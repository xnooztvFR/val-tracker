import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SkeletonScreen } from "../components/Skeleton";
import { Link, useParams } from "react-router-dom";

import { useAccount } from "../hooks/usePlayer";
import { useMatchDetail } from "../hooks/useMatches";
import ErrorState from "../components/ErrorState";
import Panel from "../components/Panel";
import RecapCardModal from "../components/RecapCardModal";
import { buildMatchReport, type EconomyTier } from "../lib/matchReport";
import { buildMatchRecapData } from "../lib/recapCard";

const TIER_LABEL_KEYS: Record<EconomyTier, string> = {
  eco: "report.tier.eco",
  force: "report.tier.force",
  full: "report.tier.full",
};

/** Rapport de match (V3) : décompose l'économie round par round et met en évidence les
 * meilleurs/pires rounds du joueur suivi — entièrement calculé côté client à partir du
 * détail de match déjà chargé par l'écran MatchDetail (aucun appel réseau ici). */
export default function MatchReport() {
  const { t } = useTranslation("matches");
  const { region, name, tag, matchId } = useParams<{
    region: string;
    name: string;
    tag: string;
    matchId: string;
  }>();

  const account = useAccount(name, tag);
  const puuid = account.data?.data.puuid;
  const detail = useMatchDetail(matchId);
  const [showRecap, setShowRecap] = useState(false);

  if (detail.isError) return <ErrorState error={detail.error} />;
  if (detail.isLoading || account.isLoading) {
    return <SkeletonScreen className="p-6" />;
  }

  const data = detail.data?.data;
  const report = data && puuid ? buildMatchReport(data, puuid) : null;
  const recapData = data && puuid ? buildMatchRecapData(data, puuid) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to={`/joueur/${region}/${name}/${tag}/matchs/${matchId}`}
            className="text-xs text-lo transition-colors hover:text-accent"
          >
            {t("report.backToDetail")}
          </Link>
          <h1 className="mt-2 font-display text-lg font-bold uppercase tracking-hud text-hi">
            {t("report.title")}
          </h1>
        </div>
        {recapData && (
          <button
            type="button"
            onClick={() => setShowRecap(true)}
            className="btn-clip mt-1 shrink-0 bg-accent px-4 py-2 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-accent-dim"
          >
            {t("report.recapButton")}
          </button>
        )}
      </div>

      {showRecap && recapData && (
        <RecapCardModal data={recapData} onClose={() => setShowRecap(false)} />
      )}

      {!report && (
        <p className="text-sm text-lo">
          {t("report.notEnoughData")}
        </p>
      )}

      {report && (
        <>
          <Panel className="p-4">
            <p className="hud-label mb-3">{t("report.economyTimeline.title", { count: report.rounds.length })}</p>
            <div className="flex flex-wrap gap-1">
              {report.rounds.map((round) => (
                <div
                  key={round.index}
                  title={t("report.economyTimeline.tooltip", {
                    index: round.index,
                    status: round.won ? t("report.economyTimeline.won") : t("report.economyTimeline.lost"),
                    tier: t(TIER_LABEL_KEYS[round.economyTier]),
                    avgLoadout: Math.round(round.teamAvgLoadout),
                  })}
                  className={`flex h-9 w-9 flex-col items-center justify-center border text-[10px] font-semibold ${
                    round.won ? "border-accent/60 bg-accent/10 text-accent" : "border-crit/60 bg-crit/10 text-crit"
                  }`}
                >
                  <span className="stat-value">{round.index}</span>
                  <span className="text-[8px] uppercase tracking-hud text-lo">
                    {t(TIER_LABEL_KEYS[round.economyTier]).slice(0, 4)}
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="p-4">
            <p className="hud-label mb-3">{t("report.winrateByBuyType.title")}</p>
            <div className="space-y-2">
              {report.economyBreakdown.map((bucket) => {
                const winPercent =
                  bucket.roundsPlayed > 0
                    ? Math.round((bucket.roundsWon / bucket.roundsPlayed) * 100)
                    : null;
                return (
                  <div key={bucket.tier} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-sm text-hi">{t(TIER_LABEL_KEYS[bucket.tier])}</span>
                    <div className="h-2 flex-1 bg-surface">
                      <div
                        className="h-2 bg-accent"
                        style={{ width: `${winPercent ?? 0}%` }}
                      />
                    </div>
                    <span className="stat-value w-24 shrink-0 text-right text-xs text-lo">
                      {bucket.roundsPlayed === 0
                        ? "—"
                        : t("report.winrateByBuyType.ratio", {
                            won: bucket.roundsWon,
                            played: bucket.roundsPlayed,
                            percent: winPercent,
                          })}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-lo">
              {t("report.winrateByBuyType.note")}
            </p>
          </Panel>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {report.bestRound && (
              <Panel className="p-4">
                <p className="hud-label mb-1 !text-accent">{t("report.bestRound.title")}</p>
                <p className="stat-value text-2xl text-hi">
                  {t("report.bestRound.label", { index: report.bestRound.index })}
                </p>
                <p className="text-xs text-lo">
                  {t("report.bestRound.detail", { kills: report.bestRound.kills, damage: report.bestRound.damage })}
                </p>
              </Panel>
            )}
            {report.worstRound && (
              <Panel className="p-4">
                <p className="hud-label mb-1 !text-crit">{t("report.worstRound.title")}</p>
                <p className="stat-value text-2xl text-hi">
                  {t("report.worstRound.label", { index: report.worstRound.index })}
                </p>
                <p className="text-xs text-lo">
                  {t("report.worstRound.detail", { kills: report.worstRound.kills, damage: report.worstRound.damage })}
                </p>
              </Panel>
            )}
          </div>

          {report.afkRounds.length > 0 && (
            <Panel className="border-crit/30 bg-crit/5 p-4">
              <p className="hud-label !text-crit">{t("report.afk.title")}</p>
              <p className="mt-1 text-sm text-lo">
                {t("report.afk.rounds", { count: report.afkRounds.length, list: report.afkRounds.join(", ") })}
              </p>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
