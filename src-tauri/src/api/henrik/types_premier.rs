//! Structs serde pour l'API Premier (`/valorant/v1/premier/*`) : recherche/detail
//! d'équipe, classement régional, historique de matchs de ligue/tournoi.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PremierTeamCustomization {
    pub icon: Option<String>,
    pub image: Option<String>,
    pub primary: Option<String>,
    pub secondary: Option<String>,
    pub tertiary: Option<String>,
}

/// Élément de résultat de recherche / classement (`premier/search`, `premier/leaderboard`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PremierTeamLite {
    pub id: String,
    pub name: String,
    pub tag: String,
    pub conference: Option<String>,
    pub division: Option<i64>,
    pub affinity: Option<String>,
    pub region: Option<String>,
    pub losses: Option<i64>,
    pub wins: Option<i64>,
    pub score: Option<i64>,
    pub ranking: Option<i64>,
    pub customization: Option<PremierTeamCustomization>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PremierTeamMember {
    pub puuid: String,
    pub name: Option<String>,
    pub tag: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PremierTeamPlacement {
    pub points: Option<i64>,
    pub conference: Option<String>,
    pub division: Option<i64>,
    pub place: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PremierTeamStats {
    pub wins: Option<i64>,
    pub matches: Option<i64>,
    pub losses: Option<i64>,
    pub rounds_won: Option<i64>,
    pub rounds_lost: Option<i64>,
}

/// Détail complet d'une équipe Premier (`premier/{name}/{tag}` ou `premier/{id}`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PremierTeamDetail {
    pub id: String,
    pub name: String,
    pub tag: String,
    pub enrolled: Option<bool>,
    pub stats: Option<PremierTeamStats>,
    pub placement: Option<PremierTeamPlacement>,
    pub customization: Option<PremierTeamCustomization>,
    #[serde(default)]
    pub member: Vec<PremierTeamMember>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PremierLeagueMatch {
    pub id: String,
    pub points_before: Option<i64>,
    pub points_after: Option<i64>,
    pub started_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PremierTournamentMatch {
    pub tournament_id: String,
    pub placement: Option<i64>,
    pub placement_league_bonus: Option<i64>,
    pub points_before: Option<i64>,
    pub points_after: Option<i64>,
    #[serde(default)]
    pub matches: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PremierTeamHistory {
    #[serde(default)]
    pub league_matches: Vec<PremierLeagueMatch>,
    #[serde(default)]
    pub tournament_matches: Vec<PremierTournamentMatch>,
}
