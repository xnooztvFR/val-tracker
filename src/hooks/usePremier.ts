import { useQuery } from "@tanstack/react-query";

import { tauriApi } from "../lib/tauriApi";

export function usePremierSearch(name?: string, tag?: string) {
  return useQuery({
    queryKey: ["premier_search", name, tag],
    queryFn: () => tauriApi.searchPremierTeams(name, tag),
    enabled: Boolean(name),
    staleTime: 60_000,
  });
}

export function usePremierLeaderboard(region: string) {
  return useQuery({
    queryKey: ["premier_leaderboard", region],
    queryFn: () => tauriApi.fetchPremierLeaderboard(region),
    staleTime: 60_000,
  });
}

export function usePremierTeam(params: { name?: string; tag?: string; teamId?: string }) {
  const { name, tag, teamId } = params;
  return useQuery({
    queryKey: ["premier_team", name, tag, teamId],
    queryFn: () => tauriApi.fetchPremierTeam({ name, tag, teamId }),
    enabled: Boolean((name && tag) || teamId),
    staleTime: 60_000,
  });
}

export function usePremierTeamHistory(params: { name?: string; tag?: string; teamId?: string }) {
  const { name, tag, teamId } = params;
  return useQuery({
    queryKey: ["premier_team_history", name, tag, teamId],
    queryFn: () => tauriApi.fetchPremierTeamHistory({ name, tag, teamId }),
    enabled: Boolean((name && tag) || teamId),
    staleTime: 60_000,
  });
}
