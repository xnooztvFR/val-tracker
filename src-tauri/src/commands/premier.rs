//! Commandes Premier (équipes, leaderboard, historique).

use tauri::State;

use super::CommandError;
use crate::api::henrik::endpoints::Fetched;
use crate::api::henrik::types_premier::{PremierTeamDetail, PremierTeamHistory, PremierTeamLite};
use crate::AppState;

#[tauri::command]
pub async fn search_premier_teams(
    state: State<'_, AppState>,
    name: Option<String>,
    tag: Option<String>,
) -> Result<Fetched<Vec<PremierTeamLite>>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };
    Ok(crate::api::henrik::endpoints_premier::search_premier_teams(
        &state.db,
        &state.henrik,
        api_key.as_ref(),
        name.as_deref(),
        tag.as_deref(),
    )
    .await?)
}

#[tauri::command]
pub async fn fetch_premier_leaderboard(
    state: State<'_, AppState>,
    region: String,
) -> Result<Fetched<Vec<PremierTeamLite>>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };
    Ok(
        crate::api::henrik::endpoints_premier::get_premier_leaderboard(
            &state.db,
            &state.henrik,
            api_key.as_ref(),
            &region,
        )
        .await?,
    )
}

#[tauri::command]
pub async fn fetch_premier_team(
    state: State<'_, AppState>,
    name: Option<String>,
    tag: Option<String>,
    team_id: Option<String>,
) -> Result<Fetched<PremierTeamDetail>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };
    if let (Some(name), Some(tag)) = (&name, &tag) {
        return Ok(crate::api::henrik::endpoints_premier::get_premier_team_by_name(
            &state.db,
            &state.henrik,
            api_key.as_ref(),
            name,
            tag,
        )
        .await?);
    }
    if let Some(team_id) = &team_id {
        return Ok(crate::api::henrik::endpoints_premier::get_premier_team_by_id(
            &state.db,
            &state.henrik,
            api_key.as_ref(),
            team_id,
        )
        .await?);
    }
    Err(CommandError::Unknown {
        message: "fetch_premier_team: fournir soit name+tag, soit team_id".to_string(),
    })
}

#[tauri::command]
pub async fn fetch_premier_team_history(
    state: State<'_, AppState>,
    name: Option<String>,
    tag: Option<String>,
    team_id: Option<String>,
) -> Result<Fetched<PremierTeamHistory>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };
    if let (Some(name), Some(tag)) = (&name, &tag) {
        return Ok(
            crate::api::henrik::endpoints_premier::get_premier_team_history_by_name(
                &state.db,
                &state.henrik,
                api_key.as_ref(),
                name,
                tag,
            )
            .await?,
        );
    }
    if let Some(team_id) = &team_id {
        return Ok(
            crate::api::henrik::endpoints_premier::get_premier_team_history_by_id(
                &state.db,
                &state.henrik,
                api_key.as_ref(),
                team_id,
            )
            .await?,
        );
    }
    Err(CommandError::Unknown {
        message: "fetch_premier_team_history: fournir soit name+tag, soit team_id".to_string(),
    })
}
