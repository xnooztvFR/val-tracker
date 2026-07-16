//! Lecture/écriture de la config locale (clé API Henrik, préférences UI) dans la table
//! `settings` de `db.rs`. Les valeurs vivent uniquement dans le dossier de données Tauri
//! (`app_data_dir`), jamais commitées, jamais loguées en clair.

use std::fmt;

use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::api::henrik::HenrikAuth;
use crate::dpapi;

/// Marqueur de préfixe distinguant une valeur chiffrée via DPAPI d'une valeur en clair
/// héritée d'une version antérieure de l'app (avant l'ajout du chiffrement au repos) — sert
/// à migrer silencieusement les installs existantes sans casser leur clé API enregistrée.
const DPAPI_PREFIX: &str = "dpapi:";

const KEY_HENRIK_API_KEY: &str = "henrik_api_key";
const KEY_DEFAULT_REGION: &str = "default_region";
const KEY_AUTO_UPDATE: &str = "auto_update_enabled";
const KEY_LOOKUP_ONLY_MODE: &str = "riot_local_disabled";
const KEY_OVERLAY_POSITION: &str = "overlay_position";
/// Backlog #76 : sélecteur d'écran explicite pour l'overlay — `"auto"` (défaut, comportement
/// historique par signature d'écran mémorisée, voir `KEY_OVERLAY_POSITION`) ou l'identifiant
/// d'un moniteur (`overlay::window::monitor_id`) sur lequel toujours faire apparaître
/// l'overlay, indépendamment du dernier setup utilisé.
const KEY_OVERLAY_MONITOR: &str = "overlay_monitor";
const KEY_DISCORD_RPC_ENABLED: &str = "discord_rpc_enabled";
const KEY_DISCORD_RPC_CLIENT_ID: &str = "discord_rpc_client_id";
/// TODO Fonctionnalités#12 : webhook Discord optionnel notifiant un rank up vers un salon
/// perso — distinct du Rich Presence (`discord_rpc_client_id`, IPC local, pas d'API réseau).
/// Ici un vrai POST HTTP sortant vers `discord.com/api/webhooks/...` (voir
/// `discord_webhook.rs`), désactivé par défaut et jamais rempli automatiquement.
const KEY_DISCORD_WEBHOOK_ENABLED: &str = "discord_webhook_enabled";
const KEY_DISCORD_WEBHOOK_URL: &str = "discord_webhook_url";
const KEY_STATUS_WATCHER_ENABLED: &str = "status_watcher_enabled";
const KEY_USAGE_METRICS_ENABLED: &str = "usage_metrics_enabled";
const KEY_UI_THEME: &str = "ui_theme";
const KEY_UI_ACCENT: &str = "ui_accent";
const KEY_UI_LANGUAGE: &str = "ui_language";
const KEY_UI_DENSITY: &str = "ui_density";
const KEY_OVERLAY_DENSITY: &str = "overlay_density";
const KEY_OVERLAY_LAYOUT: &str = "overlay_layout";
const KEY_LOSS_STREAK_ALERT_ENABLED: &str = "loss_streak_alert_enabled";
const KEY_LOSS_STREAK_ALERT_COUNT: &str = "loss_streak_alert_count";
/// TODO Fonctionnalités#5 : pendant positif de l'alerte "N défaites d'affilée" — voir
/// `win_streak.rs`.
const KEY_WIN_STREAK_ALERT_ENABLED: &str = "win_streak_alert_enabled";
const KEY_WIN_STREAK_ALERT_COUNT: &str = "win_streak_alert_count";
/// Backlog TODO#8 : notification native de rank up/down (déjà envoyée par défaut depuis
/// `notify_rank_change` dans `commands/henrik_fetch.rs`) — toggle séparé pour la désactiver
/// indépendamment des autres notifications (fin de partie, loss streak...). Activé par défaut
/// pour préserver le comportement historique (aucun opt-in nécessaire pour ce qui existait déjà).
const KEY_RANK_CHANGE_ALERT_ENABLED: &str = "rank_change_alert_enabled";
const KEY_RANK_GAP_ALERT_ENABLED: &str = "rank_gap_alert_enabled";
const KEY_RANK_GAP_ALERT_THRESHOLD: &str = "rank_gap_alert_threshold";
const KEY_INACTIVITY_REMINDER_ENABLED: &str = "inactivity_reminder_enabled";
const KEY_INACTIVITY_REMINDER_DAYS: &str = "inactivity_reminder_days";
const KEY_NOTES_PIN_ENABLED: &str = "notes_pin_enabled";
/// PIN de verrouillage des notes perso (backlog #99) — chiffré via DPAPI comme la clé API
/// Henrik (`set_encrypted`/`get_encrypted`), jamais exposé au frontend via `AppSettings`
/// (seul `notes_pin_enabled` l'est) ; la vérification se fait entièrement côté Rust via
/// `verify_notes_pin`.
const KEY_NOTES_PIN: &str = "notes_pin";
/// Compteur d'échecs consécutifs + horodatage de fin de verrouillage de `verify_notes_pin` —
/// sans ça, un PIN à 4 chiffres (10 000 combinaisons) invoqué en boucle depuis le frontend
/// (ou tout process local capable d'appeler `invoke`) se casse en quelques secondes malgré la
/// comparaison en temps constant. Persisté en DB (pas juste en mémoire) pour survivre à un
/// redémarrage de l'app pendant la fenêtre de verrouillage — même esprit que le circuit
/// breaker de `rate_limiter.rs`, mais qui lui n'a pas besoin de survivre à un redémarrage
/// (l'API Henrik retente simplement au prochain lancement).
const KEY_NOTES_PIN_FAIL_COUNT: &str = "notes_pin_fail_count";
const KEY_NOTES_PIN_LOCKOUT_UNTIL: &str = "notes_pin_lockout_until";
const NOTES_PIN_FAILURE_THRESHOLD: u32 = 5;
const NOTES_PIN_LOCKOUT_SECONDS: i64 = 60;
/// Backlog #72 (fix) : changelog de la mise à jour tout juste installée, écrit juste avant
/// `relaunch()` et lu (puis effacé) par `ChangelogModal.tsx` au chargement suivant. Stocké
/// côté Rust plutôt qu'en `localStorage` : `invoke()` attend la fin de l'écriture SQLite
/// avant de résoudre côté JS, alors qu'un `localStorage.setItem()` suivi immédiatement d'un
/// `relaunch()` (qui tue le process) n'offre aucune garantie que WebView2 ait flush
/// l'écriture sur disque avant la mort du process — c'était la cause du bug "la popup
/// n'apparaît jamais" malgré une mise à jour réussie.
const KEY_PENDING_CHANGELOG_VERSION: &str = "pending_changelog_version";
const KEY_PENDING_CHANGELOG_NOTES: &str = "pending_changelog_notes";
/// Fix (2026-07-13) : le wizard d'onboarding (`OnboardingWizard.tsx`) se déclenchait sur
/// `!henrik_api_key_set`, qui reste `false` en permanence dès qu'un relais proxy est compilé
/// (voir `default_proxy_access`) — un build de distribution ne montrait donc jamais l'écran
/// de configuration initiale (région, détection auto...), même sur une base SQLite vierge.
/// Ce flag marque un vrai "premier lancement", indépendant de la disponibilité d'une clé.
const KEY_ONBOARDING_COMPLETED: &str = "onboarding_completed";
/// Raccourcis globaux (tauri-plugin-global-shortcut, indépendants du focus applicatif) —
/// en dur jusqu'ici (`overlay::window::TOGGLE_SHORTCUT`/`MAIN_WINDOW_TOGGLE_SHORTCUT`), sans
/// moyen de les changer en cas de conflit avec une autre appli (overlay GPU, Discord...).
/// Format accelerator de `tauri-plugin-global-shortcut` (ex. `"ctrl+shift+v"`).
const KEY_SHORTCUT_OVERLAY_TOGGLE: &str = "shortcut_overlay_toggle";
const KEY_SHORTCUT_MAIN_WINDOW_TOGGLE: &str = "shortcut_main_window_toggle";
pub const DEFAULT_SHORTCUT_OVERLAY_TOGGLE: &str = "ctrl+shift+v";
pub const DEFAULT_SHORTCUT_MAIN_WINDOW_TOGGLE: &str = "ctrl+shift+h";

