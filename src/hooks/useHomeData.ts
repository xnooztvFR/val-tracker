import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAccount, useAccountTimeline, useMmr, useMmrHistory, useRankSnapshots } from "./usePlayer";
import { useMatches } from "./useMatches";
import { useCountdown } from "./useCountdown";
import { SAMPLE_SIZES, type SampleSize } from "../components/SampleSizeSwitch";
import { tauriApi } from "../lib/tauriApi";
import { computeOverview, computePeriodRecap, type PeriodRecap } from "../lib/stats";

const MMR_TTL_SECONDS = 600;
// Backlog : auto-actualisation périodique — rafraîchit toutes les données (MMR, matchs,
// historique de rang) si l'utilisateur n'a pas cliqué sur "Rafraîchir" entre-temps (le
// minuteur est réarmé à chaque refresh manuel, voir scheduleAutoRefresh).
const AUTO_REFRESH_INTERVAL_MS = 10 * 60_000;

/** Regroupe tout le chargement de données (compte, MMR, matchs, historique, snapshots,
 * timeline) et la planification de l'auto-refresh de l'écran Accueil, pour que Home.tsx
 * reste une simple composition de sous-composants d'affichage. */
export function useHomeData(region: string | undefined, name: string | undefined, tag: string | undefined) {
  const [sampleSize, setSampleSize] = useState<SampleSize>(SAMPLE_SIZES[0]);
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const account = useAccount(name, tag);
  const puuid = account.data?.data.puuid;
  const mmr = useMmr({ puuid, region, name, tag });
  const snapshots = useRankSnapshots(puuid);
  const mmrHistory = useMmrHistory({ region, name, tag });
  const accountTimeline = useAccountTimeline(puuid);
  const matches = useMatches({ region, name, tag, size: sampleSize });
  // Backlog #12 : la note libre vit sur `tracked_players` (upsertée à chaque vue de profil
  // par `fetch_account`) — pas de commande dédiée "get one", on relit la liste récente et on
  // filtre par puuid plutôt que d'ajouter un aller-retour réseau supplémentaire.
  const trackedPlayer = useQuery({
    queryKey: ["trackedPlayer", puuid],
    queryFn: () => tauriApi.listTrackedPlayers(200),
    enabled: Boolean(puuid),
    select: (players) => players.find((p) => p.puuid === puuid) ?? null,
  });

  const remaining = useCountdown(mmr.data?.cached_at, MMR_TTL_SECONDS);

  const overview = useMemo(
    () => (matches.data && puuid ? computeOverview(matches.data.data, puuid) : null),
    [matches.data, puuid],
  );

  // Backlog #36 : pulse sur le badge de rang si le dernier snapshot enregistré diffère du
  // précédent ET vient d'être écrit il y a moins de 2 min (cette session) — pas d'animation
  // en revisitant un profil dont le rank a changé il y a plusieurs jours.
  const rankPulse = useMemo((): "up" | "down" | null => {
    const list = snapshots.data;
    if (!list || list.length < 2) return null;
    const latest = list[list.length - 1];
    const previous = list[list.length - 2];
    if (latest.tier === previous.tier) return null;
    const ageSeconds = Date.now() / 1000 - latest.recorded_at;
    if (ageSeconds > 120) return null;
    return latest.tier > previous.tier ? "up" : "down";
  }, [snapshots.data]);

  const autoRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Force-refetch MMR + matchs + historique de rang (le snapshot local est réécrit côté
  // Rust dans fetch_mmr dès que la donnée vient réellement du réseau, voir commands.rs).
  const refreshAll = useCallback(async () => {
    if (!puuid || !region || !name || !tag) return;
    setRefreshing(true);
    try {
      await Promise.all([
        tauriApi.fetchMmr(puuid, region, name, tag, true),
        tauriApi.fetchMatches(region, name, tag, sampleSize, true),
        tauriApi.fetchMmrHistory(region, name, tag, true),
      ]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mmr", puuid, region, name, tag] }),
        queryClient.invalidateQueries({ queryKey: ["matches", region, name, tag, sampleSize] }),
        queryClient.invalidateQueries({ queryKey: ["mmr_history", region, name, tag] }),
        queryClient.invalidateQueries({ queryKey: ["rank_snapshots", puuid] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [puuid, region, name, tag, sampleSize, queryClient]);

  const scheduleAutoRefresh = useCallback(() => {
    if (autoRefreshTimer.current) clearTimeout(autoRefreshTimer.current);
    autoRefreshTimer.current = setTimeout(() => {
      void refreshAll().finally(scheduleAutoRefresh);
    }, AUTO_REFRESH_INTERVAL_MS);
  }, [refreshAll]);

  useEffect(() => {
    scheduleAutoRefresh();
    return () => {
      if (autoRefreshTimer.current) clearTimeout(autoRefreshTimer.current);
    };
  }, [scheduleAutoRefresh]);

  const handleRefresh = useCallback(async () => {
    await refreshAll();
    scheduleAutoRefresh();
  }, [refreshAll, scheduleAutoRefresh]);

  // Backlog #56 : agrégation locale sur les matchs déjà chargés (sampleSize courant) et les
  // snapshots de rang locaux — aucun fetch supplémentaire déclenché ici.
  const buildPeriodRecap = useCallback(
    (period: "week" | "month"): PeriodRecap | null => {
      if (!puuid || !matches.data) return null;
      return computePeriodRecap(matches.data.data, snapshots.data ?? [], puuid, period);
    },
    [puuid, matches.data, snapshots.data],
  );

  return {
    sampleSize,
    setSampleSize,
    refreshing,
    account,
    puuid,
    mmr,
    snapshots,
    mmrHistory,
    accountTimeline,
    matches,
    trackedPlayer,
    remaining,
    overview,
    rankPulse,
    handleRefresh,
    buildPeriodRecap,
  };
}
