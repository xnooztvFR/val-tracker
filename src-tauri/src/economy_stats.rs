//! TODO stats & analyse joueur : winrate par type d'achat (eco/half-buy/full-buy) agrégé sur
//! les détails de match déjà en cache SQLite (`api_cache`) — même principe que
//! `side_stats.rs`, best-effort, aucun appel réseau supplémentaire.
//!
//! Henrik n'expose pas de flag "type d'achat" explicite par round, seulement
//! `MatchDetailRoundEconomy::loadout_value` (valeur totale de l'équipement du joueur en
//! début de round). La classification en eco/half-buy/full-buy ci-dessous suit les seuils
//! usuels des trackers Valorant sur la valeur de loadout *individuelle* (pas celle de
//! l'équipe, que Henrik n'expose pas non plus par round) : < 2000 = eco, 2000-3400 =
//! half-buy, > 3400 = full-buy. Ce sont des seuils approximatifs (pas une règle officielle
//! Riot) — à ajuster si l'expérience utilisateur montre qu'ils classent mal des cas
//! fréquents.

use serde::Serialize;

use crate::api::henrik::types::MatchDetailData;

const ECO_MAX: i64 = 2000;
const HALF_BUY_MAX: i64 = 3400;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BuyType {
    Eco,
    HalfBuy,
    FullBuy,
}

fn classify(loadout_value: i64) -> BuyType {
    if loadout_value < ECO_MAX {
        BuyType::Eco
    } else if loadout_value <= HALF_BUY_MAX {
        BuyType::HalfBuy
    } else {
        BuyType::FullBuy
    }
}

#[derive(Debug, Clone, Copy, Default, Serialize)]
pub struct BuyTypeTally {
    pub rounds_played: i64,
    pub rounds_won: i64,
}

#[derive(Debug, Clone, Copy, Default, Serialize)]
pub struct EconomyStat {
    pub eco: BuyTypeTally,
    pub half_buy: BuyTypeTally,
    pub full_buy: BuyTypeTally,
    /// Nombre de matchs en cache pris en compte (informatif).
    pub matches_considered: i64,
}

/// Agrège le winrate par type d'achat d'un joueur sur un lot de détails de match déjà en
/// cache. Un round est ignoré si le joueur n'a pas de `player_stats`/`economy.loadout_value`
/// pour ce round-là (`was_afk`, données manquantes...) plutôt que de deviner.
pub fn compute_economy_stats(matches: &[MatchDetailData], puuid: &str) -> EconomyStat {
    let mut stat = EconomyStat::default();

    for detail in matches {
        if !detail.players.all_players.iter().any(|p| p.puuid == puuid) {
            continue;
        }

        let mut counted = false;
        for round in &detail.rounds {
            let Some(my_round_stat) = round
                .player_stats
                .iter()
                .find(|ps| ps.player_puuid.as_deref() == Some(puuid))
            else {
                continue;
            };
            let Some(loadout_value) = my_round_stat.economy.as_ref().and_then(|e| e.loadout_value) else {
                continue;
            };
            let Some(winning_team) = &round.winning_team else {
                continue;
            };
            let Some(my_team) = &my_round_stat.player_team else {
                continue;
            };
            let i_won = winning_team.eq_ignore_ascii_case(my_team);

            let tally = match classify(loadout_value) {
                BuyType::Eco => &mut stat.eco,
                BuyType::HalfBuy => &mut stat.half_buy,
                BuyType::FullBuy => &mut stat.full_buy,
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
    use crate::api::henrik::types::{
        MatchDetailEconomyEquipment, MatchDetailMetadata, MatchDetailPlayer, MatchDetailPlayers, MatchDetailRound,
        MatchDetailRoundEconomy, MatchDetailRoundPlayerStat, MatchDetailTeams,
    };

    fn make_player(puuid: &str) -> MatchDetailPlayer {
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
            stats: None,
            economy: None,
            damage_made: None,
            damage_received: None,
        }
    }

    fn make_round_stat(puuid: &str, team: &str, loadout_value: i64) -> MatchDetailRoundPlayerStat {
        MatchDetailRoundPlayerStat {
            player_puuid: Some(puuid.to_string()),
            player_display_name: None,
            player_team: Some(team.to_string()),
            damage: None,
            bodyshots: None,
            headshots: None,
            legshots: None,
            kills: None,
            score: None,
            was_afk: None,
            economy: Some(MatchDetailRoundEconomy {
                loadout_value: Some(loadout_value),
                remaining: None,
                spent: None,
                weapon: None::<MatchDetailEconomyEquipment>,
                armor: None,
            }),
        }
    }

    fn make_round(winning_team: &str, player_stats: Vec<MatchDetailRoundPlayerStat>) -> MatchDetailRound {
        MatchDetailRound {
            winning_team: Some(winning_team.to_string()),
            end_type: None,
            bomb_planted: None,
            bomb_defused: None,
            player_stats,
        }
    }

    fn make_match(rounds: Vec<MatchDetailRound>) -> MatchDetailData {
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
            players: MatchDetailPlayers { all_players: vec![make_player("me")] },
            teams: MatchDetailTeams { red: None, blue: None },
            rounds,
        }
    }

    #[test]
    fn classifies_rounds_into_eco_half_full_buy() {
        let rounds = vec![
            make_round("Red", vec![make_round_stat("me", "Red", 1500)]), // eco, won
            make_round("Blue", vec![make_round_stat("me", "Red", 2500)]), // half-buy, lost
            make_round("Red", vec![make_round_stat("me", "Red", 4500)]), // full-buy, won
        ];
        let matches = vec![make_match(rounds)];

        let stat = compute_economy_stats(&matches, "me");
        assert_eq!(stat.eco.rounds_played, 1);
        assert_eq!(stat.eco.rounds_won, 1);
        assert_eq!(stat.half_buy.rounds_played, 1);
        assert_eq!(stat.half_buy.rounds_won, 0);
        assert_eq!(stat.full_buy.rounds_played, 1);
        assert_eq!(stat.full_buy.rounds_won, 1);
        assert_eq!(stat.matches_considered, 1);
    }

    #[test]
    fn ignores_rounds_missing_loadout_value() {
        let mut round_stat = make_round_stat("me", "Red", 0);
        round_stat.economy = None;
        let matches = vec![make_match(vec![make_round("Red", vec![round_stat])])];

        let stat = compute_economy_stats(&matches, "me");
        assert_eq!(stat.eco.rounds_played + stat.half_buy.rounds_played + stat.full_buy.rounds_played, 0);
        assert_eq!(stat.matches_considered, 0);
    }

    #[test]
    fn skips_matches_where_the_tracked_player_is_absent() {
        let matches = vec![make_match(vec![make_round("Red", vec![make_round_stat("other", "Red", 1000)])])];
        let stat = compute_economy_stats(&matches, "me");
        assert_eq!(stat.matches_considered, 0);
    }

    #[test]
    fn boundary_thresholds_are_inclusive_on_half_buy() {
        assert_eq!(classify(1999), BuyType::Eco);
        assert_eq!(classify(2000), BuyType::HalfBuy);
        assert_eq!(classify(3400), BuyType::HalfBuy);
        assert_eq!(classify(3401), BuyType::FullBuy);
    }
}