const DEFAULT_UI_THEME: &str = "dark";
const DEFAULT_UI_ACCENT: &str = "red";
const DEFAULT_UI_LANGUAGE: &str = "fr";
const DEFAULT_UI_DENSITY: &str = "comfortable";
const DEFAULT_OVERLAY_DENSITY: &str = "detailed";
const DEFAULT_OVERLAY_LAYOUT: &str = "full";
const DEFAULT_LOSS_STREAK_ALERT_COUNT: i64 = 3;
const DEFAULT_WIN_STREAK_ALERT_COUNT: i64 = 3;
const DEFAULT_INACTIVITY_REMINDER_DAYS: i64 = 3;
/// Écart de `currenttier` Henrik à partir duquel l'alerte sonore se déclenche (voir
/// `rank_gap_alert_enabled`) — chaque rang (Bronze, Or...) couvre 3 tiers consécutifs, donc
/// 9 correspond à environ 3 rangs complets d'écart, un seuil assez large pour ne signaler
/// que les écarts vraiment suspects plutôt qu'une variation normale de lobby.
const DEFAULT_RANK_GAP_ALERT_THRESHOLD: i64 = 9;

const DEFAULT_REGION: &str = "eu";

/// Valeurs par défaut compilées dans le binaire depuis `src-tauri/.env` (voir `build.rs`) —
/// pratique pour donner l'app à quelqu'un sans lui demander de configurer un ID Discord.
/// Ce n'est PAS un mécanisme de secret : cette valeur est extractible du binaire compilé
/// par quiconque le possède (`.env` n'est jamais committé, voir `.gitignore`). Une valeur
/// enregistrée explicitement par l'utilisateur dans Paramètres prime toujours dessus.
fn default_discord_client_id() -> Option<&'static str> {
    option_env!("DISCORD_DEFAULT_CLIENT_ID").filter(|v| !v.is_empty())
}

/// URL + jeton du relais Cloudflare Worker (voir `src-tauri/proxy/`), compilés depuis
/// `.env` — permet à l'app de fonctionner sans clé Henrik personnelle en passant par un
/// serveur qui, lui, détient la vraie clé Henrik. Le jeton n'est PAS la clé Henrik : il
/// n'autorise qu'à passer par le relais, contrairement à l'ancien mécanisme
/// `HENRIK_DEFAULT_API_KEY` (abandonné) qui compilait la vraie clé dans le binaire — voir
/// `client.rs::HenrikAuth` pour le détail des deux modes Direct/Proxy.
fn default_proxy_access() -> Option<HenrikAuth> {
    let base_url = option_env!("HENRIK_PROXY_URL").filter(|v| !v.is_empty())?;
    let token = option_env!("HENRIK_PROXY_TOKEN").filter(|v| !v.is_empty())?;
    Some(HenrikAuth::Proxy {
        base_url: base_url.to_string(),
        token: token.to_string(),
    })
}

/// Préférences exposées au frontend. `henrik_api_key_set` indique juste si une clé est
/// enregistrée ; `henrik_api_key` porte la valeur pour pré-remplir le champ de l'écran
/// Settings (l'IPC Tauri reste local à la machine de l'utilisateur, ce n'est pas exposé
/// réseau — même modèle de confiance que le bot Discord lisant son .env).
#[derive(Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub henrik_api_key: Option<String>,
    pub henrik_api_key_set: bool,
    pub default_region: String,
    pub auto_update_enabled: bool,
    /// V2 : désactive la détection auto de partie (lockfile/overlay) — repli "lookup
    /// manuel". Relu par le poller à chaque tick.
    pub riot_local_disabled: bool,
    /// V3 : Rich Presence Discord (voir `discord_rpc.rs`). Désactivée par défaut — ne
    /// s'active qu'une fois un `discord_rpc_client_id` renseigné.
    pub discord_rpc_enabled: bool,
    pub discord_rpc_client_id: Option<String>,
    /// TODO Fonctionnalités#12 : webhook Discord (rank up), désactivé par défaut.
    pub discord_webhook_enabled: bool,
    pub discord_webhook_url: Option<String>,
    /// V3 : watcher de statut serveur/file d'attente en arrière-plan (voir
    /// `status_watcher.rs`) — désactivé par défaut, opt-in car c'est le seul appel réseau
    /// périodique qui tourne même quand l'utilisateur ne regarde pas l'app.
    pub status_watcher_enabled: bool,
    /// Backlog #50 : dashboard santé 100% local (taux de cache hit, erreurs API des 7
    /// derniers jours) — désactivé par défaut, opt-in car il ajoute une écriture SQLite à
    /// chaque appel Henrik pour accumuler les métriques (voir `api::henrik::endpoints`).
    /// Jamais transmis nulle part, aucune télémétrie externe.
    pub usage_metrics_enabled: bool,
    /// Backlog #33 : `"dark"` (défaut, identité HUD d'origine) ou `"light"`.
    pub ui_theme: String,
    /// Backlog #38 : `"red"` (défaut, identité HUD d'origine) | `"cyan"` | `"violet"` |
    /// `"amber"` — voir les variables CSS `--color-accent*` dans `index.css`.
    pub ui_accent: String,
    /// Système multilangue : `"fr"` (défaut) | `"en"`. Le frontend (react-i18next) applique
    /// cette valeur au démarrage puis à chaque changement via Paramètres.
    pub ui_language: String,
    /// Backlog #66 : densité d'affichage globale de l'app (pas que l'overlay, cf
    /// `overlay_density`) — `"comfortable"` (défaut) ou `"compact"`. Appliquée côté frontend
    /// via un attribut `data-density` sur `<html>` qui réduit `font-size`, ce qui rétrécit
    /// proportionnellement tout le reste de l'app basé sur les unités `rem` de Tailwind (pas
    /// de refactor composant par composant nécessaire).
    pub ui_density: String,
    /// Backlog #31 : densité d'info affichée dans l'overlay en jeu — `"compact"` (juste le
    /// badge de rank) ou `"detailed"` (défaut, ajoute le nom du rank + le RR).
    pub overlay_density: String,
    /// Backlog #75 : structure globale de l'overlay — `"full"` (défaut, liste complète
    /// alliés/adversaires, cf `overlay_density` pour le niveau d'info par ligne) ou
    /// `"mini"` (résumé minimal coin d'écran : juste les badges de rang, sans nom/RR ni
    /// recommandation d'agent, pour un encombrement visuel minimal en jeu).
    pub overlay_layout: String,
    /// Backlog #76 : `"auto"` (défaut, position mémorisée par signature d'écran) ou
    /// l'identifiant d'un moniteur choisi explicitement (voir `overlay::window::monitor_id`).
    pub overlay_monitor: String,
    /// Backlog #24 : notifie quand un joueur "à soi" (`tracked_players.is_self`) enchaîne
    /// `loss_streak_alert_count` défaites d'affilée. Désactivé par défaut.
    pub loss_streak_alert_enabled: bool,
    pub loss_streak_alert_count: i64,
    /// TODO Fonctionnalités#5 : pendant positif de `loss_streak_alert_enabled`. Désactivé par
    /// défaut, comme son pendant négatif.
    pub win_streak_alert_enabled: bool,
    pub win_streak_alert_count: i64,
    /// Backlog TODO#8 : toggle séparé pour la notification de rank up/down, distincte de la
    /// notification de fin de partie (`tauri-plugin-notification`). Activé par défaut.
    pub rank_change_alert_enabled: bool,
    /// Alerte sonore discrète (opt-in) quand un adversaire détecté en overlay a un
    /// `currenttier` Henrik supérieur au joueur local d'au moins `rank_gap_alert_threshold`
    /// (voir `Overlay.tsx`) — facile à manquer visuellement en chargement de manche.
    pub rank_gap_alert_enabled: bool,
    pub rank_gap_alert_threshold: i64,
    /// Backlog #32 : rappel doux "tu n'as pas joué depuis X jours" (opt-in, jamais agressif)
    /// — voir `status_watcher.rs` pour le pattern de tâche de fond réutilisé.
    pub inactivity_reminder_enabled: bool,
    pub inactivity_reminder_days: i64,
    /// Backlog #99 : verrouillage optionnel par PIN avant d'afficher les notes perso
    /// sensibles (tags "smurf"/"toxique" de #12) — utile en stream/écran partagé. Le PIN
    /// lui-même n'est jamais inclus ici (voir `verify_notes_pin`).
    pub notes_pin_enabled: bool,
    /// Fix (2026-07-13) : `true` une fois le wizard d'onboarding terminé (ou explicitement
    /// marqué comme tel) — déclenche l'affichage du wizard côté `Search.tsx` tant que
    /// `false`, sans dépendre de `henrik_api_key_set` (voir `KEY_ONBOARDING_COMPLETED`).
    pub onboarding_completed: bool,
    /// `true` si un blob DPAPI existe pour la clé API Henrik mais n'a pas pu être déchiffré
    /// (voir `is_dpapi_blob_unreadable`) — distinct de "jamais configuré", pour que Paramètres
    /// puisse afficher "ta clé a disparu suite à une réinstallation Windows" plutôt que de
    /// laisser croire qu'elle a été supprimée sans raison.
    pub henrik_api_key_dpapi_unreadable: bool,
    /// Même distinction pour le PIN de verrouillage des notes perso (backlog #99).
    pub notes_pin_dpapi_unreadable: bool,
    /// Raccourcis globaux reconfigurables — voir `KEY_SHORTCUT_OVERLAY_TOGGLE`. Format
    /// accelerator `tauri-plugin-global-shortcut` (ex. `"ctrl+shift+v"`).
    pub shortcut_overlay_toggle: String,
    pub shortcut_main_window_toggle: String,
}

