//! TODO Fonctionnalités#4/#33 : détection de "moments forts" (clutch 1vX, multikills) à partir
//! des `kill_events` déjà renvoyés par Henrik dans le détail de match (voir
//! `api/henrik/types.rs::KillEvent`), reconstruits par round — même pattern "pur, cache
//! seulement" que `side_stats.rs`/`tracker_score.rs`, aucun appel réseau ici.
//!
//! **Limite assumée** : les matchs mis en cache *avant* l'ajout de ce champ (`#[serde(default)]`
//! sur `kill_events`) n'auront simplement aucun highlight détecté tant qu'ils ne sont pas
//! re-fetchés (`force = true`) — comportement silencieux, pas une erreur.

use serde::Serialize;
use std::collections::HashSet;

use crate::api::henrik::types::MatchDetailData;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum HighlightKind {
    Clutch,
    Multikill,
}

#[derive(Debug, Clone, Serialize)]
pub struct MatchHighlight {
    pub match_id: String,
    pub round_number: usize,
    pub kind: HighlightKind,
    /// "1v2", "Ace", "4k"... — libellé prêt à afficher, déjà résolu côté Rust pour éviter de
    /// dupliquer la logique de formatage côté frontend.
    pub label: String,
    pub kill_time_in_round: Option<i64>,
}

/// Nombre de kills dans un même round à partir duquel on parle de "multikill" — 3k est le
/// palier le plus bas généralement mis en avant (3k/4k/Ace), en dessous ce n'est qu'un round
/// normal.
const MULTIKILL_THRESHOLD: i64 = 3;

fn multikill_label(kills: i64) -> Option<&'static str> {
    match kills {
        3 => Some("3k"),
        4 => Some("4k"),
        n if n >= 5 => Some("Ace"),
        _ => None,
    }
}

/// Détecte les clutchs/multikills de `puuid` sur un seul détail de match déjà en cache.
pub fn detect_match_highlights(detail: &MatchDetailData, puuid: &str) -> Vec<MatchHighlight> {
    let match_id = detail.metadata.matchid.clone().unwrap_or_default();
    let mut highlights = Vec::new();

    for (round_index, round) in detail.rounds.iter().enumerate() {
        // Multikill : total des kills de `puuid` sur ce round, via ses propres `kill_events`
        // (une entrée par joueur dans `player_stats`, chacune ne listant que ses propres kills).
        let my_stat = round.player_stats.iter().find(|p| p.player_puuid.as_deref() == Some(puuid));
        if let Some(my_stat) = my_stat {
            let kill_count = my_stat.kill_events.len() as i64;
            if kill_count >= MULTIKILL_THRESHOLD {
                if let Some(label) = multikill_label(kill_count) {
                    highlights.push(MatchHighlight {
                        match_id: match_id.clone(),
                        round_number: round_index + 1,
                        kind: HighlightKind::Multikill,
                        label: label.to_string(),
                        kill_time_in_round: my_stat.kill_events.last().and_then(|e| e.kill_time_in_round),
                    });
                }
            }
        }

        // Clutch : reconstruit l'ordre chronologique de toutes les éliminations du round pour
        // savoir, au moment où le dernier coéquipier de `puuid` meurt, combien d'adversaires
        // sont encore en vie — et si `puuid` a lui-même survécu jusqu'à la victoire du round.
        let Some(my_team) = round
            .player_stats
            .iter()
            .find(|p| p.player_puuid.as_deref() == Some(puuid))
            .and_then(|p| p.player_team.clone())
        else {
            continue;
        };

        let mut teammates_alive: HashSet<String> = round
            .player_stats
            .iter()
            .filter(|p| p.player_team.as_deref() == Some(my_team.as_str()) && p.player_puuid.as_deref() != Some(puuid))
            .filter_map(|p| p.player_puuid.clone())
            .collect();
        let mut enemies_alive: HashSet<String> = round
            .player_stats
            .iter()
            .filter(|p| p.player_team.as_deref() != Some(my_team.as_str()))
            .filter_map(|p| p.player_puuid.clone())
            .collect();

        if teammates_alive.is_empty() || enemies_alive.is_empty() {
            // Squad incomplet (round où un coéquipier n'a aucune ligne de stats) ou 1v1 déjà
            // couvert autrement — pas assez de monde pour parler de "clutch".
            continue;
        }

        let mut all_events: Vec<_> = round
            .player_stats
            .iter()
            .flat_map(|p| p.kill_events.iter())
            .collect();
        all_events.sort_by_key(|e| e.kill_time_in_round.unwrap_or(0));

        let mut i_survived = true;
        let mut clutch_enemy_count: Option<usize> = None;
        let mut clutch_time: Option<i64> = None;

        for event in &all_events {
            let Some(victim) = &event.victim_puuid else { continue };
            if victim == puuid {
                i_survived = false;
                break;
            }
            teammates_alive.remove(victim);
            enemies_alive.remove(victim);

            if clutch_enemy_count.is_none() && teammates_alive.is_empty() && !enemies_alive.is_empty() {
                clutch_enemy_count = Some(enemies_alive.len());
                clutch_time = event.kill_time_in_round;
            }
        }

        let round_won_by_me = round
            .winning_team
            .as_deref()
            .map(|w| w.eq_ignore_ascii_case(&my_team))
            .unwrap_or(false);

        if let (true, true, Some(enemy_count)) = (i_survived, round_won_by_me, clutch_enemy_count) {
            highlights.push(MatchHighlight {
                match_id: match_id.clone(),
                round_number: round_index + 1,
                kind: HighlightKind::Clutch,
                label: format!("1v{enemy_count}"),
                kill_time_in_round: clutch_time,
            });
        }
    }

    highlights
}

