// Fonctions d'agrégation pures sur des matchs/historique déjà en cache (aucun appel réseau
// ici) — réutilisées entre Home.tsx, Compare.tsx (backlog #11) et Trends.tsx (#15, #21).

import { formatKdRatio } from "./format";
import type { LeaderboardThreshold, MatchEntry, MmrHistoryEntry } from "./tauriApi";

export interface AgentTally {
  id: string;
  name: string;
  matches: number;
  wins: number;
  kills: number;
  deaths: number;
}

export interface Overview {
  played: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  winPercent: number;
  kd: string;
  hsPercent: number;
  bodyPercent: number;
  legPercent: number;
  acs: number;
  topAgent: AgentTally | null;
}

/** Backlog #11 : extrait de Home.tsx pour être réutilisé par l'écran de comparaison VS. */
export function computeOverview(matches: MatchEntry[], puuid: string): Overview {
  let wins = 0;
  let played = 0;
  let kills = 0;
  let deaths = 0;
  let assists = 0;
  let headshots = 0;
  let bodyshots = 0;
  let legshots = 0;
  let scoreSum = 0;
  let roundsSum = 0;
  const agents = new Map<string, AgentTally>();

  for (const match of matches) {
    const player = match.players.find((p) => p.puuid === puuid);
    if (!player?.stats) continue;
    played += 1;

    kills += player.stats.kills ?? 0;
    deaths += player.stats.deaths ?? 0;
    assists += player.stats.assists ?? 0;
    headshots += player.stats.headshots ?? 0;
    bodyshots += player.stats.bodyshots ?? 0;
    legshots += player.stats.legshots ?? 0;
    scoreSum += player.stats.score ?? 0;

    const team = match.teams.find((t) => t.team_id === player.team_id);
    const won = Boolean(team?.won);
    if (won) wins += 1;
    const roundsPlayed = (team?.rounds?.won ?? 0) + (team?.rounds?.lost ?? 0);
    roundsSum += roundsPlayed > 0 ? roundsPlayed : 1;

    const agentId = player.agent?.id;
    if (agentId) {
      const tally = agents.get(agentId) ?? {
        id: agentId,
        name: player.agent?.name ?? "Agent inconnu",
        matches: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
      };
      tally.matches += 1;
      if (won) tally.wins += 1;
      tally.kills += player.stats.kills ?? 0;
      tally.deaths += player.stats.deaths ?? 0;
      agents.set(agentId, tally);
    }
  }

  const totalShots = headshots + bodyshots + legshots;
  const topAgent = [...agents.values()].sort((a, b) => b.matches - a.matches)[0] ?? null;

  return {
    played,
    wins,
    losses: played - wins,
    kills,
    deaths,
    assists,
    headshots,
    winPercent: played > 0 ? (wins / played) * 100 : 0,
    kd: formatKdRatio(kills, deaths),
    hsPercent: totalShots > 0 ? (headshots / totalShots) * 100 : 0,
    bodyPercent: totalShots > 0 ? (bodyshots / totalShots) * 100 : 0,
    legPercent: totalShots > 0 ? (legshots / totalShots) * 100 : 0,
    acs: played > 0 ? Math.round(scoreSum / Math.max(roundsSum, 1)) : 0,
    topAgent,
  };
}

export interface AgentWinrate {
  name: string;
  matches: number;
  wins: number;
  winPercent: number;
}

/** Backlog #22 : agents perso les plus performants (winrate), pour la suggestion
 * d'agent affichée dans l'overlay pendant la sélection d'agents — `minMatches` filtre le
 * bruit d'un agent joué une seule fois. */
