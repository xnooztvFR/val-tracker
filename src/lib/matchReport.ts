import type { MatchDetailData } from "./tauriApi";

// Rapport de match (V3) — calculé entièrement côté client à partir de MatchDetailData
// déjà chargé/caché par l'écran MatchDetail (fetch_match_detail), donc zéro appel réseau
// supplémentaire. Henrik ne fournit pas d'événements de kill horodatés dans ce DTO (juste
// des stats agrégées par round), donc pas de détection de "premier sang"/clutch fiable —
// on se limite à ce qui est réellement dérivable : économie par round et perf brute.

export type EconomyTier = "eco" | "force" | "full";

/** Seuils approximatifs (valeur de loadout moyenne de l'équipe sur le round) — pas une
 * règle officielle Riot, juste une heuristique suffisante pour distinguer un round d'éco
 * d'un force-buy et d'un full-buy. */
const ECO_THRESHOLD = 2000;
const FULL_BUY_THRESHOLD = 3400;

export function economyTier(avgLoadoutValue: number): EconomyTier {
  if (avgLoadoutValue < ECO_THRESHOLD) return "eco";
  if (avgLoadoutValue < FULL_BUY_THRESHOLD) return "force";
  return "full";
}

export interface RoundSummary {
  index: number;
  won: boolean;
  economyTier: EconomyTier;
  teamAvgLoadout: number;
  bombPlanted: boolean;
  bombDefused: boolean;
  endType: string | null;
}

export interface EconomyBucketStats {
  tier: EconomyTier;
  roundsPlayed: number;
  roundsWon: number;
}

export interface RoundPerformance {
  index: number;
  kills: number;
  damage: number;
}

export interface MatchReport {
  myTeam: string;
  rounds: RoundSummary[];
  economyBreakdown: EconomyBucketStats[];
  bestRound: RoundPerformance | null;
  worstRound: RoundPerformance | null;
  afkRounds: number[];
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** `null` si le joueur n'est pas trouvé dans ce match (mauvais puuid) — l'appelant
 * affiche alors un état vide plutôt qu'un rapport à moitié rempli. */
export function buildMatchReport(data: MatchDetailData, puuid: string): MatchReport | null {
  const me = data.players.all_players.find((p) => p.puuid === puuid);
  if (!me) return null;
  const myTeam = me.team;

  const rounds: RoundSummary[] = data.rounds.map((round, i) => {
    const teamStats = round.player_stats.filter((p) => p.player_team === myTeam);
    const teamAvgLoadout = average(teamStats.map((p) => p.economy?.loadout_value ?? 0));
    return {
      index: i + 1,
      won: round.winning_team === myTeam,
      economyTier: economyTier(teamAvgLoadout),
      teamAvgLoadout,
      bombPlanted: round.bomb_planted ?? false,
      bombDefused: round.bomb_defused ?? false,
      endType: round.end_type,
    };
  });

  const economyBreakdown: EconomyBucketStats[] = (["eco", "force", "full"] as const).map((tier) => {
    const inTier = rounds.filter((r) => r.economyTier === tier);
    return {
      tier,
      roundsPlayed: inTier.length,
      roundsWon: inTier.filter((r) => r.won).length,
    };
  });

  let bestRound: RoundPerformance | null = null;
  let worstRound: RoundPerformance | null = null;
  const afkRounds: number[] = [];

  data.rounds.forEach((round, i) => {
    const myStat = round.player_stats.find((p) => p.player_puuid === puuid);
    if (!myStat) return;
    if (myStat.was_afk) afkRounds.push(i + 1);

    const entry: RoundPerformance = {
      index: i + 1,
      kills: myStat.kills ?? 0,
      damage: myStat.damage ?? 0,
    };
    if (!bestRound || entry.damage > bestRound.damage) bestRound = entry;
    if (!worstRound || entry.damage < worstRound.damage) worstRound = entry;
  });

  return { myTeam, rounds, economyBreakdown, bestRound, worstRound, afkRounds };
}
