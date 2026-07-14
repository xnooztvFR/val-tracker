//! Toutes les commandes exposées au frontend via `invoke()`. Reste volontairement fin :
//! la logique métier vit dans `db.rs` (état local) et `api::henrik` (Henrik Dev).
//!
//! Découpé par domaine (voir les sous-modules) — `CommandError` et ses conversions restent
//! ici puisqu'ils sont partagés par toutes les commandes.

use serde::Serialize;

use crate::api::henrik::HenrikError;

mod esports;
mod henrik_fetch;
mod local_data;
mod misc;
mod overlay;
mod party_stats;
mod premier;
mod self_account;
mod settings;

pub use esports::*;
pub use henrik_fetch::*;
pub use local_data::*;
pub use misc::*;
pub use overlay::*;
pub use party_stats::*;
pub use premier::*;
pub use self_account::*;
pub use settings::*;

/// Erreur sérialisable renvoyée au frontend. Le champ `kind` permet à l'UI de distinguer
/// rate-limit / 404 / panne réseau / clé manquante (voir README §6 "Gestion des erreurs").
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CommandError {
    MissingApiKey,
    NotFound,
    RateLimited { retry_after_secs: Option<u64> },
    CircuitOpen,
    Network { message: String },
    Api { status: u16, message: String },
    Database { message: String },
    Unknown { message: String },
}

impl From<HenrikError> for CommandError {
    fn from(err: HenrikError) -> Self {
        match err {
            HenrikError::MissingApiKey => CommandError::MissingApiKey,
            HenrikError::NotFound => CommandError::NotFound,
            HenrikError::RateLimited { retry_after_secs } => {
                CommandError::RateLimited { retry_after_secs }
            }
            HenrikError::CircuitOpen => CommandError::CircuitOpen,
            HenrikError::Network(e) => CommandError::Network {
                message: e.to_string(),
            },
            HenrikError::Api { status, message } => CommandError::Api { status, message },
            HenrikError::Database(e) => CommandError::Database {
                message: e.to_string(),
            },
            HenrikError::Serde(e) => {
                crate::applog!("[henrik] échec de désérialisation: {e}");
                CommandError::Unknown {
                    message: format!("réponse Henrik inattendue: {e}"),
                }
            }
        }
    }
}

impl From<rusqlite::Error> for CommandError {
    fn from(err: rusqlite::Error) -> Self {
        CommandError::Database {
            message: err.to_string(),
        }
    }
}

impl From<anyhow::Error> for CommandError {
    fn from(err: anyhow::Error) -> Self {
        CommandError::Unknown {
            message: err.to_string(),
        }
    }
}

/// Rejette une valeur hors de la liste attendue — les settings énumérés sont contraints
/// côté frontend (boutons radio), mais la commande reste la seule porte d'entrée vers le
/// stockage et ne doit pas faire confiance à la webview pour ça.
pub(super) fn ensure_one_of(value: &str, allowed: &[&str], field: &str) -> Result<(), CommandError> {
    if allowed.contains(&value) {
        Ok(())
    } else {
        Err(CommandError::Unknown {
            message: format!("{field} invalide: attendu l'un de {allowed:?}"),
        })
    }
}