export function computeAgentWinrates(
  matches: MatchEntry[],
  puuid: string,
  minMatches = 2,
): AgentWinrate[] {
  const byAgent = new Map<string, { matches: number; wins: number }>();

  for (const match of matches) {
    const player = match.players.find((p) => p.puuid === puuid);
    const agentName = player?.agent?.name;
    if (!agentName) continue;
    const team = match.teams.find((t) => t.team_id === player?.team_id);
    const entry = byAgent.get(agentName) ?? { matches: 0, wins: 0 };
    entry.matches += 1;
    if (team?.won) entry.wins += 1;
    byAgent.set(agentName, entry);
  }

  return [...byAgent.entries()]
    .filter(([, v]) => v.matches >= minMatches)
    .map(([name, v]) => ({ name, matches: v.matches, wins: v.wins, winPercent: (v.wins / v.matches) * 100 }))
    .sort((a, b) => b.winPercent - a.winPercent || b.matches - a.matches);
}

export interface HeatmapCell {
  day: number; // 0 = lundi ... 6 = dimanche
  hour: number; // 0-23, heure locale
  matches: number;
  wins: number;
}

/** Backlog #15 : winrate par jour de semaine x heure locale, à partir de
 * `metadata.started_at` déjà en cache — aucun appel réseau supplémentaire. */
export function computeHeatmap(matches: MatchEntry[], puuid: string): HeatmapCell[] {
  const cells = new Map<string, HeatmapCell>();
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      cells.set(`${day}-${hour}`, { day, hour, matches: 0, wins: 0 });
    }
  }

  for (const match of matches) {
    const startedAt = match.metadata.started_at;
    if (!startedAt) continue;
    const date = new Date(startedAt);
    if (Number.isNaN(date.getTime())) continue;

    const player = match.players.find((p) => p.puuid === puuid);
    if (!player) continue;
    const team = match.teams.find((t) => t.team_id === player.team_id);

    // getDay() : 0 = dimanche ... on décale pour que 0 = lundi (plus lisible en grille FR).
    const day = (date.getDay() + 6) % 7;
    const hour = date.getHours();
    const cell = cells.get(`${day}-${hour}`)!;
    cell.matches += 1;
    if (team?.won) cell.wins += 1;
  }

  return [...cells.values()];
}

export interface WeeklyMatchStats {
  matches: number;
  wins: number;
  winPercent: number;
}

/** Début de la semaine ISO en cours (lundi 00:00, heure locale) pour la date donnée. */
function startOfIsoWeek(date: Date): Date {
  const day = (date.getDay() + 6) % 7; // 0 = lundi
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - day);
  return start;
}

/** Backlog #55 : agrège les matchs de la semaine en cours pour les objectifs hebdo custom
 * ("X matchs cette semaine", "winrate ≥ Y%") — pure fonction sur `MatchEntry[]` déjà en
 * cache, aucun appel réseau ni période stockée en base : la fenêtre "cette semaine" est
 * recalculée à chaque affichage à partir de `metadata.started_at`. */
export function computeWeeklyMatchStats(matches: MatchEntry[], puuid: string, now = new Date()): WeeklyMatchStats {
  const weekStart = startOfIsoWeek(now);
  let count = 0;
  let wins = 0;

  for (const match of matches) {
    const startedAt = match.metadata.started_at;
    if (!startedAt) continue;
    const date = new Date(startedAt);
    if (Number.isNaN(date.getTime()) || date < weekStart) continue;

    const player = match.players.find((p) => p.puuid === puuid);
    if (!player) continue;
    count += 1;
    const team = match.teams.find((t) => t.team_id === player.team_id);
    if (team?.won) wins += 1;
  }

  return { matches: count, wins, winPercent: count > 0 ? (wins / count) * 100 : 0 };
}

export interface RegularityScore {
  sampleSize: number;
  kdaMean: number;
  kdaStdDev: number;
  /** Écart-type / moyenne — plus lisible qu'un écart-type brut pour comparer deux joueurs
   * dont le niveau moyen diffère. Plus bas = plus régulier. */
  coefficientOfVariation: number;
}

/** Backlog #53 : variance du KDA sur les N derniers matchs pour situer la régularité d'un
 * joueur à côté de ses moyennes déjà affichées — pure fonction sur `MatchEntry[]` déjà en
 * cache (pas d'ADR ici : `MatchEntry` n'expose pas les dégâts, seulement `MatchDetailData`
 * qui coûterait un fetch par match). */
