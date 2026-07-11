//! Client HTTP bas niveau pour l'API Henrik Dev : gère l'espacement/circuit breaker (via
//! `rate_limiter`), le retry avec backoff exponentiel, et le respect du header
//! `Retry-After` en cas de 429. Ne connaît rien du cache ni du parsing métier — ça, c'est
//! le rôle de `endpoints.rs`.

use std::sync::Arc;
use std::time::Duration;

use reqwest::StatusCode;
use tokio::time::sleep;

use super::rate_limiter::RateLimiter;
use super::HenrikError;

const BASE_URL: &str = "https://api.henrikdev.xyz";
const MAX_ATTEMPTS: u32 = 3;

/// Justificatif utilisé pour un appel à l'API Henrik.
///
/// - `Direct` : une vraie clé Henrik personnelle (saisie par l'utilisateur dans Paramètres)
///   envoyée telle quelle à `api.henrikdev.xyz`.
/// - `Proxy` : app donnée à un tiers sans clé perso — les requêtes passent par un relais
///   serveur (Cloudflare Worker typiquement) qui, lui, détient la vraie clé Henrik en tant
///   que secret serveur. Le jeton envoyé ici n'est PAS la clé Henrik : décompiler le binaire
///   ne révèle que ce jeton (qui n'autorise qu'à passer par le relais), jamais la clé réelle.
///   Voir `settings.rs::get_henrik_api_key` pour la résolution Direct vs Proxy, et
///   `src-tauri/proxy/` pour le code du relais.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HenrikAuth {
    Direct(String),
    Proxy { base_url: String, token: String },
}

impl HenrikAuth {
    fn target_url(&self, path: &str) -> String {
        match self {
            HenrikAuth::Direct(_) => format!("{BASE_URL}{path}"),
            HenrikAuth::Proxy { base_url, .. } => format!("{base_url}{path}"),
        }
    }

    fn apply(&self, builder: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match self {
            HenrikAuth::Direct(key) => builder.header("Authorization", key),
            HenrikAuth::Proxy { token, .. } => builder.header("X-Proxy-Token", token),
        }
    }
}

pub struct HenrikClient {
    http: reqwest::Client,
    rate_limiter: Arc<RateLimiter>,
}

impl HenrikClient {
    pub fn new(rate_limiter: Arc<RateLimiter>) -> Self {
        let http = reqwest::Client::builder()
            .user_agent("val-tracker/0.1 (+desktop app)")
            .timeout(Duration::from_secs(15))
            .build()
            .expect("construction du client reqwest");

        Self { http, rate_limiter }
    }

    /// Effectue un GET sur `path` (ex: "/valorant/v2/account/foo/bar") et renvoie le
    /// corps JSON brut en cas de succès. Gère retry/backoff et respecte `Retry-After`.
    pub async fn get_raw(&self, path: &str, auth: &HenrikAuth) -> Result<String, HenrikError> {
        let url = auth.target_url(path);

        for attempt in 1..=MAX_ATTEMPTS {
            self.rate_limiter.acquire().await?;

            let response = match auth.apply(self.http.get(&url)).send().await {
                Ok(r) => r,
                Err(err) => {
                    self.rate_limiter.record_failure().await;
                    if attempt < MAX_ATTEMPTS {
                        sleep(backoff_delay(attempt)).await;
                        continue;
                    }
                    return Err(HenrikError::Network(err));
                }
            };

            let status = response.status();

            if status == StatusCode::TOO_MANY_REQUESTS {
                self.rate_limiter.record_failure().await;
                let retry_after_secs = parse_retry_after(&response);
                if attempt < MAX_ATTEMPTS {
                    let delay = retry_after_secs
                        .map(Duration::from_secs)
                        .unwrap_or_else(|| backoff_delay(attempt));
                    sleep(delay).await;
                    continue;
                }
                return Err(HenrikError::RateLimited { retry_after_secs });
            }

            if status == StatusCode::NOT_FOUND {
                // Un 404 est une réponse valide de l'API ("joueur introuvable"), pas une
                // panne — ça ne doit pas alimenter le circuit breaker.
                self.rate_limiter.record_success().await;
                return Err(HenrikError::NotFound);
            }

            if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
                // Une clé invalide/refusée est, comme le 404, une réponse *correcte* de
                // l'API (elle a bien répondu, l'auth a juste échoué) — pas un signe
                // d'instabilité. Ne pas alimenter le circuit breaker ici, sinon un
                // utilisateur qui teste plusieurs clés dans Paramètres (verify_henrik_api_key
                // partage ce même client) peut ouvrir le circuit breaker après 5 essais et
                // bloquer tout le reste de l'app pendant 60s pour une raison qui n'a rien à
                // voir avec une panne réseau/API.
                self.rate_limiter.record_success().await;
                let message = response.text().await.unwrap_or_default();
                return Err(HenrikError::Api {
                    status: status.as_u16(),
                    message,
                });
            }

            if status.is_server_error() {
                self.rate_limiter.record_failure().await;
                if attempt < MAX_ATTEMPTS {
                    sleep(backoff_delay(attempt)).await;
                    continue;
                }
                let message = response.text().await.unwrap_or_default();
                return Err(HenrikError::Api {
                    status: status.as_u16(),
                    message,
                });
            }

            if !status.is_success() {
                self.rate_limiter.record_failure().await;
                let message = response.text().await.unwrap_or_default();
                return Err(HenrikError::Api {
                    status: status.as_u16(),
                    message,
                });
            }

            self.rate_limiter.record_success().await;
            return response.text().await.map_err(HenrikError::Network);
        }

