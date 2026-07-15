import { useMemo, useState } from "react";
import { Skeleton } from "../components/Skeleton";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useAccount, useMmrHistory } from "../hooks/usePlayer";
import { useEconomyStats, useMatches, useSideWinrate } from "../hooks/useMatches";
import StatCard from "../components/StatCard";
import Panel from "../components/Panel";
import SampleSizeSwitch, { type SampleSize } from "../components/SampleSizeSwitch";
import ErrorState from "../components/ErrorState";
import StaleDataBanner from "../components/StaleDataBanner";
import PerformanceHeatmap from "../components/PerformanceHeatmap";
import type { MatchEntry } from "../lib/tauriApi";
import { formatKdRatio, formatRelativeTime } from "../lib/format";
import { computeHeatmap, computeRegularity, computeSeasonComparison } from "../lib/stats";

const MONO = '"JetBrains Mono", Consolas, monospace';

// Séries cyan/rouge/gris selon la métrique : positif = cyan, négatif = rouge,
// contexte = nuances de gris.
const SERIES = [
  { key: "kd", color: "rgb(var(--accent-rgb))" },
  { key: "kills", color: "rgb(var(--chart-kills-rgb))" },
  { key: "deaths", color: "rgb(var(--crit-rgb))" },
  { key: "assists", color: "rgb(var(--lo-rgb))" },
  { key: "headshots", color: "rgb(var(--chart-headshots-rgb))" },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

function computeTrends(matches: MatchEntry[], puuid: string) {
  const perMatch = [...matches]
    .reverse()
    .map((match) => {
      const player = match.players.find((p) => p.puuid === puuid);
      const stats = player?.stats;
      return {
        date: formatRelativeTime(match.metadata.started_at),
        map: match.metadata.map?.name ?? "?",
        kills: stats?.kills ?? 0,
        deaths: stats?.deaths ?? 0,
        assists: stats?.assists ?? 0,
        headshots: stats?.headshots ?? 0,
        kd: Number(formatKdRatio(stats?.kills ?? 0, stats?.deaths ?? 0)),
      };
    });

  const bestMatch = [...perMatch].sort((a, b) => b.kills - a.kills)[0] ?? null;

  const byMap = new Map<string, { matches: number; wins: number }>();
  for (const match of matches) {
    const player = match.players.find((p) => p.puuid === puuid);
    if (!player) continue;
    const team = match.teams.find((t) => t.team_id === player.team_id);
    const mapName = match.metadata.map?.name ?? "?";
    const entry = byMap.get(mapName) ?? { matches: 0, wins: 0 };
    entry.matches += 1;
    if (team?.won) entry.wins += 1;
    byMap.set(mapName, entry);
  }
  const bestMap = [...byMap.entries()]
    .filter(([, v]) => v.matches >= 2)
    .sort((a, b) => b[1].wins / b[1].matches - a[1].wins / a[1].matches)[0];

  const totalKills = perMatch.reduce((sum, m) => sum + m.kills, 0);
  const totalDeaths = perMatch.reduce((sum, m) => sum + m.deaths, 0);

  return {
    perMatch,
    bestMatch,
    bestMapName: bestMap?.[0] ?? null,
    bestMapWinPercent: bestMap ? (bestMap[1].wins / bestMap[1].matches) * 100 : null,
    overallKd: formatKdRatio(totalKills, totalDeaths),
  };
}

export default function Trends() {
  const { t } = useTranslation("stats");
  const { region, name, tag } = useParams<{ region: string; name: string; tag: string }>();
  const [sampleSize, setSampleSize] = useState<SampleSize>(20);
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set(["deaths", "assists", "headshots"]));

  const account = useAccount(name, tag);
  const puuid = account.data?.data.puuid;
  const matches = useMatches({ region, name, tag, size: sampleSize });
  const mmrHistory = useMmrHistory({ region, name, tag });
  const sideWinrate = useSideWinrate(puuid);
  const economyStats = useEconomyStats(puuid);

  const trends = useMemo(
    () => (matches.data && puuid ? computeTrends(matches.data.data, puuid) : null),
    [matches.data, puuid],
  );
  const heatmapCells = useMemo(
    () => (matches.data && puuid ? computeHeatmap(matches.data.data, puuid) : null),
    [matches.data, puuid],
  );
  const seasonComparison = useMemo(
    () => (mmrHistory.data ? computeSeasonComparison(mmrHistory.data.data.history) : []),
    [mmrHistory.data],
  );
  const regularity = useMemo(
    () => (matches.data && puuid ? computeRegularity(matches.data.data, puuid) : null),
    [matches.data, puuid],
  );

  function toggleSeries(key: SeriesKey) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="hud-label text-sm">{t("trends.title")}</h1>
        <SampleSizeSwitch value={sampleSize} onChange={setSampleSize} />
      </div>

      {matches.isError && <ErrorState error={matches.error} />}
      {matches.data?.stale && <StaleDataBanner cachedAt={matches.data.cached_at} />}
      {matches.isLoading && <Skeleton className="h-32 w-full" />}

      {trends && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <StatCard
              label={t("trends.statCards.recentMatches", { count: sampleSize })}
              value={t("trends.statCards.kdValue", { kd: trends.overallKd })}
              emphasis
            />
            <StatCard
              label={t("trends.statCards.bestMatch")}
              value={
                trends.bestMatch
                  ? t("trends.statCards.bestMatchValue", { kills: trends.bestMatch.kills })
                  : "—"
              }
              hint={trends.bestMatch?.map}
            />
            <StatCard
              label={t("trends.statCards.bestMap")}
              value={trends.bestMapName ?? "—"}
              hint={
                trends.bestMapWinPercent !== null
                  ? t("trends.statCards.bestMapWinrate", { percent: trends.bestMapWinPercent.toFixed(0) })
                  : undefined
              }
            />
            {regularity && regularity.sampleSize > 0 && (
              <StatCard
                label={t("trends.statCards.regularity")}
                value={t("trends.statCards.regularityValue", {
                  cv: (regularity.coefficientOfVariation * 100).toFixed(0),
                })}
                hint={t("trends.statCards.regularityHint", {
                  mean: regularity.kdaMean.toFixed(2),
                  count: regularity.sampleSize,
                })}
              />
            )}
          </div>

          <Panel className="h-72 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trends.perMatch} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="rgb(var(--lo-rgb) / 0.15)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "rgb(var(--lo-rgb))", fontFamily: MONO }}
                  minTickGap={20}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "rgb(var(--lo-rgb))", fontFamily: MONO }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "rgb(var(--raised-rgb))",
                    border: "1px solid rgb(var(--line-rgb))",
                    borderRadius: 0,
                    fontSize: 12,
                    fontFamily: MONO,
                  }}
                />
                <Legend
                  onClick={(entry) => toggleSeries(entry.dataKey as SeriesKey)}
                  wrapperStyle={{ fontSize: 11, cursor: "pointer", fontFamily: MONO }}
                  formatter={(value, entry) => (
                    <span
                      style={{
                        color: hidden.has((entry as { dataKey?: SeriesKey }).dataKey ?? "kd")
                          ? "rgb(var(--chart-muted-rgb))"
                          : "rgb(var(--hi-rgb))",
                        textDecoration: hidden.has((entry as { dataKey?: SeriesKey }).dataKey ?? "kd")
                          ? "line-through"
                          : "none",
                      }}
                    >
                      {value}
                    </span>
                  )}
                />
                {SERIES.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={t(`trends.series.${s.key}`)}
                    stroke={s.color}
                    strokeWidth={s.key === "kd" ? 2 : 1.25}
                    dot={false}
                    activeDot={{ r: 3 }}
                    hide={hidden.has(s.key)}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </Panel>

          {heatmapCells && (
            <div>
              <h2 className="hud-label mb-2">{t("trends.heatmapTitle")}</h2>
              <Panel className="p-4">
                <PerformanceHeatmap cells={heatmapCells} />
              </Panel>
            </div>
          )}

          {sideWinrate.data && sideWinrate.data.matches_considered > 0 && (
            <div>
              <h2 className="hud-label mb-2">{t("trends.sideWinrate.title")}</h2>
              <p className="mb-2 text-xs text-lo">
                {t("trends.sideWinrate.description", { count: sideWinrate.data.matches_considered })}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <StatCard
                  label={t("trends.sideWinrate.attack")}
                  value={t("trends.statCards.bestMapWinrate", {
                    percent:
                      sideWinrate.data.attack.rounds_played > 0
                        ? ((sideWinrate.data.attack.rounds_won / sideWinrate.data.attack.rounds_played) * 100).toFixed(0)
                        : "0",
                  })}
                  hint={t("trends.sideWinrate.roundsHint", { n: sideWinrate.data.attack.rounds_played })}
                  gaugePercent={
                    sideWinrate.data.attack.rounds_played > 0
                      ? (sideWinrate.data.attack.rounds_won / sideWinrate.data.attack.rounds_played) * 100
                      : 0
                  }
                />
                <StatCard
                  label={t("trends.sideWinrate.defense")}
                  value={t("trends.statCards.bestMapWinrate", {
                    percent:
                      sideWinrate.data.defense.rounds_played > 0
                        ? ((sideWinrate.data.defense.rounds_won / sideWinrate.data.defense.rounds_played) * 100).toFixed(0)
                        : "0",
                  })}
                  hint={t("trends.sideWinrate.roundsHint", { n: sideWinrate.data.defense.rounds_played })}
                  gaugePercent={
                    sideWinrate.data.defense.rounds_played > 0
                      ? (sideWinrate.data.defense.rounds_won / sideWinrate.data.defense.rounds_played) * 100
                      : 0
                  }
                />
              </div>
            </div>
          )}

          {economyStats.data && economyStats.data.matches_considered > 0 && (
            <div>
              <h2 className="hud-label mb-2">{t("trends.economyStats.title")}</h2>
              <p className="mb-2 text-xs text-lo">
                {t("trends.economyStats.description", { count: economyStats.data.matches_considered })}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {(
                  [
                    ["eco", economyStats.data.eco, t("trends.economyStats.eco")],
                    ["half_buy", economyStats.data.half_buy, t("trends.economyStats.halfBuy")],
                    ["full_buy", economyStats.data.full_buy, t("trends.economyStats.fullBuy")],
                  ] as const
                ).map(([key, tally, label]) => (
                  <StatCard
                    key={key}
                    label={label}
                    value={t("trends.statCards.bestMapWinrate", {
                      percent: tally.rounds_played > 0 ? ((tally.rounds_won / tally.rounds_played) * 100).toFixed(0) : "0",
                    })}
                    hint={t("trends.economyStats.roundsHint", { n: tally.rounds_played })}
                    gaugePercent={tally.rounds_played > 0 ? (tally.rounds_won / tally.rounds_played) * 100 : 0}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {seasonComparison.length > 0 && (
        <div>
          <h2 className="hud-label mb-2">{t("trends.seasonComparison.title")}</h2>
          <p className="mb-2 text-xs text-lo">{t("trends.seasonComparison.description")}</p>
          <Panel className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left">
                <tr>
                  <th className="hud-label px-4 py-3 font-semibold">{t("trends.seasonComparison.table.season")}</th>
                  <th className="hud-label px-4 py-3 font-semibold">{t("trends.seasonComparison.table.games")}</th>
                  <th className="hud-label px-4 py-3 font-semibold">{t("trends.seasonComparison.table.netRr")}</th>
                  <th className="hud-label px-4 py-3 font-semibold">{t("trends.seasonComparison.table.highestTier")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {seasonComparison.map((row) => (
                  <tr key={row.season} className="text-hi/90">
                    <td className="px-4 py-2.5 font-medium">{row.season}</td>
                    <td className="stat-value px-4 py-2.5">{row.games}</td>
                    <td className={`stat-value px-4 py-2.5 ${row.netRr >= 0 ? "text-accent" : "text-crit"}`}>
                      {row.netRr >= 0 ? "+" : ""}
                      {row.netRr}
                    </td>
                    <td className="stat-value px-4 py-2.5">{row.highestTier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      )}
    </div>
  );
}