export function computeRegularity(matches: MatchEntry[], puuid: string): RegularityScore {
  const kdaValues: number[] = [];

  for (const match of matches) {
    const player = match.players.find((p) => p.puuid === puuid);
    if (!player?.stats) continue;
    const kills = player.stats.kills ?? 0;
    const assists = player.stats.assists ?? 0;
    const deaths = player.stats.deaths ?? 0;
    kdaValues.push((kills + assists) / Math.max(deaths, 1));
  }

  const sampleSize = kdaValues.length;
  if (sampleSize === 0) {
    return { sampleSize: 0, kdaMean: 0, kdaStdDev: 0, coefficientOfVariation: 0 };
  }

  const kdaMean = kdaValues.reduce((sum, v) => sum + v, 0) / sampleSize;
  const variance = kdaValues.reduce((sum, v) => sum + (v - kdaMean) ** 2, 0) / sampleSize;
  const kdaStdDev = Math.sqrt(variance);

  return {
    sampleSize,
    kdaMean,
    kdaStdDev,
    coefficientOfVariation: kdaMean > 0 ? kdaStdDev / kdaMean : 0,
  };
}

export interface SeasonComparison {
  season: string;
  games: number;
  netRr: number;
  highestTier: number;
}

/** Backlog #21 : comparaison "avant/après" par saison plutôt que par patch exact — Henrik
 * n'expose pas le numéro de patch par match sans un fetch supplémentaire par match (coût
 * réseau, voir TODO.md #21) ; la saison, elle, est déjà présente sur chaque entrée de
 * `fetchMmrHistory` (un seul appel, déjà en cache). */
export function computeSeasonComparison(history: MmrHistoryEntry[]): SeasonComparison[] {
  const bySeason = new Map<string, SeasonComparison>();

  for (const entry of history) {
    const seasonLabel = entry.season?.short ?? entry.season?.id ?? "Saison inconnue";
    const current = bySeason.get(seasonLabel) ?? {
      season: seasonLabel,
      games: 0,
      netRr: 0,
      highestTier: 0,
    };
    current.games += 1;
    current.netRr += entry.last_change ?? 0;
    current.highestTier = Math.max(current.highestTier, entry.tier?.id ?? 0);
    bySeason.set(seasonLabel, current);
  }

  return [...bySeason.values()];
}

export interface LeaderboardPercentile {
  rank: number;
  tierName: string | null;
  /** Position dans le tier, 0% = meilleur du tier, 100% = pire du tier. */
  percentileInTier: number;
  playersAboveInTier: number;
  playersInTier: number | null;
}

/** Backlog #54 : situe le joueur suivi dans son tier via `thresholds` — Henrik n'expose pas
 * la taille totale de la région (pas de vrai percentile "région" possible), mais chaque
 * `threshold` marque le `start_index` (rang) où un tier commence sur le leaderboard, ce qui
 * suffit à calculer une position relative au sein du tier, sans appel réseau de plus que
 * `fetch_leaderboard` déjà branché. */
export function computeLeaderboardPercentile(
  rank: number,
  thresholds: LeaderboardThreshold[],
): LeaderboardPercentile | null {
  const sorted = [...thresholds]
    .filter((t): t is LeaderboardThreshold & { start_index: number } => t.start_index != null)
    .sort((a, b) => a.start_index - b.start_index);

  let current: (LeaderboardThreshold & { start_index: number }) | null = null;
  let next: (LeaderboardThreshold & { start_index: number }) | null = null;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].start_index <= rank) {
      current = sorted[i];
      next = sorted[i + 1] ?? null;
    }
  }
  if (!current) return null;

  const playersAboveInTier = rank - current.start_index;
  const playersInTier = next ? next.start_index - current.start_index : null;
  const percentileInTier = playersInTier ? (playersAboveInTier / playersInTier) * 100 : 0;

  return {
    rank,
    tierName: current.tier?.name ?? null,
    percentileInTier,
    playersAboveInTier,
    playersInTier,
  };
}
