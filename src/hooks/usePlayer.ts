import { useQuery } from "@tanstack/react-query";

import { tauriApi } from "../lib/tauriApi";

export function useAccount(name: string | undefined, tag: string | undefined) {
  return useQuery({
    queryKey: ["account", name, tag],
    queryFn: () => tauriApi.fetchAccount(name!, tag!),
    enabled: Boolean(name && tag),
  });
}

export function useMmr(params: {
  puuid?: string;
  region?: string;
  name?: string;
  tag?: string;
}) {
  const { puuid, region, name, tag } = params;
  return useQuery({
    queryKey: ["mmr", puuid, region, name, tag],
    queryFn: () => tauriApi.fetchMmr(puuid!, region!, name!, tag!),
    enabled: Boolean(puuid && region && name && tag),
  });
}

export function useRankSnapshots(puuid: string | undefined) {
  return useQuery({
    queryKey: ["rank_snapshots", puuid],
    queryFn: () => tauriApi.listRankSnapshots(puuid!),
    enabled: Boolean(puuid),
  });
}

/** Historique de RR côté serveur (v2/mmr-history) — complète les snapshots locaux avec
 * les parties jouées avant la première ouverture de l'app sur ce profil. */
export function useMmrHistory(params: { region?: string; name?: string; tag?: string }) {
  const { region, name, tag } = params;
  return useQuery({
    queryKey: ["mmr_history", region, name, tag],
    queryFn: () => tauriApi.fetchMmrHistory(region!, name!, tag!),
    enabled: Boolean(region && name && tag),
    staleTime: 5 * 60_000,
  });
}

/** Stats de duo/squad (V3) accumulées localement au fil des matchs consultés (voir
 * commands::record_party_from_match) — ne déclenche aucun appel réseau, relit juste la
 * table locale `party_matches`. `minMatches` filtre les parties de passage. */
export function useDuoStats(puuid: string | undefined, minMatches = 2) {
  return useQuery({
    queryKey: ["duo_stats", puuid, minMatches],
    queryFn: () => tauriApi.listDuoStats(puuid!, minMatches),
    enabled: Boolean(puuid),
  });
}

/** Backlog #23 : extension "squad" (trios) de useDuoStats. */
export function useSquadStats(puuid: string | undefined, minMatches = 2) {
  return useQuery({
    queryKey: ["squad_stats", puuid, minMatches],
    queryFn: () => tauriApi.listSquadStats(puuid!, minMatches),
    enabled: Boolean(puuid),
  });
}
