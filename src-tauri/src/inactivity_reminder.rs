//! Rappel d'inactivité (backlog #32) — opt-in, notification douce si aucun des comptes "à
//! soi" (`tracked_players.is_self`) n'a été consulté depuis
//! `settings::AppSettings::inactivity_reminder_days`. Ne notifie jamais plus d'une fois par
//! jour (voir `settings::get_last_inactivity_reminder_sent`) pour rester non-agressif,
//! même sur un intervalle de vérification plus court. Mêmes précautions que
//! `status_watcher.rs` : opt-in, best-effort, ne fait jamais échouer le démarrage de l'app.

use std::time::Duration;

use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::AppState;

const CHECK_INTERVAL: Duration = Duration::from_secs(3600);
const MIN_RESEND_INTERVAL_SECS: i64 = 24 * 3600;
const SECS_PER_DAY: i64 = 24 * 3600;

pub fn start(app_handle: AppHandle) {
    tauri::async_runtime::spawn(run_loop(app_handle));
}

async fn run_loop(app: AppHandle) {
    loop {
        tokio::time::sleep(CHECK_INTERVAL).await;
        tick(&app).await;
    }
}

async fn tick(app: &AppHandle) {
    crate::diagnostics::record_tick(app, crate::diagnostics::INACTIVITY_REMINDER);
    let state = app.state::<AppState>();
    let conn = state.db.lock().await;

    let Ok(settings) = crate::settings::load_settings(&conn) else {
        crate::diagnostics::record_error(
            app,
            crate::diagnostics::INACTIVITY_REMINDER,
            "lecture des réglages échouée",
        );
        return;
    };
    if !settings.inactivity_reminder_enabled {
        return;
    }

    let Ok(selves) = crate::db::list_self_accounts(&conn) else {
        return;
    };
    let Some(most_recent) = selves.iter().map(|p| p.last_viewed_at).max() else {
        // Aucun compte marqué "à soi" : rien à surveiller.
        return;
    };

    let now = chrono::Utc::now().timestamp();
    let idle_secs = now - most_recent;
    let threshold_secs = settings.inactivity_reminder_days * SECS_PER_DAY;
    if idle_secs < threshold_secs {
        return;
    }

    if let Ok(Some(last_sent)) = crate::settings::get_last_inactivity_reminder_sent(&conn) {
        if now - last_sent < MIN_RESEND_INTERVAL_SECS {
            return;
        }
    }

    let days = idle_secs / SECS_PER_DAY;
    let _ = app
        .notification()
        .builder()
        .title("On ne t'a pas vu récemment")
        .body(format!(
            "Ça fait {days} jour(s) que tu n'as pas suivi tes stats Valorant."
        ))
        .show();

    let _ = crate::settings::set_last_inactivity_reminder_sent(&conn, now);
}
