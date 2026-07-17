//! TODO Fonctionnalités#1 : "Tracker Score" — note de performance composite sur 1000 points,
//! inspirée du Tracker Score de tracker.gg (https://tracker.gg/valorant/articles/tracker-score-our-new-performance-rating),
//! agrégée sur les détails de match déjà en cache SQLite (aucun appel réseau ici, même
//! pattern que `side_stats.rs`/`recommendations.rs`).
//!
//! **Limite assumée** : Henrik ne fournit aucune distribution statistique réelle des stats
//! par rang (pas de endpoint "moyenne de la communauté"). Les bornes de `BENCHMARKS`
//! ci-dessous sont donc des seuils communautaires approximatifs (retours de coaching/tier
//! list publics), pas une calibration scientifique — le score sert d'indicateur directionnel
//! ("je suis plutôt au-dessus/en-dessous de mon rang sur cette métrique"), pas une vérité
//! statistique. À ajuster si des retours utilisateurs montrent des tiers manifestement
//! incohérents.

use serde::Serialize;

use crate::api::henrik::types::MatchDetailData;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum ScoreTier {
    S,
    A,
    B,
    C,
    D,
}

impl ScoreTier {
    fn from_ratio(ratio: f64) -> Self {
        if ratio >= 0.9 {
            ScoreTier::S
        } else if ratio >= 0.7 {
            ScoreTier::A
        } else if ratio >= 0.45 {
            ScoreTier::B
        } else if ratio >= 0.2 {
            ScoreTier::C
        } else {
            ScoreTier::D
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct MetricScore {
    pub name: String,
    pub value: f64,
    /// Score normalisé 0-200 (5 métriques à poids égal -> total /1000).
    pub points: f64,
    pub tier: ScoreTier,
}

#[derive(Debug, Clone, Serialize)]
pub struct TrackerScoreResult {
    pub total_score: f64,
    pub tier: ScoreTier,
    pub metrics: Vec<MetricScore>,
    /// Nombre de matchs en cache pris en compte — informatif, un score sur 1-2 matchs est
    /// peu fiable, affiché en garde-fou côté UI.
    pub matches_considered: i64,
}

/// Bracket de rang (regroupement large, voir `format.ts::RANK_NAME_KEYS` côté frontend pour
/// le mapping tier -> nom) : les seuils de performance "normale" montent avec le rang.
#[derive(Debug, Clone, Copy)]
struct Bracket {
    max_tier: i64,
    acs: (f64, f64),
    kd: (f64, f64),
    adr: (f64, f64),
    hs_percent: (f64, f64),
    winrate: (f64, f64),
}

/// (bas = D/C, haut = S) par métrique — mêmes unités que les valeurs calculées plus bas.
const BENCHMARKS: &[Bracket] = &[
    Bracket {
        max_tier: 8, // Iron/Bronze
        acs: (100.0, 220.0),
        kd: (0.6, 1.15),
        adr: (90.0, 160.0),
        hs_percent: (10.0, 25.0),
        winrate: (35.0, 55.0),
    },
    Bracket {
        max_tier: 14, // Silver/Gold
        acs: (130.0, 250.0),
        kd: (0.7, 1.25),
        adr: (100.0, 175.0),
        hs_percent: (12.0, 28.0),
        winrate: (35.0, 55.0),
    },
    Bracket {
        max_tier: 20, // Platinum/Diamond
        acs: (150.0, 280.0),
        kd: (0.75, 1.35),
        adr: (110.0, 190.0),
        hs_percent: (14.0, 30.0),
        winrate: (35.0, 55.0),
    },
    Bracket {
        max_tier: 27, // Ascendant/Immortal/Radiant
        acs: (170.0, 310.0),
        kd: (0.8, 1.45),
        adr: (120.0, 205.0),
        hs_percent: (16.0, 32.0),
        winrate: (35.0, 55.0),
    },
];

fn bracket_for_tier(tier: Option<i64>) -> &'static Bracket {
    let t = tier.unwrap_or(BENCHMARKS[0].max_tier);
    BENCHMARKS
        .iter()
        .find(|b| t <= b.max_tier)
        .unwrap_or(&BENCHMARKS[BENCHMARKS.len() - 1])
}

/// Normalise `value` dans `[low, high]` vers un ratio `[0, 1]` (borné), puis vers 0-200 points.
fn score_metric(name: &str, value: f64, (low, high): (f64, f64)) -> MetricScore {
    let ratio = if high > low {
        ((value - low) / (high - low)).clamp(0.0, 1.0)
    } else {
        0.0
    };
    MetricScore {
        name: name.to_string(),
        value,
        points: ratio * 200.0,
        tier: ScoreTier::from_ratio(ratio),
    }
}

fn team_won(detail: &MatchDetailData, team: &str) -> bool {
    let team_data = if team.eq_ignore_ascii_case("red") {
        detail.teams.red.as_ref()
    } else if team.eq_ignore_ascii_case("blue") {
        detail.teams.blue.as_ref()
    } else {
        None
    };
    team_data.and_then(|t| t.has_won).unwrap_or(false)
}

/// Agrège ACS/K-D/ADR/HS%/winrate sur un lot de détails de match déjà en cache, puis calcule
/// le Tracker Score composite pour `puuid`. `current_tier` (rang courant, MMR déjà fetché
/// côté commande) choisit le bracket de benchmarks — `None` retombe sur le bracket le plus
/// bas (comparaison la plus indulgente par défaut).
pub fn compute_tracker_score(
    matches: &[MatchDetailData],
    puuid: &str,
    current_tier: Option<i64>,
) -> TrackerScoreResult {
    let mut rounds_total = 0i64;
    let mut score_total = 0i64;
    let mut kills_total = 0i64;
    let mut deaths_total = 0i64;
    let mut damage_total = 0i64;
    let mut headshots_total = 0i64;
    let mut bodyshots_total = 0i64;
    let mut legshots_total = 0i64;
    let mut wins = 0i64;
    let mut considered = 0i64;

    for detail in matches {
        let Some(me) = detail.players.all_players.iter().find(|p| p.puuid == puuid) else {
            continue;
        };
        let rounds = detail
            .metadata
            .rounds_played
            .unwrap_or(detail.rounds.len() as i64)
            .max(0);
        if rounds == 0 {
            continue;
        }
        rounds_total += rounds;
        if let Some(stats) = &me.stats {
            score_total += stats.score.unwrap_or(0);
            kills_total += stats.kills.unwrap_or(0);
            deaths_total += stats.deaths.unwrap_or(0);
            headshots_total += stats.headshots.unwrap_or(0);
            bodyshots_total += stats.bodyshots.unwrap_or(0);
            legshots_total += stats.legshots.unwrap_or(0);
        }
        damage_total += me.damage_made.unwrap_or(0);
        if team_won(detail, &me.team) {
            wins += 1;
        }
        considered += 1;
    }

    let bracket = bracket_for_tier(current_tier);

    if considered == 0 || rounds_total == 0 {
        return TrackerScoreResult {
            total_score: 0.0,
            tier: ScoreTier::D,
            metrics: vec![],
            matches_considered: 0,
        };
    }

    let acs = score_total as f64 / rounds_total as f64;
    let deaths_safe = deaths_total.max(1) as f64;
    let kd = kills_total as f64 / deaths_safe;
    let adr = damage_total as f64 / rounds_total as f64;
    let total_shots = (headshots_total + bodyshots_total + legshots_total).max(1) as f64;
    let hs_percent = headshots_total as f64 / total_shots * 100.0;
    let winrate = wins as f64 / considered as f64 * 100.0;

    let metrics = vec![
        score_metric("acs", acs, bracket.acs),
        score_metric("kd", kd, bracket.kd),
        score_metric("adr", adr, bracket.adr),
        score_metric("hs_percent", hs_percent, bracket.hs_percent),
        score_metric("winrate", winrate, bracket.winrate),
    ];

    let total_score: f64 = metrics.iter().map(|m| m.points).sum();
    let tier = ScoreTier::from_ratio(total_score / 1000.0);

    TrackerScoreResult {
        total_score,
        tier,
        metrics,
        matches_considered: considered,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::henrik::types::{
        MatchDetailMetadata, MatchDetailPlayer, MatchDetailPlayerStats, MatchDetailPlayers,
        MatchDetailTeam, MatchDetailTeams,
    };

    fn make_match(
        rounds_played: i64,
        team: &str,
        won: bool,
        score: i64,
        kills: i64,
        deaths: i64,
        damage_made: i64,
        headshots: i64,
        bodyshots: i64,
    ) -> MatchDetailData {
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
                all_players: vec![MatchDetailPlayer {
                    puuid: "me".to_string(),
                    name: "p".to_string(),
                    tag: "1234".to_string(),
                    team: team.to_string(),
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
                        assists: Some(0),
                        bodyshots: Some(bodyshots),
                        headshots: Some(headshots),
                        legshots: Some(0),
                    }),
                    economy: None,
                    damage_made: Some(damage_made),
                    damage_received: None,
                }],
            },
            teams: MatchDetailTeams {
                red: if team.eq_ignore_ascii_case("red") {
                    Some(MatchDetailTeam { has_won: Some(won), rounds_won: None, rounds_lost: None })
                } else {
                    None
                },
                blue: if team.eq_ignore_ascii_case("blue") {
                    Some(MatchDetailTeam { has_won: Some(won), rounds_won: None, rounds_lost: None })
                } else {
                    None
                },
            },
            rounds: vec![],
        }
    }

    #[test]
    fn returns_zero_score_when_no_match_found_for_puuid() {
        let matches = vec![make_match(24, "Red", true, 4000, 20, 10, 3000, 5, 10)];
        let result = compute_tracker_score(&matches, "someone-else", Some(10));
        assert_eq!(result.matches_considered, 0);
        assert_eq!(result.total_score, 0.0);
    }

    #[test]
    fn computes_a_high_score_for_dominant_stats_at_a_low_rank_bracket() {
        // Bracket Iron/Bronze (tier 5) : ACS ~250 (au-dessus de la borne haute 220) et K/D 2.0
        // doivent chacun taper le plafond de 200 points.
        let matches = vec![make_match(24, "Red", true, 6000, 40, 20, 4500, 15, 15)];
        let result = compute_tracker_score(&matches, "me", Some(5));
        assert_eq!(result.matches_considered, 1);
        let acs_metric = result.metrics.iter().find(|m| m.name == "acs").unwrap();
        assert_eq!(acs_metric.tier, ScoreTier::S);
        assert!(result.total_score > 500.0);
    }

    #[test]
    fn a_higher_rank_bracket_is_harder_to_score_well_in() {
        let matches = vec![make_match(24, "Red", true, 4000, 20, 15, 3200, 8, 15)];
        let low_bracket = compute_tracker_score(&matches, "me", Some(5));
        let high_bracket = compute_tracker_score(&matches, "me", Some(26));
        assert!(high_bracket.total_score <= low_bracket.total_score);
    }

    #[test]
    fn aggregates_across_multiple_matches() {
        let matches = vec![
            make_match(24, "Red", true, 4000, 20, 15, 3200, 8, 15),
            make_match(24, "Blue", false, 3500, 15, 18, 2800, 6, 15),
        ];
        let result = compute_tracker_score(&matches, "me", Some(10));
        assert_eq!(result.matches_considered, 2);
        let winrate_metric = result.metrics.iter().find(|m| m.name == "winrate").unwrap();
        assert!((winrate_metric.value - 50.0).abs() < f64::EPSILON);
    }
}
