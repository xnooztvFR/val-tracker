//! Endpoints esport détaillés basés sur VLR.gg (`/valorant/v2/esports/vlr/*`) : events,
//! matchs d'un event, détail de match, équipes (roster/historique), joueurs (stats par
//! agent/historique). Même principe de cache que `endpoints.rs`.

use rusqlite::Connection;
use tokio::sync::Mutex;

use super::client::HenrikClient;
use super::endpoints::{fetch_with_cache, Fetched};
use super::types_esports::{
    VlrEvent, VlrEventMatch, VlrMatchDetail, VlrPlayer, VlrPlayerMatch, VlrTeam, VlrTeamMatch,
};
use super::{HenrikError, TTL_ESPORTS_V2};

pub async fn get_vlr_events(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&str>,
    region: Option<&str>,
    event_type: Option<&str>,
    page: u32,
) -> Result<Fetched<Vec<VlrEvent>>, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let mut query = vec![format!("page={page}")];
    if let Some(region) = region {
        query.push(format!("region={region}"));
    }
    if let Some(event_type) = event_type {
        query.push(format!("type={event_type}"));
    }
    let path = format!("/valorant/v2/esports/vlr/events?{}", query.join("&"));
    fetch_with_cache(db, client, api_key, &path, TTL_ESPORTS_V2, false).await
}

pub async fn get_vlr_event_matches(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&str>,
    event_id: u32,
) -> Result<Fetched<Vec<VlrEventMatch>>, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let path = format!("/valorant/v2/esports/vlr/events/{event_id}/matches");
    fetch_with_cache(db, client, api_key, &path, TTL_ESPORTS_V2, false).await
}

pub async fn get_vlr_match(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&str>,
    match_id: u32,
) -> Result<Fetched<VlrMatchDetail>, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let path = format!("/valorant/v2/esports/vlr/matches/{match_id}");
    fetch_with_cache(db, client, api_key, &path, TTL_ESPORTS_V2, false).await
}

pub async fn get_vlr_team(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&str>,
    team_id: u32,
) -> Result<Fetched<VlrTeam>, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let path = format!("/valorant/v2/esports/vlr/teams/{team_id}");
    fetch_with_cache(db, client, api_key, &path, TTL_ESPORTS_V2, false).await
}

pub async fn get_vlr_team_matches(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&str>,
    team_id: u32,
    page: u32,
) -> Result<Fetched<Vec<VlrTeamMatch>>, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let path = format!("/valorant/v2/esports/vlr/teams/{team_id}/matches?page={page}");
    fetch_with_cache(db, client, api_key, &path, TTL_ESPORTS_V2, false).await
}

pub async fn get_vlr_player(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&str>,
    player_id: u32,
    timespan: Option<&str>,
) -> Result<Fetched<VlrPlayer>, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let mut path = format!("/valorant/v2/esports/vlr/players/{player_id}");
    if let Some(timespan) = timespan {
        path.push_str(&format!("?timespan={timespan}"));
    }
    fetch_with_cache(db, client, api_key, &path, TTL_ESPORTS_V2, false).await
}

pub async fn get_vlr_player_matches(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&str>,
    player_id: u32,
    page: u32,
) -> Result<Fetched<Vec<VlrPlayerMatch>>, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let path = format!("/valorant/v2/esports/vlr/players/{player_id}/matches?page={page}");
    fetch_with_cache(db, client, api_key, &path, TTL_ESPORTS_V2, false).await
}
