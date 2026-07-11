//! Endpoints Premier (`/valorant/v1/premier/*`) : recherche/detail d'équipe, classement
//! régional, historique de matchs. Même principe de cache que `endpoints.rs`.

use rusqlite::Connection;
use tokio::sync::Mutex;

use super::client::HenrikClient;
use super::endpoints::{encode, fetch_with_cache, Fetched};
use super::types_premier::{PremierTeamDetail, PremierTeamHistory, PremierTeamLite};
use super::{HenrikError, TTL_PREMIER};

/// Recherche d'équipes Premier par nom/tag (les deux optionnels — un nom seul renvoie
/// toutes les équipes correspondantes).
pub async fn search_premier_teams(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&str>,
    name: Option<&str>,
    tag: Option<&str>,
) -> Result<Fetched<Vec<PremierTeamLite>>, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let mut query = Vec::new();
    if let Some(name) = name {
        query.push(format!("name={}", encode(name)));
    }
    if let Some(tag) = tag {
        query.push(format!("tag={}", encode(tag)));
    }
    let mut path = "/valorant/v1/premier/search".to_string();
    if !query.is_empty() {
        path.push('?');
        path.push_str(&query.join("&"));
    }
    fetch_with_cache(db, client, api_key, &path, TTL_PREMIER, false).await
}

/// Classement Premier d'une région (conférence/division agrégées côté API).
pub async fn get_premier_leaderboard(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&str>,
    region: &str,
) -> Result<Fetched<Vec<PremierTeamLite>>, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let path = format!("/valorant/v1/premier/leaderboard/{}", encode(region));
    fetch_with_cache(db, client, api_key, &path, TTL_PREMIER, false).await
}

/// Détail d'une équipe Premier par pseudo#tag.
pub async fn get_premier_team_by_name(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&str>,
    name: &str,
    tag: &str,
) -> Result<Fetched<PremierTeamDetail>, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let path = format!("/valorant/v1/premier/{}/{}", encode(name), encode(tag));
    fetch_with_cache(db, client, api_key, &path, TTL_PREMIER, false).await
}

/// Détail d'une équipe Premier par UUID.
pub async fn get_premier_team_by_id(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&str>,
    team_id: &str,
) -> Result<Fetched<PremierTeamDetail>, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let path = format!("/valorant/v1/premier/{}", encode(team_id));
    fetch_with_cache(db, client, api_key, &path, TTL_PREMIER, false).await
}

/// Historique de matchs de ligue/tournoi d'une équipe, par pseudo#tag.
pub async fn get_premier_team_history_by_name(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&str>,
    name: &str,
    tag: &str,
) -> Result<Fetched<PremierTeamHistory>, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let path = format!(
        "/valorant/v1/premier/{}/{}/history",
        encode(name),
        encode(tag)
    );
    fetch_with_cache(db, client, api_key, &path, TTL_PREMIER, false).await
}

/// Historique de matchs de ligue/tournoi d'une équipe, par UUID.
pub async fn get_premier_team_history_by_id(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&str>,
    team_id: &str,
) -> Result<Fetched<PremierTeamHistory>, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let path = format!("/valorant/v1/premier/{}/history", encode(team_id));
    fetch_with_cache(db, client, api_key, &path, TTL_PREMIER, false).await
}
