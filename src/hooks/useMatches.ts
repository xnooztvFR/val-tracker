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
