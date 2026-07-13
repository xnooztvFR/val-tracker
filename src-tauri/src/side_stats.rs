//! Backlog #52 : winrate Attaque vs Défense agrégé sur les détails de match déjà en cache
//! SQLite (`api_cache`, clé `/valorant/v2/match/{id}`) — best-effort, ne couvre que les
//! matchs dont l'utilisateur a déjà ouvert le détail (`fetch_match_detail`), aucun appel
//! réseau supplémentaire ici.
//!
//! Henrik n'expose pas de champ "side" par round (`MatchDetailRound::player_team` est fixe
//! pour tout le match — c'est l'équipe Red/Blue, pas ATK/DEF). Le side est donc dérivé par
//! convention Valorant : l'équipe Red démarre en attaque, un swap a lieu à la moitié des
//! rounds réguliers (premier à 13 = 24 rounds réguliers max, swap après le 12e). Les rounds
//! au-delà de ce plafond (prolongation) sont ignorés plutôt que de deviner une convention
//! d'alternance ambiguë en overtime — mieux vaut un split partiel correct qu'un split
//! complet approximatif.

use serde::Serialize;

use crate::api::henrik::types::MatchDetailData;

const MAX_REGULAR_ROUNDS: usize = 24;

#[derive(Debug, Clone, Copy, Default, Serialize)]
pub struct SideTally {
    pub rounds_played: i64,
    pub rounds_won: i64,
}

#[derive(Debug, Clone, Copy, Default, Serialize)]
pub struct SideWinrateStat {
    pub attack: SideTally,
    pub defense: SideTally,
    /// Nombre de matchs en cache pris en compte (informatif, pour un message du style
    /// "basé sur les N derniers matchs consultés").
    pub matches_considered: i64,
}

/// `true` si l'équipe Red est en attaque à cet index de round (0-based), `None` si le round
/// est au-delà du plafond de rounds réguliers (prolongation, ignorée).
fn red_is_attack(round_index: usize, regular_rounds: usize) -> Option<bool> {
    if round_index >= regular_rounds {
        return None;
    }
    let half = regular_rounds.div_ceil(2);
    Some(round_index < half)
}

/// Agrège le winrate ATK/DEF d'un joueur sur un lot de détails de match déjà en cache.
pub fn compute_side_winrate(matches: &[MatchDetailData], puuid: &str) -> SideWinrateStat {
    let mut stat = SideWinrateStat::default();

    for detail in matches {
        let Some(me) = detail.players.all_players.iter().find(|p| p.puuid == puuid) else {
            continue;
        };
        let regular_rounds = (detail.metadata.rounds_played.unwrap_or(detail.rounds.len() as i64) as usize)
            .min(detail.rounds.len())
            .min(MAX_REGULAR_ROUNDS);
        if regular_rounds == 0 {
            continue;
        }

        let mut counted = false;
        for (i, round) in detail.rounds.iter().enumerate() {
            let Some(red_atk) = red_is_attack(i, regular_rounds) else {
                continue;
            };
            let my_side_is_attack = if me.team.eq_ignore_ascii_case("red") {
                red_atk
            } else {
                !red_atk
            };
            let Some(winning_team) = &round.winning_team else {
                continue;
            };
            let i_won = winning_team.eq_ignore_ascii_case(&me.team);

            let tally = if my_side_is_attack {
                &mut stat.attack
            } else {
                &mut stat.defense
            };
            tally.rounds_played += 1;
            if i_won {
                tally.rounds_won += 1;
            }
            counted = true;
        }
        if counted {
            stat.matches_considered += 1;
        }
    }

    stat
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::henrik::types::{MatchDetailMetadata, MatchDetailPlayer, MatchDetailPlayers, MatchDetailRound, MatchDetailTeams};

    fn make_player(puuid: &str, team: &str) -> MatchDetailPlayer {
        MatchDetailPlayer {
            puuid: puuid.to_string(),
            name: "p".to_string(),
            tag: "1234".to_string(),
            team: team.to_string(),
            level: None,
            character: None,
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

    fn make_round(winning_team: &str) -> MatchDetailRound {
        MatchDetailRound {
            winning_team: Some(winning_team.to_string()),
            end_type: None,
            bomb_planted: None,
            bomb_defused: None,
            player_stats: vec![],
        }
    }

    fn make_match(team: &str, rounds: Vec<MatchDetailRound>) -> MatchDetailData {
        let rounds_played = rounds.len() as i64;
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
                rounds_played: Some(rounds_played),
            },
            players: MatchDetailPlayers {
                all_players: vec![make_player("me", team), make_player("other", if team == "Red" { "Blue" } else { "Red" })],
            },
            teams: MatchDetailTeams { red: None, blue: None },
            rounds,
        }
    }

    #[test]
    fn splits_rounds_by_attack_defense_with_the_half_swap_convention() {
        // 4 rounds réguliers : Red attaque les 2 premiers, défend les 2 derniers.
        let rounds = vec![
            make_round("Red"),  // round 0, Red ATK, Red gagne -> ATK won
            make_round("Blue"), // round 1, Red ATK, Blue gagne -> ATK lost
            make_round("Red"),  // round 2, Red DEF, Red gagne -> DEF won
            make_round("Blue"), // round 3, Red DEF, Blue gagne -> DEF lost
        ];
        let matches = vec![make_match("Red", rounds)];

        let stat = compute_side_winrate(&matches, "me");
        assert_eq!(stat.attack.rounds_played, 2);
        assert_eq!(stat.attack.rounds_won, 1);
        assert_eq!(stat.defense.rounds_played, 2);
        assert_eq!(stat.defense.rounds_won, 1);
        assert_eq!(stat.matches_considered, 1);
    }

    #[test]
    fn ignores_rounds_beyond_the_regular_round_cap() {
        let mut rounds = vec![make_round("Red"); 24];
        rounds.push(make_round("Blue")); // rounds réguliers max = 24 -> round 24 (OT) ignoré
        let mut m = make_match("Red", rounds);
        m.metadata.rounds_played = Some(25);
        let matches = vec![m];

        let stat = compute_side_winrate(&matches, "me");
        assert_eq!(stat.attack.rounds_played + stat.defense.rounds_played, 24);
    }

    #[test]
    fn skips_matches_where_the_tracked_player_is_absent() {
        let matches = vec![make_match("Red", vec![make_round("Red")])];
        let stat = compute_side_winrate(&matches, "someone-else");
        assert_eq!(stat.matches_considered, 0);
        assert_eq!(stat.attack.rounds_played, 0);
    }
}
