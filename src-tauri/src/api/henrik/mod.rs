//! Accès à l'API Henrik Dev : cache SQLite + TTL différenciés, rate limiter avec
//! espacement + circuit breaker simple, retry respectant `Retry-After`. Toute la logique
//! réseau du reste de l'app passe par ce module (voir `commands.rs`).

pub mod cache;
pub mod client;
pub mod endpoints;
pub mod endpoints_esports;
pub mod endpoints_premier;
pub mod rate_limiter;
pub mod types;
pub mod types_esports;
pub mod types_premier;

pub use client::HenrikClient;
pub use rate_limiter::RateLimiter;

/// Durée de vie d'une entrée de cache, en secondes.
#[derive(Debug, Clone, Copy)]
pub struct TtlSeconds(pub i64);

/// Compte Henrik : change rarement (pseudo/tag/niveau) — 1h de cache.
pub const TTL_ACCOUNT: TtlSeconds = TtlSeconds(3600);
/// MMR/rank courant : peut changer à chaque partie — 10 min de cache, comme côté bot.
pub const TTL_MMR: TtlSeconds = TtlSeconds(600);
/// Un match terminé est immuable — 24h de cache, comme côté bot.
pub const TTL_MATCHES: TtlSeconds = TtlSeconds(86_400);
/// Détail d'un match terminé (v2/match) : immuable comme la liste de matchs — 24h.
pub const TTL_MATCH_DETAIL: TtlSeconds = TtlSeconds(86_400);
/// Historique de RR : nouvelle entrée seulement après une partie — même TTL que le MMR.
pub const TTL_MMR_HISTORY: TtlSeconds = TtlSeconds(600);
/// Classement compétitif : recalculé côté Riot toutes les ~15 min — 15 min de cache.
pub const TTL_LEADERBOARD: TtlSeconds = TtlSeconds(900);
/// Statut serveur / file d'attente : doit rester réactif aux incidents — 3 min de cache.
pub const TTL_STATUS: TtlSeconds = TtlSeconds(180);
/// Calendrier esport : change rarement en cours de journée — 30 min de cache.
pub const TTL_ESPORTS: TtlSeconds = TtlSeconds(1800);
/// Image de crosshair : purement déterministe à partir du code — cache long, 7 jours.
pub const TTL_CROSSHAIR: TtlSeconds = TtlSeconds(604_800);
/// Données Premier (équipes, classement, historique) : recalculées peu souvent — 10 min.
pub const TTL_PREMIER: TtlSeconds = TtlSeconds(600);
/// Données esport VLR (events, équipes, joueurs, matchs pro) : quasi statiques hors
/// live — 30 min de cache, comme le calendrier esport v1.
pub const TTL_ESPORTS_V2: TtlSeconds = TtlSeconds(1800);

#[derive(Debug, thiserror::Error)]
pub enum HenrikError {
    #[error("clé API Henrik manquante ou invalide")]
    MissingApiKey,
    #[error("joueur introuvable")]
    NotFound,
    #[error("limite de requêtes atteinte")]
    RateLimited { retry_after_secs: Option<u64> },
    #[error("trop d'échecs récents, nouvelle tentative dans quelques instants")]
    CircuitOpen,
    #[error("erreur réseau: {0}")]
    Network(#[from] reqwest::Error),
    #[error("erreur API Henrik ({status}): {message}")]
    Api { status: u16, message: String },
    #[error("erreur base de données: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("erreur de désérialisation: {0}")]
    Serde(#[from] serde_json::Error),
}

impl From<rate_limiter::CircuitOpenError> for HenrikError {
    fn from(_: rate_limiter::CircuitOpenError) -> Self {
        HenrikError::CircuitOpen
    }
}
