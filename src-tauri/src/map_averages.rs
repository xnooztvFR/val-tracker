//! TODO stats & analyse joueur : comparaison à la moyenne perso sur une carte donnée
//! ("28 dmg/round de plus que ta moyenne sur Bind"), affichée sur `MatchDetail.tsx`. Même
//! principe que `side_stats.rs`/`economy_stats.rs` : agrégé sur les détails de match déjà en
//! cache SQLite, aucun appel réseau supplémentaire — ne couvre donc que les matchs déjà
//! ouverts en détail par l'utilisateur sur cette carte.

use serde::Serialize;

use crate::api::henrik::types::MatchDetailData;

#[derive(Debug, Clone, Serialize)]
pub struct MapAverageStat {
    pub matches_considered: i64,
    pub avg_adr: f64,
    pub avg_kd: f64,
    pub avg_score: f64,
}

/// `None` si aucun match en cache pour ce joueur sur cette carte (ADR moyen non calculable).
pub fn compute_map_average(matches: &[MatchDetailData], puuid: &str, map: &str) -> Option<MapAverageStat> {
    let mut adr_sum = 0.0;
    let mut kills_sum: i64 = 0;
    let mut deaths_sum: i64 = 0;
    let mut score_sum: i64 = 0;
    let mut n: i64 = 0;

    for detail in matches {
        let Some(detail_map) = &detail.metadata.map else { continue };
        if !detail_map.eq_ignore_ascii_case(map) {
            continue;
        }
        let Some(me) = detail.players.all_players.iter().find(|p| p.puuid == puuid) else {
            continue;
        };
        let rounds = detail.metadata.rounds_played.unwrap_or(detail.rounds.len() as i64);
        if rounds <= 0 {
            continue;
        }

        let damage = me.damage_made.unwrap_or(0) as f64;
        adr_sum += damage / rounds as f64;
        kills_sum += me.stats.as_ref().and_then(|s| s.kills).unwrap_or(0);
        deaths_sum += me.stats.as_ref().and_then(|s| s.deaths).unwrap_or(0);
        score_sum += me.stats.as_ref().and_then(|s| s.score).unwrap_or(0);
        n += 1;
    }

    if n == 0 {
        return None;
    }

    Some(MapAverageStat {
        matches_considered: n,
        avg_adr: adr_sum / n as f64,
        avg_kd: if deaths_sum > 0 { kills_sum as f64 / deaths_sum as f64 } else { kills_sum as f64 },
        avg_score: score_sum as f64 / n as f64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::henrik::types::{
        MatchDetailMetadata, MatchDetailPlayer, MatchDetailPlayerStats, MatchDetailPlayers, MatchDetailTeams,
    };

    fn make_player(puuid: &str, damage_made: i64, kills: i64, deaths: i64, score: i64) -> MatchDetailPlayer {
        MatchDetailPlayer {
            puuid: puuid.to_string(),
            name: "p".to_string(),
            tag: "1234".to_string(),
            team: "Red".to_string(),
            level: None,
            character: None,
            currenttier: None,
            currenttier_patched: None,
            party_id: None,
            assets: None,
            stats: Some(MatchDetailPlayerStats {
                score: Some(score),
                kills: Some(kills),
                deaths: Some(deaths),
                assists: None,
                bodyshots: None,
                headshots: None,
                legshots: None,
            }),
            economy: None,
            damage_made: Some(damage_made),
            damage_received: None,
        }
    }

    fn make_match(map: &str, rounds_played: i64, player: MatchDetailPlayer) -> MatchDetailData {
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
                rounds_played: Some(rounds_played),
            },
            players: MatchDetailPlayers { all_players: vec![player] },
            teams: MatchDetailTeams { red: None, blue: None },
            rounds: vec![],
        }
    }

    #[test]
    fn averages_adr_kd_and_score_across_matches_on_the_same_map() {
        let matches = vec![
            make_match("Bind", 20, make_player("me", 2000, 20, 10, 400)), // 100 ADR, 2.0 K/D
            make_match("Bind", 25, make_player("me", 1500, 10, 10, 300)), // 60 ADR, 1.0 K/D
            make_match("Ascent", 24, make_player("me", 4800, 30, 10, 500)), // carte différente, ignorée
        ];

        let stat = compute_map_average(&matches, "me", "Bind").unwrap();
        assert_eq!(stat.matches_considered, 2);
        assert!((stat.avg_adr - 80.0).abs() < 0.01);
        assert!((stat.avg_kd - 1.5).abs() < 0.01);
        assert!((stat.avg_score - 350.0).abs() < 0.01);
    }

    #[test]
    fn returns_none_when_no_match_is_cached_for_that_map() {
        let matches = vec![make_match("Ascent", 24, make_player("me", 4800, 30, 10, 500))];
        assert!(compute_map_average(&matches, "me", "Bind").is_none());
    }

    #[test]
    fn ignores_matches_where_the_tracked_player_is_absent() {
        let matches = vec![make_match("Bind", 24, make_player("other", 4800, 30, 10, 500))];
        assert!(compute_map_average(&matches, "me", "Bind").is_none());
    }
}
