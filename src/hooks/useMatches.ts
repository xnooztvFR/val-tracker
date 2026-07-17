import { useQuery } from "@tanstack/react-query";

import { tauriApi } from "../lib/tauriApi";

export function useMatches(params: {
  region?: string;
  name?: string;
  tag?: string;
  size?: number;
}) {
  const { region, name, tag, size = 20 } = params;
  return useQuery({
    queryKey: ["matches", region, name, tag, size],
    queryFn: () => tauriApi.fetchMatches(region!, name!, tag!, size),
    enabled: Boolean(region && name && tag),
  });
}

export function useMatchDetail(matchId: string | undefined) {
  return useQuery({
    queryKey: ["match_detail", matchId],
    queryFn: () => tauriApi.fetchMatchDetail(matchId!),
    enabled: Boolean(matchId),
    staleTime: Infinity,
  });
}

/** Backlog #52 : winrate ATK/DEF agrégé côté Rust sur les détails de match déjà en cache
 * (voir `useMatchDetail`) — n'engage aucun fetch réseau, se recalcule juste à chaque
 * consultation d'un nouveau match en détail (queryKey partagée avec `match_detail`). */
export function useSideWinrate(puuid: string | undefined) {
  return useQuery({
    queryKey: ["side_winrate", puuid],
    queryFn: () => tauriApi.getSideWinrate(puuid!),
    enabled: Boolean(puuid),
  });
}

/** TODO stats & analyse joueur : winrate par type d'achat (eco/half-buy/full-buy), même
 * principe que `useSideWinrate` — agrégé côté Rust sur les détails de match déjà en cache. */
export function useEconomyStats(puuid: string | undefined) {
  return useQuery({
    queryKey: ["economy_stats", puuid],
    queryFn: () => tauriApi.getEconomyStats(puuid!),
    enabled: Boolean(puuid),
  });
}

/** TODO stats & analyse joueur : comparaison à la moyenne perso sur une carte, même principe
 * que `useEconomyStats` — agrégé côté Rust sur les détails de match déjà en cache pour cette
 * carte précisément. */
export function useMapAverageStats(puuid: string | undefined, map: string | undefined) {
  return useQuery({
    queryKey: ["map_average_stats", puuid, map],
    queryFn: () => tauriApi.getMapAverageStats(puuid!, map!),
    enabled: Boolean(puuid && map),
  });
}

/** TODO stats & analyse joueur : winrate solo-queue vs party, même principe que
 * `useSideWinrate` — agrégé côté Rust sur les détails de match déjà en cache. */
export function useQueueStats(puuid: string | undefined) {
  return useQuery({
    queryKey: ["queue_stats", puuid],
    queryFn: () => tauriApi.getQueueStats(puuid!),
    enabled: Boolean(puuid),
  });
}

/** TODO Fonctionnalités#14 : recommandation de carte/agent basée sur l'historique perso. */
export function useRecommendations(puuid: string | undefined, minMatches = 3) {
  return useQuery({
    queryKey: ["recommendations", puuid, minMatches],
    queryFn: () => tauriApi.getRecommendations(puuid!, minMatches),
    enabled: Boolean(puuid),
  });
}

/** TODO Fonctionnalités#4/#33 : moments forts (clutch/multikill) d'un match précis, mêmes
 * données que `useMatchDetail` déjà en cache — aucun fetch réseau supplémentaire. */
export function useMatchHighlights(matchId: string | undefined, puuid: string | undefined) {
  return useQuery({
    queryKey: ["match_highlights", matchId, puuid],
    queryFn: () => tauriApi.getMatchHighlights(matchId!, puuid!),
    enabled: Boolean(matchId && puuid),
  });
}

/** TODO Fonctionnalités#4/#33 : moments forts agrégés sur tous les matchs déjà en cache pour
 * ce puuid — alimente les badges dans la liste MatchHistory sans rouvrir chaque match. */
export function useAllMatchHighlights(puuid: string | undefined) {
  return useQuery({
    queryKey: ["all_match_highlights", puuid],
    queryFn: () => tauriApi.getAllMatchHighlights(puuid!),
    enabled: Boolean(puuid),
  });
}

/** TODO Fonctionnalités#1 : "Tracker Score" composite /1000. Contrairement aux autres stats
 * dérivées (`useRecommendations`, etc.), backfill automatiquement le cache de détail pour les
 * 100 derniers matchs compétitifs côté Rust (voir `commands::get_tracker_score`) — le score
 * doit couvrir tout l'historique récent, pas seulement les matchs déjà ouverts manuellement.
 * `staleTime` généreux : le backfill réseau est coûteux (jusqu'à ~100 requêtes rate-limitées
 * sur un profil jamais consulté), pas la peine de le rejouer à chaque focus d'onglet. */
export function useTrackerScore(
  puuid: string | undefined,
  region: string | undefined,
  name: string | undefined,
  tag: string | undefined,
  currentTier: number | null | undefined,
) {
  return useQuery({
    queryKey: ["tracker_score", puuid, region, name, tag, currentTier],
    queryFn: () => tauriApi.getTrackerScore(puuid!, region!, name!, tag!, currentTier ?? null),
    enabled: Boolean(puuid && region && name && tag),
    staleTime: 10 * 60 * 1000,
  });
}