        unreachable!("la boucle de retry renvoie toujours avant d'épuiser MAX_ATTEMPTS")
    }

    /// Variante binaire de `get_raw`, pour les endpoints qui renvoient une image (ex:
    /// `/valorant/v1/crosshair/generate`) plutôt qu'un JSON `{ status, data }`.
    pub async fn get_raw_bytes(&self, path: &str, auth: &HenrikAuth) -> Result<Vec<u8>, HenrikError> {
        let url = auth.target_url(path);

        for attempt in 1..=MAX_ATTEMPTS {
            self.rate_limiter.acquire().await?;

            let response = match auth.apply(self.http.get(&url)).send().await {
                Ok(r) => r,
                Err(err) => {
                    self.rate_limiter.record_failure().await;
                    if attempt < MAX_ATTEMPTS {
                        sleep(backoff_delay(attempt)).await;
                        continue;
                    }
                    return Err(HenrikError::Network(err));
                }
            };

            let status = response.status();

            if status == StatusCode::TOO_MANY_REQUESTS {
                self.rate_limiter.record_failure().await;
                let retry_after_secs = parse_retry_after(&response);
                if attempt < MAX_ATTEMPTS {
                    let delay = retry_after_secs
                        .map(Duration::from_secs)
                        .unwrap_or_else(|| backoff_delay(attempt));
                    sleep(delay).await;
                    continue;
                }
                return Err(HenrikError::RateLimited { retry_after_secs });
            }

            if status == StatusCode::NOT_FOUND {
                self.rate_limiter.record_success().await;
                return Err(HenrikError::NotFound);
            }

            if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
                // Voir le commentaire équivalent dans `get_raw` : une auth refusée n'est
                // pas une panne, ça ne doit pas alimenter le circuit breaker.
                self.rate_limiter.record_success().await;
                let message = response.text().await.unwrap_or_default();
                return Err(HenrikError::Api {
                    status: status.as_u16(),
                    message,
                });
            }

            if !status.is_success() {
                self.rate_limiter.record_failure().await;
                if status.is_server_error() && attempt < MAX_ATTEMPTS {
                    sleep(backoff_delay(attempt)).await;
                    continue;
                }
                let message = response.text().await.unwrap_or_default();
                return Err(HenrikError::Api {
                    status: status.as_u16(),
                    message,
                });
            }

            self.rate_limiter.record_success().await;
            return response
                .bytes()
                .await
                .map(|b| b.to_vec())
                .map_err(HenrikError::Network);
        }

        unreachable!("la boucle de retry renvoie toujours avant d'épuiser MAX_ATTEMPTS")
    }
}

fn backoff_delay(attempt: u32) -> Duration {
    Duration::from_millis(500 * 2u64.pow(attempt.min(4)))
}

fn parse_retry_after(response: &reqwest::Response) -> Option<u64> {
    response
        .headers()
        .get(reqwest::header::RETRY_AFTER)?
        .to_str()
        .ok()?
        .parse::<u64>()
        .ok()
}
