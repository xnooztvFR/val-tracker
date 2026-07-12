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
const KEY_DISCORD_RPC_ENABLED: &str = "discord_rpc_enabled";
const KEY_DISCORD_RPC_CLIENT_ID: &str = "discord_rpc_client_id";
const KEY_STATUS_WATCHER_ENABLED: &str = "status_watcher_enabled";
const KEY_USAGE_METRICS_ENABLED: &str = "usage_metrics_enabled";
const KEY_UI_THEME: &str = "ui_theme";
const KEY_UI_ACCENT: &str = "ui_accent";
const KEY_UI_LANGUAGE: &str = "ui_language";
const KEY_UI_DENSITY: &str = "ui_density";
const KEY_OVERLAY_DENSITY: &str = "overlay_density";
const KEY_LOSS_STREAK_ALERT_ENABLED: &str = "loss_streak_alert_enabled";
const KEY_LOSS_STREAK_ALERT_COUNT: &str = "loss_streak_alert_count";
const KEY_INACTIVITY_REMINDER_ENABLED: &str = "inactivity_reminder_enabled";
const KEY_INACTIVITY_REMINDER_DAYS: &str = "inactivity_reminder_days";
const KEY_NOTES_PIN_ENABLED: &str = "notes_pin_enabled";
/// PIN de verrouillage des notes perso (backlog #99) — chiffré via DPAPI comme la clé API
/// Henrik (`set_encrypted`/`get_encrypted`), jamais exposé au frontend via `AppSettings`
/// (seul `notes_pin_enabled` l'est) ; la vérification se fait entièrement côté Rust via
/// `verify_notes_pin`.
const KEY_NOTES_PIN: &str = "notes_pin";
/// Backlog #72 (fix) : changelog de la mise à jour tout juste installée, écrit juste avant
/// `relaunch()` et lu (puis effacé) par `ChangelogModal.tsx` au chargement suivant. Stocké
/// côté Rust plutôt qu'en `localStorage` : `invoke()` attend la fin de l'écriture SQLite
/// avant de résoudre côté JS, alors qu'un `localStorage.setItem()` suivi immédiatement d'un
/// `relaunch()` (qui tue le process) n'offre aucune garantie que WebView2 ait flush
/// l'écriture sur disque avant la mort du process — c'était la cause du bug "la popup
/// n'apparaît jamais" malgré une mise à jour réussie.
const KEY_PENDING_CHANGELOG_VERSION: &str = "pending_changelog_version";
const KEY_PENDING_CHANGELOG_NOTES: &str = "pending_changelog_notes";

const DEFAULT_UI_THEME: &str = "dark";
const DEFAULT_UI_ACCENT: &str = "red";
const DEFAULT_UI_LANGUAGE: &str = "fr";
const DEFAULT_UI_DENSITY: &str = "comfortable";
const DEFAULT_OVERLAY_DENSITY: &str = "detailed";
const DEFAULT_LOSS_STREAK_ALERT_COUNT: i64 = 3;
const DEFAULT_INACTIVITY_REMINDER_DAYS: i64 = 3;

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
    /// Backlog #24 : notifie quand un joueur "à soi" (`tracked_players.is_self`) enchaîne
    /// `loss_streak_alert_count` défaites d'affilée. Désactivé par défaut.
    pub loss_streak_alert_enabled: bool,
    pub loss_streak_alert_count: i64,
    /// Backlog #32 : rappel doux "tu n'as pas joué depuis X jours" (opt-in, jamais agressif)
    /// — voir `status_watcher.rs` pour le pattern de tâche de fond réutilisé.
    pub inactivity_reminder_enabled: bool,
    pub inactivity_reminder_days: i64,
    /// Backlog #99 : verrouillage optionnel par PIN avant d'afficher les notes perso
    /// sensibles (tags "smurf"/"toxique" de #12) — utile en stream/écran partagé. Le PIN
    /// lui-même n'est jamais inclus ici (voir `verify_notes_pin`).
    pub notes_pin_enabled: bool,
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
            .field("status_watcher_enabled", &self.status_watcher_enabled)
            .field("usage_metrics_enabled", &self.usage_metrics_enabled)
            .field("ui_theme", &self.ui_theme)
            .field("ui_accent", &self.ui_accent)
            .field("ui_language", &self.ui_language)
            .field("ui_density", &self.ui_density)
            .field("overlay_density", &self.overlay_density)
            .field("loss_streak_alert_enabled", &self.loss_streak_alert_enabled)
            .field("loss_streak_alert_count", &self.loss_streak_alert_count)
            .field(
                "inactivity_reminder_enabled",
                &self.inactivity_reminder_enabled,
            )
            .field("inactivity_reminder_days", &self.inactivity_reminder_days)
            .field("notes_pin_enabled", &self.notes_pin_enabled)
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
    let loss_streak_alert_enabled = get_raw(conn, KEY_LOSS_STREAK_ALERT_ENABLED)?
        .map(|v| v == "true")
        .unwrap_or(false);
    let loss_streak_alert_count = get_raw(conn, KEY_LOSS_STREAK_ALERT_COUNT)?
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(DEFAULT_LOSS_STREAK_ALERT_COUNT);
    let inactivity_reminder_enabled = get_raw(conn, KEY_INACTIVITY_REMINDER_ENABLED)?
        .map(|v| v == "true")
        .unwrap_or(false);
    let inactivity_reminder_days = get_raw(conn, KEY_INACTIVITY_REMINDER_DAYS)?
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(DEFAULT_INACTIVITY_REMINDER_DAYS);
    let notes_pin_enabled = get_raw(conn, KEY_NOTES_PIN_ENABLED)?
        .map(|v| v == "true")
        .unwrap_or(false);

    Ok(AppSettings {
        henrik_api_key_set,
        henrik_api_key,
        default_region,
        auto_update_enabled,
        riot_local_disabled,
        discord_rpc_enabled,
        discord_rpc_client_id,
        status_watcher_enabled,
        usage_metrics_enabled,
        ui_theme,
        ui_accent,
        ui_language,
        ui_density,
        overlay_density,
        loss_streak_alert_enabled,
        loss_streak_alert_count,
        inactivity_reminder_enabled,
        inactivity_reminder_days,
        notes_pin_enabled,
    })
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

