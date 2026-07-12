// Formatage KDA / pourcentages / durées / dates, et mapping des tiers de rank Henrik.
// Table de correspondance tier -> nom (README §4) : 0-2 Unranked, 3-5 Iron, 6-8 Bronze,
// 9-11 Silver, 12-14 Gold, 15-17 Platinum, 18-20 Diamond, 21-23 Ascendant,
// 24-26 Immortal, 27 Radiant.

import i18n from "../i18n";
import type { MatchEntry } from "./tauriApi";

export interface RankInfo {
  name: string;
  colorClass: string;
  iconUrl: string;
}

const TIER_ICON_SET = "03621f52-342b-cf4e-4f86-9350a49c6d04";

// Les composants appelants utilisent presque tous `useTranslation()` pour leur propre
// texte, ce qui les abonne déjà à l'évènement `languageChanged` d'i18next et les fait
// re-render au changement de langue — ces fonctions pures relisent alors `i18n.t()` avec
// la langue à jour sans logique de souscription supplémentaire ici.
const RANK_NAME_KEYS: Array<[max: number, key: string, colorClass: string]> = [
  [2, "format:rank.unranked", "text-lo"],
  [5, "format:rank.iron", "text-rank-iron"],
  [8, "format:rank.bronze", "text-rank-bronze"],
  [11, "format:rank.silver", "text-rank-silver"],
  [14, "format:rank.gold", "text-rank-gold"],
  [17, "format:rank.platinum", "text-rank-platinum"],
  [20, "format:rank.diamond", "text-rank-diamond"],
  [23, "format:rank.ascendant", "text-rank-ascendant"],
  [26, "format:rank.immortal", "text-rank-immortal"],
  [27, "format:rank.radiant", "text-rank-radiant"],
];

export function rankIconUrl(tier: number): string {
  return `https://media.valorant-api.com/competitivetiers/${TIER_ICON_SET}/${tier}/largeicon.png`;
}

/** Icône d'agent depuis son UUID Henrik (NamedRef.id) — même CDN que les rangs. */
export function agentIconUrl(agentId: string): string {
  return `https://media.valorant-api.com/agents/${agentId}/displayicon.png`;
}

/** Image de carte de joueur depuis son UUID (AccountData.card) — même CDN. */
export function playerCardIconUrl(cardId: string): string {
  return `https://media.valorant-api.com/playercards/${cardId}/smallart.png`;
}

export function rankInfo(tier: number | null | undefined): RankInfo {
  const t = tier ?? 0;
  // Un tier au-delà de Radiant (27) ne devrait jamais arriver côté Henrik, mais mieux
  // vaut retomber sur le rang le plus haut connu que sur "Non classé" si ça arrive un
  // jour (nouveau rang ajouté par Riot avant mise à jour de cette table).
  const [, nameKey, colorClass] =
    RANK_NAME_KEYS.find(([max]) => t <= max) ?? RANK_NAME_KEYS[RANK_NAME_KEYS.length - 1];
  return { name: i18n.t(nameKey), colorClass, iconUrl: rankIconUrl(t) };
}

const RANK_GLOW_COLORS: Array<[max: number, hex: string]> = [
  [2, "#737373"],
  [5, "#5c5c5c"],
  [8, "#8a5a35"],
  [11, "#9fa6ad"],
  [14, "#d4af37"],
  [17, "#3ba8a0"],
  [20, "#a672e0"],
  [23, "#3ecf8e"],
  [26, "#c23b6c"],
  [27, "#f4e285"],
];

