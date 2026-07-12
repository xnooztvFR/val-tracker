//! V2 — Détection automatique de partie via l'API locale (non officielle) du Riot
//! Client. Lit le lockfile pour trouver le port/mot de passe de l'API HTTPS locale, puis
//! poll l'état du client (hors-jeu / menu / pregame / in-game) pour piloter l'overlay
//! (`crate::overlay`).
//!
//! **Important** : cette API locale n'est pas officiellement supportée par Riot Games —
//! son comportement peut changer sans préavis. Tout ce module est strictement
//! best-effort : si le lockfile est absent ou que l'API locale répond de façon
//! inattendue, l'app bascule silencieusement en mode "lookup manuel uniquement" sans
//! jamais faire planter le reste. Désactivable depuis Paramètres (voir
//! `settings::AppSettings::riot_local_disabled`).

pub mod client;
pub mod lockfile;
pub mod poller;

use std::sync::Mutex;

use serde::Serialize;

/// Un joueur détecté dans la partie en cours, avec son équipe relative au joueur local.
/// En pregame, le Riot Client n'expose que l'équipe alliée (voir
/// `client::fetch_pregame_player_puuids`) — tous les joueurs y sont donc `"ally"`. En
/// in-game, `team` est déduit du `TeamID` Riot renvoyé par le core-game (voir
/// `client::CoreGamePlayer`), comparé à celui du joueur local.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct LivePlayer {
    pub puuid: String,
    /// "ally" | "enemy"
    pub team: String,
}

/// Instantané de l'état de partie détecté, partagé entre le poller (écriture), la
/// commande `get_live_state` (lecture au montage de l'overlay) et l'event Tauri
/// `riot-local://state` (poussé à chaque changement).
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct LiveSnapshot {
    /// "hors_jeu" | "menu" | "pregame" | "in_game" | "post_game" | "desactive"
    pub state: String,
    /// Joueurs détectés dans la partie en cours (vide hors partie).
    pub players: Vec<LivePlayer>,
    /// Région de déploiement détectée (sinon la région par défaut des réglages).
    pub region: Option<String>,
}

impl LiveSnapshot {
    pub fn disabled() -> Self {
        Self {
            state: "desactive".to_string(),
            players: Vec::new(),
            region: None,
        }
    }

    pub fn offline() -> Self {
        Self {
            state: "hors_jeu".to_string(),
            players: Vec::new(),
            region: None,
        }
    }
}

/// État live managé par Tauri (`app.manage`), lu par `commands::get_live_state`.
pub struct LiveState(pub Mutex<LiveSnapshot>);

impl LiveState {
    pub fn new() -> Self {
        Self(Mutex::new(LiveSnapshot::offline()))
    }
}