/// Agrège les highlights sur un lot de détails de match déjà en cache (voir
/// `api::henrik::endpoints::get_cached_match_details_for_puuid`), triés par match le plus
/// récent en premier — l'ordre d'entrée de `matches` est préservé (déjà trié côté appelant).
pub fn detect_highlights(matches: &[MatchDetailData], puuid: &str) -> Vec<MatchHighlight> {
    matches.iter().flat_map(|m| detect_match_highlights(m, puuid)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::henrik::types::{
        KillEvent, MatchDetailMetadata, MatchDetailPlayers, MatchDetailRound, MatchDetailRoundPlayerStat,
        MatchDetailTeams,
    };

    fn kill(killer: &str, victim: &str, killer_team: &str, victim_team: &str, t: i64) -> KillEvent {
        KillEvent {
            kill_time_in_round: Some(t),
            kill_time_in_match: Some(t),
            killer_puuid: Some(killer.to_string()),
            killer_display_name: None,
            killer_team: Some(killer_team.to_string()),
            victim_puuid: Some(victim.to_string()),
            victim_display_name: None,
            victim_team: Some(victim_team.to_string()),
        }
    }

    fn player_stat(puuid: &str, team: &str, kill_events: Vec<KillEvent>) -> MatchDetailRoundPlayerStat {
        MatchDetailRoundPlayerStat {
            player_puuid: Some(puuid.to_string()),
            player_display_name: None,
            player_team: Some(team.to_string()),
            damage: None,
            bodyshots: None,
            headshots: None,
            legshots: None,
            kills: Some(kill_events.len() as i64),
            score: None,
            was_afk: None,
            economy: None,
            kill_events,
        }
    }

    fn make_match(rounds: Vec<MatchDetailRound>) -> MatchDetailData {
        MatchDetailData {
            metadata: MatchDetailMetadata {
                matchid: Some("match-1".to_string()),
                map: None,
                mode: None,
                queue: None,
                season_id: None,
                game_length: None,
                game_start: None,
                game_start_patched: None,
                rounds_played: Some(rounds.len() as i64),
            },
            players: MatchDetailPlayers { all_players: vec![] },
            teams: MatchDetailTeams { red: None, blue: None },
            rounds,
        }
    }

    #[test]
    fn detects_a_multikill_from_kill_event_count() {
        let round = MatchDetailRound {
            winning_team: Some("Red".to_string()),
            end_type: None,
            bomb_planted: None,
            bomb_defused: None,
            player_stats: vec![player_stat(
                "me",
                "Red",
                vec![
                    kill("me", "e1", "Red", "Blue", 1000),
                    kill("me", "e2", "Red", "Blue", 2000),
                    kill("me", "e3", "Red", "Blue", 3000),
                ],
            )],
        };
        let detail = make_match(vec![round]);
        let highlights = detect_match_highlights(&detail, "me");
        assert_eq!(highlights.len(), 1);
        assert_eq!(highlights[0].kind, HighlightKind::Multikill);
        assert_eq!(highlights[0].label, "3k");
    }

    #[test]
    fn detects_an_ace_at_five_kills() {
        let events = (1..=5).map(|i| kill("me", &format!("e{i}"), "Red", "Blue", i * 1000)).collect();
        let round = MatchDetailRound {
            winning_team: Some("Red".to_string()),
            end_type: None,
            bomb_planted: None,
            bomb_defused: None,
            player_stats: vec![player_stat("me", "Red", events)],
        };
        let detail = make_match(vec![round]);
        let highlights = detect_match_highlights(&detail, "me");
        assert_eq!(highlights[0].label, "Ace");
    }

    #[test]
    fn detects_a_clutch_when_i_survive_alone_and_win_the_round() {
        // Round 5v5 : deux de mes coéquipiers tradent un adversaire chacun avant de mourir,
        // puis mes deux derniers coéquipiers meurent sans trade — au moment où le dernier
        // meurt, 3 adversaires sont encore en vie (1v3). Je les élimine ensuite seul pour
        // gagner le round.
        let round = MatchDetailRound {
            winning_team: Some("Red".to_string()),
            end_type: None,
            bomb_planted: None,
            bomb_defused: None,
            player_stats: vec![
                player_stat(
                    "me",
                    "Red",
                    vec![
                        kill("me", "e3", "Red", "Blue", 5000),
                        kill("me", "e4", "Red", "Blue", 6000),
                        kill("me", "e5", "Red", "Blue", 7000),
                    ],
                ),
                player_stat("mate1", "Red", vec![kill("mate1", "e1", "Red", "Blue", 500)]),
                player_stat("mate2", "Red", vec![kill("mate2", "e2", "Red", "Blue", 1500)]),
                player_stat("mate3", "Red", vec![]),
                player_stat("mate4", "Red", vec![]),
                player_stat("e1", "Blue", vec![]),
                player_stat("e2", "Blue", vec![kill("e2", "mate1", "Blue", "Red", 1000)]),
                player_stat("e3", "Blue", vec![kill("e3", "mate2", "Blue", "Red", 2000)]),
                player_stat("e4", "Blue", vec![kill("e4", "mate3", "Blue", "Red", 3000)]),
                player_stat("e5", "Blue", vec![kill("e5", "mate4", "Blue", "Red", 4000)]),
            ],
        };
        let detail = make_match(vec![round]);
        let highlights = detect_match_highlights(&detail, "me");
        let clutch = highlights.iter().find(|h| h.kind == HighlightKind::Clutch);
        assert!(clutch.is_some());
        assert_eq!(clutch.unwrap().label, "1v3");
    }

    #[test]
    fn no_clutch_when_i_die_before_the_round_ends() {
        let round = MatchDetailRound {
            winning_team: Some("Blue".to_string()),
            end_type: None,
            bomb_planted: None,
            bomb_defused: None,
            player_stats: vec![
                player_stat("me", "Red", vec![]),
                player_stat("mate1", "Red", vec![]),
                player_stat("e1", "Blue", vec![kill("e1", "mate1", "Blue", "Red", 1000)]),
                player_stat("e2", "Blue", vec![kill("e2", "me", "Blue", "Red", 2000)]),
            ],
        };
        let detail = make_match(vec![round]);
        let highlights = detect_match_highlights(&detail, "me");
        assert!(highlights.iter().all(|h| h.kind != HighlightKind::Clutch));
    }

    #[test]
    fn no_clutch_when_the_round_is_lost_despite_surviving() {
        // Je survis (spike explose avant que je ne tue tout le monde), mais mon équipe perd
        // le round -> pas un clutch au sens sportif du terme.
        let round = MatchDetailRound {
            winning_team: Some("Blue".to_string()),
            end_type: None,
            bomb_planted: None,
            bomb_defused: None,
            player_stats: vec![
                player_stat("me", "Red", vec![]),
                player_stat("mate1", "Red", vec![]),
                player_stat("e1", "Blue", vec![kill("e1", "mate1", "Blue", "Red", 1000)]),
                player_stat("e2", "Blue", vec![]),
            ],
        };
        let detail = make_match(vec![round]);
        let highlights = detect_match_highlights(&detail, "me");
        assert!(highlights.iter().all(|h| h.kind != HighlightKind::Clutch));
    }
}
