//! Création/positionnement de la fenêtre overlay (V2).
//!
//! Fenêtre Tauri séparée (label "overlay") : always-on-top, sans décorations,
//! transparente, click-through par défaut (`set_ignore_cursor_events(true)`). Le
//! raccourci global `Ctrl+Shift+V` (voir `register_toggle_shortcut`) bascule en mode
//! interactif pour la repositionner ; la position choisie est persistée (`settings::
//! get/set_overlay_position`) et restaurée au lancement suivant. Le contenu (React,
//! `src/screens/Overlay.tsx`) est poussé par le poller via l'event `riot-local://state`.

use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::AppState;

pub const OVERLAY_LABEL: &str = "overlay";
/// Backlog #68 : montrer/masquer la fenêtre principale même quand Valorant a le focus —
/// `Ctrl+Shift+H` fonctionne comme `Ctrl+Shift+V` (raccourci OS global via
/// tauri-plugin-global-shortcut, indépendant du focus applicatif). Les deux sont
/// reconfigurables depuis Paramètres (voir `settings::DEFAULT_SHORTCUT_*` pour les valeurs
/// par défaut ci-dessous, et `change_toggle_shortcut`/`change_main_window_shortcut` pour le
/// réenregistrement à chaud) — un raccourci pris par une autre appli (overlay GPU, Discord...)
/// n'avait auparavant aucun moyen d'être changé sans recompiler.
/// Réaffiche l'overlay tant que la touche est maintenue (voir `register_recall_shortcut`)
/// — utile pendant `IN_GAME_OVERLAY_DURATION` où l'overlay se masque automatiquement au
/// lancement de la manche pour ne pas gêner la visée, si 12s n'ont pas suffi à lire le
/// roster ennemi en chargeant.
const RECALL_SHORTCUT: &str = "ctrl+shift+space";
const DEFAULT_POSITION: (f64, f64) = (24.0, 96.0);

/// `true` tant que l'overlay ignore les clics (mode par défaut).
static CLICK_THROUGH: AtomicBool = AtomicBool::new(true);
/// `true` entre l'appui et le relâchement de `RECALL_SHORTCUT` quand celui-ci a
/// effectivement déclenché l'affichage (overlay masqué au moment de l'appui) — distingue
/// ce cas du cas où l'overlay était déjà visible (pregame, ou dans la fenêtre initiale des
/// `IN_GAME_OVERLAY_DURATION`), pour ne jamais le masquer prématurément au relâchement.
static PEEKING: AtomicBool = AtomicBool::new(false);

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

/// Combinaisons actuellement enregistrées auprès de `tauri-plugin-global-shortcut` pour les
/// deux raccourcis reconfigurables — nécessaire pour savoir quoi désenregistrer
/// (`unregister`) quand l'utilisateur en choisit une nouvelle depuis Paramètres, le plugin
/// n'exposant pas de "quel est le raccourci actuel associé à ce handler".
pub struct ActiveShortcuts {
    pub overlay_toggle: std::sync::Mutex<String>,
    pub main_window_toggle: std::sync::Mutex<String>,
}

impl ActiveShortcuts {
    pub fn new(overlay_toggle: String, main_window_toggle: String) -> Self {
        Self {
            overlay_toggle: std::sync::Mutex::new(overlay_toggle),
            main_window_toggle: std::sync::Mutex::new(main_window_toggle),
        }
    }
}

/// Identifiant stable d'un moniteur pour le sélecteur d'écran explicite (backlog #76) —
/// `Monitor::name()` (ex. `\\.\DISPLAY1` sous Windows) quand disponible, sinon une clé
/// dérivée de sa résolution + position (mêmes composants que `monitor_signature`, mais pour
/// un seul écran plutôt que l'ensemble du setup).
fn monitor_id(m: &tauri::Monitor) -> String {
    match m.name() {
        Some(name) if !name.is_empty() => name.clone(),
        _ => {
            let size = m.size();
            let pos = m.position();
            format!("{}x{}@{},{}", size.width, size.height, pos.x, pos.y)
        }
    }
}

#[derive(Serialize)]
pub struct MonitorInfo {
    pub id: String,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}

