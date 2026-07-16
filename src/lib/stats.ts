// Fonctions d'agrégation pures sur des matchs/historique déjà en cache (aucun appel réseau
// ici) — réutilisées entre Home.tsx, Compare.tsx (backlog #11) et Trends.tsx (#15, #21).

import { formatKdRatio, groupMatchesIntoSessions, SESSION_GAP_MS as MATCH_SESSION_GAP_MS } from "./format";
import type { LeaderboardThreshold, MatchEntry, MmrHistoryEntry, RankSnapshot } from "./tauriApi";

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
  /** TODO Fonctionnalités#7 : agrégats pour les objectifs K/D et HS% cible. */
  kills: number;
  deaths: number;
  kd: number;
  hsPercent: number;
}

/** Début de la semaine ISO en cours (lundi 00:00, heure locale) pour la date donnée. */
function startOfIsoWeek(date: Date): Date {
  const day = (date.getDay() + 6) % 7; // 0 = lundi
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - day);
  return start;
}

/** Fonction partagée par `computeWeeklyMatchStats` et `computeTodayStats` (TODO
 * Fonctionnalités#13) : agrège tous les matchs dont `started_at >= since`. */
function computeMatchStatsSince(matches: MatchEntry[], puuid: string, since: Date): WeeklyMatchStats {
  let count = 0;
  let wins = 0;
  let kills = 0;
  let deaths = 0;
  let headshots = 0;
  let bodyshots = 0;
  let legshots = 0;

  for (const match of matches) {
    const startedAt = match.metadata.started_at;
    if (!startedAt) continue;
    const date = new Date(startedAt);
    if (Number.isNaN(date.getTime()) || date < since) continue;

    const player = match.players.find((p) => p.puuid === puuid);
    if (!player) continue;
    count += 1;
    const team = match.teams.find((t) => t.team_id === player.team_id);
    if (team?.won) wins += 1;
    kills += player.stats?.kills ?? 0;
    deaths += player.stats?.deaths ?? 0;
    headshots += player.stats?.headshots ?? 0;
    bodyshots += player.stats?.bodyshots ?? 0;
    legshots += player.stats?.legshots ?? 0;
  }

  const totalShots = headshots + bodyshots + legshots;
  return {
    matches: count,
    wins,
    winPercent: count > 0 ? (wins / count) * 100 : 0,
    kills,
    deaths,
    kd: deaths > 0 ? kills / deaths : kills,
    hsPercent: totalShots > 0 ? (headshots / totalShots) * 100 : 0,
  };
}

/** Backlog #55 : agrège les matchs de la semaine en cours pour les objectifs hebdo custom
 * ("X matchs cette semaine", "winrate ≥ Y%") — pure fonction sur `MatchEntry[]` déjà en
 * cache, aucun appel réseau ni période stockée en base : la fenêtre "cette semaine" est
 * recalculée à chaque affichage à partir de `metadata.started_at`. */
export function computeWeeklyMatchStats(matches: MatchEntry[], puuid: string, now = new Date()): WeeklyMatchStats {
  return computeMatchStatsSince(matches, puuid, startOfIsoWeek(now));
}

/** Début du jour calendaire (00:00 heure locale) pour la date donnée. */
function startOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

/** TODO Fonctionnalités#13 : agrège les matchs joués aujourd'hui (vue "aujourd'hui" —
 * dashboard condensé, écran Today.tsx), même principe que `computeWeeklyMatchStats`. */
export function computeTodayStats(matches: MatchEntry[], puuid: string, now = new Date()): WeeklyMatchStats {
  return computeMatchStatsSince(matches, puuid, startOfDay(now));
}

/** Clé de semaine ISO ("2026-W03") pour dédupliquer un objectif hebdo atteint une seule
 * fois par semaine (backlog #57, voir record_goal_achieved côté Rust). */
