//! File d'attente + espacement des requêtes vers Henrik, et circuit breaker simple.
//!
//! Henrik autorise ~30 req/min ; comme côté bot Discord, on cadence en dessous de cette
//! limite (~24 req/min, soit un intervalle minimum de 2,5s entre deux requêtes) pour
//! garder de la marge.
//!
//! Optimisations #2 (TODO.md) : deux priorités — `Interactive` (recherche/profil/écrans
//! au premier plan) et `Background` (fetch en rafale de l'overlay pour plusieurs joueurs
//! détectés en partie). L'espacement `MIN_INTERVAL` reste global (impossible de dépasser
//! le quota Henrik quelle que soit la priorité), mais un appel `Background` cède
//! systématiquement le prochain créneau à un appel `Interactive` en attente, pour que
//! l'UI au premier plan ne reste jamais bloquée derrière une rafale de fetch overlay.

use std::time::{Duration, Instant};

use tokio::sync::Mutex;
use tokio::time::sleep;

const MIN_INTERVAL: Duration = Duration::from_millis(2_500);
const FAILURE_THRESHOLD: u32 = 5;
const BREAKER_COOLDOWN: Duration = Duration::from_secs(60);
/// Délai de repoll d'un appel `Background` tant qu'un appel `Interactive` est en attente —
/// volontairement court devant `MIN_INTERVAL` pour ne pas retarder l'UI au premier plan.
const BACKGROUND_YIELD_POLL: Duration = Duration::from_millis(100);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Priority {
    /// Écrans au premier plan (recherche, profil, historique...) — ne doit jamais
    /// attendre derrière une rafale de requêtes `Background`.
    Interactive,
    /// Fetch de fond (overlay V2 : plusieurs joueurs détectés en partie) — cède le
    /// prochain créneau libre à tout appel `Interactive` en attente.
    Background,
}

#[derive(Debug, Default)]
struct State {
    last_request_at: Option<Instant>,
    consecutive_failures: u32,
    circuit_open_until: Option<Instant>,
    /// Nombre d'appels `Interactive` actuellement en attente d'un créneau — consulté par
    /// les appels `Background` pour savoir s'ils doivent céder leur tour.
    interactive_pending: u32,
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
    /// d'émettre si le circuit breaker est ouvert. Voir `Priority` pour la sémantique des
    /// deux niveaux.
    pub async fn acquire(&self, priority: Priority) -> Result<(), CircuitOpenError> {
        if priority == Priority::Interactive {
            self.state.lock().await.interactive_pending += 1;
        }
        let result = self.acquire_slot(priority).await;
        if priority == Priority::Interactive {
            self.state.lock().await.interactive_pending -= 1;
        }
        result
    }

    async fn acquire_slot(&self, priority: Priority) -> Result<(), CircuitOpenError> {
        loop {
            let wait = {
                let state = self.state.lock().await;
                if let Some(open_until) = state.circuit_open_until {
                    if Instant::now() < open_until {
                        return Err(CircuitOpenError);
                    }
                }
                if priority == Priority::Background && state.interactive_pending > 0 {
                    Some(BACKGROUND_YIELD_POLL)
                } else {
                    state
                        .last_request_at
                        .map(|t| MIN_INTERVAL.saturating_sub(t.elapsed()))
                        .filter(|d| !d.is_zero())
                }
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
        assert!(limiter.acquire(Priority::Interactive).await.is_ok());
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
        assert!(limiter.acquire(Priority::Interactive).await.is_err());
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

    /// Optimisations #2 (TODO.md) : un appel `Background` en attente doit céder son tour
    /// à un appel `Interactive` arrivé pendant qu'il patientait, plutôt que de garder son
    /// rang dans la file d'espacement.
    #[tokio::test(start_paused = true)]
    async fn background_yields_next_slot_to_pending_interactive() {
        use std::sync::Arc;
        use tokio::sync::Notify;

        let limiter = Arc::new(RateLimiter::new());
        // Consomme le tout premier créneau pour que le prochain acquire() (peu importe la
        // priorité) doive attendre MIN_INTERVAL.
        limiter.acquire(Priority::Interactive).await.unwrap();

        let order = Arc::new(Mutex::new(Vec::<&'static str>::new()));

        let background_started = Arc::new(Notify::new());

        let bg_limiter = limiter.clone();
        let bg_order = order.clone();
        let bg_started = background_started.clone();
        let background = tokio::spawn(async move {
            bg_started.notify_one();
            bg_limiter.acquire(Priority::Background).await.unwrap();
            bg_order.lock().await.push("background");
        });

        // Laisse le fetch background entrer dans sa boucle d'attente en premier.
        background_started.notified().await;
        tokio::task::yield_now().await;

        let interactive = tokio::spawn({
            let limiter = limiter.clone();
            let order = order.clone();
            async move {
                limiter.acquire(Priority::Interactive).await.unwrap();
                order.lock().await.push("interactive");
            }
        });

        interactive.await.unwrap();
        background.await.unwrap();

        assert_eq!(*order.lock().await, vec!["interactive", "background"]);
    }
}
