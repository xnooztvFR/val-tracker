//! Regroupe les petites commandes standalone : logs consultables (backlog #49), vérification
//! d'intégrité de l'updater (backlog #97), images externes VLR/esports (backlog #100),
//! métriques d'usage local (backlog #50), diagnostics des tâches de fond.

use serde::Serialize;
use tauri::{Manager, State};

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

// ---- Diagnostics des tâches de fond ----

/// Dernier tick/dernière erreur des tâches de fond (poller riot_local, status watcher,
/// rappel d'inactivité, thread Discord RPC) pour Paramètres → Diagnostics — rend les échecs
/// best-effort silencieux réellement débogables sans lire le fichier de log brut.
#[tauri::command]
pub fn get_background_diagnostics(
    registry: State<'_, crate::diagnostics::TaskRegistry>,
) -> Vec<crate::diagnostics::TaskDiagnostic> {
    registry.snapshot()
}

#[derive(Serialize)]
pub struct DiagnosticsReport {
    pub app_version: String,
    pub overlay_enabled: bool,
    pub db_size_bytes: Option<u64>,
    pub last_henrik_error: Option<String>,
    pub last_henrik_error_at: Option<i64>,
    pub background_tasks: Vec<crate::diagnostics::TaskDiagnostic>,
}

/// Rapport diagnostics agrégé exportable en un clic (Paramètres → Diagnostics) : version de
/// l'app, état de la détection auto de partie/overlay, taille de la base SQLite locale,
/// dernière erreur Henrik rencontrée, et l'état des tâches de fond déjà exposé par
/// `get_background_diagnostics` — pour accélérer le support à distance sans devoir demander
/// le fichier de log brut.
#[tauri::command]
pub async fn get_diagnostics_report(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    registry: State<'_, crate::diagnostics::TaskRegistry>,
) -> Result<DiagnosticsReport, CommandError> {
    let settings = {
        let conn = state.db.lock().await;
        crate::settings::load_settings(&conn)?
    };

    let db_size_bytes = crate::db::resolve_db_path(&app)
        .ok()
        .and_then(|path| std::fs::metadata(path).ok())
        .map(|meta| meta.len());

    let (last_henrik_error, last_henrik_error_at) = state
        .henrik
        .last_error_snapshot()
        .await
        .map(|(msg, at)| (Some(msg), Some(at)))
        .unwrap_or((None, None));

    Ok(DiagnosticsReport {
        app_version: app.package_info().version.to_string(),
        overlay_enabled: !settings.riot_local_disabled,
        db_size_bytes,
        last_henrik_error,
        last_henrik_error_at,
        background_tasks: registry.snapshot(),
    })
}

// ---- Dossier Téléchargements ----

/// Ouvre le dossier Téléchargements de l'utilisateur dans l'explorateur Windows — appelé
/// après chaque export/téléchargement (CSV/JSON/PNG) déclenché côté frontend via un `<a
/// download>` classique (voir `lib/downloadFile.ts`), qui atterrit silencieusement dans ce
/// dossier sans qu'un utilisateur non technique sache où le chercher. Best-effort : une
/// erreur ici (résolution du dossier, `explorer.exe` absent) ne doit jamais faire échouer
/// l'export lui-même, déjà terminé côté webview au moment de l'appel.
#[tauri::command]
pub fn open_downloads_folder(app: tauri::AppHandle) -> Result<(), CommandError> {
    let dir = app.path().download_dir().map_err(|e| CommandError::Unknown { message: e.to_string() })?;
    std::process::Command::new("explorer")
        .arg(dir)
        .spawn()
        .map_err(|e| CommandError::Unknown { message: e.to_string() })?;
    Ok(())
}
