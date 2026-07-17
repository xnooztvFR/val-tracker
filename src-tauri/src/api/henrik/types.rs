//! Structs serde pour les réponses de l'API Henrik Dev. Les champs sont volontairement
//! optionnels partout où la forme de la réponse peut varier légèrement (l'API v4 en
//! particulier est encore mouvante) : on préfère un champ `None` côté UI à un crash de
//! désérialisation qui casserait tout l'écran.

use serde::{Deserialize, Serialize};

/// Enveloppe générique `{ status, data }` utilisée par la plupart des endpoints Henrik.
#[derive(Debug, Clone, Deserialize)]
pub struct HenrikEnvelope<T> {
    #[allow(dead_code)]
    pub status: i64,
    pub data: T,
}

// ---- /valorant/v2/account/{name}/{tag} ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountData {
    pub puuid: String,
    pub region: Option<String>,
    pub account_level: Option<i64>,
    pub name: String,
    pub tag: String,
    /// UUID de la carte de joueur (pas un objet imbriqué — l'API renvoie juste l'ID ;
    /// l'image se construit côté frontend via le CDN valorant-api, comme les rangs).
    pub card: Option<String>,
    pub title: Option<String>,
}

// ---- /valorant/v2/mmr/{region}/{name}/{tag} ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MmrData {
    pub current_data: Option<CurrentRankData>,
    pub highest_rank: Option<HighestRank>,
    /// Présents sur la variante by-puuid (V2 overlay) : permettent d'afficher le
    /// pseudo#tag d'un joueur détecté sans appel account supplémentaire.
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub tag: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurrentRankData {
    pub currenttier: Option<i64>,
    pub currenttierpatched: Option<String>,
    pub ranking_in_tier: Option<i64>,
    pub elo: Option<i64>,
    pub mmr_change_to_last_game: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HighestRank {
    pub tier: Option<i64>,
    pub patched_tier: Option<String>,
    pub season: Option<String>,
}

// ---- /valorant/v4/matches/{region}/pc/{name}/{tag} ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchEntry {
    pub metadata: MatchMetadata,
    #[serde(default)]
    pub players: Vec<MatchPlayer>,
    #[serde(default)]
    pub teams: Vec<MatchTeam>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchMetadata {
    pub match_id: Option<String>,
    pub map: Option<NamedRef>,
    pub queue: Option<QueueRef>,
    pub started_at: Option<String>,
    pub game_length_in_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NamedRef {
    pub id: Option<String>,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueRef {
    pub id: Option<String>,
    pub name: Option<String>,
    pub mode_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchPlayer {
    pub puuid: Option<String>,
    pub name: Option<String>,
    pub tag: Option<String>,
    pub team_id: Option<String>,
    pub agent: Option<NamedRef>,
    pub stats: Option<PlayerStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerStats {
    pub score: Option<i64>,
    pub kills: Option<i64>,
    pub deaths: Option<i64>,
    pub assists: Option<i64>,
    pub headshots: Option<i64>,
    pub bodyshots: Option<i64>,
    pub legshots: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchTeam {
    pub team_id: Option<String>,
    pub won: Option<bool>,
    pub rounds: Option<TeamRounds>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamRounds {
    pub won: Option<i64>,
    pub lost: Option<i64>,
}

// ---- /valorant/v2/mmr-history/{region}/{platform}/{name}/{tag} ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MmrHistoryData {
    pub account: MmrHistoryAccount,
    #[serde(default)]
    pub history: Vec<MmrHistoryEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MmrHistoryAccount {
    pub name: Option<String>,
    pub tag: Option<String>,
    pub puuid: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MmrHistoryEntry {
    pub date: Option<String>,
    pub elo: Option<i64>,
    pub last_change: Option<i64>,
    pub rr: Option<i64>,
    pub match_id: Option<String>,
    pub refunded_rr: Option<i64>,
    pub was_derank_protected: Option<bool>,
    pub map: Option<NamedRef>,
    pub season: Option<SeasonRef>,
    pub tier: Option<TierRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeasonRef {
    pub id: Option<String>,
    pub short: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TierRef {
    pub id: Option<i64>,
    pub name: Option<String>,
}

// ---- /valorant/v2/match/{match_id} ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchDetailData {
    pub metadata: MatchDetailMetadata,
    pub players: MatchDetailPlayers,
    pub teams: MatchDetailTeams,
    #[serde(default)]
    pub rounds: Vec<MatchDetailRound>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchDetailMetadata {
    pub matchid: Option<String>,
    pub map: Option<String>,
    pub mode: Option<String>,
    pub queue: Option<String>,
    pub season_id: Option<String>,
    pub game_length: Option<i64>,
    pub game_start: Option<i64>,
    pub game_start_patched: Option<String>,
    pub rounds_played: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchDetailPlayers {
    #[serde(default)]
    pub all_players: Vec<MatchDetailPlayer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchDetailPlayer {
    pub puuid: String,
    pub name: String,
    pub tag: String,
    pub team: String,
    pub level: Option<i64>,
    pub character: Option<String>,
    pub currenttier: Option<i64>,
    pub currenttier_patched: Option<String>,
    pub party_id: Option<String>,
    pub assets: Option<MatchDetailPlayerAssets>,
    pub stats: Option<MatchDetailPlayerStats>,
    pub economy: Option<MatchDetailPlayerEconomy>,
    pub damage_made: Option<i64>,
    pub damage_received: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchDetailPlayerAssets {
    pub agent: Option<MatchDetailAgentAssets>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchDetailAgentAssets {
    pub small: Option<String>,
    pub bust: Option<String>,
    pub full: Option<String>,
    pub killfeed: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchDetailPlayerStats {
    pub score: Option<i64>,
    pub kills: Option<i64>,
    pub deaths: Option<i64>,
    pub assists: Option<i64>,
    pub bodyshots: Option<i64>,
    pub headshots: Option<i64>,
    pub legshots: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchDetailPlayerEconomy {
    pub spent: Option<MatchDetailEconomyValue>,
    pub loadout_value: Option<MatchDetailEconomyValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchDetailEconomyValue {
    pub overall: Option<i64>,
    pub average: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchDetailTeams {
    pub red: Option<MatchDetailTeam>,
    pub blue: Option<MatchDetailTeam>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchDetailTeam {
    pub has_won: Option<bool>,
    pub rounds_won: Option<i64>,
    pub rounds_lost: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchDetailRound {
    pub winning_team: Option<String>,
    pub end_type: Option<String>,
    pub bomb_planted: Option<bool>,
    pub bomb_defused: Option<bool>,
    #[serde(default)]
    pub player_stats: Vec<MatchDetailRoundPlayerStat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchDetailRoundPlayerStat {
    pub player_puuid: Option<String>,
    pub player_display_name: Option<String>,
    pub player_team: Option<String>,
    pub damage: Option<i64>,
    pub bodyshots: Option<i64>,
    pub headshots: Option<i64>,
    pub legshots: Option<i64>,
    pub kills: Option<i64>,
    pub score: Option<i64>,
    pub was_afk: Option<bool>,
    pub economy: Option<MatchDetailRoundEconomy>,
    /// TODO Fonctionnalités#3/#33 : élimination par élimination (killer/victime/timing) sur
    /// ce round pour ce joueur — déjà renvoyé par Henrik (`kill_events`, voir api_henrik.json
    /// `MatchesV2DataRoundPlayerStatsKillEvents`) mais jamais mappé jusqu'ici. Base de
    /// `highlights.rs` (détection clutch/multikill), aucun appel réseau supplémentaire.
    #[serde(default)]
    pub kill_events: Vec<KillEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KillEvent {
    pub kill_time_in_round: Option<i64>,
    pub kill_time_in_match: Option<i64>,
    pub killer_puuid: Option<String>,
    pub killer_display_name: Option<String>,
    pub killer_team: Option<String>,
    pub victim_puuid: Option<String>,
    pub victim_display_name: Option<String>,
    pub victim_team: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchDetailRoundEconomy {
    pub loadout_value: Option<i64>,
    pub remaining: Option<i64>,
    pub spent: Option<i64>,
    pub weapon: Option<MatchDetailEconomyEquipment>,
    pub armor: Option<MatchDetailEconomyEquipment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchDetailEconomyEquipment {
    pub id: Option<String>,
    pub name: Option<String>,
}

// ---- /valorant/v3/leaderboard/{region}/{platform} ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaderboardData {
    pub updated_at: Option<String>,
    #[serde(default)]
    pub players: Vec<LeaderboardPlayer>,
    #[serde(default)]
    pub thresholds: Vec<LeaderboardThreshold>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaderboardPlayer {
    pub puuid: Option<String>,
    pub name: String,
    pub tag: String,
    pub card: Option<String>,
    pub title: Option<String>,
    pub is_banned: Option<bool>,
    pub is_anonymized: Option<bool>,
    pub leaderboard_rank: Option<i64>,
    pub tier: Option<i64>,
    pub rr: Option<i64>,
    pub wins: Option<i64>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaderboardThreshold {
    pub start_index: Option<i64>,
    pub threshold: Option<i64>,
    pub tier: Option<TierRef>,
}

// ---- /valorant/v1/status/{region} ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusData {
    #[serde(default)]
    pub incidents: Vec<StatusIncident>,
    #[serde(default)]
    pub maintenances: Vec<StatusIncident>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusIncident {
    pub id: Option<i64>,
    pub incident_severity: Option<String>,
    pub maintenance_status: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    #[serde(default)]
    pub platforms: Vec<String>,
    #[serde(default)]
    pub titles: Vec<StatusIncidentContent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusIncidentContent {
    pub locale: Option<String>,
    pub content: Option<String>,
}

// ---- /valorant/v1/queue-status/{region} ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueStatusEntry {
    pub mode: Option<String>,
    pub mode_id: Option<String>,
    pub enabled: Option<bool>,
    pub team_size: Option<i64>,
    pub ranked: Option<bool>,
    pub tournament: Option<bool>,
    pub required_account_level: Option<i64>,
    #[serde(default)]
    pub platforms: Vec<String>,
}

// ---- /valorant/v1/esports/schedule ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EsportsScheduleEntry {
    pub date: Option<String>,
    pub state: Option<String>,
    #[serde(rename = "type")]
    pub kind: Option<String>,
    pub vod: Option<String>,
    pub league: Option<EsportsLeague>,
    pub tournament: Option<EsportsTournament>,
    #[serde(rename = "match")]
    pub match_: Option<EsportsMatch>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EsportsLeague {
    pub name: Option<String>,
    pub identifier: Option<String>,
    pub icon: Option<String>,
    pub region: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EsportsTournament {
    pub name: Option<String>,
    pub season: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EsportsMatch {
    pub id: Option<String>,
    #[serde(default)]
    pub teams: Vec<EsportsMatchTeam>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EsportsMatchTeam {
    pub name: Option<String>,
    pub code: Option<String>,
    pub icon: Option<String>,
    pub has_won: Option<bool>,
    pub game_wins: Option<i64>,
    pub record: Option<EsportsMatchTeamRecord>,
}

// ---- /valorant/v1/stored-matches/{affinity}/{name}/{tag} (fallback circuit-breaker) ----
//
// Shape très différente de `MatchEntry` (v4) : une seule ligne de stats, celle du joueur
// demandé, pas le roster complet des 10 joueurs — la v1 "stored" n'expose que ce que Henrik
// a persisté côté serveur pour CE joueur. Suffisant pour un repli en liste (endpoints.rs
// les traduit vers un `MatchEntry` à un seul joueur), pas pour un détail de match complet.

#[derive(Debug, Clone, Deserialize)]
pub struct StoredMatch {
    pub meta: StoredMatchMeta,
    pub stats: StoredMatchStats,
    pub teams: StoredMatchTeamScore,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StoredMatchMeta {
    pub id: String,
    pub map: NamedRef,
    #[allow(dead_code)]
    pub mode: String,
    pub started_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StoredMatchStats {
    pub puuid: String,
    pub team: String,
    pub character: NamedRef,
    pub score: i64,
    pub kills: i64,
    pub deaths: i64,
    pub assists: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StoredMatchTeamScore {
    pub red: i64,
    pub blue: i64,
}

// ---- /valorant/v1/stored-mmr-history/{affinity}/{name}/{tag} (fallback circuit-breaker) ----

#[derive(Debug, Clone, Deserialize)]
pub struct StoredMmrEntry {
    pub match_id: String,
    pub tier: TierRef,
    pub map: NamedRef,
    pub ranking_in_tier: i64,
    pub last_mmr_change: i64,
    pub elo: i64,
    pub date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EsportsMatchTeamRecord {
    pub wins: Option<i64>,
    pub losses: Option<i64>,
}
