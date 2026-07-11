import { useQuery } from "@tanstack/react-query";

import { tauriApi } from "../lib/tauriApi";

/** Classement compétitif d'une région (écran Leaderboard, indépendant d'un joueur suivi). */
export function useLeaderboard(params: {
  region: string;
  size: number;
  startIndex: number;
  name?: string;
  tag?: string;
}) {
  const { region, size, startIndex, name, tag } = params;
  return useQuery({
    queryKey: ["leaderboard", region, size, startIndex, name, tag],
    queryFn: () => tauriApi.fetchLeaderboard(region, size, startIndex, name, tag),
    staleTime: 60_000,
  });
}

/** Statut serveur (incidents/maintenances) — rafraîchi périodiquement pour le bandeau
 * d'alerte global. */
export function useServerStatus(region: string | undefined) {
  return useQuery({
    queryKey: ["status", region],
    queryFn: () => tauriApi.fetchStatus(region!),
    enabled: Boolean(region),
    refetchInterval: 3 * 60_000,
    staleTime: 60_000,
  });
}

export function useQueueStatus(region: string | undefined) {
  return useQuery({
    queryKey: ["queue_status", region],
    queryFn: () => tauriApi.fetchQueueStatus(region!),
    enabled: Boolean(region),
    staleTime: 60_000,
  });
}

export function useEsportsSchedule(params: { region?: string; league?: string }) {
  const { region, league } = params;
  return useQuery({
    queryKey: ["esports_schedule", region, league],
    queryFn: () => tauriApi.fetchEsportsSchedule(region, league),
    staleTime: 5 * 60_000,
  });
}