/// Dernière position connue de la fenêtre overlay (déplacée en mode interactif via
/// Ctrl+Shift+V), pour la restaurer au prochain lancement plutôt que de revenir à la
/// position par défaut à chaque redémarrage.
pub fn get_overlay_position(conn: &Connection) -> rusqlite::Result<Option<(f64, f64)>> {
    let raw = get_raw(conn, KEY_OVERLAY_POSITION)?;
    Ok(raw.and_then(|v| {
        let (x_raw, y_raw) = v.split_once(',')?;
        let x = x_raw.parse::<f64>().ok()?;
        let y = y_raw.parse::<f64>().ok()?;
        Some((x, y))
    }))
}

pub fn set_overlay_position(conn: &Connection, x: f64, y: f64) -> rusqlite::Result<()> {
    set_raw(conn, KEY_OVERLAY_POSITION, &format!("{x},{y}"))
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

/// Backlog #24 : toggle + seuil de l'alerte "N défaites d'affilée".
pub fn set_loss_streak_alert_enabled(conn: &Connection, enabled: bool) -> rusqlite::Result<()> {
    set_raw(
        conn,
        KEY_LOSS_STREAK_ALERT_ENABLED,
        if enabled { "true" } else { "false" },
    )
}

pub fn set_loss_streak_alert_count(conn: &Connection, count: i64) -> rusqlite::Result<()> {
    set_raw(conn, KEY_LOSS_STREAK_ALERT_COUNT, &count.max(1).to_string())
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

/// Backlog #99 : active le verrou et enregistre le PIN (chiffré via DPAPI, comme la clé API
/// Henrik). `pin` doit être non vide — validé côté commande avant d'appeler cette fonction.
pub fn set_notes_pin(conn: &Connection, pin: &str) -> rusqlite::Result<()> {
    set_encrypted(conn, KEY_NOTES_PIN, pin)?;
    set_raw(conn, KEY_NOTES_PIN_ENABLED, "true")
}

/// Désactive le verrou et efface le PIN enregistré (pas seulement le flag) — repasser
/// `notes_pin_enabled` à `false` sans effacer le PIN laisserait une valeur DPAPI orpheline
/// qui redeviendrait active si l'utilisateur ré-active le verrou plus tard sans le vouloir.
pub fn clear_notes_pin(conn: &Connection) -> rusqlite::Result<()> {
    set_raw(conn, KEY_NOTES_PIN, "")?;
    set_raw(conn, KEY_NOTES_PIN_ENABLED, "false")
}

/// Compare `pin` au PIN enregistré. `false` si aucun PIN n'est configuré (le verrou ne
/// devrait alors pas être affiché côté frontend — `notes_pin_enabled` sert de garde).
/// Comparaison en temps constant : le temps de réponse ne doit pas dépendre du nombre de
/// caractères corrects (timing attack, même si le modèle de menace local la rend théorique).
pub fn verify_notes_pin(conn: &Connection, pin: &str) -> rusqlite::Result<bool> {
    let stored = get_encrypted(conn, KEY_NOTES_PIN)?;
    Ok(stored.is_some_and(|s| constant_time_eq(s.as_bytes(), pin.as_bytes())))
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
        assert!(get_overlay_position(&conn).unwrap().is_none());

        set_overlay_position(&conn, 128.5, -12.0).unwrap();
        let (x, y) = get_overlay_position(&conn).unwrap().unwrap();
        assert_eq!(x, 128.5);
        assert_eq!(y, -12.0);
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

    #[test]
    fn notes_pin_round_trip_verify_and_clear() {
        let conn = memory_conn();
        assert!(!load_settings(&conn).unwrap().notes_pin_enabled);
        assert!(!verify_notes_pin(&conn, "1234").unwrap());

        set_notes_pin(&conn, "1234").unwrap();
        assert!(load_settings(&conn).unwrap().notes_pin_enabled);
        assert!(verify_notes_pin(&conn, "1234").unwrap());
        assert!(!verify_notes_pin(&conn, "0000").unwrap());

        // Le PIN ne doit jamais apparaître en clair dans la base.
        let raw = get_raw(&conn, KEY_NOTES_PIN).unwrap().unwrap();
        assert!(raw.starts_with(DPAPI_PREFIX));
        assert!(!raw.contains("1234"));

        clear_notes_pin(&conn).unwrap();
        assert!(!load_settings(&conn).unwrap().notes_pin_enabled);
        assert!(!verify_notes_pin(&conn, "1234").unwrap());
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
