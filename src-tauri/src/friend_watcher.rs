//! TODO Fonctionnalités#19 : "mode spectateur ami" — suivre le statut d'un ami sans lancer
//! sa propre partie.
//!
//! Limite assumée et documentée : l'API Henrik n'expose **aucun** endpoint de présence par
//! joueur (voir `api/henrik/endpoints.rs::get_status`, qui ne couvre qu'un statut serveur
//! régional — maintenance/incidents). Il n'existe donc aucun moyen de savoir qu'un ami est
//! *en train* de jouer via Henrik. Ce watcher observe la seule chose réellement disponible :
//! l'apparition d'un nouveau match dans son historique compétitif (`v4/matches`, size=1,
//! même cache/rate-limiter que le reste). C'est un signal *a posteriori* — "il vient de
//! terminer une partie" — pas une présence en direct. Toujours opt-in (voir
//! `db::players::set_followed_friend`), silencieux si aucun ami n'est suivi, même pattern
//! best-effort que `status_watcher.rs`/`inactivity_reminder.rs`.

use std::time::Duration;

use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::AppState;

const CHECK_INTERVAL: Duration = Duration::from_secs(300);

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
    crate::diagnostics::record_tick(app, crate::diagnostics::FRIEND_WATCHER);
    let state = app.state::<AppState>();

    let (friends, api_key) = {
        let conn = state.db.lock().await;
        let friends = crate::db::list_followed_friends(&conn).unwrap_or_default();
        let api_key = crate::settings::get_henrik_api_key(&conn).ok().flatten();
        (friends, api_key)
    };
    if friends.is_empty() {
        return;
    }
    let Some(api_key) = api_key else { return };

    for friend in friends {
        let result = crate::api::henrik::endpoints::get_matches(
            &state.db,
            &state.henrik,
            Some(&api_key),
            &friend.region,
            &friend.name,
            &friend.tag,
            1,
            false,
        )
        .await;

        let Ok(fetched) = result else {
            // Best-effort : un ami dont le Riot ID a changé de région, ou une panne réseau
            // ponctuelle, ne doit jamais faire échouer le tick pour les autres amis suivis.
            continue;
        };
        let Some(latest) = fetched.data.first() else { continue };
        let Some(match_id) = latest.metadata.match_id.clone() else { continue };

        if friend.last_followed_match_id.as_deref() == Some(match_id.as_str()) {
            continue;
        }

        let conn = state.db.lock().await;
        // Premier tick pour cet ami (jamais de `last_followed_match_id` enregistré) :
        // on mémorise juste l'état actuel sans notifier, sinon suivre un ami avec un
        // historique déjà existant déclencherait une notification immédiate pour une
        // partie potentiellement jouée il y a des mois.
        let is_first_check = friend.last_followed_match_id.is_none();
        if let Err(e) = crate::db::set_last_followed_match_id(&conn, &friend.puuid, &match_id) {
            crate::applog!("[friend_watcher] échec d'écriture de la dédup ({}): {e}", friend.puuid);
        }
        drop(conn);

        if is_first_check {
            continue;
        }

        let won = latest
            .players
            .iter()
            .find(|p| p.puuid.as_deref() == Some(friend.puuid.as_str()))
            .and_then(|p| p.team_id.clone())
            .and_then(|team_id| latest.teams.iter().find(|t| t.team_id.as_deref() == Some(team_id.as_str())))
            .and_then(|t| t.won);

        let result_label = match won {
            Some(true) => "victoire",
            Some(false) => "défaite",
            None => "partie terminée",
        };
        let _ = app
            .notification()
            .builder()
            .title("Un ami suivi vient de jouer")
            .body(format!("{}#{} — {result_label}", friend.name, friend.tag))
            .show();
    }
}