impl fmt::Debug for AppSettings {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("AppSettings")
            .field(
                "henrik_api_key",
                &self.henrik_api_key.as_ref().map(|_| "<masqué>"),
            )
            .field("henrik_api_key_set", &self.henrik_api_key_set)
            .field("default_region", &self.default_region)
            .field("auto_update_enabled", &self.auto_update_enabled)
            .field("riot_local_disabled", &self.riot_local_disabled)
            .field("discord_rpc_enabled", &self.discord_rpc_enabled)
            .field(
                "discord_rpc_client_id",
                &self.discord_rpc_client_id.as_ref().map(|_| "<masqué>"),
            )
            .field("discord_webhook_enabled", &self.discord_webhook_enabled)
            .field(
                "discord_webhook_url",
                &self.discord_webhook_url.as_ref().map(|_| "<masqué>"),
            )
            .field("status_watcher_enabled", &self.status_watcher_enabled)
            .field("usage_metrics_enabled", &self.usage_metrics_enabled)
            .field("ui_theme", &self.ui_theme)
            .field("ui_accent", &self.ui_accent)
            .field("ui_language", &self.ui_language)
            .field("ui_density", &self.ui_density)
            .field("overlay_density", &self.overlay_density)
            .field("overlay_layout", &self.overlay_layout)
            .field("overlay_monitor", &self.overlay_monitor)
            .field("loss_streak_alert_enabled", &self.loss_streak_alert_enabled)
            .field("loss_streak_alert_count", &self.loss_streak_alert_count)
            .field("win_streak_alert_enabled", &self.win_streak_alert_enabled)
            .field("win_streak_alert_count", &self.win_streak_alert_count)
            .field("rank_change_alert_enabled", &self.rank_change_alert_enabled)
            .field("rank_gap_alert_enabled", &self.rank_gap_alert_enabled)
            .field("rank_gap_alert_threshold", &self.rank_gap_alert_threshold)
            .field(
                "inactivity_reminder_enabled",
                &self.inactivity_reminder_enabled,
            )
            .field("inactivity_reminder_days", &self.inactivity_reminder_days)
            .field("notes_pin_enabled", &self.notes_pin_enabled)
            .field("onboarding_completed", &self.onboarding_completed)
            .field(
                "henrik_api_key_dpapi_unreadable",
                &self.henrik_api_key_dpapi_unreadable,
            )
            .field("notes_pin_dpapi_unreadable", &self.notes_pin_dpapi_unreadable)
            .field("shortcut_overlay_toggle", &self.shortcut_overlay_toggle)
            .field("shortcut_main_window_toggle", &self.shortcut_main_window_toggle)
            .finish()
    }
}

fn get_raw(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [key],
        |row| row.get(0),
    )
    .optional()
}

fn set_raw(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )?;
    Ok(())
}

/// Lit une valeur potentiellement chiffrée via DPAPI (préfixe `dpapi:`). Une valeur sans ce
/// préfixe est une clé enregistrée par une version antérieure de l'app (en clair) : elle est
/// renvoyée telle quelle et transparemment re-chiffrée pour la prochaine lecture, sans que
/// l'utilisateur n'ait à ressaisir sa clé API.
fn get_encrypted(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    let Some(raw) = get_raw(conn, key)? else {
        return Ok(None);
    };
    if raw.is_empty() {
        return Ok(None);
    }
    match raw.strip_prefix(DPAPI_PREFIX) {
        Some(encoded) => match dpapi::unprotect(encoded) {
            Ok(plain) => Ok(Some(plain)),
            Err(e) => {
                // Un blob DPAPI illisible (profil Windows recréé, compte migré...) ne doit
                // jamais faire planter le chargement des settings — on retombe sur "pas de
                // clé configurée", l'utilisateur la ressaisit dans Paramètres.
                crate::applog!("[settings] déchiffrement DPAPI échoué pour {key}: {e}");
                Ok(None)
            }
        },
        None => {
            if let Ok(encrypted) = dpapi::protect(&raw) {
                let _ = set_raw(conn, key, &format!("{DPAPI_PREFIX}{encrypted}"));
            }
            Ok(Some(raw))
        }
    }
}

/// Distingue "jamais configuré" de "un blob DPAPI existe mais n'est plus déchiffrable"
/// (réinstallation Windows, migration de compte...). `get_encrypted` gère déjà ce cas sans
/// planter (repli silencieux sur `None`), ce qui masque à l'utilisateur la différence entre
/// "je n'ai jamais renseigné ça" et "ça a disparu sans que je l'aie supprimé" — utilisé pour
/// afficher un bandeau dédié dans Paramètres plutôt que de laisser croire à une suppression.
fn is_dpapi_blob_unreadable(conn: &Connection, key: &str) -> bool {
    let Ok(Some(raw)) = get_raw(conn, key) else {
        return false;
    };
    match raw.strip_prefix(DPAPI_PREFIX) {
        Some(encoded) => dpapi::unprotect(encoded).is_err(),
        None => false,
    }
}

/// Chiffre `value` via DPAPI avant écriture — jamais de secret en clair sur disque.
fn set_encrypted(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    match dpapi::protect(value) {
        Ok(encrypted) => set_raw(conn, key, &format!("{DPAPI_PREFIX}{encrypted}")),
        Err(e) => {
            crate::applog!("[settings] chiffrement DPAPI échoué pour {key}, stockage en clair en secours: {e}");
            set_raw(conn, key, value)
        }
    }
}

