import type { DuoStat } from "./tauriApi";

// TODO Fonctionnalités#3/#36 : "coéquipier de confiance" — badge calculé (volume + winrate
// ensemble), au-delà du simple pourcentage déjà affiché dans Duo.tsx. Seuils volontairement
// simples et documentés plutôt qu'un score continu : un badge binaire/à deux paliers reste
// lisible d'un coup d'œil dans une grille de cartes, contrairement à un pourcentage de
// confiance qui demanderait sa propre légende.
export type TrustLevel = "gold" | "silver" | null;

const GOLD_MIN_MATCHES = 15;
const GOLD_MIN_WIN_PERCENT = 55;
const SILVER_MIN_MATCHES = 8;
const SILVER_MIN_WIN_PERCENT = 50;

export function computeTrustLevel(duo: Pick<DuoStat, "matches_played" | "matches_won">): TrustLevel {
  const winPercent = duo.matches_played > 0 ? (duo.matches_won / duo.matches_played) * 100 : 0;
  if (duo.matches_played >= GOLD_MIN_MATCHES && winPercent >= GOLD_MIN_WIN_PERCENT) return "gold";
  if (duo.matches_played >= SILVER_MIN_MATCHES && winPercent >= SILVER_MIN_WIN_PERCENT) return "silver";
  return null;
}