const FULL_TIER_KEYS: Array<{ tier: number; rankKey: string; sub: number | null }> = [
  { tier: 3, rankKey: "format:rank.iron", sub: 1 },
  { tier: 4, rankKey: "format:rank.iron", sub: 2 },
  { tier: 5, rankKey: "format:rank.iron", sub: 3 },
  { tier: 6, rankKey: "format:rank.bronze", sub: 1 },
  { tier: 7, rankKey: "format:rank.bronze", sub: 2 },
  { tier: 8, rankKey: "format:rank.bronze", sub: 3 },
  { tier: 9, rankKey: "format:rank.silver", sub: 1 },
  { tier: 10, rankKey: "format:rank.silver", sub: 2 },
  { tier: 11, rankKey: "format:rank.silver", sub: 3 },
  { tier: 12, rankKey: "format:rank.gold", sub: 1 },
  { tier: 13, rankKey: "format:rank.gold", sub: 2 },
  { tier: 14, rankKey: "format:rank.gold", sub: 3 },
  { tier: 15, rankKey: "format:rank.platinum", sub: 1 },
  { tier: 16, rankKey: "format:rank.platinum", sub: 2 },
  { tier: 17, rankKey: "format:rank.platinum", sub: 3 },
  { tier: 18, rankKey: "format:rank.diamond", sub: 1 },
  { tier: 19, rankKey: "format:rank.diamond", sub: 2 },
  { tier: 20, rankKey: "format:rank.diamond", sub: 3 },
  { tier: 21, rankKey: "format:rank.ascendant", sub: 1 },
  { tier: 22, rankKey: "format:rank.ascendant", sub: 2 },
  { tier: 23, rankKey: "format:rank.ascendant", sub: 3 },
  { tier: 24, rankKey: "format:rank.immortal", sub: 1 },
  { tier: 25, rankKey: "format:rank.immortal", sub: 2 },
  { tier: 26, rankKey: "format:rank.immortal", sub: 3 },
  { tier: 27, rankKey: "format:rank.radiant", sub: null },
];

/** Backlog #13 : libellé complet (avec sous-rang) par tier Henrik, pour le sélecteur
 * d'objectif de progression — plus précis que les buckets de `RANK_NAME_KEYS` ci-dessus.
 * Recalculée à chaque appel (pas de const figée) pour rester à jour si la langue change
 * pendant que le composant appelant reste monté. */
export function getFullTierLabels(): Array<{ tier: number; label: string }> {
  return FULL_TIER_KEYS.map(({ tier, rankKey, sub }) => ({
    tier,
    label: sub === null ? i18n.t(rankKey) : i18n.t("format:tier.sub", { rank: i18n.t(rankKey), sub }),
  }));
}

export interface GoalProgress {
  percent: number;
  reached: boolean;
}

/** Backlog #13 : progression approximative vers un objectif de rank — à tier égal, se base
 * sur le RR courant vs le RR cible ; sinon sur la position relative entre les deux tiers
 * (chaque palier de rang compte pour un pas égal, faute de barème RR officiel entre rangs). */
export function computeGoalProgress(
  currentTier: number,
  currentRr: number,
  targetTier: number,
  targetRr: number | null,
): GoalProgress {
  const effectiveTargetRr = targetRr ?? 0;
  if (currentTier > targetTier || (currentTier === targetTier && currentRr >= effectiveTargetRr)) {
    return { percent: 100, reached: true };
  }
  if (currentTier === targetTier) {
    return { percent: Math.max(0, Math.min(100, (currentRr / (targetRr ?? 100)) * 100)), reached: false };
  }
  if (targetTier <= 0) {
    return { percent: 0, reached: false };
  }
  return { percent: Math.max(0, Math.min(100, (currentTier / targetTier) * 100)), reached: false };
}

/** Couleur brute (hex) du tier, pour les effets de lueur (box-shadow inline) derrière le
 * badge de rang — Tailwind ne peut pas générer de classe dynamique pour ça. */
export function rankGlowColor(tier: number | null | undefined): string {
  const t = tier ?? 0;
  return (
    RANK_GLOW_COLORS.find(([max]) => t <= max)?.[1] ??
    RANK_GLOW_COLORS[RANK_GLOW_COLORS.length - 1][1]
  );
}

export function formatKda(kills: number, deaths: number, assists: number): string {
  return `${kills}/${deaths}/${assists}`;
}

export function formatKdRatio(kills: number, deaths: number): string {
  if (deaths === 0) return kills.toFixed(2);
  return (kills / deaths).toFixed(2);
}