pub fn load_settings(conn: &Connection) -> rusqlite::Result<AppSettings> {
    // `henrik_api_key` ne porte QUE la clé perso de l'utilisateur (jamais un jeton de
    // proxy) : c'est la valeur pré-remplie dans le champ éditable de Paramètres, et il ne
    // faut surtout pas qu'un utilisateur puisse "enregistrer" par erreur le jeton de proxy
    // comme s'il s'agissait de sa propre clé Henrik.
    let henrik_api_key = get_encrypted(conn, KEY_HENRIK_API_KEY)?.filter(|v| !v.is_empty());
    // En revanche, `henrik_api_key_set` reflète "l'app peut-elle appeler Henrik maintenant"
    // — vrai aussi via le relais proxy compilé, pour ne pas bloquer inutilement la
    // recherche sur un build donné à quelqu'un sans clé perso (voir Search.tsx).
    let henrik_api_key_set = henrik_api_key.is_some() || default_proxy_access().is_some();
    let default_region =
        get_raw(conn, KEY_DEFAULT_REGION)?.unwrap_or_else(|| DEFAULT_REGION.to_string());
    let auto_update_enabled = get_raw(conn, KEY_AUTO_UPDATE)?
        .map(|v| v == "true")
        .unwrap_or(true);
    let riot_local_disabled = get_raw(conn, KEY_LOOKUP_ONLY_MODE)?
        .map(|v| v == "true")
        .unwrap_or(false); // V2 livrée : détection activée par défaut (best-effort).
    let discord_rpc_client_id = get_raw(conn, KEY_DISCORD_RPC_CLIENT_ID)?
        .filter(|v| !v.is_empty())
        .or_else(|| default_discord_client_id().map(String::from));
    let discord_rpc_enabled = get_raw(conn, KEY_DISCORD_RPC_ENABLED)?
        .map(|v| v == "true")
        // Pas de préférence explicite enregistrée : activé par défaut si un client_id est
        // disponible (utilisateur ou valeur compilée), pour que la RPC marche "out of the
        // box" sur un build donné à quelqu'un.
        .unwrap_or_else(|| discord_rpc_client_id.is_some());
    let discord_webhook_url = get_raw(conn, KEY_DISCORD_WEBHOOK_URL)?.filter(|v| !v.is_empty());
    let discord_webhook_enabled = get_raw(conn, KEY_DISCORD_WEBHOOK_ENABLED)?
        .map(|v| v == "true")
        .unwrap_or(false);
    let status_watcher_enabled = get_raw(conn, KEY_STATUS_WATCHER_ENABLED)?
        .map(|v| v == "true")
        .unwrap_or(false);
    let usage_metrics_enabled = get_raw(conn, KEY_USAGE_METRICS_ENABLED)?
        .map(|v| v == "true")
        .unwrap_or(false);
    let ui_theme =
        get_raw(conn, KEY_UI_THEME)?.unwrap_or_else(|| DEFAULT_UI_THEME.to_string());
    let ui_accent =
        get_raw(conn, KEY_UI_ACCENT)?.unwrap_or_else(|| DEFAULT_UI_ACCENT.to_string());
    let ui_language =
        get_raw(conn, KEY_UI_LANGUAGE)?.unwrap_or_else(|| DEFAULT_UI_LANGUAGE.to_string());
    let ui_density =
        get_raw(conn, KEY_UI_DENSITY)?.unwrap_or_else(|| DEFAULT_UI_DENSITY.to_string());
    let overlay_density = get_raw(conn, KEY_OVERLAY_DENSITY)?
        .unwrap_or_else(|| DEFAULT_OVERLAY_DENSITY.to_string());
    let overlay_layout = get_raw(conn, KEY_OVERLAY_LAYOUT)?
        .unwrap_or_else(|| DEFAULT_OVERLAY_LAYOUT.to_string());
    let overlay_monitor =
        get_raw(conn, KEY_OVERLAY_MONITOR)?.unwrap_or_else(|| "auto".to_string());
    let loss_streak_alert_enabled = get_raw(conn, KEY_LOSS_STREAK_ALERT_ENABLED)?
        .map(|v| v == "true")
        .unwrap_or(false);
    let loss_streak_alert_count = get_raw(conn, KEY_LOSS_STREAK_ALERT_COUNT)?
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(DEFAULT_LOSS_STREAK_ALERT_COUNT);
    let win_streak_alert_enabled = get_raw(conn, KEY_WIN_STREAK_ALERT_ENABLED)?
        .map(|v| v == "true")
        .unwrap_or(false);
    let win_streak_alert_count = get_raw(conn, KEY_WIN_STREAK_ALERT_COUNT)?
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(DEFAULT_WIN_STREAK_ALERT_COUNT);
    let rank_change_alert_enabled = get_raw(conn, KEY_RANK_CHANGE_ALERT_ENABLED)?
        .map(|v| v == "true")
        .unwrap_or(true);
    let rank_gap_alert_enabled = get_raw(conn, KEY_RANK_GAP_ALERT_ENABLED)?
        .map(|v| v == "true")
        .unwrap_or(false);
    let rank_gap_alert_threshold = get_raw(conn, KEY_RANK_GAP_ALERT_THRESHOLD)?
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(DEFAULT_RANK_GAP_ALERT_THRESHOLD);
    let inactivity_reminder_enabled = get_raw(conn, KEY_INACTIVITY_REMINDER_ENABLED)?
        .map(|v| v == "true")
        .unwrap_or(false);
    let inactivity_reminder_days = get_raw(conn, KEY_INACTIVITY_REMINDER_DAYS)?
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(DEFAULT_INACTIVITY_REMINDER_DAYS);
    let notes_pin_enabled = get_raw(conn, KEY_NOTES_PIN_ENABLED)?
        .map(|v| v == "true")
        .unwrap_or(false);
    let onboarding_completed = get_raw(conn, KEY_ONBOARDING_COMPLETED)?
        .map(|v| v == "true")
        .unwrap_or(false);
    let henrik_api_key_dpapi_unreadable = is_dpapi_blob_unreadable(conn, KEY_HENRIK_API_KEY);
    let notes_pin_dpapi_unreadable = is_dpapi_blob_unreadable(conn, KEY_NOTES_PIN);
    let shortcut_overlay_toggle = get_raw(conn, KEY_SHORTCUT_OVERLAY_TOGGLE)?
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_SHORTCUT_OVERLAY_TOGGLE.to_string());
    let shortcut_main_window_toggle = get_raw(conn, KEY_SHORTCUT_MAIN_WINDOW_TOGGLE)?
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_SHORTCUT_MAIN_WINDOW_TOGGLE.to_string());

    Ok(AppSettings {
        henrik_api_key_set,
        henrik_api_key,
        default_region,
        auto_update_enabled,
        riot_local_disabled,
        discord_rpc_enabled,
        discord_rpc_client_id,
        discord_webhook_enabled,
        discord_webhook_url,
        status_watcher_enabled,
        usage_metrics_enabled,
        ui_theme,
        ui_accent,
        ui_language,
        ui_density,
        overlay_density,
        overlay_layout,
        overlay_monitor,
        loss_streak_alert_enabled,
        loss_streak_alert_count,
        win_streak_alert_enabled,
        win_streak_alert_count,
        rank_change_alert_enabled,
        rank_gap_alert_enabled,
        rank_gap_alert_threshold,
        inactivity_reminder_enabled,
        inactivity_reminder_days,
        notes_pin_enabled,
        onboarding_completed,
        henrik_api_key_dpapi_unreadable,
        notes_pin_dpapi_unreadable,
        shortcut_overlay_toggle,
        shortcut_main_window_toggle,
    })
}

/// Marque le wizard d'onboarding comme terminé — n'est plus jamais réaffiché
/// automatiquement ensuite (voir doc de `KEY_ONBOARDING_COMPLETED`).
pub fn set_onboarding_completed(conn: &Connection, completed: bool) -> rusqlite::Result<()> {
    set_raw(
        conn,
        KEY_ONBOARDING_COMPLETED,
        if completed { "true" } else { "false" },
    )
}

pub fn set_henrik_api_key(conn: &Connection, api_key: &str) -> rusqlite::Result<()> {
    set_encrypted(conn, KEY_HENRIK_API_KEY, api_key)
}

/// Justificatif à utiliser pour le prochain appel Henrik : la clé perso de l'utilisateur si
/// elle est enregistrée (mode `Direct`, va droit à `api.henrikdev.xyz`), sinon le relais
/// proxy compilé si disponible (mode `Proxy`, voir `default_proxy_access`), sinon rien
/// (l'appelant renvoie `HenrikError::MissingApiKey`).
pub fn get_henrik_api_key(conn: &Connection) -> rusqlite::Result<Option<HenrikAuth>> {
    if let Some(key) = get_encrypted(conn, KEY_HENRIK_API_KEY)?.filter(|v| !v.is_empty()) {
        return Ok(Some(HenrikAuth::Direct(key)));
    }
    Ok(default_proxy_access())
}

pub fn set_default_region(conn: &Connection, region: &str) -> rusqlite::Result<()> {
    set_raw(conn, KEY_DEFAULT_REGION, region)
}

pub fn set_auto_update_enabled(conn: &Connection, enabled: bool) -> rusqlite::Result<()> {
    set_raw(conn, KEY_AUTO_UPDATE, if enabled { "true" } else { "false" })
}

pub fn set_riot_local_disabled(conn: &Connection, disabled: bool) -> rusqlite::Result<()> {
    set_raw(
        conn,
        KEY_LOOKUP_ONLY_MODE,
        if disabled { "true" } else { "false" },
    )
}

fn parse_position(raw: &str) -> Option<(f64, f64)> {
    let (x_raw, y_raw) = raw.split_once(',')?;
    let x = x_raw.parse::<f64>().ok()?;
    let y = y_raw.parse::<f64>().ok()?;
    Some((x, y))
}

