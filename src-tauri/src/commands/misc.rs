//! Regroupe les petites commandes standalone : logs consultables (backlog #49), vérification
//! d'intégrité de l'updater (backlog #97), images externes VLR/esports (backlog #100),
//! métriques d'usage local (backlog #50).

use serde::Serialize;
use tauri::State;

use super::CommandError;
use crate::AppState;

// ---- Logs consultables (backlog #49) ----

/// Nombre maximal d'octets relus depuis la fin du fichier de log — un utilisateur qui
/// ouvre Paramètres → Logs veut voir ce qui vient de se passer, pas tout l'historique.
const LOG_TAIL_BYTES: usize = 200_000;

#[derive(Serialize)]
pub struct LogSnapshot {
    pub path: Option<String>,
    pub content: String,
}

/// Lit la fin du fichier de log local pour l'écran Paramètres → Logs — aucun appel
/// réseau, best-effort (chaîne vide si le fichier n'existe pas encore ou est illisible).
#[tauri::command]
pub fn get_recent_logs() -> LogSnapshot {
    LogSnapshot {
        path: crate::applog::path(),
        content: crate::applog::tail(LOG_TAIL_BYTES),
    }
}

// ---- Auto-update — vérification d'intégrité (backlog #97) ----

/// Vérifie le SHA256 de l'installeur pointé par `url` contre `expected_sha256` (champ
/// custom de `latest.json`, en plus de la signature Ed25519 déjà vérifiée par
/// `tauri-plugin-updater` avant l'installation — voir `updater.rs`). Best-effort : une
/// erreur réseau ici ne doit pas empêcher `downloadAndInstall` de retenter côté plugin,
/// l'appelant (useUpdater.ts) traite `Err`/`false` comme "vérification indisponible ou
/// échouée" et bloque l'installation dans les deux cas.
#[tauri::command]
pub async fn verify_update_hash(url: String, expected_sha256: String) -> Result<bool, CommandError> {
    crate::updater::verify_download_sha256(&url, &expected_sha256)
        .await
        .map_err(CommandError::from)
}

// ---- Images externes VLR/esports (backlog #100) ----

/// Récupère un logo/avatar hébergé sur un CDN tiers (voir `image_proxy.rs`) et le renvoie en
/// `data:` URI, pour l'afficher sans étendre `img-src` à un domaine externe non garanti dans
/// le temps.
#[tauri::command]
pub async fn fetch_external_image(url: String) -> Result<String, CommandError> {
    crate::image_proxy::fetch_as_data_uri(&url)
        .await
        .map_err(CommandError::from)
}

// ---- Métriques d'usage local (backlog #50) ----

const USAGE_METRICS_WINDOW_SECS: i64 = 7 * 24 * 3600;

/// Résumé des métriques d'usage sur les 7 derniers jours pour le dashboard Paramètres →
/// Santé — vide (tout à zéro) si `usage_metrics_enabled` n'a jamais été activé, aucun
/// appel réseau ici, juste une lecture SQLite locale.
#[tauri::command]
pub async fn get_usage_metrics_summary(
    state: State<'_, AppState>,
) -> Result<crate::db::UsageMetricsSummary, CommandError> {
    let conn = state.db.lock().await;
    let since = chrono::Utc::now().timestamp() - USAGE_METRICS_WINDOW_SECS;
    Ok(crate::db::usage_metrics_summary(&conn, since)?)
}
