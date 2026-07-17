// Pas de console Windows en release (garde la console en dev pour voir les logs).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;
mod applog;
mod commands;
mod db;
mod diagnostics;
mod discord_rpc;
mod dpapi;
mod image_proxy;
mod inactivity_reminder;
mod discord_webhook;
mod friend_watcher;
mod loss_streak;
mod win_streak;
mod overlay;
mod riot_local;
mod economy_stats;
mod map_averages;
mod queue_stats;
mod recommendations;
mod security_config;
mod settings;
mod side_stats;
mod status_watcher;
mod updater;

use std::sync::Arc;

use tauri::{Emitter, Manager};
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
        .plugin(tauri_plugin_clipboard_manager::init())
        // Backlog #69 : démarrage auto avec Windows, désactivé tant que l'utilisateur ne
        // l'active pas explicitement dans Paramètres (voir commands::save_autostart_enabled).
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let handle = app.handle().clone();
            applog::init(&handle);
            applog::install_panic_hook();

            let db_path = db::resolve_db_path(&handle)?;
            let conn = db::init_db(&db_path)?;
            db::maybe_vacuum(&conn, &db_path);
            db::purge_old_events(&conn);

            // Lu avant de déplacer `conn` dans l'état partagé : les raccourcis globaux
            // reconfigurables (voir `register_shortcuts`) doivent connaître la combinaison
            // choisie par l'utilisateur dès le démarrage, pas seulement la valeur par défaut.
            let startup_settings = settings::load_settings(&conn)?;

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
            // Crée la fenêtre overlay par anticipation (masquée) plutôt qu'à la demande de
            // la première partie détectée — voir `overlay::window::warm_up` (bug constaté
            // en session : pas d'overlay sur la toute première partie qui suit un
            // lancement d'app, fenêtre de course avec le démarrage de l'app lui-même).
            tauri::async_runtime::spawn(overlay::window::warm_up(handle.clone()));

            // Registre "dernier tick / dernière erreur" des tâches de fond (poller
            // riot_local, status watcher, rappel d'inactivité, thread Discord RPC),
            // consultable depuis Paramètres → Diagnostics — voir `diagnostics.rs`. Doit
            // être managé avant le démarrage de ces tâches, qui l'alimentent dès leur
            // premier tick.
            app.manage(diagnostics::TaskRegistry::new());

            app.manage(riot_local::LiveState::new());
            // Backlog #81 : lien "voir le récap" déposé par le poller à la fin d'une
            // partie, consommé au focus de la fenêtre principale (voir plus bas).
            app.manage(riot_local::PostgameLinkState::new());
            // Le handle doit rester géré pour toute la durée de vie de l'app : il détient
            // le `watch::Sender` qui maintient la boucle de polling en vie. Le laisser
            // tomber ici fermerait immédiatement le canal et arrêterait `run_loop` dès sa
            // première itération, avant même le premier tick (bug constaté en session).
            app.manage(riot_local::poller::start(handle.clone()));

            // V3 — Rich Presence Discord : thread IPC dédié, piloté depuis le poller (état
            // de partie déjà calculé là-bas) et depuis Paramètres. Best-effort : géré même
            // si Discord n'est pas lancé ou si aucun client_id n'est configuré (voir
            // discord_rpc.rs).
            app.manage(discord_rpc::spawn(handle.clone()));

            // V3 — watcher de statut serveur/file d'attente : opt-in (settings::
            // AppSettings::status_watcher_enabled), voir status_watcher.rs.
            status_watcher::start(handle.clone());

            // Backlog #32 — rappel d'inactivité : opt-in (settings::AppSettings::
            // inactivity_reminder_enabled), voir inactivity_reminder.rs.
            inactivity_reminder::start(handle.clone());

            // TODO Fonctionnalités#19 — "mode spectateur ami" : silencieux tant qu'aucun ami
            // n'est suivi (voir friend_watcher.rs), pas de toggle de réglage séparé — suivre
            // un ami *est* l'opt-in.
            friend_watcher::start(handle.clone());

            register_shortcuts(&handle, &startup_settings);

            // La fenêtre overlay (V2) est créée à la demande puis seulement masquée, jamais
            // détruite (voir `overlay::window::hide_overlay`) — elle reste donc « ouverte »
            // aux yeux de Tauri même invisible. Sans ce handler, fermer la fenêtre "main"
            // laisse ce hidden window (+ les tâches de fond : poller, Discord RPC, watchers)
            // tourner indéfiniment en arrière-plan (bug constaté en session : le process
            // survit dans le Gestionnaire des tâches après fermeture de l'app). On force
            // donc la sortie complète du process dès que la fenêtre principale se ferme.
            if let Some(main_window) = app.get_webview_window("main") {
                let handle = app.handle().clone();
                main_window.on_window_event(move |event| {
                    match event {
                        tauri::WindowEvent::CloseRequested { .. } => handle.exit(0),
                        // Backlog #81 : reprend le focus de la fenêtre principale (ex. clic
                        // sur la notification de fin de partie, qui active l'app côté OS
                        // sans callback direct côté plugin) pour consommer un éventuel lien
                        // "voir le récap" déposé par le poller et naviguer dessus.
                        tauri::WindowEvent::Focused(true) => {
                            if let Some(link_state) =
                                handle.try_state::<riot_local::PostgameLinkState>()
                            {
                                let now = chrono::Utc::now().timestamp();
                                if let Some(link) = link_state.take_if_fresh(now) {
                                    let _ = handle.emit("postgame://navigate", link);
                                }
                            }
                        }
                        _ => {}
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::set_pending_changelog,
            commands::take_pending_changelog,
            commands::list_changelog_history,
            commands::log_updater_trace,
            commands::save_henrik_api_key,
            commands::save_default_region,
            commands::save_auto_update_enabled,
            commands::save_riot_local_disabled,
            commands::save_discord_rpc_enabled,
            commands::save_discord_rpc_client_id,
            commands::save_status_watcher_enabled,
            commands::save_usage_metrics_enabled,
            commands::get_usage_metrics_summary,
            commands::get_background_diagnostics,
            commands::get_diagnostics_report,
            commands::open_downloads_folder,
            commands::save_ui_theme,
            commands::save_ui_accent,
            commands::save_ui_language,
            commands::save_ui_density,
            commands::save_overlay_density,
            commands::save_overlay_layout,
            commands::save_ui_font,
            commands::save_presentation_mode_enabled,
            commands::save_wallpaper_enabled,
            commands::save_hud_sounds_enabled,
            commands::save_hud_sounds_volume,
            commands::save_cursor_enabled,
            commands::save_icon_style,
            commands::list_overlay_monitors,
            commands::save_overlay_monitor,
            commands::save_loss_streak_alert_enabled,
            commands::save_win_streak_alert_enabled,
            commands::save_win_streak_alert_count,
            commands::save_rank_change_alert_enabled,
            commands::save_discord_webhook_enabled,
            commands::save_discord_webhook_url,
            commands::save_vlr_player_link,
            commands::save_followed_friend,
            commands::list_followed_friends,
            commands::save_loss_streak_alert_count,
            commands::save_rank_gap_alert_enabled,
            commands::save_rank_gap_alert_threshold,
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
            commands::get_side_winrate,
            commands::get_economy_stats,
            commands::get_map_average_stats,
            commands::get_queue_stats,
            commands::list_duo_stats,
            commands::list_squad_stats,
            commands::list_full_roster_stats,
            commands::get_recommendations,
            commands::list_match_notes,
            commands::add_match_note,
            commands::delete_match_note,
            commands::list_rivalry_stats,
            commands::retro_populate_rivalry,
            commands::record_goal_achieved,
            commands::list_account_timeline,
            commands::list_tracked_players,
            commands::toggle_favorite_player,
            commands::list_favorite_players,
            commands::reorder_favorite_players,
            commands::list_rank_snapshots,
            commands::reset_local_stats,
            commands::save_player_notes,
            commands::save_player_tags,
            commands::get_progression_goal,
            commands::save_progression_goal,
            commands::clear_progression_goal,
            commands::list_weekly_goals,
            commands::save_weekly_goal,
            commands::clear_weekly_goal,
            commands::set_self_account,
            commands::list_self_accounts,
            commands::set_self_account_loss_streak_threshold,
            commands::detect_local_account,
            commands::get_recent_logs,
            commands::verify_update_hash,
            commands::save_notes_pin,
            commands::clear_notes_pin,
            commands::verify_notes_pin,
            commands::fetch_external_image,
            commands::get_autostart_enabled,
            commands::save_autostart_enabled,
            commands::mark_onboarding_completed,
            commands::reset_onboarding,
            commands::save_shortcut_overlay_toggle,
            commands::save_shortcut_main_window_toggle,
        ])
        .run(tauri::generate_context!())
        .expect("erreur lors du lancement de l'application Tauri");
}

/// Enregistre les raccourcis globaux de l'app (overlay V2 + backlog #68) et gère l'état
/// partagé `ShortcutStatus` (lu par `commands::get_overlay_shortcut_status`). Best-effort à
/// chaque étage : un raccourci déjà pris par une autre appli ne doit jamais empêcher l'app
/// de démarrer, juste laisser une trace dans les logs.
fn register_shortcuts(handle: &tauri::AppHandle, settings: &settings::AppSettings) {
    // V2 overlay : bascule le mode click-through de l'overlay. Reconfigurable depuis
    // Paramètres (backlog sécurité) — voir `settings::shortcut_overlay_toggle`.
    let shortcut_registered = match overlay::window::register_toggle_shortcut(
        handle,
        &settings.shortcut_overlay_toggle,
    ) {
        Ok(()) => true,
        Err(err) => {
            applog!(
                "[overlay] raccourci global overlay ({}) indisponible (probablement déjà pris par une autre appli): {err}",
                settings.shortcut_overlay_toggle
            );
            false
        }
    };
    handle.manage(overlay::window::ShortcutStatus::registered(shortcut_registered));

    // Backlog #68 : montre/masque la fenêtre principale même quand Valorant a le focus.
    // Best-effort comme le raccourci overlay ci-dessus. Reconfigurable depuis Paramètres.
    if let Err(err) = overlay::window::register_main_window_shortcut(
        handle,
        &settings.shortcut_main_window_toggle,
    ) {
        applog!(
            "[overlay] raccourci global fenêtre principale ({}) indisponible (probablement déjà pris par une autre appli): {err}",
            settings.shortcut_main_window_toggle
        );
    }

    handle.manage(overlay::window::ActiveShortcuts::new(
        settings.shortcut_overlay_toggle.clone(),
        settings.shortcut_main_window_toggle.clone(),
    ));

    // Ctrl+Shift+Espace, maintenu : réaffiche l'overlay pendant qu'il est masqué
    // par IN_GAME_OVERLAY_DURATION (voir poller::on_state_changed). Best-effort comme les
    // autres raccourcis globaux ci-dessus. Pas reconfigurable (touche maintenue, pas un
    // simple toggle, moins sujette à conflit qu'un raccourci "appui simple").
    if let Err(err) = overlay::window::register_recall_shortcut(handle) {
        applog!(
            "[overlay] raccourci global Ctrl+Shift+Espace indisponible (probablement déjà pris par une autre appli): {err}"
        );
    }
}
