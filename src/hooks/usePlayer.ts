import { useQuery } from "@tanstack/react-query";

import { tauriApi } from "../lib/tauriApi";
import { useUiStore } from "../store/uiStore";

// `staleTime` alignés sur les TTL SQLite côté Rust (`api/henrik/mod.rs::TTL_ACCOUNT`/
// `TTL_MMR`) : sans ça, React Query considère la donnée périmée dès qu'un composant se
// remonte (staleTime par défaut = 0) et redéclenche un `invoke()` alors que le cache Rust
// aurait de toute façon servi la même donnée fraîche — un aller-retour IPC inutile.
const ACCOUNT_STALE_TIME_MS = 60 * 60_000; // TTL_ACCOUNT = 1h
const MMR_STALE_TIME_MS = 10 * 60_000; // TTL_MMR = 10 min

export function useAccount(name: string | undefined, tag: string | undefined) {
  // Backlog Fonctionnalités#11 : mode incognito ponctuel — n'upsert pas ce profil dans
  // `tracked_players` côté backend tant que le toggle est actif (voir uiStore.incognito et
  // Search.tsx). Lu au moment de l'appel réseau, pas dans la queryKey : le contenu renvoyé
  // par l'API est identique avec ou sans enregistrement, seul l'effet de bord change.
  const incognito = useUiStore((s) => s.incognito);
  return useQuery({
    queryKey: ["account", name, tag],
    queryFn: () => tauriApi.fetchAccount(name!, tag!, false, !incognito),
    enabled: Boolean(name && tag),
    staleTime: ACCOUNT_STALE_TIME_MS,
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
    staleTime: MMR_STALE_TIME_MS,
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
/** TODO Social/multi-comptes : `sinceDays` (`null` = toutes les périodes) convertit en
 * timestamp Unix côté frontend avant l'appel — garde les panneaux duo/squad/rivalité
 * pertinents dans le temps ("coéquipier des 30 derniers jours" vs "occasionnel il y a un an"). */
function sinceDaysToTs(sinceDays: number | null): number | null {
  return sinceDays == null ? null : Math.floor(Date.now() / 1000) - sinceDays * 24 * 60 * 60;
}

export function useDuoStats(puuid: string | undefined, minMatches = 2, sinceDays: number | null = null) {
  return useQuery({
    queryKey: ["duo_stats", puuid, minMatches, sinceDays],
    queryFn: () => tauriApi.listDuoStats(puuid!, minMatches, sinceDaysToTs(sinceDays)),
    enabled: Boolean(puuid),
  });
}

/** Backlog #23 : extension "squad" (trios) de useDuoStats. */
export function useSquadStats(puuid: string | undefined, minMatches = 2, sinceDays: number | null = null) {
  return useQuery({
    queryKey: ["squad_stats", puuid, minMatches, sinceDays],
    queryFn: () => tauriApi.listSquadStats(puuid!, minMatches, sinceDaysToTs(sinceDays)),
    enabled: Boolean(puuid),
  });
}

/** TODO Fonctionnalités#1 : historique de composition d'équipe — rosters complets à 5. */
export function useFullRosterStats(puuid: string | undefined, minMatches = 2, sinceDays: number | null = null) {
  return useQuery({
    queryKey: ["full_roster_stats", puuid, minMatches, sinceDays],
    queryFn: () => tauriApi.listFullRosterStats(puuid!, minMatches, sinceDaysToTs(sinceDays)),
    enabled: Boolean(puuid),
  });
}

/** Backlog #58 : rivalité suivie en continu, pendant "adversaire" de useDuoStats —
 * alimentée par commands::record_party_from_match à chaque consultation d'un match où le
 * joueur suivi affrontait un adversaire déjà croisé, aucun appel réseau ici non plus. */
export function useRivalryStats(puuid: string | undefined, minMatches = 2, sinceDays: number | null = null) {
  return useQuery({
    queryKey: ["rivalry_stats", puuid, minMatches, sinceDays],
    queryFn: () => tauriApi.listRivalryStats(puuid!, minMatches, sinceDaysToTs(sinceDays)),
    enabled: Boolean(puuid),
  });
}

/** Backlog #57 : frise "vie du compte" (rank_snapshots + objectifs hebdo atteints + note
 * perso), entièrement locale — aucun appel réseau. */
export function useAccountTimeline(puuid: string | undefined) {
  return useQuery({
    queryKey: ["account_timeline", puuid],
    queryFn: () => tauriApi.listAccountTimeline(puuid!),
    enabled: Boolean(puuid),
  });
}
