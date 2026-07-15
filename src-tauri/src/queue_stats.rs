//! TODO stats & analyse joueur : distinction claire solo-queue / party (duo/squad) en tête de
//! profil ("winrate solo vs winrate en party"). `party_matches` (voir `db::party`) ne
//! mémorise que les co-occurrences de `party_id` détectées — il ne contient aucune ligne pour
//! un match joué entièrement solo, donc impossible d'en dériver un winrate solo. Ce module
//! recalcule directement depuis les détails de match déjà en cache SQLite (même principe que
//! `side_stats.rs`) : un match est "party" si au moins un coéquipier partage le `party_id` du
//! joueur suivi, "solo" sinon — même convention que `commands::party_stats::record_party_from_match`.

use serde::Serialize;

use crate::api::henrik::types::MatchDetailData;

#[derive(Debug, Clone, Copy, Default, Serialize)]
pub struct QueueTally {
    pub matches_played: i64,
    pub matches_won: i64,
}

#[derive(Debug, Clone, Copy, Default, Serialize)]
pub struct QueueStat {
    pub solo: QueueTally,
    pub party: QueueTally,
}

pub fn compute_queue_stats(matches: &[MatchDetailData], puuid: &str) -> QueueStat {
    let mut stat = QueueStat::default();

    for detail in matches {
        let Some(me) = detail.players.all_players.iter().find(|p| p.puuid == puuid) else {
            continue;
        };
        let is_party = me.party_id.is_some()
            && detail.players.all_players.iter().any(|p| {
                p.puuid != puuid && p.team == me.team && me.party_id.is_some() && p.party_id == me.party_id
            });

        let team_data = if me.team.eq_ignore_ascii_case("red") {
            detail.teams.red.as_ref()
        } else if me.team.eq_ignore_ascii_case("blue") {
            detail.teams.blue.as_ref()
        } else {
            None
        };
        let Some(won) = team_data.and_then(|t| t.has_won) else {
            continue;
        };

        let tally = if is_party { &mut stat.party } else { &mut stat.solo };
        tally.matches_played += 1;
        if won {
            tally.matches_won += 1;
        }
    }

    stat
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::henrik::types::{
        MatchDetailMetadata, MatchDetailPlayer, MatchDetailPlayers, MatchDetailTeam, MatchDetailTeams,
    };

    fn make_player(puuid: &str, team: &str, party_id: Option<&str>) -> MatchDetailPlayer {
        MatchDetailPlayer {
            puuid: puuid.to_string(),
            name: "p".to_string(),
            tag: "1234".to_string(),
            team: team.to_string(),
            level: None,
            character: None,
            currenttier: None,
            currenttier_patched: None,
            party_id: party_id.map(str::to_string),
            assets: None,
            stats: None,
            economy: None,
            damage_made: None,
            damage_received: None,
        }
    }

    fn make_match(players: Vec<MatchDetailPlayer>, red_won: bool) -> MatchDetailData {
        MatchDetailData {
            metadata: MatchDetailMetadata {
                matchid: None,
                map: None,
                mode: None,
                queue: None,
                season_id: None,
                game_length: None,
                game_start: None,
                game_start_patched: None,
                rounds_played: None,
            },
            players: MatchDetailPlayers { all_players: players },
            teams: MatchDetailTeams {
                red: Some(MatchDetailTeam { has_won: Some(red_won), rounds_won: None, rounds_lost: None }),
                blue: Some(MatchDetailTeam { has_won: Some(!red_won), rounds_won: None, rounds_lost: None }),
            },
            rounds: vec![],
        }
    }

    #[test]
    fn classifies_as_party_when_a_teammate_shares_the_party_id() {
        let matches = vec![make_match(
            vec![
                make_player("me", "Red", Some("p1")),
                make_player("mate", "Red", Some("p1")),
                make_player("enemy", "Blue", Some("p2")),
            ],
            true,
        )];
        let stat = compute_queue_stats(&matches, "me");
        assert_eq!(stat.party.matches_played, 1);
        assert_eq!(stat.party.matches_won, 1);
        assert_eq!(stat.solo.matches_played, 0);
    }

    #[test]
    fn classifies_as_solo_when_no_teammate_shares_the_party_id() {
        let matches = vec![make_match(
            vec![make_player("me", "Red", Some("p1")), make_player("mate", "Red", Some("p2"))],
            false,
        )];
        let stat = compute_queue_stats(&matches, "me");
        assert_eq!(stat.solo.matches_played, 1);
        assert_eq!(stat.solo.matches_won, 0);
        assert_eq!(stat.party.matches_played, 0);
    }

    #[test]
    fn treats_missing_party_id_as_solo() {
        let matches = vec![make_match(
            vec![make_player("me", "Red", None), make_player("mate", "Red", None)],
            true,
        )];
        let stat = compute_queue_stats(&matches, "me");
        assert_eq!(stat.solo.matches_played, 1);
    }

    #[test]
    fn skips_matches_where_the_tracked_player_is_absent() {
        let matches = vec![make_match(vec![make_player("other", "Red", None)], true)];
        let stat = compute_queue_stats(&matches, "me");
        assert_eq!(stat.solo.matches_played + stat.party.matches_played, 0);
    }
}
