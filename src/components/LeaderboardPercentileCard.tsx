import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useLeaderboard } from "../hooks/useMeta";
import { computeLeaderboardPercentile } from "../lib/stats";
import StatCard from "./StatCard";

interface LeaderboardPercentileCardProps {
  region: string | undefined;
  name: string | undefined;
  tag: string | undefined;
  currentTier: number | null | undefined;
}

/** Backlog #54 : situe le joueur suivi dans son tier via le leaderboard régional déjà
 * branché (`fetch_leaderboard`, cache 15 min) — n'affiche rien si le joueur n'apparaît pas
 * dans le leaderboard (hors Immortal/Radiant, ce que Henrik seul expose). */
export default function LeaderboardPercentileCard({
  region,
  name,
  tag,
  currentTier,
}: LeaderboardPercentileCardProps) {
  const { t } = useTranslation("home");
  // Le leaderboard n'a de sens que pour les tiers les plus hauts (Immortal/Radiant, tier
  // 24+, voir lib/format.ts) — évite un appel réseau inutile pour la grande majorité des
  // joueurs suivis.
  const eligible = Boolean(region && name && tag && currentTier != null && currentTier >= 24);
  const leaderboard = useLeaderboard({
    region: region ?? "",
    size: 1,
    startIndex: 1,
    name: eligible ? name : undefined,
    tag: eligible ? tag : undefined,
  });

  const rank = leaderboard.data?.data.players[0]?.leaderboard_rank ?? null;
  const percentile = useMemo(
    () =>
      rank != null && leaderboard.data
        ? computeLeaderboardPercentile(rank, leaderboard.data.data.thresholds)
        : null,
    [rank, leaderboard.data],
  );

  if (!eligible || leaderboard.isLoading || !percentile) return null;

  return (
    <StatCard
      label={t("leaderboardPercentile.label")}
      value={t("leaderboardPercentile.value", { rank: percentile.rank })}
      hint={
        percentile.playersInTier
          ? t("leaderboardPercentile.hintWithPercentile", {
              tier: percentile.tierName,
              percent: percentile.percentileInTier.toFixed(0),
            })
          : t("leaderboardPercentile.hint", { tier: percentile.tierName })
      }
    />
  );
}
