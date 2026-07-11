//! Création/positionnement de la fenêtre overlay (V2).
//!
//! Fenêtre Tauri séparée (label "overlay") : always-on-top, sans décorations,
//! transparente, click-through par défaut (`set_ignore_cursor_events(true)`). Le
//! raccourci global `Ctrl+Shift+V` (voir `register_toggle_shortcut`) bascule en mode
//! interactif pour la repositionner ; la position choisie est persistée (`settings::
//! get/set_overlay_position`) et restaurée au lancement suivant. Le contenu (React,
//! `src/screens/Overlay.tsx`) est poussé par le poller via l'event `riot-local://state`.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::AppState;

pub const OVERLAY_LABEL: &str = "overlay";
const TOGGLE_SHORTCUT: &str = "ctrl+shift+v";
const DEFAULT_POSITION: (f64, f64) = (24.0, 96.0);

/// `true` tant que l'overlay ignore les clics (mode par défaut).
static CLICK_THROUGH: AtomicBool = AtomicBool::new(true);

/// Résultat de l'enregistrement du raccourci global au démarrage, exposé au frontend via
/// `commands::get_overlay_shortcut_status` — `Ctrl+Shift+V` est un raccourci commun
/// ("coller sans formatage" dans VS Code/Chrome/Slack...), un échec d'enregistrement
/// (déjà pris par une autre appli) ne doit pas rester silencieux côté UI.
pub struct ShortcutStatus(pub AtomicBool);

impl ShortcutStatus {
    pub fn registered(value: bool) -> Self {
        Self(AtomicBool::new(value))
    }
}

/// Crée la fenêtre overlay si elle n'existe pas encore (cachée par défaut, affichée par
/// le poller quand une partie démarre), à la position sauvegardée si connue.
fn create_overlay_window(app_handle: &AppHandle, position: Option<(f64, f64)>) -> tauri::Result<()> {
    if app_handle.get_webview_window(OVERLAY_LABEL).is_some() {
        return Ok(());
    }

    let (x, y) = position.unwrap_or(DEFAULT_POSITION);

    let window = WebviewWindowBuilder::new(
        app_handle,
        OVERLAY_LABEL,
        WebviewUrl::App("index.html".into()),
    )
    .title("Valorant Tracker — Overlay")
    .inner_size(360.0, 520.0)
    .position(x, y)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(false)
    .focused(false)
    .build()?;

    window.set_ignore_cursor_events(true)?;
    CLICK_THROUGH.store(true, Ordering::Relaxed);

    // Persiste la position dès que l'utilisateur relâche la fenêtre après un
    // déplacement en mode interactif — best-effort, une écriture DB qui échoue ne doit
    // jamais faire planter l'app.
    let handle = app_handle.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Moved(pos) = event {
            let handle = handle.clone();
            let (x, y) = (pos.x as f64, pos.y as f64);
            tauri::async_runtime::spawn(async move {
                if let Some(state) = handle.try_state::<AppState>() {
                    let conn = state.db.lock().await;
                    if let Err(err) = crate::settings::set_overlay_position(&conn, x, y) {
                        eprintln!("[overlay] échec de sauvegarde de la position: {err}");
                    }
                }
            });
        }
    });

    Ok(())
}

pub async fn show_overlay(app_handle: &AppHandle) {
    if app_handle.get_webview_window(OVERLAY_LABEL).is_none() {
        let position = match app_handle.try_state::<AppState>() {
            Some(state) => {
                let conn = state.db.lock().await;
                crate::settings::get_overlay_position(&conn).ok().flatten()
            }
            None => None,
        };
        if let Err(err) = create_overlay_window(app_handle, position) {
            eprintln!("[overlay] création de la fenêtre overlay impossible: {err}");
            return;
        }
    }
    if let Some(window) = app_handle.get_webview_window(OVERLAY_LABEL) {
        let _ = window.show();
    }
}

pub fn hide_overlay(app_handle: &AppHandle) {
    if let Some(window) = app_handle.get_webview_window(OVERLAY_LABEL) {
        let _ = window.hide();
    }
}

/// Active/désactive le click-through de l'overlay. En mode interactif, la fenêtre
/// reprend le focus pour pouvoir être déplacée.
pub fn set_click_through(app_handle: &AppHandle, ignore: bool) -> tauri::Result<()> {
    let Some(window) = app_handle.get_webview_window(OVERLAY_LABEL) else {
        return Ok(());
    };
    window.set_ignore_cursor_events(ignore)?;
    CLICK_THROUGH.store(ignore, Ordering::Relaxed);
    if !ignore {
        let _ = window.set_focus();
    }
    // L'UI de l'overlay affiche un cadre/poignée en mode interactif.
    let _ = tauri::Emitter::emit(app_handle, "overlay://interactive", !ignore);
    Ok(())
}

/// Enregistre `Ctrl+Shift+V` → bascule click-through / interactif. Le plugin
/// global-shortcut doit déjà être enregistré dans le builder (voir `main.rs`).
pub fn register_toggle_shortcut(app_handle: &AppHandle) -> anyhow::Result<()> {
    app_handle
        .global_shortcut()
        .on_shortcut(TOGGLE_SHORTCUT, |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                let ignore = !CLICK_THROUGH.load(Ordering::Relaxed);
                let _ = set_click_through(app, ignore);
            }
        })?;
    Ok(())
}
