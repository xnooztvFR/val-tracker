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
            // TODO Social/multi-comptes#6/#40 : sème le record perso sur le premier match vu
            // pour cet ami (sans notifier, même raisonnement que la dédup victoire/défaite
            // ci-dessus) — sinon le tout premier match suivi déclencherait toujours un "record
            // battu" par comparaison à une absence de record.
            seed_personal_bests(&state, &friend.puuid, &latest, &match_id).await;
            continue;
        }

        let friend_stats = latest
            .players
            .iter()
            .find(|p| p.puuid.as_deref() == Some(friend.puuid.as_str()))
            .and_then(|p| p.stats.as_ref());

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

        maybe_notify_personal_best(
            app,
            &state,
            &friend.puuid,
            &friend.name,
            &friend.tag,
            friend_stats,
            &match_id,
        )
        .await;
    }
}

/// TODO Social/multi-comptes#6/#40 : mémorise le record initial sans notifier — voir le
/// commentaire d'appel dans `tick`.
async fn seed_personal_bests(
    state: &AppState,
    puuid: &str,
    latest: &crate::api::henrik::types::MatchEntry,
    match_id: &str,
) {
    let Some(stats) = latest
        .players
        .iter()
        .find(|p| p.puuid.as_deref() == Some(puuid))
        .and_then(|p| p.stats.as_ref())
    else {
        return;
    };
    let conn = state.db.lock().await;
    if let Some(kills) = stats.kills {
        let _ = crate::db::set_personal_best(&conn, puuid, crate::db::PersonalBestMetric::Kills, kills, match_id);
    }
    if let Some(score) = stats.score {
        let _ = crate::db::set_personal_best(&conn, puuid, crate::db::PersonalBestMetric::Score, score, match_id);
    }
}

/// TODO Social/multi-comptes#6/#40 : compare chaque métrique suivie (kills, score) au record
/// connu — notifie et met à jour le record si dépassé. Best-effort : une métrique absente de
/// la réponse Henrik (`stats` = `None`) est simplement ignorée, pas une erreur.
async fn maybe_notify_personal_best(
    app: &AppHandle,
    state: &AppState,
    puuid: &str,
    name: &str,
    tag: &str,
    stats: Option<&crate::api::henrik::types::PlayerStats>,
    match_id: &str,
) {
    let Some(stats) = stats else { return };

    for (metric, value, label) in [
        (crate::db::PersonalBestMetric::Kills, stats.kills, "kills"),
        (crate::db::PersonalBestMetric::Score, stats.score, "score"),
    ] {
        let Some(value) = value else { continue };
        let conn = state.db.lock().await;
        let previous_best = crate::db::get_personal_best(&conn, puuid, metric).unwrap_or(None);
        let is_new_best = previous_best.map(|best| value > best).unwrap_or(false);
        if !is_new_best {
            continue;
        }
        if let Err(e) = crate::db::set_personal_best(&conn, puuid, metric, value, match_id) {
            crate::applog!("[friend_watcher] échec d'écriture du record perso ({puuid}/{label}): {e}");
            continue;
        }
        drop(conn);

        let _ = app
            .notification()
            .builder()
            .title("Record personnel battu !")
            .body(format!("{name}#{tag} vient de battre son record de {label} ({value}) — félicite-le !"))
            .show();
    }
}