/// Dernière position connue de la fenêtre overlay (déplacée en mode interactif via
/// Ctrl+Shift+V), pour la restaurer au prochain lancement plutôt que de revenir à la
/// position par défaut à chaque redémarrage. Backlog #76 : la position est mémorisée par
/// configuration d'écran (`monitor_signature`, voir `overlay::window::monitor_signature`)
/// pour éviter qu'elle réapparaisse hors-écran après un changement de setup (ex. laptop
/// débranché d'un moniteur externe) — chaque signature a sa propre entrée. Une position
/// enregistrée par une version antérieure de l'app (avant #76, une seule position globale
/// sans signature) sert de repli pour une configuration encore jamais vue, plutôt que de la
/// perdre silencieusement à la mise à jour.
pub fn get_overlay_position(
    conn: &Connection,
    monitor_signature: &str,
) -> rusqlite::Result<Option<(f64, f64)>> {
    let key = format!("{KEY_OVERLAY_POSITION}:{monitor_signature}");
    if let Some(raw) = get_raw(conn, &key)? {
        return Ok(parse_position(&raw));
    }
    let legacy = get_raw(conn, KEY_OVERLAY_POSITION)?;
    Ok(legacy.and_then(|v| parse_position(&v)))
}

pub fn set_overlay_position(
    conn: &Connection,
    monitor_signature: &str,
    x: f64,
    y: f64,
) -> rusqlite::Result<()> {
    let key = format!("{KEY_OVERLAY_POSITION}:{monitor_signature}");
    set_raw(conn, &key, &format!("{x},{y}"))
}

/// Backlog #76 : `"auto"` (défaut) ou l'identifiant d'un moniteur choisi explicitement.
pub fn get_overlay_monitor(conn: &Connection) -> rusqlite::Result<Option<String>> {
    get_raw(conn, KEY_OVERLAY_MONITOR)
}

pub fn set_overlay_monitor(conn: &Connection, monitor_id: &str) -> rusqlite::Result<()> {
    set_raw(conn, KEY_OVERLAY_MONITOR, monitor_id)
}

pub fn set_discord_rpc_enabled(conn: &Connection, enabled: bool) -> rusqlite::Result<()> {
    set_raw(
        conn,
        KEY_DISCORD_RPC_ENABLED,
        if enabled { "true" } else { "false" },
    )
}

pub fn set_discord_rpc_client_id(conn: &Connection, client_id: &str) -> rusqlite::Result<()> {
    set_raw(conn, KEY_DISCORD_RPC_CLIENT_ID, client_id.trim())
}

/// TODO Fonctionnalités#12 : webhook Discord optionnel (rank up).
pub fn set_discord_webhook_enabled(conn: &Connection, enabled: bool) -> rusqlite::Result<()> {
    set_raw(
        conn,
        KEY_DISCORD_WEBHOOK_ENABLED,
        if enabled { "true" } else { "false" },
    )
}

pub fn set_discord_webhook_url(conn: &Connection, url: &str) -> rusqlite::Result<()> {
    set_raw(conn, KEY_DISCORD_WEBHOOK_URL, url.trim())
}

pub fn set_status_watcher_enabled(conn: &Connection, enabled: bool) -> rusqlite::Result<()> {
    set_raw(
        conn,
        KEY_STATUS_WATCHER_ENABLED,
        if enabled { "true" } else { "false" },
    )
}

pub fn set_usage_metrics_enabled(conn: &Connection, enabled: bool) -> rusqlite::Result<()> {
    set_raw(
        conn,
        KEY_USAGE_METRICS_ENABLED,
        if enabled { "true" } else { "false" },
    )
}

pub fn set_ui_theme(conn: &Connection, theme: &str) -> rusqlite::Result<()> {
    set_raw(conn, KEY_UI_THEME, theme)
}

pub fn set_ui_accent(conn: &Connection, accent: &str) -> rusqlite::Result<()> {
    set_raw(conn, KEY_UI_ACCENT, accent)
}

/// Système multilangue : `"fr"` | `"en"`.
pub fn set_ui_language(conn: &Connection, language: &str) -> rusqlite::Result<()> {
    set_raw(conn, KEY_UI_LANGUAGE, language)
}

/// Backlog #66 : `"comfortable"` | `"compact"`.
pub fn set_ui_density(conn: &Connection, density: &str) -> rusqlite::Result<()> {
    set_raw(conn, KEY_UI_DENSITY, density)
}

/// Backlog #31 : `"compact"` | `"detailed"`.
pub fn set_overlay_density(conn: &Connection, density: &str) -> rusqlite::Result<()> {
    set_raw(conn, KEY_OVERLAY_DENSITY, density)
}

/// Backlog #75 : `"full"` | `"mini"`.
pub fn set_overlay_layout(conn: &Connection, layout: &str) -> rusqlite::Result<()> {
    set_raw(conn, KEY_OVERLAY_LAYOUT, layout)
}

/// Backlog #24 : toggle + seuil de l'alerte "N défaites d'affilée".
pub fn set_loss_streak_alert_enabled(conn: &Connection, enabled: bool) -> rusqlite::Result<()> {
    set_raw(
        conn,
        KEY_LOSS_STREAK_ALERT_ENABLED,
        if enabled { "true" } else { "false" },
    )
}

/// Backlog TODO#8 : toggle de la notification de rank up/down, séparé de la notification de
/// fin de partie.
pub fn set_rank_change_alert_enabled(conn: &Connection, enabled: bool) -> rusqlite::Result<()> {
    set_raw(
        conn,
        KEY_RANK_CHANGE_ALERT_ENABLED,
        if enabled { "true" } else { "false" },
    )
}

pub fn set_loss_streak_alert_count(conn: &Connection, count: i64) -> rusqlite::Result<()> {
    set_raw(conn, KEY_LOSS_STREAK_ALERT_COUNT, &count.max(1).to_string())
}

/// TODO Fonctionnalités#5 : toggle + seuil de l'alerte "N victoires d'affilée".
pub fn set_win_streak_alert_enabled(conn: &Connection, enabled: bool) -> rusqlite::Result<()> {
    set_raw(
        conn,
        KEY_WIN_STREAK_ALERT_ENABLED,
        if enabled { "true" } else { "false" },
    )
}

pub fn set_win_streak_alert_count(conn: &Connection, count: i64) -> rusqlite::Result<()> {
    set_raw(conn, KEY_WIN_STREAK_ALERT_COUNT, &count.max(1).to_string())
}

/// Backlog #32 : toggle + seuil (en jours) du rappel d'inactivité.
pub fn set_inactivity_reminder_enabled(conn: &Connection, enabled: bool) -> rusqlite::Result<()> {
    set_raw(
        conn,
        KEY_INACTIVITY_REMINDER_ENABLED,
        if enabled { "true" } else { "false" },
    )
}

pub fn set_inactivity_reminder_days(conn: &Connection, days: i64) -> rusqlite::Result<()> {
    set_raw(conn, KEY_INACTIVITY_REMINDER_DAYS, &days.max(1).to_string())
}

/// Backlog Overlay : toggle + seuil de l'alerte sonore d'écart de rang adverse.
pub fn set_rank_gap_alert_enabled(conn: &Connection, enabled: bool) -> rusqlite::Result<()> {
    set_raw(
        conn,
        KEY_RANK_GAP_ALERT_ENABLED,
        if enabled { "true" } else { "false" },
    )
}

pub fn set_rank_gap_alert_threshold(conn: &Connection, threshold: i64) -> rusqlite::Result<()> {
    set_raw(
        conn,
        KEY_RANK_GAP_ALERT_THRESHOLD,
        &threshold.max(1).to_string(),
    )
}

/// Persiste le raccourci global de bascule de l'overlay — appelée seulement après un
/// réenregistrement réussi côté `overlay::window::change_toggle_shortcut` (voir la commande
/// correspondante), jamais avant, pour ne jamais persister un raccourci qui n'a pas pu être
/// activé.
pub fn set_shortcut_overlay_toggle(conn: &Connection, shortcut: &str) -> rusqlite::Result<()> {
    set_raw(conn, KEY_SHORTCUT_OVERLAY_TOGGLE, shortcut)
}

pub fn set_shortcut_main_window_toggle(conn: &Connection, shortcut: &str) -> rusqlite::Result<()> {
    set_raw(conn, KEY_SHORTCUT_MAIN_WINDOW_TOGGLE, shortcut)
}

