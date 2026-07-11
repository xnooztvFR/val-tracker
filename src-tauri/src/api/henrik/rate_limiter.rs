//! File d'attente + espacement des requêtes vers Henrik, et circuit breaker simple.
//!
//! Henrik autorise ~30 req/min ; comme côté bot Discord, on cadence en dessous de cette
//! limite (~24 req/min, soit un intervalle minimum de 2,5s entre deux requêtes) pour
//! garder de la marge. Une seule priorité pour l'instant (l'app est essentiellement
//! interactive au premier plan) — la structure (méthode `acquire`) permet d'ajouter
//! facilement une file à deux priorités plus tard si des jobs de fond apparaissent.

use std::time::{Duration, Instant};

use tokio::sync::Mutex;
use tokio::time::sleep;

const MIN_INTERVAL: Duration = Duration::from_millis(2_500);
const FAILURE_THRESHOLD: u32 = 5;
const BREAKER_COOLDOWN: Duration = Duration::from_secs(60);

#[derive(Debug, Default)]
struct State {
    last_request_at: Option<Instant>,
    consecutive_failures: u32,
    circuit_open_until: Option<Instant>,
}

pub struct RateLimiter {
    state: Mutex<State>,
}

#[derive(Debug, thiserror::Error)]
#[error("circuit breaker ouvert — trop d'échecs consécutifs vers l'API Henrik, réessaie plus tard")]
pub struct CircuitOpenError;

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(State::default()),
        }
    }

    /// À appeler avant chaque requête HTTP : attend l'espacement minimum et refuse
    /// d'émettre si le circuit breaker est ouvert.
    pub async fn acquire(&self) -> Result<(), CircuitOpenError> {
        loop {
            let wait = {
                let state = self.state.lock().await;
                if let Some(open_until) = state.circuit_open_until {
                    if Instant::now() < open_until {
                        return Err(CircuitOpenError);
                    }
                }
                state
                    .last_request_at
                    .map(|t| MIN_INTERVAL.saturating_sub(t.elapsed()))
                    .filter(|d| !d.is_zero())
            };

            match wait {
                Some(d) => sleep(d).await,
                None => break,
            }
        }

        let mut state = self.state.lock().await;
        state.last_request_at = Some(Instant::now());
        Ok(())
    }

    pub async fn record_success(&self) {
        let mut state = self.state.lock().await;
        state.consecutive_failures = 0;
        state.circuit_open_until = None;
    }

    pub async fn record_failure(&self) {
        let mut state = self.state.lock().await;
        state.consecutive_failures += 1;
        if state.consecutive_failures >= FAILURE_THRESHOLD {
            state.circuit_open_until = Some(Instant::now() + BREAKER_COOLDOWN);
        }
    }

    pub async fn breaker_is_open(&self) -> bool {
        let state = self.state.lock().await;
        state
            .circuit_open_until
            .map(|until| Instant::now() < until)
            .unwrap_or(false)
    }
}

impl Default for RateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn breaker_closed_by_default() {
        let limiter = RateLimiter::new();
        assert!(!limiter.breaker_is_open().await);
        assert!(limiter.acquire().await.is_ok());
    }

    #[tokio::test]
    async fn breaker_stays_closed_below_failure_threshold() {
        let limiter = RateLimiter::new();
        for _ in 0..(FAILURE_THRESHOLD - 1) {
            limiter.record_failure().await;
        }
        assert!(!limiter.breaker_is_open().await);
    }

    #[tokio::test]
    async fn breaker_opens_at_failure_threshold_and_blocks_acquire() {
        let limiter = RateLimiter::new();
        for _ in 0..FAILURE_THRESHOLD {
            limiter.record_failure().await;
        }
        assert!(limiter.breaker_is_open().await);
        assert!(limiter.acquire().await.is_err());
    }

    #[tokio::test]
    async fn record_success_resets_failure_counter() {
        let limiter = RateLimiter::new();
        for _ in 0..(FAILURE_THRESHOLD - 1) {
            limiter.record_failure().await;
        }
        limiter.record_success().await;
        // Repart de zéro : un seul échec de plus ne doit pas ouvrir le circuit.
        limiter.record_failure().await;
        assert!(!limiter.breaker_is_open().await);
    }
}
