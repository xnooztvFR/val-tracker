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

pub mod agents;
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
    /// Nom d'agent résolu depuis le `CharacterID` pregame (voir `agents.rs`) — `None` tant
    /// que l'agent n'est pas locké, hors pregame, ou si le schéma de champ de l'API locale a
    /// changé (best-effort, jamais bloquant, voir doc de `agents.rs`).
    pub agent: Option<String>,
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
    /// Overlay & détection en jeu (TODO#3) : "ok" | "degraded" — reflète les échecs
    /// consécutifs de l'API locale Riot (`poller::PollContext::local_failures`/`stuck_ticks`)
    /// pendant la partie en cours, aujourd'hui silencieux côté overlay malgré des retries en
    /// coulisses. `"ok"` par défaut (pas de partie en cours ou aucune instabilité observée).
    #[serde(default = "default_api_health")]
    pub api_health: String,
}

fn default_api_health() -> String {
    "ok".to_string()
}

impl LiveSnapshot {
    pub fn disabled() -> Self {
        Self {
            state: "desactive".to_string(),
            players: Vec::new(),
            region: None,
            api_health: default_api_health(),
        }
    }

    pub fn offline() -> Self {
        Self {
            state: "hors_jeu".to_string(),
            players: Vec::new(),
            region: None,
            api_health: default_api_health(),
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

/// Cible du lien "voir le récap" déposé par la notification de fin de partie (backlog
/// #81) — le match qui vient de se terminer n'est pas encore forcément ingéré côté Henrik
/// (voir le message de la notification), donc on pointe vers l'historique de matchs du
/// compte local plutôt qu'un `match_id` précis. Consommé une seule fois : le handler de
/// focus de la fenêtre principale (voir `main.rs`) le prend puis le vide.
#[derive(Debug, Clone, Serialize)]
pub struct PostgameLink {
    pub region: String,
    pub name: String,
    pub tag: String,
    /// Timestamp Unix (secondes) de dépôt — un lien trop vieux (fenêtre principale restée
    /// masquée longtemps) n'a plus grand intérêt à rediriger automatiquement l'utilisateur
    /// vers un match qu'il a peut-être déjà consulté depuis.
    pub set_at: i64,
}

/// Backlog #81 : durée de vie du lien avant qu'on le considère périmé plutôt que de
/// rediriger l'utilisateur vers une partie déjà oubliée.
pub const POSTGAME_LINK_TTL_SECS: i64 = 15 * 60;

/// Overlay & détection en jeu (TODO#3) : résumé de fin de partie affiché dans l'overlay
/// (voir `Overlay.tsx`), poussé par `poller::fetch_and_emit_postgame_summary` via l'event
/// `riot-local://postgame-summary` — best-effort, le match peut ne pas encore être ingéré
/// côté Henrik au moment de la transition in-game → menu (voir les tentatives espacées dans
/// le poller), donc rien n'est émis si toutes les tentatives échouent plutôt que d'afficher
/// un résumé vide ou incorrect.
#[derive(Debug, Clone, Serialize)]
pub struct PostgameSummary {
    pub agent: Option<String>,
    pub map: Option<String>,
    pub kills: i64,
    pub deaths: i64,
    pub assists: i64,
    pub won: Option<bool>,
}

pub const POSTGAME_SUMMARY_EVENT: &str = "riot-local://postgame-summary";

/// Overlay & détection en jeu (TODO#3) : notification live qu'un ami suivi (voir
/// `db::list_followed_friends`) vient d'entrer en pregame/in-game — poussée par
/// `poller::scan_followed_friends_presence` (scan de `chat/v4/presences`, qui expose la
/// presence de tous les amis Riot, pas seulement locale), au-delà du pull post-game a
/// posteriori déjà fait par `friend_watcher.rs`.
pub const FRIEND_LIVE_EVENT: &str = "riot-local://friend-live";

#[derive(Debug, Clone, Serialize)]
pub struct FriendLiveEvent {
    pub name: String,
    pub tag: String,
}

pub struct PostgameLinkState(pub Mutex<Option<PostgameLink>>);

impl PostgameLinkState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }

    pub fn set(&self, link: PostgameLink) {
        if let Ok(mut guard) = self.0.lock() {
            *guard = Some(link);
        }
    }

    /// Retire et retourne le lien s'il existe et n'est pas périmé (voir
    /// `POSTGAME_LINK_TTL_SECS`) — appelé au focus de la fenêtre principale.
    pub fn take_if_fresh(&self, now: i64) -> Option<PostgameLink> {
        let mut guard = self.0.lock().ok()?;
        let link = guard.take()?;
        if now - link.set_at <= POSTGAME_LINK_TTL_SECS {
            Some(link)
        } else {
            None
        }
    }
}
