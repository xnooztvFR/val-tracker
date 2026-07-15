//! Watcher de statut serveur / file d'attente (V3) — opt-in, voir
//! `settings::AppSettings::status_watcher_enabled`. C'est le seul appel réseau
//! périodique de l'app qui tourne même quand l'utilisateur ne regarde pas la fenêtre
//! (tout le reste — MMR, matchs, overlay — est déclenché par une action explicite ou par
//! `riot_local` qui n'appelle que l'API locale). Réutilise `get_status`/`get_queue_status`
//! (donc le cache SQLite + rate limiter + circuit breaker déjà en place côté Henrik) au
//! lieu de taper l'API directement.

use std::collections::HashSet;
use std::time::Duration;

use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::api::henrik::types::StatusIncident;
use crate::AppState;

/// Volontairement un peu au-dessus de `TTL_STATUS` (3 min) : chaque tick retape donc
/// vraiment le réseau plutôt que de retrouver son propre cache encore frais.
const WATCH_INTERVAL: Duration = Duration::from_secs(200);

/// Cadence appliquée une fois la fenêtre principale restée hors focus pendant
/// `DEEP_IDLE_THRESHOLD` ticks consécutifs — même philosophie que `DEEP_IDLE_INTERVAL` du
/// poller `riot_local` (backlog #78) : ce watcher est le seul appel réseau périodique qui
/// tourne même app en arrière-plan/minimisée, pas la peine de retaper le réseau toutes les
/// 200s pendant des heures si personne ne regarde la fenêtre.
const DEEP_IDLE_INTERVAL: Duration = Duration::from_secs(1200);
const DEEP_IDLE_THRESHOLD: u32 = 5;

pub fn start(app_handle: AppHandle) {
    tauri::async_runtime::spawn(run_loop(app_handle));
}

async fn run_loop(app: AppHandle) {
    let mut ctx = WatchContext::default();
    loop {
        tokio::time::sleep(next_interval(&ctx)).await;
        tick(&app, &mut ctx).await;
    }
}

#[derive(Default)]
struct WatchContext {
    known_incident_ids: HashSet<i64>,
    disabled_queues: HashSet<String>,
    /// Au tout premier tick où le watcher a des données, on ne notifie rien : on
    /// initialise juste l'état connu, sinon un incident déjà en cours depuis avant le
    /// lancement de l'app déclencherait une notification à chaque redémarrage.
    initialized: bool,
    /// Nombre de ticks consécutifs où la fenêtre principale n'avait pas le focus — bascule
    /// vers `DEEP_IDLE_INTERVAL` au-delà de `DEEP_IDLE_THRESHOLD`, remis à zéro dès que la
    /// fenêtre reprend le focus (voir mise à jour dans `tick`).
    unfocused_ticks: u32,
}

fn next_interval(ctx: &WatchContext) -> Duration {
    if ctx.unfocused_ticks >= DEEP_IDLE_THRESHOLD {
        DEEP_IDLE_INTERVAL
    } else {
        WATCH_INTERVAL
    }
}

/// `unwrap_or(true)` : si la fenêtre principale n'existe pas encore ou que l'état de focus
/// n'est pas interrogeable (best-effort), on préfère rester à la cadence normale plutôt que
/// de risquer de rater un incident faute d'avoir pu déterminer que l'app est bien au premier
/// plan.
fn is_main_window_focused(app: &AppHandle) -> bool {
    app.get_webview_window("main").and_then(|w| w.is_focused().ok()).unwrap_or(true)
}

async fn tick(app: &AppHandle, ctx: &mut WatchContext) {
    crate::diagnostics::record_tick(app, crate::diagnostics::STATUS_WATCHER);
    if is_main_window_focused(app) {
        ctx.unfocused_ticks = 0;
    } else {
        ctx.unfocused_ticks = ctx.unfocused_ticks.saturating_add(1);
    }

    let (enabled, api_key, region) = {
        let state = app.state::<AppState>();
        let conn = state.db.lock().await;
        let (enabled, region) = match crate::settings::load_settings(&conn) {
            Ok(s) => (s.status_watcher_enabled, s.default_region),
            Err(_) => (false, "eu".to_string()),
        };
        // Utilise `get_henrik_api_key` (Direct clé perso OU Proxy compilé) plutôt que le
        // champ `henrik_api_key` de `AppSettings`, qui ne porte volontairement que la clé
        // perso (voir settings.rs::load_settings) — sinon ce watcher resterait muet sur un
        // build donné à quelqu'un sans clé perso.
        let api_key = crate::settings::get_henrik_api_key(&conn).ok().flatten();
        (enabled, api_key, region)
    };
    if !enabled {
        // Réglage désactivé : on efface l'état connu pour repartir propre si jamais
        // l'utilisateur le réactive plus tard (évite une rafale de notifs rattrapant tout
        // ce qui a changé pendant que le watcher était éteint).
        ctx.known_incident_ids.clear();
        ctx.disabled_queues.clear();
        ctx.initialized = false;
        return;
    }
    let Some(api_key) = api_key else { return };

    let state = app.state::<AppState>();
    let is_first_pass = !ctx.initialized;

    match crate::api::henrik::endpoints::get_status(
        &state.db,
        &state.henrik,
        Some(&api_key),
        &region,
        false,
    )
    .await
    {
        Err(err) => crate::diagnostics::record_error(app, crate::diagnostics::STATUS_WATCHER, &err),
        Ok(status) => {
            for incident in status.data.incidents.iter().chain(status.data.maintenances.iter()) {
                let Some(id) = incident.id else { continue };
                let is_new = ctx.known_incident_ids.insert(id);
                if is_new && !is_first_pass {
                    let _ = app
                        .notification()
                        .builder()
                        .title(format!("Incident Riot — {}", region.to_uppercase()))
                        .body(incident_title(incident))
                        .show();
                }
            }
        }
    }

    match crate::api::henrik::endpoints::get_queue_status(
        &state.db,
        &state.henrik,
        Some(&api_key),
        &region,
        false,
    )
    .await
    {
        Err(err) => crate::diagnostics::record_error(app, crate::diagnostics::STATUS_WATCHER, &err),
        Ok(queues) => {
            let mut currently_disabled = HashSet::new();
            for q in &queues.data {
                if q.enabled == Some(false) {
                    if let Some(mode) = &q.mode {
                        currently_disabled.insert(mode.clone());
                    }
                }
            }

            if !is_first_pass {
                for mode in ctx.disabled_queues.difference(&currently_disabled) {
                    let _ = app
                        .notification()
                        .builder()
                        .title("File d'attente rouverte")
                        .body(format!("{mode} est de nouveau disponible sur {}.", region.to_uppercase()))
                        .show();
                }
            }
            ctx.disabled_queues = currently_disabled;
        }
    }

    ctx.initialized = true;
}

fn incident_title(incident: &StatusIncident) -> String {
    let fr = incident.titles.iter().find(|t| t.locale.as_deref().is_some_and(|l| l.starts_with("fr")));
    let en = incident.titles.iter().find(|t| t.locale.as_deref().is_some_and(|l| l.starts_with("en")));
    fr.or(en)
        .or_else(|| incident.titles.first())
        .and_then(|t| t.content.clone())
        .unwrap_or_else(|| "Incident en cours".to_string())
}
