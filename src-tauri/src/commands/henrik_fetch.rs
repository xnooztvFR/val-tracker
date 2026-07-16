//! Commandes de récupération de données Henrik Dev (compte, rank, matchs, leaderboard,
//! statut serveur, crosshair preview).

use tauri::State;

use super::CommandError;
use crate::api::henrik::endpoints::Fetched;
use crate::api::henrik::types::{
    AccountData, EsportsScheduleEntry, LeaderboardData, MatchDetailData, MatchEntry, MmrData,
    MmrHistoryData, QueueStatusEntry, StatusData,
};
use crate::AppState;

#[tauri::command]
pub async fn fetch_account(
    state: State<'_, AppState>,
    name: String,
    tag: String,
    force: bool,
) -> Result<Fetched<AccountData>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };

    let result = crate::api::henrik::endpoints::get_account(
        &state.db,
        &state.henrik,
        api_key.as_ref(),
        &name,
        &tag,
        force,
    )
    .await?;

    {
        let conn = state.db.lock().await;
        let region = match result.data.region.clone() {
            Some(region) => region,
            None => crate::settings::load_settings(&conn)?.default_region,
        };
        crate::db::upsert_tracked_player(&conn, &result.data.puuid, &name, &tag, &region)?;
    }

    Ok(result)
}

#[tauri::command]
pub async fn fetch_mmr(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    puuid: String,
    region: String,
    name: String,
    tag: String,
    force: bool,
) -> Result<Fetched<MmrData>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };

    let result = crate::api::henrik::endpoints::get_mmr(
        &state.db,
        &state.henrik,
        api_key.as_ref(),
        &region,
        &name,
        &tag,
        force,
    )
    .await?;

    // On ne journalise un snapshot que si la donnée vient réellement du réseau, pour ne
    // pas empiler des points identiques à chaque relecture d'un cache encore frais.
    if result.from_network {
        if let Some(current) = &result.data.current_data {
            if let Some(tier) = current.currenttier {
                let tier_patched = current.currenttierpatched.as_deref().unwrap_or("Inconnu");
                let conn = state.db.lock().await;
                // V3 : lu avant l'insertion pour comparer avec le nouveau tier — c'est ce
                // qui alimente la notification de promotion/dérank (voir plus bas), sans
                // appel réseau supplémentaire : on observe juste ce que cette commande
                // récupère déjà.
                let previous = crate::db::latest_rank_snapshot(&conn, &puuid)?;
                crate::db::insert_rank_snapshot(
                    &conn,
                    &puuid,
                    tier,
                    tier_patched,
                    current.ranking_in_tier,
                )?;
                let alert_settings = crate::settings::load_settings(&conn)?;
                let rank_change_alert_enabled = alert_settings.rank_change_alert_enabled;
                let webhook = alert_settings
                    .discord_webhook_enabled
                    .then_some(alert_settings.discord_webhook_url)
                    .flatten();
                drop(conn);

                if let Some(previous) = previous {
                    if previous.tier != tier {
                        let promoted = tier > previous.tier;
                        if rank_change_alert_enabled {
                            notify_rank_change(&app, &previous.tier_patched, tier_patched, promoted);
                        }
                        if let Some(webhook_url) = webhook {
                            let from = previous.tier_patched.clone();
                            let to = tier_patched.to_string();
                            tauri::async_runtime::spawn(async move {
                                crate::discord_webhook::send_rank_change(&webhook_url, &from, &to, promoted).await;
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(result)
}

/// Notification native de changement de rank (promotion/dérank) — voir la doc de
/// `fetch_mmr` pour le contexte. Best-effort, ne fait jamais échouer la commande.
fn notify_rank_change(app: &tauri::AppHandle, from: &str, to: &str, promoted: bool) {
    use tauri_plugin_notification::NotificationExt;

    let title = if promoted { "Promotion !" } else { "Dérank" };
    let _ = app
        .notification()
        .builder()
        .title(title)
        .body(format!("{from} → {to}"))
        .show();
}

#[tauri::command]
pub async fn fetch_matches(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    region: String,
    name: String,
    tag: String,
    size: u32,
    force: bool,
) -> Result<Fetched<Vec<MatchEntry>>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };

    let result = crate::api::henrik::endpoints::get_matches(
        &state.db,
        &state.henrik,
        api_key.as_ref(),
        &region,
        &name,
        &tag,
        size,
        force,
    )
    .await?;

    {
        let conn = state.db.lock().await;
        if let Ok(settings) = crate::settings::load_settings(&conn) {
            if settings.loss_streak_alert_enabled {
                crate::loss_streak::maybe_notify(
                    &app,
                    &conn,
                    &name,
                    &tag,
                    &result.data,
                    settings.loss_streak_alert_count,
                );
            }
            if settings.win_streak_alert_enabled {
                crate::win_streak::maybe_notify(
                    &app,
                    &conn,
                    &name,
                    &tag,
                    &result.data,
                    settings.win_streak_alert_count,
                );
            }
        }
    }

    Ok(result)
}

#[tauri::command]
pub async fn fetch_mmr_history(
    state: State<'_, AppState>,
    region: String,
    name: String,
    tag: String,
    force: bool,
) -> Result<Fetched<MmrHistoryData>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };

    Ok(crate::api::henrik::endpoints::get_mmr_history(
        &state.db,
        &state.henrik,
        api_key.as_ref(),
        &region,
        &name,
        &tag,
        force,
    )
    .await?)
}

#[tauri::command]
pub async fn fetch_match_detail(
    state: State<'_, AppState>,
    match_id: String,
    force: bool,
) -> Result<Fetched<MatchDetailData>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };

    Ok(crate::api::henrik::endpoints::get_match_detail(
        &state.db,
        &state.henrik,
        api_key.as_ref(),
        &match_id,
        force,
    )
    .await?)
}

#[tauri::command]
pub async fn fetch_leaderboard(
    state: State<'_, AppState>,
    region: String,
    size: u32,
    start_index: u32,
    name: Option<String>,
    tag: Option<String>,
    force: bool,
) -> Result<Fetched<LeaderboardData>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };

    Ok(crate::api::henrik::endpoints::get_leaderboard(
        &state.db,
        &state.henrik,
        api_key.as_ref(),
        &region,
        size,
        start_index,
        name.as_deref(),
        tag.as_deref(),
        force,
    )
    .await?)
}

