//! TODO Fonctionnalités#14 : recommandation de carte/agent basée sur l'historique perso —
//! où le joueur performe le mieux (winrate), agrégé sur tous les détails de match déjà en
//! cache SQLite pour ce puuid (aucun appel réseau, même principe que `queue_stats.rs`/
//! `map_averages.rs`). Ne couvre donc que les matchs déjà ouverts en détail par
//! l'utilisateur, pas l'historique Henrik complet.

use std::collections::HashMap;

use serde::Serialize;

use crate::api::henrik::types::MatchDetailData;

#[derive(Debug, Clone, Serialize)]
pub struct MapRecommendation {
    pub map: String,
    pub matches_played: i64,
    pub matches_won: i64,
    pub win_percent: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct AgentRecommendation {
    pub agent: String,
    pub matches_played: i64,
    pub matches_won: i64,
    pub win_percent: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct RecommendationStats {
    /// Triées par winrate décroissant, puis par nombre de matchs (départage).
    pub best_maps: Vec<MapRecommendation>,
    pub best_agents: Vec<AgentRecommendation>,
}

fn team_won(detail: &MatchDetailData, team: &str) -> Option<bool> {
    let team_data = if team.eq_ignore_ascii_case("red") {
        detail.teams.red.as_ref()
    } else if team.eq_ignore_ascii_case("blue") {
        detail.teams.blue.as_ref()
    } else {
        None
    };
    team_data.and_then(|t| t.has_won)
}

/// `min_matches` filtre le bruit (une carte/agent joué une seule fois ne dit rien d'un
/// vrai point fort) — recommandé : 3.
pub fn compute_recommendations(
    matches: &[MatchDetailData],
    puuid: &str,
    min_matches: i64,
) -> RecommendationStats {
    let mut by_map: HashMap<String, (i64, i64)> = HashMap::new();
    let mut by_agent: HashMap<String, (i64, i64)> = HashMap::new();

    for detail in matches {
        let Some(me) = detail.players.all_players.iter().find(|p| p.puuid == puuid) else {
            continue;
        };
        let Some(won) = team_won(detail, &me.team) else {
            continue;
        };

        if let Some(map) = &detail.metadata.map {
            let entry = by_map.entry(map.clone()).or_insert((0, 0));
            entry.0 += 1;
            if won {
                entry.1 += 1;
            }
        }
        if let Some(agent) = &me.character {
            let entry = by_agent.entry(agent.clone()).or_insert((0, 0));
            entry.0 += 1;
            if won {
                entry.1 += 1;
            }
        }
    }

    let mut best_maps: Vec<MapRecommendation> = by_map
        .into_iter()
        .filter(|(_, (played, _))| *played >= min_matches)
        .map(|(map, (played, won))| MapRecommendation {
            map,
            matches_played: played,
            matches_won: won,
            win_percent: won as f64 / played as f64 * 100.0,
        })
        .collect();
    best_maps.sort_by(|a, b| {
        b.win_percent
            .partial_cmp(&a.win_percent)
            .unwrap()
            .then(b.matches_played.cmp(&a.matches_played))
    });

    let mut best_agents: Vec<AgentRecommendation> = by_agent
        .into_iter()
        .filter(|(_, (played, _))| *played >= min_matches)
        .map(|(agent, (played, won))| AgentRecommendation {
            agent,
            matches_played: played,
            matches_won: won,
            win_percent: won as f64 / played as f64 * 100.0,
        })
        .collect();
    best_agents.sort_by(|a, b| {
        b.win_percent
            .partial_cmp(&a.win_percent)
            .unwrap()
            .then(b.matches_played.cmp(&a.matches_played))
    });

    RecommendationStats { best_maps, best_agents }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::henrik::types::{
        MatchDetailMetadata, MatchDetailPlayer, MatchDetailPlayers, MatchDetailTeam, MatchDetailTeams,
    };

    fn make_player(puuid: &str, team: &str, agent: &str) -> MatchDetailPlayer {
        MatchDetailPlayer {
            puuid: puuid.to_string(),
            name: "p".to_string(),
            tag: "1234".to_string(),
            team: team.to_string(),
            level: None,
            character: Some(agent.to_string()),
            currenttier: None,
            currenttier_patched: None,
            party_id: None,
            assets: None,
            stats: None,
            economy: None,
            damage_made: None,
            damage_received: None,
        }
    }

    fn make_match(map: &str, player: MatchDetailPlayer, red_won: bool) -> MatchDetailData {
        MatchDetailData {
            metadata: MatchDetailMetadata {
                matchid: None,
                map: Some(map.to_string()),
                mode: None,
                queue: None,
                season_id: None,
                game_length: None,
                game_start: None,
                game_start_patched: None,
                rounds_played: None,
            },
            players: MatchDetailPlayers { all_players: vec![player] },
            teams: MatchDetailTeams {
                red: Some(MatchDetailTeam { has_won: Some(red_won), rounds_won: None, rounds_lost: None }),
                blue: Some(MatchDetailTeam { has_won: Some(!red_won), rounds_won: None, rounds_lost: None }),
            },
            rounds: vec![],
        }
    }

    #[test]
    fn recommends_the_map_and_agent_with_the_best_winrate() {
        let matches = vec![
            make_match("Bind", make_player("me", "Red", "Jett"), true),
            make_match("Bind", make_player("me", "Red", "Jett"), true),
            make_match("Bind", make_player("me", "Red", "Jett"), false),
            make_match("Ascent", make_player("me", "Red", "Sova"), false),
            make_match("Ascent", make_player("me", "Red", "Sova"), false),
            make_match("Ascent", make_player("me", "Red", "Sova"), false),
        ];

        let stats = compute_recommendations(&matches, "me", 3);
        assert_eq!(stats.best_maps.len(), 2);
        assert_eq!(stats.best_maps[0].map, "Bind");
        assert!((stats.best_maps[0].win_percent - 66.66).abs() < 0.1);
        assert_eq!(stats.best_maps[1].map, "Ascent");

        assert_eq!(stats.best_agents.len(), 2);
        assert_eq!(stats.best_agents[0].agent, "Jett");
    }

    #[test]
    fn filters_out_maps_and_agents_below_min_matches() {
        let matches = vec![
            make_match("Bind", make_player("me", "Red", "Jett"), true),
            make_match("Bind", make_player("me", "Red", "Jett"), true),
        ];

        let stats = compute_recommendations(&matches, "me", 3);
        assert!(stats.best_maps.is_empty());
        assert!(stats.best_agents.is_empty());

        let stats = compute_recommendations(&matches, "me", 2);
        assert_eq!(stats.best_maps.len(), 1);
        assert_eq!(stats.best_agents.len(), 1);
    }
}
