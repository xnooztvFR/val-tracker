//! Lecture/écriture de la config locale (clé API Henrik, préférences UI) dans la table
//! `settings` de `db.rs`. Les valeurs vivent uniquement dans le dossier de données Tauri
//! (`app_data_dir`), jamais commitées, jamais loguées en clair.

use std::fmt;

use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

const KEY_HENRIK_API_KEY: &str = "henrik_api_key";
const KEY_DEFAULT_REGION: &str = "default_region";
const KEY_AUTO_UPDATE: &str = "auto_update_enabled";
const KEY_LOOKUP_ONLY_MODE: &str = "riot_local_disabled";
const KEY_OVERLAY_POSITION: &str = "overlay_position";
const KEY_DISCORD_RPC_ENABLED: &str = "discord_rpc_enabled";
const KEY_DISCORD_RPC_CLIENT_ID: &str = "discord_rpc_client_id";
const KEY_STATUS_WATCHER_ENABLED: &str = "status_watcher_enabled";

const DEFAULT_REGION: &str = "eu";

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

pub fn load_settings(conn: &Connection) -> rusqlite::Result<AppSettings> {
    let henrik_api_key = get_raw(conn, KEY_HENRIK_API_KEY)?.filter(|v| !v.is_empty());
    let default_region =
        get_raw(conn, KEY_DEFAULT_REGION)?.unwrap_or_else(|| DEFAULT_REGION.to_string());
    let auto_update_enabled = get_raw(conn, KEY_AUTO_UPDATE)?
        .map(|v| v == "true")
        .unwrap_or(false);
    let riot_local_disabled = get_raw(conn, KEY_LOOKUP_ONLY_MODE)?
        .map(|v| v == "true")
        .unwrap_or(false); // V2 livrée : détection activée par défaut (best-effort).
    let discord_rpc_enabled = get_raw(conn, KEY_DISCORD_RPC_ENABLED)?
        .map(|v| v == "true")
        .unwrap_or(false);
    let discord_rpc_client_id = get_raw(conn, KEY_DISCORD_RPC_CLIENT_ID)?.filter(|v| !v.is_empty());
    let status_watcher_enabled = get_raw(conn, KEY_STATUS_WATCHER_ENABLED)?
        .map(|v| v == "true")
        .unwrap_or(false);

    Ok(AppSettings {
        henrik_api_key_set: henrik_api_key.is_some(),
        henrik_api_key,
        default_region,
        auto_update_enabled,
        riot_local_disabled,
        discord_rpc_enabled,
        discord_rpc_client_id,
        status_watcher_enabled,
    })
}

pub fn set_henrik_api_key(conn: &Connection, api_key: &str) -> rusqlite::Result<()> {
    set_raw(conn, KEY_HENRIK_API_KEY, api_key)
}

pub fn get_henrik_api_key(conn: &Connection) -> rusqlite::Result<Option<String>> {
    get_raw(conn, KEY_HENRIK_API_KEY)?
        .filter(|v| !v.is_empty())
        .map(Ok)
        .transpose()
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
        assert!(!settings.henrik_api_key_set);
        assert_eq!(settings.default_region, DEFAULT_REGION);
        assert!(!settings.auto_update_enabled);
        // V2 livrée : détection activée par défaut (voir doc du champ).
        assert!(!settings.riot_local_disabled);
        // V3 : tout ce qui ajoute un appel réseau périodique ou une connexion IPC externe
        // est opt-in par défaut.
        assert!(!settings.discord_rpc_enabled);
        assert!(settings.discord_rpc_client_id.is_none());
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
    fn empty_discord_rpc_client_id_is_treated_as_unset() {
        let conn = memory_conn();
        set_discord_rpc_client_id(&conn, "").unwrap();
        assert!(load_settings(&conn).unwrap().discord_rpc_client_id.is_none());
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
        assert_eq!(get_henrik_api_key(&conn).unwrap().as_deref(), Some("my-secret-key"));

        // Le Debug custom ne doit jamais faire fuiter la clé en clair dans les logs.
        let debug_output = format!("{:?}", settings);
        assert!(!debug_output.contains("my-secret-key"));
        assert!(debug_output.contains("masqué"));
    }

    #[test]
    fn empty_api_key_is_treated_as_unset() {
        let conn = memory_conn();
        set_henrik_api_key(&conn, "").unwrap();

        let settings = load_settings(&conn).unwrap();
        assert!(!settings.henrik_api_key_set);
        assert!(settings.henrik_api_key.is_none());
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
}