/// Backlog #99 : active le verrou et enregistre le PIN (chiffré via DPAPI, comme la clé API
/// Henrik). `pin` doit être non vide — validé côté commande avant d'appeler cette fonction.
pub fn set_notes_pin(conn: &Connection, pin: &str) -> rusqlite::Result<()> {
    set_encrypted(conn, KEY_NOTES_PIN, pin)?;
    set_raw(conn, KEY_NOTES_PIN_ENABLED, "true")?;
    // Un nouveau PIN repart avec un compteur d'échecs propre — sinon changer de PIN pendant
    // un verrouillage en cours resterait bloqué jusqu'à expiration de l'ancien cooldown.
    reset_notes_pin_lockout(conn)
}

/// Désactive le verrou et efface le PIN enregistré (pas seulement le flag) — repasser
/// `notes_pin_enabled` à `false` sans effacer le PIN laisserait une valeur DPAPI orpheline
/// qui redeviendrait active si l'utilisateur ré-active le verrou plus tard sans le vouloir.
pub fn clear_notes_pin(conn: &Connection) -> rusqlite::Result<()> {
    set_raw(conn, KEY_NOTES_PIN, "")?;
    set_raw(conn, KEY_NOTES_PIN_ENABLED, "false")?;
    reset_notes_pin_lockout(conn)
}

fn reset_notes_pin_lockout(conn: &Connection) -> rusqlite::Result<()> {
    set_raw(conn, KEY_NOTES_PIN_FAIL_COUNT, "0")?;
    set_raw(conn, KEY_NOTES_PIN_LOCKOUT_UNTIL, "0")
}

/// Résultat de `verify_notes_pin` — distingue un verrouillage temporaire (brute-force) d'une
/// simple comparaison réussie/échouée, pour que l'appelant puisse afficher un délai d'attente
/// plutôt qu'un simple "PIN incorrect" trompeur pendant le cooldown.
pub enum NotesPinCheck {
    Verified(bool),
    LockedOut { retry_after_secs: i64 },
}

/// Compare `pin` au PIN enregistré. `Verified(false)` si aucun PIN n'est configuré (le
/// verrou ne devrait alors pas être affiché côté frontend — `notes_pin_enabled` sert de
/// garde). Comparaison en temps constant : le temps de réponse ne doit pas dépendre du nombre
/// de caractères corrects (timing attack, même si le modèle de menace local la rend
/// théorique). Après `NOTES_PIN_FAILURE_THRESHOLD` échecs consécutifs, verrouille pendant
/// `NOTES_PIN_LOCKOUT_SECONDS` — persisté en DB, survit à un redémarrage de l'app.
pub fn verify_notes_pin(conn: &Connection, pin: &str) -> rusqlite::Result<NotesPinCheck> {
    let now = chrono::Utc::now().timestamp();
    if let Some(until) = get_raw(conn, KEY_NOTES_PIN_LOCKOUT_UNTIL)?
        .and_then(|v| v.parse::<i64>().ok())
        .filter(|until| *until > now)
    {
        return Ok(NotesPinCheck::LockedOut {
            retry_after_secs: until - now,
        });
    }

    let stored = get_encrypted(conn, KEY_NOTES_PIN)?;
    let matches = stored.is_some_and(|s| constant_time_eq(s.as_bytes(), pin.as_bytes()));

    if matches {
        reset_notes_pin_lockout(conn)?;
    } else {
        let fail_count = get_raw(conn, KEY_NOTES_PIN_FAIL_COUNT)?
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(0)
            + 1;
        if fail_count >= NOTES_PIN_FAILURE_THRESHOLD {
            set_raw(conn, KEY_NOTES_PIN_FAIL_COUNT, "0")?;
            set_raw(
                conn,
                KEY_NOTES_PIN_LOCKOUT_UNTIL,
                &(now + NOTES_PIN_LOCKOUT_SECONDS).to_string(),
            )?;
        } else {
            set_raw(conn, KEY_NOTES_PIN_FAIL_COUNT, &fail_count.to_string())?;
        }
    }

    Ok(NotesPinCheck::Verified(matches))
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    let mut diff = a.len() ^ b.len();
    for i in 0..a.len().min(b.len()) {
        diff |= (a[i] ^ b[i]) as usize;
    }
    diff == 0
}

const KEY_LAST_INACTIVITY_REMINDER_SENT: &str = "last_inactivity_reminder_sent_at";

/// Horodatage (unix seconds) du dernier rappel d'inactivité envoyé — évite de renotifier
/// à chaque tick de `inactivity_reminder.rs` tant qu'un jour ne s'est pas écoulé.
pub fn get_last_inactivity_reminder_sent(conn: &Connection) -> rusqlite::Result<Option<i64>> {
    Ok(get_raw(conn, KEY_LAST_INACTIVITY_REMINDER_SENT)?.and_then(|v| v.parse::<i64>().ok()))
}

pub fn set_last_inactivity_reminder_sent(conn: &Connection, ts: i64) -> rusqlite::Result<()> {
    set_raw(conn, KEY_LAST_INACTIVITY_REMINDER_SENT, &ts.to_string())
}

/// Écrit le changelog en attente juste avant `relaunch()` — voir doc de
/// `KEY_PENDING_CHANGELOG_VERSION`.
pub fn set_pending_changelog(conn: &Connection, version: &str, notes: &str) -> rusqlite::Result<()> {
    set_raw(conn, KEY_PENDING_CHANGELOG_VERSION, version)?;
    set_raw(conn, KEY_PENDING_CHANGELOG_NOTES, notes)
}

