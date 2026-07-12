import { rankGlowColor, rankInfo } from "./format";
import type { Overview } from "./stats";

// Données de la "carte de visite" de profil (backlog #74) — pendant de recapCard.ts mais
// pour un profil entier plutôt qu'un match précis. Dérivées de données déjà chargées par
// Home.tsx (compte, rang courant, overview agrégé) : aucun appel réseau ici. Le rendu
// canvas vit dans components/ProfileCardModal.tsx.

export interface ProfileCardData {
  playerName: string;
  playerTag: string;
  region: string;
  rankLabel: string;
  rankColorHex: string;
  rr: number | null;
  played: number;
  wins: number;
  losses: number;
  winPercent: number;
  kd: string;
  hsPercent: number;
  acs: number;
  topAgentName: string | null;
}

export function buildProfileCardData(params: {
  name: string;
  tag: string;
  region: string;
  currentTier: number | null | undefined;
  rr: number | null | undefined;
  overview: Overview | null;
}): ProfileCardData {
  const { name, tag, region, currentTier, rr, overview } = params;
  const rank = rankInfo(currentTier);

  return {
    playerName: name,
    playerTag: tag,
    region,
    rankLabel: rank.name,
    rankColorHex: rankGlowColor(currentTier),
    rr: rr ?? null,
    played: overview?.played ?? 0,
    wins: overview?.wins ?? 0,
    losses: overview?.losses ?? 0,
    winPercent: overview?.winPercent ?? 0,
    kd: overview?.kd ?? "0.00",
    hsPercent: overview?.hsPercent ?? 0,
    acs: overview?.acs ?? 0,
    topAgentName: overview?.topAgent?.name ?? null,
  };
}
