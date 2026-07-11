//! Structs serde pour l'API esport détaillée basée sur VLR.gg (`/valorant/v2/esports/vlr/*`).
//! Identifiants numériques (pas des UUID) pour events/matchs/équipes/joueurs.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrCountry {
    pub name: Option<String>,
    pub code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrSocial {
    pub platform: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrIdSlug {
    pub id: i64,
    pub slug: Option<String>,
}

// ---- events ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrEventDates {
    pub start: Option<String>,
    pub end: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrEvent {
    pub id: i64,
    pub title: String,
    pub slug: Option<String>,
    pub icon: Option<String>,
    pub price: Option<String>,
    pub region: Option<String>,
    /// "completed" / "ongoing" / "upcoming" / "unknown"
    pub status: Option<String>,
    pub dates: Option<VlrEventDates>,
}

/// Élément de `events/{id}/matches` : malgré le nom "EventDetail" côté API, c'est un
/// match programmé dans l'event (id/slug de match, équipes, tags, date).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrEventMatch {
    pub id: i64,
    pub slug: Option<String>,
    pub event: Option<String>,
    pub series: Option<String>,
    pub date: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub teams: Vec<VlrMatchTeamLite>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrMatchTeamLite {
    pub name: String,
    pub is_winner: Option<bool>,
    pub score: Option<i64>,
}

// ---- teams ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrTeamRosterMember {
    pub id: i64,
    pub alias: String,
    pub avatar: Option<String>,
    pub country_code: Option<String>,
    pub real_name: Option<String>,
    pub role: Option<String>,
    pub is_captain: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrPlacementEvent {
    pub id: i64,
    pub slug: Option<String>,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrPlacementEntry {
    pub place: Option<String>,
    pub prize: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrEventPlacement {
    pub event: Option<VlrPlacementEvent>,
    pub year: Option<String>,
    #[serde(default)]
    pub placements: Vec<VlrPlacementEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrTeam {
    pub id: i64,
    pub name: String,
    pub tag: Option<String>,
    pub logo: Option<String>,
    pub country: Option<VlrCountry>,
    pub total_winnings: Option<String>,
    #[serde(default)]
    pub roster: Vec<VlrTeamRosterMember>,
    #[serde(default)]
    pub socials: Vec<VlrSocial>,
    #[serde(default)]
    pub event_placements: Vec<VlrEventPlacement>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrMatchLeague {
    pub icon: Option<String>,
    pub name: Option<String>,
    pub series: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrTeamMatchTeam {
    pub name: String,
    pub tag: Option<String>,
    pub logo: Option<String>,
    pub score: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrTeamMatch {
    #[serde(rename = "match")]
    pub match_: VlrIdSlug,
    pub league: Option<VlrMatchLeague>,
    pub date: Option<String>,
    #[serde(default)]
    pub teams: Vec<VlrTeamMatchTeam>,
    #[serde(default)]
    pub vods: Vec<String>,
}

// ---- players ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrPlayerTeamRef {
    pub id: i64,
    pub name: Option<String>,
    pub logo: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrAgentUsage {
    pub count: Option<i64>,
    pub percentage: Option<f64>,
    pub rounds: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrAgentPerformanceStats {
    pub rating: Option<f64>,
    pub acs: Option<f64>,
    pub kd: Option<f64>,
    pub adr: Option<f64>,
    pub kast: Option<f64>,
    pub kpr: Option<f64>,
    pub apr: Option<f64>,
    pub fkpr: Option<f64>,
    pub fdpr: Option<f64>,
    pub kills: Option<i64>,
    pub deaths: Option<i64>,
    pub assists: Option<i64>,
    pub first_kills: Option<i64>,
    pub first_deaths: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrPlayerAgentStats {
    pub agent: String,
    pub usage: Option<VlrAgentUsage>,
    pub stats: Option<VlrAgentPerformanceStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrPlayer {
    pub id: i64,
    pub name: String,
    pub real_name: Option<String>,
    pub avatar: Option<String>,
    pub country: Option<VlrCountry>,
    pub total_winnings: Option<String>,
    #[serde(default)]
    pub current_teams: Vec<VlrPlayerTeamRef>,
    #[serde(default)]
    pub past_teams: Vec<VlrPlayerTeamRef>,
    #[serde(default)]
    pub agent_stats: Vec<VlrPlayerAgentStats>,
    #[serde(default)]
    pub event_placements: Vec<VlrEventPlacement>,
    #[serde(default)]
    pub socials: Vec<VlrSocial>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrPlayerMatchTeam {
    pub name: String,
    pub tag: Option<String>,
    pub icon: Option<String>,
    pub score: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrPlayerMatch {
    #[serde(rename = "match")]
    pub match_: VlrIdSlug,
    pub league: Option<VlrMatchLeague>,
    pub date: Option<String>,
    #[serde(default)]
    pub teams: Vec<VlrPlayerMatchTeam>,
    #[serde(default)]
    pub vods: Vec<String>,
}

// ---- match detail ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrMatchEvent {
    pub id: i64,
    pub slug: Option<String>,
    pub icon: Option<String>,
    pub title: Option<String>,
    pub series: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrMatchHeader {
    pub event: Option<VlrMatchEvent>,
    pub date: Option<String>,
    pub patch: Option<String>,
    pub format: Option<String>,
    pub status: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrMatchHeaderTeam {
    pub id: i64,
    pub slug: Option<String>,
    pub url: Option<String>,
    pub name: String,
    pub icon: Option<String>,
    pub score: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrMatchStream {
    pub name: String,
    pub link: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrMatchPlayerRef {
    pub id: i64,
    pub name: String,
    pub nation: Option<String>,
    pub slug: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrMatchGamePlayerStats {
    pub rating: Option<f64>,
    pub acs: Option<i64>,
    pub kills: Option<i64>,
    pub deaths: Option<i64>,
    pub assists: Option<i64>,
    pub kd_diff: Option<i64>,
    pub kast: Option<f64>,
    pub adr: Option<f64>,
    pub hs_pct: Option<f64>,
    pub first_kills: Option<i64>,
    pub first_deaths: Option<i64>,
    pub fk_diff: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrMatchGamePlayer {
    pub player: VlrMatchPlayerRef,
    pub agent: String,
    pub stats: Option<VlrMatchGamePlayerStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrMatchGameTeam {
    pub name: String,
    pub is_winner: Option<bool>,
    pub score: Option<i64>,
    pub score_ct: Option<i64>,
    pub score_t: Option<i64>,
    #[serde(default)]
    pub players: Vec<VlrMatchGamePlayer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrMatchGame {
    pub map: String,
    pub duration_in_s: Option<i64>,
    pub picked_by: Option<i64>,
    #[serde(default)]
    pub teams: Vec<VlrMatchGameTeam>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlrMatchDetail {
    pub metadata: VlrMatchHeader,
    #[serde(default)]
    pub teams: Vec<VlrMatchHeaderTeam>,
    #[serde(default)]
    pub streams: Vec<VlrMatchStream>,
    #[serde(default)]
    pub vods: Vec<VlrMatchStream>,
    #[serde(default)]
    pub games: Vec<VlrMatchGame>,
}