export function formatPercent(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`;
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return i18n.t("format:unknown");
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return i18n.t("format:duration.value", { minutes, seconds: seconds.toString().padStart(2, "0") });
}

/** "il y a 3h" / "3h ago", etc. — pour les lignes de MatchHistory. */
export function formatRelativeTime(isoOrUnix: string | number | null | undefined): string {
  if (!isoOrUnix) return i18n.t("format:unknown");
  const date = typeof isoOrUnix === "number" ? new Date(isoOrUnix * 1000) : new Date(isoOrUnix);
  if (Number.isNaN(date.getTime())) return i18n.t("format:unknown");

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return i18n.t("format:relative.now");
  if (diffMinutes < 60) return i18n.t("format:relative.minutes", { count: diffMinutes });
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return i18n.t("format:relative.hours", { count: diffHours });
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return i18n.t("format:relative.days", { count: diffDays });
  const diffMonths = Math.floor(diffDays / 30);
  return i18n.t("format:relative.months", { count: diffMonths });
}

/** "10/07 à 14:32" / "10/07 at 14:32" — pour le bandeau "Données en cache" (README §6). */
export function formatDateTimeShort(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return i18n.t("format:dateTimeShort.unknown");
  const date = new Date(unixSeconds * 1000);
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return i18n.t("format:dateTimeShort.value", { day, month, hours, minutes });
}

const REGION_KEYS = [
  { value: "eu", key: "format:region.eu" },
  { value: "na", key: "format:region.na" },
  { value: "ap", key: "format:region.ap" },
  { value: "kr", key: "format:region.kr" },
] as const;

/** Recalculée à chaque appel (pas de const figée) pour rester à jour au changement de
 * langue tant qu'un composant appelant reste monté. */
export function getRegions(): Array<{ value: string; label: string }> {
  return REGION_KEYS.map(({ value, key }) => ({ value, label: i18n.t(key) }));
}

/** Découpe un Riot ID "pseudo#tag" saisi tel quel dans le champ de recherche. */
export function splitRiotId(input: string): { name: string; tag: string } | null {
  const trimmed = input.trim();
  const idx = trimmed.lastIndexOf("#");
  if (idx <= 0 || idx === trimmed.length - 1) return null;
  return { name: trimmed.slice(0, idx), tag: trimmed.slice(idx + 1) };
}

const SESSION_GAP_MS = 30 * 60 * 1000;

export interface MatchSession {
  matches: MatchEntry[];
  startedAt: string | null;
  wins: number;
  losses: number;
}

/** Backlog #14 : regroupe les matchs (triés du plus récent au plus ancien, comme renvoyé
 * par Henrik) en sessions de jeu — un écart de plus de 30 min entre deux matchs
 * consécutifs marque le début d'une nouvelle session. */
export function groupMatchesIntoSessions(matches: MatchEntry[], puuid: string): MatchSession[] {
  const sessions: MatchSession[] = [];
  let current: MatchSession | null = null;
  let previousTimestamp: number | null = null;

  for (const match of matches) {
    const startedAt = match.metadata.started_at;
    const timestamp = startedAt ? new Date(startedAt).getTime() : null;
    const validTimestamp = timestamp !== null && !Number.isNaN(timestamp) ? timestamp : null;
    const gapExceeded =
      previousTimestamp !== null &&
      validTimestamp !== null &&
      previousTimestamp - validTimestamp > SESSION_GAP_MS;

    if (!current || gapExceeded) {
      current = { matches: [], startedAt, wins: 0, losses: 0 };
      sessions.push(current);
    }

    current.matches.push(match);
    const player = match.players.find((p) => p.puuid === puuid);
    const team = match.teams.find((t) => t.team_id === player?.team_id);
    if (team?.won === true) current.wins += 1;
    else if (team?.won === false) current.losses += 1;

    if (validTimestamp !== null) previousTimestamp = validTimestamp;
  }

  return sessions;
}

/** "Session du 10/07" / "Session of 10/07" — pour l'en-tête de groupe dans MatchHistory.tsx. */
export function formatSessionHeader(iso: string | null): string {
  if (!iso) return i18n.t("format:session.label");
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return i18n.t("format:session.label");
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  return i18n.t("format:session.dated", { day, month });
}
