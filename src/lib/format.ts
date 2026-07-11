// Formatage KDA / pourcentages / durées / dates, et mapping des tiers de rank Henrik.
// Table de correspondance tier -> nom (README §4) : 0-2 Unranked, 3-5 Iron, 6-8 Bronze,
// 9-11 Silver, 12-14 Gold, 15-17 Platinum, 18-20 Diamond, 21-23 Ascendant,
// 24-26 Immortal, 27 Radiant.

export interface RankInfo {
  name: string;
  colorClass: string;
  iconUrl: string;
}

const TIER_ICON_SET = "03621f52-342b-cf4e-4f86-9350a49c6d04";

const RANK_NAMES: Array<[max: number, name: string, colorClass: string]> = [
  [2, "Non classé", "text-lo"],
  [5, "Fer", "text-rank-iron"],
  [8, "Bronze", "text-rank-bronze"],
  [11, "Argent", "text-rank-silver"],
  [14, "Or", "text-rank-gold"],
  [17, "Platine", "text-rank-platinum"],
  [20, "Diamant", "text-rank-diamond"],
  [23, "Ascendant", "text-rank-ascendant"],
  [26, "Immortel", "text-rank-immortal"],
  [27, "Radiant", "text-rank-radiant"],
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
  const [, name, colorClass] =
    RANK_NAMES.find(([max]) => t <= max) ?? RANK_NAMES[RANK_NAMES.length - 1];
  return { name, colorClass, iconUrl: rankIconUrl(t) };
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
  if (!ms || ms <= 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}min ${seconds.toString().padStart(2, "0")}s`;
}

/** "il y a 3h", "il y a 2j", etc. — pour les lignes de MatchHistory. */
export function formatRelativeTime(isoOrUnix: string | number | null | undefined): string {
  if (!isoOrUnix) return "—";
  const date = typeof isoOrUnix === "number" ? new Date(isoOrUnix * 1000) : new Date(isoOrUnix);
  if (Number.isNaN(date.getTime())) return "—";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return "à l'instant";
  if (diffMinutes < 60) return `il y a ${diffMinutes}min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `il y a ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `il y a ${diffDays}j`;
  const diffMonths = Math.floor(diffDays / 30);
  return `il y a ${diffMonths} mois`;
}

/** "10/07 à 14:32" — pour le bandeau "Données en cache" (README §6). */
export function formatDateTimeShort(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return "date inconnue";
  const date = new Date(unixSeconds * 1000);
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${day}/${month} à ${hours}:${minutes}`;
}

export const REGIONS = [
  { value: "eu", label: "Europe" },
  { value: "na", label: "Amérique du Nord" },
  { value: "ap", label: "Asie-Pacifique" },
  { value: "kr", label: "Corée" },
] as const;

/** Découpe un Riot ID "pseudo#tag" saisi tel quel dans le champ de recherche. */
export function splitRiotId(input: string): { name: string; tag: string } | null {
  const trimmed = input.trim();
  const idx = trimmed.lastIndexOf("#");
  if (idx <= 0 || idx === trimmed.length - 1) return null;
  return { name: trimmed.slice(0, idx), tag: trimmed.slice(idx + 1) };
}