export function isoWeekKey(date: Date): string {
  // Algorithme ISO 8601 standard : le jeudi de la semaine détermine son année ISO.
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Début du mois calendaire en cours (1er à 00:00, heure locale) pour la date donnée. */
function startOfMonth(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(1);
  return start;
}

export interface PeriodRankChange {
  tierStart: number;
  tierPatchedStart: string;
  rrStart: number | null;
  tierEnd: number;
  tierPatchedEnd: string;
  rrEnd: number | null;
}

export interface PeriodRecap {
  period: "week" | "month" | "session";
  start: Date;
  end: Date;
  overview: Overview;
  rankChange: PeriodRankChange | null;
}

/** Compare le dernier snapshot avant `startMs` (ou le premier après, s'il n'y en a pas
 * avant) au tout dernier snapshot connu — partagé par `computePeriodRecap` et
 * `computeSessionRecap`. */
function computeRankChangeSince(snapshots: RankSnapshot[], startMs: number): PeriodRankChange | null {
  const sorted = [...snapshots].sort((a, b) => a.recorded_at - b.recorded_at);
  const startSec = startMs / 1000;
  const beforePeriod = sorted.filter((s) => s.recorded_at < startSec);
  const fromPeriod = sorted.filter((s) => s.recorded_at >= startSec);
  const startSnapshot = beforePeriod[beforePeriod.length - 1] ?? fromPeriod[0] ?? null;
  const endSnapshot = sorted[sorted.length - 1] ?? null;

  if (!startSnapshot || !endSnapshot) return null;
  return {
    tierStart: startSnapshot.tier,
    tierPatchedStart: startSnapshot.tier_patched,
    rrStart: startSnapshot.rr,
    tierEnd: endSnapshot.tier,
    tierPatchedEnd: endSnapshot.tier_patched,
    rrEnd: endSnapshot.rr,
  };
}

/** Backlog #56 : récap hebdo/mensuel — agrégation locale des matchs et snapshots de rang
 * déjà en cache sur une fenêtre "semaine ISO en cours" ou "mois calendaire en cours" (pas
 * de période arbitraire ni de stockage : recalculé à la demande à partir de
 * `metadata.started_at`/`recorded_at`, comme `computeWeeklyMatchStats`). Le changement de
 * rang compare le dernier snapshot avant la période (ou le premier de la période s'il n'y
 * en a pas avant) au tout dernier snapshot connu — pas de delta RR synthétisé entre tiers
 * différents, qui ne serait pas fiable (les paliers de RR par tier ne sont pas uniformes). */
export function computePeriodRecap(
  matches: MatchEntry[],
  snapshots: RankSnapshot[],
  puuid: string,
  period: "week" | "month",
  now = new Date(),
): PeriodRecap {
  const start = period === "week" ? startOfIsoWeek(now) : startOfMonth(now);
  const startMs = start.getTime();

  const periodMatches = matches.filter((m) => {
    const startedAt = m.metadata.started_at;
    if (!startedAt) return false;
    const date = new Date(startedAt);
    return !Number.isNaN(date.getTime()) && date.getTime() >= startMs;
  });

  const overview = computeOverview(periodMatches, puuid);
  const rankChange = computeRankChangeSince(snapshots, startMs);

  return { period, start, end: now, overview, rankChange };
}

/** TODO Fonctionnalités#9 : "mode session" — récap borné à la session de jeu la plus
 * récente (regroupement existant de `groupMatchesIntoSessions`, écart de 30 min entre deux
 * matchs = nouvelle session) plutôt qu'une fenêtre calendaire fixe. `null` si aucun match
 * n'est chargé. Contrairement à `computePeriodRecap`, le `start`/`end` viennent des matchs
 * de la session elle-même (premier/dernier), pas d'une date arbitraire. */
export function computeSessionRecap(
  matches: MatchEntry[],
  snapshots: RankSnapshot[],
  puuid: string,
): PeriodRecap | null {
  const sessions = groupMatchesIntoSessions(matches, puuid);
  const latest = sessions[0];
  if (!latest || latest.matches.length === 0) return null;

  // `matches` est trié du plus récent au plus ancien (comme renvoyé par Henrik) : le premier
  // élément de la session est donc son match le plus récent, le dernier le plus ancien.
  const newest = latest.matches[0];
  const oldest = latest.matches[latest.matches.length - 1];
  const end = newest.metadata.started_at ? new Date(newest.metadata.started_at) : new Date();
  const start = oldest.metadata.started_at ? new Date(oldest.metadata.started_at) : end;

  const overview = computeOverview(latest.matches, puuid);
  const rankChange = computeRankChangeSince(snapshots, start.getTime());

  return { period: "session", start, end, overview, rankChange };
}

/** TODO Fonctionnalités#9 : une session est considérée "terminée" si le dernier match connu
 * remonte à plus de `SESSION_GAP_MS` (même seuil que `groupMatchesIntoSessions`) — sert à
 * déclencher le récap automatique sans rouvrir la fenêtre tant que le joueur enchaîne
 * encore des matchs. */
export function isSessionOver(matches: MatchEntry[], now = new Date()): boolean {
  const latest = matches[0]?.metadata.started_at;
  if (!latest) return false;
  const latestMs = new Date(latest).getTime();
  if (Number.isNaN(latestMs)) return false;
  return now.getTime() - latestMs > MATCH_SESSION_GAP_MS;
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

export interface RankEta {
  /** Pente de la régression linéaire RR/jour sur le palier actuel (peut être négative). */
  slopeRrPerDay: number;
  /** Nombre de jours avant d'atteindre `targetRr` au rythme actuel, `null` si la tendance
   * n'est pas positive ou si l'objectif est déjà atteint/pas assez de données. */
  daysToTargetRr: number | null;
  sampleSize: number;
  currentTier: number;
}

/** TODO stats & analyse joueur : ETA de progression de rang, régression linéaire simple sur
 * `rank_snapshots` déjà en cache. Volontairement restreinte aux snapshots du palier (tier)
 * *actuel* : `computePeriodRecap` documente déjà que les paliers de RR par tier ne sont pas
 * uniformes, donc mélanger des RR de tiers différents dans une même régression donnerait une
 * pente trompeuse. Ici on estime seulement "à ce rythme, combien de jours avant la promotion
 * (RR >= targetRr, 100 par défaut) depuis le tier actuel" — pas une ETA jusqu'à un tier cible
 * arbitraire plus haut, qui resterait une extrapolation non fiable au-delà du palier en
 * cours. */
export function computeRankEta(snapshots: RankSnapshot[], targetRr = 100): RankEta | null {
  const sorted = [...snapshots].sort((a, b) => a.recorded_at - b.recorded_at);
  if (sorted.length === 0) return null;
  const currentTier = sorted[sorted.length - 1].tier;

  // Ne garde que la série continue de snapshots du tier actuel, en partant de la fin — dès
  // qu'on retombe sur un tier différent en remontant dans le temps, on s'arrête.
  const sameTier: RankSnapshot[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].tier !== currentTier) break;
    if (sorted[i].rr == null) continue;
    sameTier.unshift(sorted[i]);
  }
  if (sameTier.length < 2) return null;

  // Régression linéaire simple RR = a + b*t, t en jours depuis le premier snapshot retenu.
  const t0 = sameTier[0].recorded_at;
  const xs = sameTier.map((s) => (s.recorded_at - t0) / 86_400);
  const ys = sameTier.map((s) => s.rr ?? 0);
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const lastRr = sameTier[sameTier.length - 1].rr ?? 0;
  const daysToTargetRr = slope > 0 && targetRr > lastRr ? (targetRr - lastRr) / slope : null;

  return { slopeRrPerDay: slope, daysToTargetRr, sampleSize: n, currentTier };
}

