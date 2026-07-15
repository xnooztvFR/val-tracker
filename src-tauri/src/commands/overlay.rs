//! Commandes overlay (V2) : état live, statut du raccourci global, liste des moniteurs.

use tauri::State;

use super::CommandError;
use crate::AppState;

/// V2 overlay : instantané de l'état de partie détecté (lu au montage de l'overlay ;
/// les mises à jour arrivent ensuite via l'event `riot-local://state`).
#[tauri::command]
pub fn get_live_state(
    live: State<'_, crate::riot_local::LiveState>,
) -> Result<crate::riot_local::LiveSnapshot, CommandError> {
    live.0
        .lock()
        .map(|guard| guard.clone())
        .map_err(|_| CommandError::Unknown {
            message: "état live indisponible".to_string(),
        })
}

/// V2 overlay : `true` si le raccourci global `Ctrl+Shift+V` a bien pu être enregistré au
/// démarrage. `false` s'il est déjà pris par une autre appli (ex: "coller sans formatage"
/// dans VS Code/Chrome/Slack) — l'UI Paramètres affiche alors un avertissement plutôt que
/// de laisser l'utilisateur découvrir en jeu que l'overlay ne peut pas être déplacé.
#[tauri::command]
pub fn get_overlay_shortcut_status(
    status: State<'_, crate::overlay::window::ShortcutStatus>,
) -> bool {
    status.0.load(std::sync::atomic::Ordering::Relaxed)
}

/// Backlog sécurité : change à chaud le raccourci global de bascule de l'overlay (aucun
/// redémarrage requis). Rejette une valeur vide ; si le nouveau raccourci est invalide ou
/// déjà pris par une autre appli, l'ancien reste actif et rien n'est persisté (voir
/// `overlay::window::change_toggle_shortcut`).
#[tauri::command]
pub async fn save_shortcut_overlay_toggle(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    active: State<'_, crate::overlay::window::ActiveShortcuts>,
    shortcut: String,
) -> Result<(), CommandError> {
    let normalized = shortcut.trim().to_lowercase();
    if normalized.is_empty() {
        return Err(CommandError::Unknown {
            message: "le raccourci ne peut pas être vide".to_string(),
        });
    }
    {
        let mut guard = active.overlay_toggle.lock().map_err(|_| CommandError::Unknown {
            message: "état des raccourcis indisponible".to_string(),
        })?;
        crate::overlay::window::change_toggle_shortcut(&app, &guard, &normalized)?;
        *guard = normalized.clone();
    }
    let conn = state.db.lock().await;
    crate::settings::set_shortcut_overlay_toggle(&conn, &normalized)?;
    Ok(())
}

/// Même principe que `save_shortcut_overlay_toggle` pour le raccourci de bascule de la
/// fenêtre principale (backlog #68).
#[tauri::command]
pub async fn save_shortcut_main_window_toggle(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    active: State<'_, crate::overlay::window::ActiveShortcuts>,
    shortcut: String,
) -> Result<(), CommandError> {
    let normalized = shortcut.trim().to_lowercase();
    if normalized.is_empty() {
        return Err(CommandError::Unknown {
            message: "le raccourci ne peut pas être vide".to_string(),
        });
    }
    {
        let mut guard = active
            .main_window_toggle
            .lock()
            .map_err(|_| CommandError::Unknown {
                message: "état des raccourcis indisponible".to_string(),
            })?;
        crate::overlay::window::change_main_window_shortcut(&app, &guard, &normalized)?;
        *guard = normalized.clone();
    }
    let conn = state.db.lock().await;
    crate::settings::set_shortcut_main_window_toggle(&conn, &normalized)?;
    Ok(())
}

/// Backlog #76 : liste les moniteurs connectés pour le sélecteur d'écran explicite de
/// Paramètres → Overlay, plutôt que de ne dépendre que de la dernière signature d'écran
/// mémorisée (voir `overlay::window::list_monitors`).
#[tauri::command]
pub fn list_overlay_monitors(app: tauri::AppHandle) -> Vec<crate::overlay::window::MonitorInfo> {
    crate::overlay::window::list_monitors(&app)
}

/// `"auto"` (défaut) ou l'identifiant d'un moniteur choisi explicitement.
#[tauri::command]
pub async fn save_overlay_monitor(
    state: State<'_, AppState>,
    monitor_id: String,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_overlay_monitor(&conn, &monitor_id)?;
    Ok(())
}
