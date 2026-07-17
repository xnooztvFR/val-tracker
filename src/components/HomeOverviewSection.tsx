import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import Panel from "./Panel";
import StatCard from "./StatCard";
import { formatKdRatio, formatPercent, mapSplashUrl } from "../lib/format";
import AgentIcon from "./AgentIcon";
import type { MatchEntry } from "../lib/tauriApi";
import type { Overview } from "../lib/stats";

interface HomeOverviewSectionProps {
  overview: Overview;
  region: string | undefined;
  name: string | undefined;
  tag: string | undefined;
  lastMatch: MatchEntry | undefined;
}

/** Section "vue d'ensemble" de l'Accueil : cartes de stats, mini-stats, top agent,
 * répartition de précision et vignette de la dernière carte jouée. Purement dérivée de
 * `overview` (voir lib/stats.ts) — aucun fetch ici. */
export default function HomeOverviewSection({ overview, region, name, tag, lastMatch }: HomeOverviewSectionProps) {
  const { t } = useTranslation("home");

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard
          label={t("overview.stats.winrate")}
          value={formatPercent(overview.winPercent)}
          hint={t("overview.winLossHint", { wins: overview.wins, losses: overview.losses })}
          gaugePercent={overview.winPercent}
          gaugeColor={overview.winPercent >= 50 ? "rgb(var(--accent-rgb))" : "rgb(var(--crit-rgb))"}
        />
        <StatCard
          label={t("overview.stats.kd")}
          value={overview.kd}
          hint={t("overview.stats.kdHint", { n: overview.kills })}
          icon={<KdIcon />}
          tooltip={t("overview.stats.tooltip.kd")}
        />
        <StatCard
          label={t("overview.stats.headshotPercent")}
          value={formatPercent(overview.hsPercent)}
          gaugePercent={overview.hsPercent}
          gaugeColor="rgb(var(--accent-rgb))"
          tooltip={t("overview.stats.tooltip.headshotPercent")}
        />
        <StatCard
          label={t("overview.stats.acs")}
          value={overview.acs.toString()}
          icon={<TargetIcon />}
          tooltip={t("overview.stats.tooltip.acs")}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <MiniStat label={t("overview.miniStats.wins")} value={overview.wins} accent="text-accent" />
        <MiniStat label={t("overview.miniStats.losses")} value={overview.losses} accent="text-crit" />
        <MiniStat label={t("overview.miniStats.kills")} value={overview.kills} />
        <MiniStat label={t("overview.miniStats.deaths")} value={overview.deaths} />
        <MiniStat label={t("overview.miniStats.assists")} value={overview.assists} />
        <MiniStat label={t("overview.miniStats.headshots")} value={overview.headshots} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Panel className="p-4">
          <p className="hud-label mb-3">{t("overview.topAgent.title")}</p>
          {overview.topAgent ? (
            <div className="flex items-center gap-4">
              <AgentIcon
                agentId={overview.topAgent.id}
                agentName={overview.topAgent.name}
                variant="portrait"
                className="h-16 w-16 border border-line object-cover object-top"
              />
              <div>
                <p className="font-display font-semibold text-hi">{overview.topAgent.name}</p>
                <p className="tnum text-xs text-lo">
                  {t("overview.topAgent.stats", {
                    matches: overview.topAgent.matches,
                    winPercent: formatPercent((overview.topAgent.wins / overview.topAgent.matches) * 100),
                    kd: formatKdRatio(overview.topAgent.kills, overview.topAgent.deaths),
                  })}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-lo">{t("overview.notEnoughData")}</p>
          )}
        </Panel>

        <Panel className="p-4">
          <p className="hud-label mb-3">{t("overview.accuracy.title")}</p>
          <div className="space-y-2.5">
            <AccuracyBar label={t("overview.accuracy.head")} percent={overview.hsPercent} color="rgb(var(--accent-rgb))" />
            <AccuracyBar label={t("overview.accuracy.body")} percent={overview.bodyPercent} color="rgb(var(--lo-rgb))" />
            <AccuracyBar label={t("overview.accuracy.legs")} percent={overview.legPercent} color="#3A424B" />
          </div>
        </Panel>

        {region && name && tag && lastMatch && <LastMapWidget match={lastMatch} region={region} name={name} tag={tag} />}
      </div>
    </>
  );
}

/** Backlog #62 : mini-vignette de la carte du dernier match joué, entrée rapide vers
 * MapStats pour cette carte précise (surlignée là-bas via ?carte=, voir MapStats.tsx). */
function LastMapWidget({
  match,
  region,
  name,
  tag,
}: {
  match: MatchEntry;
  region: string;
  name: string;
  tag: string;
}) {
  const { t } = useTranslation("home");
  const map = match.metadata.map;
  if (!map?.name) return null;

  return (
    <Link
      to={`/joueur/${region}/${name}/${tag}/cartes?carte=${encodeURIComponent(map.name)}`}
      className="target-lock relative block h-full overflow-hidden panel-clip"
    >
      {map.id && (
        <img
          src={mapSplashUrl(map.id)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-40 transition-opacity hover:opacity-55"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
          }}
        />
      )}
      <div className="relative flex h-full flex-col justify-end bg-gradient-to-t from-surface via-surface/60 to-transparent p-4">
        <p className="hud-label text-lo">{t("overview.lastMap.title")}</p>
        <p className="font-display text-lg font-bold text-hi">{map.name}</p>
      </div>
    </Link>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="panel-clip-sm px-3 py-2 text-center">
      <p className={`stat-value text-base font-bold ${accent ?? "text-hi"}`}>{value}</p>
      <p className="hud-label mt-0.5 text-[9px] text-lo">{label}</p>
    </div>
  );
}

function AccuracyBar({ label, percent, color }: { label: string; percent: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-lo">{label}</span>
        <span className="stat-value">{formatPercent(percent)}</span>
      </div>
      <div className="h-[3px] bg-line">
        <div
          className="h-full transition-all"
          style={{ width: `${Math.min(100, percent)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function KdIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M4 4l7 7M20 4l-7 7M4 20l7-7M20 20l-7-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="0.5" fill="currentColor" stroke="currentColor" />
    </svg>
  );
}
