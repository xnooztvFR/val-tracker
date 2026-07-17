import { useTranslation } from "react-i18next";

import Panel from "./Panel";
import InfoTooltip from "./InfoTooltip";
import { useTrackerScore } from "../hooks/useMatches";
import type { ScoreTier } from "../lib/tauriApi";

const TIER_COLOR_CLASS: Record<ScoreTier, string> = {
  S: "text-accent",
  A: "text-accent",
  B: "text-hi",
  C: "text-lo",
  D: "text-crit",
};

interface TrackerScoreCardProps {
  puuid: string | undefined;
  region: string | undefined;
  name: string | undefined;
  tag: string | undefined;
  currentTier: number | null | undefined;
}

/** TODO Fonctionnalités#1 : "Tracker Score" composite /1000, façon tracker.gg — voir
 * `tracker_score.rs` côté Rust pour la méthodologie (benchmarks communautaires approximatifs
 * par bracket de rang). Couvre automatiquement les 100 derniers matchs compétitifs (backfill
 * réseau côté Rust, voir `useTrackerScore`), pas seulement les matchs déjà ouverts en détail.
 * N'affiche rien tant que le puuid n'est pas résolu ; un message dédié remplace la carte si
 * trop peu de matchs existent pour un score fiable. */
export default function TrackerScoreCard({ puuid, region, name, tag, currentTier }: TrackerScoreCardProps) {
  const { t } = useTranslation("componentsExtra");
  const query = useTrackerScore(puuid, region, name, tag, currentTier);
  const result = query.data;

  if (!puuid || !result) return null;

  if (result.matches_considered === 0) {
    return (
      <Panel className="p-4">
        <p className="hud-label mb-2 flex items-center gap-1">
          {t("trackerScoreCard.title")}
          <InfoTooltip text={t("trackerScoreCard.tooltip")} />
        </p>
        <p className="text-sm text-lo">{t("trackerScoreCard.notEnoughData")}</p>
      </Panel>
    );
  }

  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="hud-label flex items-center gap-1">
          {t("trackerScoreCard.title")}
          <InfoTooltip text={t("trackerScoreCard.tooltip")} />
        </p>
        <span className={`font-display text-2xl font-bold leading-none ${TIER_COLOR_CLASS[result.tier]}`}>
          {result.tier}
        </span>
      </div>

      <p className="stat-value mt-1.5 text-2xl font-bold text-hi">
        {Math.round(result.total_score)}
        <span className="ml-1.5 text-xs font-normal text-lo">{t("trackerScoreCard.subtitle", { total: 1000 })}</span>
      </p>

      <div className="mt-3 grid grid-cols-5 gap-2">
        {result.metrics.map((metric) => (
          <div key={metric.name} className="text-center">
            <p className={`stat-value text-sm font-bold ${TIER_COLOR_CLASS[metric.tier]}`}>{metric.tier}</p>
            <p className="hud-label mt-0.5 truncate text-[9px] text-lo">
              {t(`trackerScoreCard.metric.${metric.name}`)}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-lo">
        {t("trackerScoreCard.matchesConsidered", { count: result.matches_considered })}
      </p>
    </Panel>
  );
}
