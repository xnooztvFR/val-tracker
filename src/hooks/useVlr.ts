import { useQuery } from "@tanstack/react-query";

import { tauriApi } from "../lib/tauriApi";

export function useVlrEvents(region?: string, eventType?: string, page = 1) {
  return useQuery({
    queryKey: ["vlr_events", region, eventType, page],
    queryFn: () => tauriApi.fetchVlrEvents(region, eventType, page),
    staleTime: 5 * 60_000,
  });
}

export function useVlrEventMatches(eventId: number | undefined) {
  return useQuery({
    queryKey: ["vlr_event_matches", eventId],
    queryFn: () => tauriApi.fetchVlrEventMatches(eventId!),
    enabled: Boolean(eventId),
    staleTime: 5 * 60_000,
  });
}

export function useVlrMatch(matchId: number | undefined) {
  return useQuery({
    queryKey: ["vlr_match", matchId],
    queryFn: () => tauriApi.fetchVlrMatch(matchId!),
    enabled: Boolean(matchId),
    staleTime: 5 * 60_000,
  });
}

export function useVlrTeam(teamId: number | undefined) {
  return useQuery({
    queryKey: ["vlr_team", teamId],
    queryFn: () => tauriApi.fetchVlrTeam(teamId!),
    enabled: Boolean(teamId),
    staleTime: 5 * 60_000,
  });
}

export function useVlrTeamMatches(teamId: number | undefined, page = 1) {
  return useQuery({
    queryKey: ["vlr_team_matches", teamId, page],
    queryFn: () => tauriApi.fetchVlrTeamMatches(teamId!, page),
    enabled: Boolean(teamId),
    staleTime: 5 * 60_000,
  });
}

export function useVlrPlayer(playerId: number | undefined, timespan?: string) {
  return useQuery({
    queryKey: ["vlr_player", playerId, timespan],
    queryFn: () => tauriApi.fetchVlrPlayer(playerId!, timespan),
    enabled: Boolean(playerId),
    staleTime: 5 * 60_000,
  });
}

export function useVlrPlayerMatches(playerId: number | undefined, page = 1) {
  return useQuery({
    queryKey: ["vlr_player_matches", playerId, page],
    queryFn: () => tauriApi.fetchVlrPlayerMatches(playerId!, page),
    enabled: Boolean(playerId),
    staleTime: 5 * 60_000,
  });
}