#[tauri::command]
pub async fn fetch_status(
    state: State<'_, AppState>,
    region: String,
) -> Result<Fetched<StatusData>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };

    Ok(crate::api::henrik::endpoints::get_status(
        &state.db,
        &state.henrik,
        api_key.as_ref(),
        &region,
        false,
    )
    .await?)
}

#[tauri::command]
pub async fn fetch_queue_status(
    state: State<'_, AppState>,
    region: String,
) -> Result<Fetched<Vec<QueueStatusEntry>>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };

    Ok(crate::api::henrik::endpoints::get_queue_status(
        &state.db,
        &state.henrik,
        api_key.as_ref(),
        &region,
        false,
    )
    .await?)
}

#[tauri::command]
pub async fn fetch_esports_schedule(
    state: State<'_, AppState>,
    region: Option<String>,
    league: Option<String>,
) -> Result<Fetched<Vec<EsportsScheduleEntry>>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };

    Ok(crate::api::henrik::endpoints::get_esports_schedule(
        &state.db,
        &state.henrik,
        api_key.as_ref(),
        region.as_deref(),
        league.as_deref(),
        false,
    )
    .await?)
}

/// Renvoie l'image du crosshair en base64 (data URL construite côté frontend), pour un
/// code de crosshair donné — outil de prévisualisation dans Paramètres.
#[tauri::command]
pub async fn fetch_crosshair_preview(
    state: State<'_, AppState>,
    code: String,
) -> Result<String, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };

    Ok(crate::api::henrik::endpoints::get_crosshair_preview(
        &state.db,
        &state.henrik,
        api_key.as_ref(),
        &code,
        false,
    )
    .await?)
}

/// V2 overlay : MMR d'un joueur détecté en partie, par PUUID (même cache/rate limiting
/// que le reste des appels Henrik).
#[tauri::command]
pub async fn fetch_mmr_by_puuid(
    state: State<'_, AppState>,
    puuid: String,
    region: String,
) -> Result<Fetched<MmrData>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };

    Ok(crate::api::henrik::endpoints::get_mmr_by_puuid(
        &state.db,
        &state.henrik,
        api_key.as_ref(),
        &region,
        &puuid,
        false,
    )
    .await?)
}
