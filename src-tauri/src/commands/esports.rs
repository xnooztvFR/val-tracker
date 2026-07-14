//! Commandes Esport pro (VLR) : events, matchs, équipes, joueurs.

use tauri::State;

use super::CommandError;
use crate::api::henrik::endpoints::Fetched;
use crate::api::henrik::types_esports::{
    VlrEvent, VlrEventMatch, VlrMatchDetail, VlrPlayer, VlrPlayerMatch, VlrTeam, VlrTeamMatch,
};
use crate::AppState;

#[tauri::command]
pub async fn fetch_vlr_events(
    state: State<'_, AppState>,
    region: Option<String>,
    event_type: Option<String>,
    page: u32,
) -> Result<Fetched<Vec<VlrEvent>>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };
    Ok(crate::api::henrik::endpoints_esports::get_vlr_events(
        &state.db,
        &state.henrik,
        api_key.as_ref(),
        region.as_deref(),
        event_type.as_deref(),
        page,
    )
    .await?)
}

#[tauri::command]
pub async fn fetch_vlr_event_matches(
    state: State<'_, AppState>,
    event_id: u32,
) -> Result<Fetched<Vec<VlrEventMatch>>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };
    Ok(
        crate::api::henrik::endpoints_esports::get_vlr_event_matches(
            &state.db,
            &state.henrik,
            api_key.as_ref(),
            event_id,
        )
        .await?,
    )
}

#[tauri::command]
pub async fn fetch_vlr_match(
    state: State<'_, AppState>,
    match_id: u32,
) -> Result<Fetched<VlrMatchDetail>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };
    Ok(crate::api::henrik::endpoints_esports::get_vlr_match(
        &state.db,
        &state.henrik,
        api_key.as_ref(),
        match_id,
    )
    .await?)
}

#[tauri::command]
pub async fn fetch_vlr_team(
    state: State<'_, AppState>,
    team_id: u32,
) -> Result<Fetched<VlrTeam>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };
    Ok(crate::api::henrik::endpoints_esports::get_vlr_team(
        &state.db,
        &state.henrik,
        api_key.as_ref(),
        team_id,
    )
    .await?)
}

#[tauri::command]
pub async fn fetch_vlr_team_matches(
    state: State<'_, AppState>,
    team_id: u32,
    page: u32,
) -> Result<Fetched<Vec<VlrTeamMatch>>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };
    Ok(
        crate::api::henrik::endpoints_esports::get_vlr_team_matches(
            &state.db,
            &state.henrik,
            api_key.as_ref(),
            team_id,
            page,
        )
        .await?,
    )
}

#[tauri::command]
pub async fn fetch_vlr_player(
    state: State<'_, AppState>,
    player_id: u32,
    timespan: Option<String>,
) -> Result<Fetched<VlrPlayer>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };
    Ok(crate::api::henrik::endpoints_esports::get_vlr_player(
        &state.db,
        &state.henrik,
        api_key.as_ref(),
        player_id,
        timespan.as_deref(),
    )
    .await?)
}

#[tauri::command]
pub async fn fetch_vlr_player_matches(
    state: State<'_, AppState>,
    player_id: u32,
    page: u32,
) -> Result<Fetched<Vec<VlrPlayerMatch>>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };
    Ok(
        crate::api::henrik::endpoints_esports::get_vlr_player_matches(
            &state.db,
            &state.henrik,
            api_key.as_ref(),
            player_id,
            page,
        )
        .await?,
    )
}