/// Liste les moniteurs connectés pour le sélecteur d'écran explicite de Paramètres →
/// Overlay (backlog #76). Le "principal" est approximé par la position `(0, 0)` — Tauri
/// n'expose pas directement le moniteur principal du système, mais c'est la convention
/// Windows/X11 la plus courante.
pub fn list_monitors(app_handle: &AppHandle) -> Vec<MonitorInfo> {
    let monitors = app_handle
        .get_webview_window("main")
        .and_then(|w| w.available_monitors().ok())
        .unwrap_or_default();

    monitors
        .iter()
        .map(|m| {
            let size = m.size();
            let pos = m.position();
            MonitorInfo {
                id: monitor_id(m),
                width: size.width,
                height: size.height,
                is_primary: pos.x == 0 && pos.y == 0,
            }
        })
        .collect()
}

/// Position par défaut de l'overlay sur un moniteur choisi explicitement (backlog #76) —
/// coin haut-gauche du moniteur + le même décalage que `DEFAULT_POSITION`. `None` si le
/// moniteur choisi n'est plus connecté (débranché depuis) : l'appelant retombe alors sur le
/// comportement "auto" par signature d'écran.
fn explicit_monitor_position(app_handle: &AppHandle, monitor_id_pref: &str) -> Option<(f64, f64)> {
    let monitors = app_handle
        .get_webview_window("main")?
        .available_monitors()
        .ok()?;
    let target = monitors.iter().find(|m| monitor_id(m) == monitor_id_pref)?;
    let pos = target.position();
    Some((pos.x as f64 + DEFAULT_POSITION.0, pos.y as f64 + DEFAULT_POSITION.1))
}

/// Backlog #76 : signature textuelle de la configuration d'écran courante (résolution +
/// position de chaque moniteur connecté, triées pour être stables indépendamment de l'ordre
/// renvoyé par l'OS) — sert de clé pour mémoriser la position de l'overlay par setup plutôt
/// qu'une seule position globale, qui pouvait réapparaître hors-écran après un changement de
/// setup (ex. laptop débranché d'un moniteur externe). Dérivée de la fenêtre "main" (qui
/// existe toujours) plutôt que de l'overlay lui-même, pour rester utilisable avant même que
/// la fenêtre overlay soit créée.
pub fn monitor_signature(app_handle: &AppHandle) -> String {
    let monitors = app_handle
        .get_webview_window("main")
        .and_then(|w| w.available_monitors().ok())
        .unwrap_or_default();

    if monitors.is_empty() {
        return "unknown".to_string();
    }

    let mut parts: Vec<String> = monitors
        .iter()
        .map(|m| {
            let size = m.size();
            let pos = m.position();
            format!("{}x{}@{},{}", size.width, size.height, pos.x, pos.y)
        })
        .collect();
    parts.sort();
    parts.join("|")
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
            let signature = monitor_signature(&handle);
            tauri::async_runtime::spawn(async move {
                if let Some(state) = handle.try_state::<AppState>() {
                    let conn = state.db.lock().await;
                    if let Err(err) = crate::settings::set_overlay_position(&conn, &signature, x, y) {
                        crate::applog!("[overlay] échec de sauvegarde de la position: {err}");
                    }
                }
            });
        }
    });

    Ok(())
}

/// Crée la fenêtre overlay (masquée) si elle n'existe pas déjà, sans la montrer — appelée
/// à la fois par `show_overlay` (au moment réel d'affichage) et en warm-up au démarrage de
/// l'app (voir `warm_up`) pour sortir la création de fenêtre du chemin critique de la
/// première partie détectée.
async fn ensure_overlay_window(app_handle: &AppHandle) {
    if app_handle.get_webview_window(OVERLAY_LABEL).is_some() {
        return;
    }
    let position = match app_handle.try_state::<AppState>() {
        Some(state) => {
            let conn = state.db.lock().await;
            let explicit_monitor = crate::settings::get_overlay_monitor(&conn)
                .ok()
                .flatten()
                .filter(|id| id != "auto");
            match explicit_monitor.and_then(|id| explicit_monitor_position(app_handle, &id)) {
                Some(position) => Some(position),
                // Pas de préférence explicite, ou moniteur choisi débranché depuis :
                // repli sur la dernière position mémorisée pour ce setup d'écrans.
                None => {
                    let signature = monitor_signature(app_handle);
                    crate::settings::get_overlay_position(&conn, &signature)
                        .ok()
                        .flatten()
                }
            }
        }
        None => None,
    };
    if let Err(err) = create_overlay_window(app_handle, position) {
        crate::applog!("[overlay] création de la fenêtre overlay impossible: {err}");
    }
}