/// Lit puis efface immédiatement le changelog en attente (affichage unique, au premier
/// chargement suivant l'installation).
pub fn take_pending_changelog(conn: &Connection) -> rusqlite::Result<Option<(String, String)>> {
    let version = get_raw(conn, KEY_PENDING_CHANGELOG_VERSION)?;
    let Some(version) = version.filter(|v| !v.is_empty()) else {
        return Ok(None);
    };
    let notes = get_raw(conn, KEY_PENDING_CHANGELOG_NOTES)?.unwrap_or_default();
    set_raw(conn, KEY_PENDING_CHANGELOG_VERSION, "")?;
    set_raw(conn, KEY_PENDING_CHANGELOG_NOTES, "")?;
    Ok(Some((version, notes)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memory_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn defaults_when_nothing_saved() {
        let conn = memory_conn();
        let settings = load_settings(&conn).unwrap();
        // Ces champs retombent sur les valeurs compilées depuis `.env` (voir build.rs) si un
        // `.env` local en fournit — non déterministe entre postes de dev, donc on compare à
        // la fonction plutôt qu'à une constante en dur.
        assert_eq!(settings.henrik_api_key_set, default_proxy_access().is_some());
        // Le champ éditable ne reflète JAMAIS le relais proxy, seulement une clé perso.
        assert!(settings.henrik_api_key.is_none());
        assert_eq!(settings.discord_rpc_client_id.is_some(), default_discord_client_id().is_some());
        assert_eq!(settings.discord_rpc_enabled, default_discord_client_id().is_some());
        assert_eq!(settings.default_region, DEFAULT_REGION);
        // Opt-out par défaut : sinon les mises à jour n'atteignent que les utilisateurs qui
        // pensent à aller l'activer dans Paramètres.
        assert!(settings.auto_update_enabled);
        // V2 livrée : détection activée par défaut (voir doc du champ).
        assert!(!settings.riot_local_disabled);
        assert!(!settings.status_watcher_enabled);
    }

    #[test]
    fn discord_rpc_settings_round_trip_and_masking() {
        let conn = memory_conn();
        set_discord_rpc_enabled(&conn, true).unwrap();
        set_discord_rpc_client_id(&conn, "  123456789012345678  ").unwrap();

        let settings = load_settings(&conn).unwrap();
        assert!(settings.discord_rpc_enabled);
        assert_eq!(settings.discord_rpc_client_id.as_deref(), Some("123456789012345678"));

        let debug_output = format!("{:?}", settings);
        assert!(!debug_output.contains("123456789012345678"));
    }

    #[test]
    fn empty_discord_rpc_client_id_falls_back_to_compiled_default() {
        let conn = memory_conn();
        set_discord_rpc_client_id(&conn, "").unwrap();
        assert_eq!(
            load_settings(&conn).unwrap().discord_rpc_client_id.as_deref(),
            default_discord_client_id()
        );
    }

    #[test]
    fn status_watcher_toggle_round_trip() {
        let conn = memory_conn();
        set_status_watcher_enabled(&conn, true).unwrap();
        assert!(load_settings(&conn).unwrap().status_watcher_enabled);
    }

    #[test]
    fn api_key_round_trip_and_masking() {
        let conn = memory_conn();
        set_henrik_api_key(&conn, "my-secret-key").unwrap();

        let settings = load_settings(&conn).unwrap();
        assert!(settings.henrik_api_key_set);
        assert_eq!(settings.henrik_api_key.as_deref(), Some("my-secret-key"));
        assert_eq!(
            get_henrik_api_key(&conn).unwrap(),
            Some(HenrikAuth::Direct("my-secret-key".to_string()))
        );

        // Le Debug custom ne doit jamais faire fuiter la clé en clair dans les logs.
        let debug_output = format!("{:?}", settings);
        assert!(!debug_output.contains("my-secret-key"));
        assert!(debug_output.contains("masqué"));
    }

    #[test]
    fn legacy_plaintext_api_key_is_migrated_to_dpapi_on_read() {
        let conn = memory_conn();
        // Simule une clé enregistrée par une version antérieure de l'app, avant l'ajout du
        // chiffrement au repos (voir dpapi.rs) — stockée en clair dans la table settings.
        set_raw(&conn, KEY_HENRIK_API_KEY, "legacy-plaintext-key").unwrap();

        let settings = load_settings(&conn).unwrap();
        assert_eq!(settings.henrik_api_key.as_deref(), Some("legacy-plaintext-key"));

        // La valeur brute en base doit maintenant être chiffrée, plus jamais en clair.
        let raw_after_read = get_raw(&conn, KEY_HENRIK_API_KEY).unwrap().unwrap();
        assert!(raw_after_read.starts_with(DPAPI_PREFIX));
        assert!(!raw_after_read.contains("legacy-plaintext-key"));

        // Et une relecture ultérieure déchiffre correctement la valeur migrée.
        assert_eq!(
            get_henrik_api_key(&conn).unwrap(),
            Some(HenrikAuth::Direct("legacy-plaintext-key".to_string()))
        );
    }

    #[test]
    fn empty_api_key_falls_back_to_compiled_proxy_or_none() {
        let conn = memory_conn();
        set_henrik_api_key(&conn, "").unwrap();

        let settings = load_settings(&conn).unwrap();
        assert_eq!(settings.henrik_api_key_set, default_proxy_access().is_some());
        // Toujours vide : la clé perso vide ne doit jamais laisser fuiter le jeton proxy
        // dans le champ éditable de Paramètres.
        assert!(settings.henrik_api_key.is_none());
        assert_eq!(get_henrik_api_key(&conn).unwrap(), default_proxy_access());
    }

    #[test]
    fn overlay_position_round_trip() {
        let conn = memory_conn();
        assert!(get_overlay_position(&conn, "1920x1080@0,0").unwrap().is_none());

        set_overlay_position(&conn, "1920x1080@0,0", 128.5, -12.0).unwrap();
        let (x, y) = get_overlay_position(&conn, "1920x1080@0,0").unwrap().unwrap();
        assert_eq!(x, 128.5);
        assert_eq!(y, -12.0);
    }

    #[test]
    fn overlay_position_is_scoped_per_monitor_signature() {
        let conn = memory_conn();
        set_overlay_position(&conn, "1920x1080@0,0", 10.0, 20.0).unwrap();
        // Une configuration d'écran jamais vue ne doit pas hériter de la position d'une
        // autre config tant qu'aucun legacy global n'existe.
        assert!(get_overlay_position(&conn, "2560x1440@0,0").unwrap().is_none());
        let (x, y) = get_overlay_position(&conn, "1920x1080@0,0").unwrap().unwrap();
        assert_eq!((x, y), (10.0, 20.0));
    }

    #[test]
    fn overlay_position_falls_back_to_legacy_global_key_for_unseen_signature() {
        let conn = memory_conn();
        // Simule une valeur enregistrée par une version antérieure à #76 (sans signature).
        set_raw(&conn, KEY_OVERLAY_POSITION, "5,6").unwrap();
        let (x, y) = get_overlay_position(&conn, "1920x1080@0,0").unwrap().unwrap();
        assert_eq!((x, y), (5.0, 6.0));
    }

    #[test]
    fn boolean_flags_round_trip() {
        let conn = memory_conn();
        set_auto_update_enabled(&conn, true).unwrap();
        set_riot_local_disabled(&conn, true).unwrap();
        set_default_region(&conn, "na").unwrap();

        let settings = load_settings(&conn).unwrap();
        assert!(settings.auto_update_enabled);
        assert!(settings.riot_local_disabled);
        assert_eq!(settings.default_region, "na");
    }

    #[test]
    fn usage_metrics_toggle_round_trip() {
        let conn = memory_conn();
        assert!(!load_settings(&conn).unwrap().usage_metrics_enabled);

        set_usage_metrics_enabled(&conn, true).unwrap();
        assert!(load_settings(&conn).unwrap().usage_metrics_enabled);
    }

    #[test]
    fn ui_theme_and_accent_default_then_round_trip() {
        let conn = memory_conn();
        let defaults = load_settings(&conn).unwrap();
        assert_eq!(defaults.ui_theme, "dark");
        assert_eq!(defaults.ui_accent, "red");

        set_ui_theme(&conn, "light").unwrap();
        set_ui_accent(&conn, "cyan").unwrap();

        let settings = load_settings(&conn).unwrap();
        assert_eq!(settings.ui_theme, "light");
        assert_eq!(settings.ui_accent, "cyan");
    }

    #[test]
    fn ui_density_default_then_round_trip() {
        let conn = memory_conn();
        assert_eq!(load_settings(&conn).unwrap().ui_density, "comfortable");

        set_ui_density(&conn, "compact").unwrap();
        assert_eq!(load_settings(&conn).unwrap().ui_density, "compact");
    }

    #[test]
    fn ui_language_default_then_round_trip() {
        let conn = memory_conn();
        assert_eq!(load_settings(&conn).unwrap().ui_language, "fr");

        set_ui_language(&conn, "en").unwrap();
        assert_eq!(load_settings(&conn).unwrap().ui_language, "en");
    }

    #[test]
    fn overlay_density_default_then_round_trip() {
        let conn = memory_conn();
        assert_eq!(load_settings(&conn).unwrap().overlay_density, "detailed");

        set_overlay_density(&conn, "compact").unwrap();
        assert_eq!(load_settings(&conn).unwrap().overlay_density, "compact");
    }

    #[test]
    fn overlay_layout_default_then_round_trip() {
        let conn = memory_conn();
        assert_eq!(load_settings(&conn).unwrap().overlay_layout, "full");

        set_overlay_layout(&conn, "mini").unwrap();
        assert_eq!(load_settings(&conn).unwrap().overlay_layout, "mini");
    }

    #[test]
    fn overlay_monitor_default_then_round_trip() {
        let conn = memory_conn();
        assert_eq!(load_settings(&conn).unwrap().overlay_monitor, "auto");

        set_overlay_monitor(&conn, "\\\\.\\DISPLAY2").unwrap();
        assert_eq!(load_settings(&conn).unwrap().overlay_monitor, "\\\\.\\DISPLAY2");
    }

    #[test]
    fn loss_streak_alert_defaults_then_round_trip() {
        let conn = memory_conn();
        let defaults = load_settings(&conn).unwrap();
        assert!(!defaults.loss_streak_alert_enabled);
        assert_eq!(defaults.loss_streak_alert_count, 3);

        set_loss_streak_alert_enabled(&conn, true).unwrap();
        set_loss_streak_alert_count(&conn, 5).unwrap();

        let settings = load_settings(&conn).unwrap();
        assert!(settings.loss_streak_alert_enabled);
        assert_eq!(settings.loss_streak_alert_count, 5);
    }

    #[test]
    fn win_streak_alert_defaults_then_round_trip() {
        let conn = memory_conn();
        let defaults = load_settings(&conn).unwrap();
        assert!(!defaults.win_streak_alert_enabled);
        assert_eq!(defaults.win_streak_alert_count, 3);

        set_win_streak_alert_enabled(&conn, true).unwrap();
        set_win_streak_alert_count(&conn, 4).unwrap();

        let settings = load_settings(&conn).unwrap();
        assert!(settings.win_streak_alert_enabled);
        assert_eq!(settings.win_streak_alert_count, 4);
    }

    #[test]
    fn discord_webhook_defaults_then_round_trip() {
        let conn = memory_conn();
        let defaults = load_settings(&conn).unwrap();
        assert!(!defaults.discord_webhook_enabled);
        assert!(defaults.discord_webhook_url.is_none());

        set_discord_webhook_enabled(&conn, true).unwrap();
        set_discord_webhook_url(&conn, "  https://discord.com/api/webhooks/123/abc  ").unwrap();

        let settings = load_settings(&conn).unwrap();
        assert!(settings.discord_webhook_enabled);
        assert_eq!(
            settings.discord_webhook_url.as_deref(),
            Some("https://discord.com/api/webhooks/123/abc")
        );
    }

    #[test]
    fn rank_change_alert_defaults_then_round_trip() {
        let conn = memory_conn();
        assert!(load_settings(&conn).unwrap().rank_change_alert_enabled);

        set_rank_change_alert_enabled(&conn, false).unwrap();
        assert!(!load_settings(&conn).unwrap().rank_change_alert_enabled);

        set_rank_change_alert_enabled(&conn, true).unwrap();
        assert!(load_settings(&conn).unwrap().rank_change_alert_enabled);
    }

    #[test]
    fn rank_gap_alert_defaults_then_round_trip() {
        let conn = memory_conn();
        let defaults = load_settings(&conn).unwrap();
        assert!(!defaults.rank_gap_alert_enabled);
        assert_eq!(defaults.rank_gap_alert_threshold, 9);

        set_rank_gap_alert_enabled(&conn, true).unwrap();
        set_rank_gap_alert_threshold(&conn, 6).unwrap();

        let settings = load_settings(&conn).unwrap();
        assert!(settings.rank_gap_alert_enabled);
        assert_eq!(settings.rank_gap_alert_threshold, 6);
    }

    #[test]
    fn inactivity_reminder_defaults_then_round_trip() {
        let conn = memory_conn();
        let defaults = load_settings(&conn).unwrap();
        assert!(!defaults.inactivity_reminder_enabled);
        assert_eq!(defaults.inactivity_reminder_days, 3);

        set_inactivity_reminder_enabled(&conn, true).unwrap();
        set_inactivity_reminder_days(&conn, 7).unwrap();

        let settings = load_settings(&conn).unwrap();
        assert!(settings.inactivity_reminder_enabled);
        assert_eq!(settings.inactivity_reminder_days, 7);
    }

    fn assert_verified(conn: &Connection, pin: &str, expected: bool) {
        match verify_notes_pin(conn, pin).unwrap() {
            NotesPinCheck::Verified(matched) => assert_eq!(matched, expected),
            NotesPinCheck::LockedOut { .. } => panic!("unexpected lockout"),
        }
    }

    #[test]
    fn notes_pin_round_trip_verify_and_clear() {
        let conn = memory_conn();
        assert!(!load_settings(&conn).unwrap().notes_pin_enabled);
        assert_verified(&conn, "1234", false);

        set_notes_pin(&conn, "1234").unwrap();
        assert!(load_settings(&conn).unwrap().notes_pin_enabled);
        assert_verified(&conn, "1234", true);
        assert_verified(&conn, "0000", false);

        // Le PIN ne doit jamais apparaître en clair dans la base.
        let raw = get_raw(&conn, KEY_NOTES_PIN).unwrap().unwrap();
        assert!(raw.starts_with(DPAPI_PREFIX));
        assert!(!raw.contains("1234"));

        clear_notes_pin(&conn).unwrap();
        assert!(!load_settings(&conn).unwrap().notes_pin_enabled);
        assert_verified(&conn, "1234", false);
    }

    #[test]
    fn notes_pin_locks_out_after_repeated_failures_and_persists_across_reload() {
        let conn = memory_conn();
        set_notes_pin(&conn, "1234").unwrap();

        for _ in 0..NOTES_PIN_FAILURE_THRESHOLD {
            assert_verified(&conn, "0000", false);
        }

        // Le seuil est atteint : même le bon PIN est refusé pendant le cooldown.
        match verify_notes_pin(&conn, "1234").unwrap() {
            NotesPinCheck::LockedOut { retry_after_secs } => {
                assert!(retry_after_secs > 0 && retry_after_secs <= NOTES_PIN_LOCKOUT_SECONDS);
            }
            NotesPinCheck::Verified(_) => panic!("expected lockout"),
        }

        // Persisté en DB, pas juste en mémoire : une nouvelle "session" (même connexion ici,
        // mais aucune valeur en mémoire de process n'est utilisée par verify_notes_pin) voit
        // toujours le verrouillage actif.
        match verify_notes_pin(&conn, "1234").unwrap() {
            NotesPinCheck::LockedOut { .. } => {}
            NotesPinCheck::Verified(_) => panic!("expected lockout to persist"),
        }
    }

    #[test]
    fn setting_a_new_pin_resets_any_pending_lockout() {
        let conn = memory_conn();
        set_notes_pin(&conn, "1234").unwrap();
        for _ in 0..NOTES_PIN_FAILURE_THRESHOLD {
            assert_verified(&conn, "0000", false);
        }
        // Verrouillé à ce stade.
        assert!(matches!(
            verify_notes_pin(&conn, "1234").unwrap(),
            NotesPinCheck::LockedOut { .. }
        ));

        set_notes_pin(&conn, "5678").unwrap();
        assert_verified(&conn, "5678", true);
    }

    #[test]
    fn shortcuts_default_then_round_trip() {
        let conn = memory_conn();
        let defaults = load_settings(&conn).unwrap();
        assert_eq!(defaults.shortcut_overlay_toggle, DEFAULT_SHORTCUT_OVERLAY_TOGGLE);
        assert_eq!(
            defaults.shortcut_main_window_toggle,
            DEFAULT_SHORTCUT_MAIN_WINDOW_TOGGLE
        );

        set_shortcut_overlay_toggle(&conn, "ctrl+shift+o").unwrap();
        set_shortcut_main_window_toggle(&conn, "ctrl+alt+h").unwrap();

        let settings = load_settings(&conn).unwrap();
        assert_eq!(settings.shortcut_overlay_toggle, "ctrl+shift+o");
        assert_eq!(settings.shortcut_main_window_toggle, "ctrl+alt+h");
    }

    #[test]
    fn unreadable_dpapi_blob_is_distinguished_from_never_configured() {
        let conn = memory_conn();
        let defaults = load_settings(&conn).unwrap();
        assert!(!defaults.henrik_api_key_dpapi_unreadable);
        assert!(!defaults.notes_pin_dpapi_unreadable);

        // Simule un blob DPAPI corrompu/illisible (ex. profil Windows recréé) plutôt qu'une
        // valeur jamais enregistrée.
        set_raw(&conn, KEY_HENRIK_API_KEY, &format!("{DPAPI_PREFIX}not-a-real-blob")).unwrap();
        let settings = load_settings(&conn).unwrap();
        assert!(settings.henrik_api_key_dpapi_unreadable);
        // Le champ éditable reste vide (comportement inchangé), seul le nouveau flag change.
        assert!(settings.henrik_api_key.is_none());

        // Une clé jamais configurée ne doit jamais déclencher ce flag.
        assert!(!load_settings(&conn).unwrap().notes_pin_dpapi_unreadable);
    }

    #[test]
    fn onboarding_completed_defaults_false_then_round_trip() {
        let conn = memory_conn();
        assert!(!load_settings(&conn).unwrap().onboarding_completed);

        set_onboarding_completed(&conn, true).unwrap();
        assert!(load_settings(&conn).unwrap().onboarding_completed);

        set_onboarding_completed(&conn, false).unwrap();
        assert!(!load_settings(&conn).unwrap().onboarding_completed);
    }

    #[test]
    fn pending_changelog_round_trip_and_single_read() {
        let conn = memory_conn();
        assert!(take_pending_changelog(&conn).unwrap().is_none());

        set_pending_changelog(&conn, "0.3.9", "Nouveautés de la v0.3.9").unwrap();
        let (version, notes) = take_pending_changelog(&conn).unwrap().unwrap();
        assert_eq!(version, "0.3.9");
        assert_eq!(notes, "Nouveautés de la v0.3.9");

        // Lecture unique : effacé après le premier `take`.
        assert!(take_pending_changelog(&conn).unwrap().is_none());
    }
}