const SESSION_GAP_MS = 2 * 60 * 60 * 1000;
/** Sous ce nombre de matchs, le signal "tilt" (delta K/D début vs fin de session) est trop
 * bruité pour être affiché — un split en tiers de 1-2 matchs ne veut rien dire. */
const MIN_MATCHES_FOR_TILT_SIGNAL = 3;

export interface GameSession {
  start: Date;
  end: Date;
  matches: number;
  wins: number;
  losses: number;
  winPercent: number;
  /** K/D moyen du dernier tiers de la session moins celui du premier tiers — négatif =
   * signal de tilt (perf en baisse en cours de session). `null` si la session est trop
   * courte pour un signal fiable (voir `MIN_MATCHES_FOR_TILT_SIGNAL`). */
  tiltDeltaKd: number | null;
}

/** TODO stats & analyse joueur : regroupement par "session de jeu" (écart > 2h entre deux
 * matchs = nouvelle session), avec un indicateur de tilt simple — pure fonction sur
 * `MatchEntry[]` déjà en cache, aucun appel réseau supplémentaire. Sessions triées de la plus
 * récente à la plus ancienne. */
export function computeSessions(matches: MatchEntry[], puuid: string): GameSession[] {
  const withDates = matches
    .map((match) => {
      const player = match.players.find((p) => p.puuid === puuid);
      const startedAt = match.metadata.started_at;
      if (!player?.stats || !startedAt) return null;
      const date = new Date(startedAt);
      if (Number.isNaN(date.getTime())) return null;
      const team = match.teams.find((t) => t.team_id === player.team_id);
      const kills = player.stats.kills ?? 0;
      const deaths = player.stats.deaths ?? 0;
      return { date, won: team?.won ?? false, kd: deaths > 0 ? kills / deaths : kills };
    })
    .filter((m): m is { date: Date; won: boolean; kd: number } => m !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const sessions: GameSession[] = [];
  let current: typeof withDates = [];

  function flush() {
    if (current.length === 0) return;
    const wins = current.filter((m) => m.won).length;
    let tiltDeltaKd: number | null = null;
    if (current.length >= MIN_MATCHES_FOR_TILT_SIGNAL) {
      const third = Math.max(1, Math.floor(current.length / 3));
      const avg = (arr: typeof current) => arr.reduce((sum, m) => sum + m.kd, 0) / arr.length;
      tiltDeltaKd = avg(current.slice(-third)) - avg(current.slice(0, third));
    }
    sessions.push({
      start: current[0].date,
      end: current[current.length - 1].date,
      matches: current.length,
      wins,
      losses: current.length - wins,
      winPercent: (wins / current.length) * 100,
      tiltDeltaKd,
    });
    current = [];
  }

  for (const m of withDates) {
    if (current.length > 0 && m.date.getTime() - current[current.length - 1].date.getTime() > SESSION_GAP_MS) {
      flush();
    }
    current.push(m);
  }
  flush();

  return sessions.reverse();
}