/// Crée la fenêtre overlay par anticipation, juste après le démarrage de l'app (voir
/// `main.rs::setup`), plutôt que d'attendre la toute première partie détectée. Avant ce
/// warm-up, la création de fenêtre (WebView2 + enregistrement Tauri) partageait son tout
/// premier appel avec la course de démarrage de l'app elle-même — bug constaté en session
/// (2026-07-14) : l'overlay ne s'affichait pas sur la toute première partie qui suivait un
/// lancement d'app fraîchement démarrée, mais fonctionnait normalement dès la partie
/// suivante (fenêtre déjà créée). Sortir la création du chemin de la première détection
/// élimine cette fenêtre de course.
pub async fn warm_up(app_handle: AppHandle) {
    ensure_overlay_window(&app_handle).await;
}

pub async fn show_overlay(app_handle: &AppHandle) {
    ensure_overlay_window(app_handle).await;
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
pub fn register_toggle_shortcut(app_handle: &AppHandle, shortcut: &str) -> anyhow::Result<()> {
    app_handle
        .global_shortcut()
        .on_shortcut(shortcut, |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                let ignore = !CLICK_THROUGH.load(Ordering::Relaxed);
                let _ = set_click_through(app, ignore);
            }
        })?;
    Ok(())
}

/// Réenregistre le raccourci de bascule de l'overlay avec une nouvelle combinaison — appelée
/// depuis Paramètres (backlog sécurité : raccourcis globaux non reconfigurables). Enregistre
/// d'abord `new` avant de désenregistrer `old` : si `new` est invalide ou déjà pris par une
/// autre appli, `old` reste actif plutôt que de laisser l'utilisateur sans raccourci du tout.
pub fn change_toggle_shortcut(app_handle: &AppHandle, old: &str, new: &str) -> anyhow::Result<()> {
    if old.eq_ignore_ascii_case(new) {
        return Ok(());
    }
    register_toggle_shortcut(app_handle, new)?;
    let _ = app_handle.global_shortcut().unregister(old);
    Ok(())
}

/// Enregistre `Ctrl+Shift+Espace` → maintien pour réafficher l'overlay pendant qu'il est
/// masqué par `IN_GAME_OVERLAY_DURATION` (voir `poller::on_state_changed`), relâchement
/// pour revenir à l'état masqué. Sans effet si l'overlay était déjà visible à l'appui
/// (pregame, ou fenêtre initiale d'affichage en in-game) : voir `PEEKING`.
pub fn register_recall_shortcut(app_handle: &AppHandle) -> anyhow::Result<()> {
    app_handle
        .global_shortcut()
        .on_shortcut(RECALL_SHORTCUT, |app, _shortcut, event| match event.state() {
            ShortcutState::Pressed => {
                let already_visible = app
                    .get_webview_window(OVERLAY_LABEL)
                    .and_then(|w| w.is_visible().ok())
                    .unwrap_or(false);
                if already_visible {
                    return;
                }
                PEEKING.store(true, Ordering::Relaxed);
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    show_overlay(&app).await;
                });
            }
            ShortcutState::Released => {
                if PEEKING.swap(false, Ordering::Relaxed) {
                    hide_overlay(app);
                }
            }
        })?;
    Ok(())
}

/// Enregistre `Ctrl+Shift+H` → montre/masque la fenêtre principale, y compris quand
/// Valorant a le focus (raccourci OS global, pas une chaîne de touches captée par la
/// fenêtre). Best-effort comme `register_toggle_shortcut` : un échec (raccourci déjà pris
/// par une autre appli) ne doit pas empêcher l'app de démarrer.
pub fn register_main_window_shortcut(app_handle: &AppHandle, shortcut: &str) -> anyhow::Result<()> {
    app_handle
        .global_shortcut()
        .on_shortcut(shortcut, |app, _shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            let Some(window) = app.get_webview_window("main") else {
                return;
            };
            let is_visible = window.is_visible().unwrap_or(true);
            let is_focused = window.is_focused().unwrap_or(false);
            if is_visible && is_focused {
                let _ = window.hide();
            } else {
                let _ = window.show();
                let _ = window.set_focus();
            }
        })?;
    Ok(())
}

/// Même principe que `change_toggle_shortcut` pour le raccourci de bascule de la fenêtre
/// principale.
pub fn change_main_window_shortcut(app_handle: &AppHandle, old: &str, new: &str) -> anyhow::Result<()> {
    if old.eq_ignore_ascii_case(new) {
        return Ok(());
    }
    register_main_window_shortcut(app_handle, new)?;
    let _ = app_handle.global_shortcut().unregister(old);
    Ok(())
}
