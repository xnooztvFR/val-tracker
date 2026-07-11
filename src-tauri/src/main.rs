// Pas de console Windows en release (garde la console en dev pour voir les logs).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;
mod applog;
mod commands;
mod db;
mod discord_rpc;
mod dpapi;
mod inactivity_reminder;
mod overlay;
mod riot_local;
mod settings;
mod status_watcher;

use std::sync::Arc;

use tauri::Manager;
use tokio::sync::Mutex;

use api::henrik::{HenrikClient, RateLimiter};

/// État partagé de l'app, injecté dans toutes les commandes via `tauri::State`.
pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub henrik: HenrikClient,
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let handle = app.handle().clone();
            applog::init(&handle);

            let db_path = db::resolve_db_path(&handle)?;
            let conn = db::init_db(&db_path)?;

            let rate_limiter = Arc::new(RateLimiter::new());
            let henrik = HenrikClient::new(rate_limiter);

            app.manage(AppState {
                db: Mutex::new(conn),
                henrik,
            });

            // V2 — détection de partie + overlay : état live partagé, boucle de polling
            // (respecte le toggle riot_local_disabled à chaque tick) et raccourci global
            // Ctrl+Shift+V (bascule click-through de l'overlay). Best-effort : un échec
            // d'enregistrement du raccourci ne doit pas empêcher l'app de démarrer.
            app.manage(riot_local::LiveState::new());
            riot_local::poller::start(handle.clone());

            // V3 — Rich Presence Discord : thread IPC dédié, piloté depuis le poller (état
            // de partie déjà calculé là-bas) et depuis Paramètres. Best-effort : géré même
            // si Discord n'est pas lancé ou si aucun client_id n'est configuré (voir
            // discord_rpc.rs).
            app.manage(discord_rpc::spawn());

            // V3 — watcher de statut serveur/file d'attente : opt-in (settings::
            // AppSettings::status_watcher_enabled), voir status_watcher.rs.
            status_watcher::start(handle.clone());

            // Backlog #32 — rappel d'inactivité : opt-in (settings::AppSettings::
            // inactivity_reminder_enabled), voir inactivity_reminder.rs.
            inactivity_reminder::start(handle.clone());

            let shortcut_registered = match overlay::window::register_toggle_shortcut(&handle) {
                Ok(()) => true,
                Err(err) => {
                    applog!(
                        "[overlay] raccourci global Ctrl+Shift+V indisponible (probablement déjà pris par une autre appli): {err}"
                    );
                    false
                }
            };
            app.manage(overlay::window::ShortcutStatus::registered(shortcut_registered));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_henrik_api_key,
            commands::save_default_region,
            commands::save_auto_update_enabled,
            commands::save_riot_local_disabled,
            commands::save_discord_rpc_enabled,
            commands::save_discord_rpc_client_id,
            commands::save_status_watcher_enabled,
            commands::save_usage_metrics_enabled,
            commands::get_usage_metrics_summary,
            commands::save_ui_theme,
            commands::save_ui_accent,
            commands::save_overlay_density,
            commands::save_loss_streak_alert_enabled,
            commands::save_loss_streak_alert_count,
            commands::save_inactivity_reminder_enabled,
            commands::save_inactivity_reminder_days,
            commands::verify_henrik_api_key,
            commands::fetch_account,
            commands::fetch_mmr,
            commands::fetch_matches,
            commands::fetch_mmr_by_puuid,
            commands::fetch_mmr_history,
            commands::fetch_match_detail,
            commands::fetch_leaderboard,
            commands::fetch_status,
            commands::fetch_queue_status,
            commands::fetch_esports_schedule,
            commands::fetch_crosshair_preview,
            commands::search_premier_teams,
            commands::fetch_premier_leaderboard,
            commands::fetch_premier_team,
            commands::fetch_premier_team_history,
            commands::fetch_vlr_events,
            commands::fetch_vlr_event_matches,
            commands::fetch_vlr_match,
            commands::fetch_vlr_team,
            commands::fetch_vlr_team_matches,
            commands::fetch_vlr_player,
            commands::fetch_vlr_player_matches,
            commands::get_live_state,
            commands::get_overlay_shortcut_status,
            commands::record_party_from_match,
            commands::list_duo_stats,
            commands::list_squad_stats,
            commands::list_tracked_players,
            commands::toggle_favorite_player,
            commands::list_favorite_players,
            commands::reorder_favorite_players,
            commands::list_rank_snapshots,
            commands::reset_local_stats,
            commands::save_player_notes,
            commands::get_progression_goal,
            commands::save_progression_goal,
            commands::clear_progression_goal,
            commands::set_self_account,
            commands::list_self_accounts,
            commands::detect_local_account,
            commands::get_recent_logs,
        ])
        .run(tauri::generate_context!())
        .expect("erreur lors du lancement de l'application Tauri");
}
