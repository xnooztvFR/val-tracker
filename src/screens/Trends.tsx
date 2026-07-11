import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
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

import { useAccount } from "../hooks/usePlayer";
import { useMatches } from "../hooks/useMatches";
import StatCard from "../components/StatCard";
import Panel from "../components/Panel";
import SampleSizeSwitch, { type SampleSize } from "../components/SampleSizeSwitch";
import ErrorState from "../components/ErrorState";
import StaleDataBanner from "../components/StaleDataBanner";
import type { MatchEntry } from "../lib/tauriApi";
import { formatKdRatio, formatRelativeTime } from "../lib/format";

const MONO = '"JetBrains Mono", Consolas, monospace';

// Séries cyan/rouge/gris selon la métrique : positif = cyan, négatif = rouge,
// contexte = nuances de gris.
const SERIES = [
  { key: "kd", label: "K/D", color: "#7CE8D3" },
  { key: "kills", label: "Kills", color: "#4DA695" },
  { key: "deaths", label: "Deaths", color: "#FF5F5F" },
  { key: "assists", label: "Assists", color: "#7A8590" },
  { key: "headshots", label: "Headshots", color: "#C8D0D6" },
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
  const { region, name, tag } = useParams<{ region: string; name: string; tag: string }>();
  const [sampleSize, setSampleSize] = useState<SampleSize>(20);
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set(["deaths", "assists", "headshots"]));

  const account = useAccount(name, tag);
  const puuid = account.data?.data.puuid;
  const matches = useMatches({ region, name, tag, size: sampleSize });

  const trends = useMemo(
    () => (matches.data && puuid ? computeTrends(matches.data.data, puuid) : null),
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
        <h1 className="hud-label text-sm">Tendances</h1>
        <SampleSizeSwitch value={sampleSize} onChange={setSampleSize} />
      </div>

      {matches.isError && <ErrorState error={matches.error} />}
      {matches.data?.stale && <StaleDataBanner cachedAt={matches.data.cached_at} />}
      {matches.isLoading && <p className="text-sm text-lo">Chargement…</p>}

      {trends && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label={`${sampleSize} derniers matchs`} value={`K/D ${trends.overallKd}`} emphasis />
            <StatCard
              label="Meilleur match"
              value={trends.bestMatch ? `${trends.bestMatch.kills} kills` : "—"}
              hint={trends.bestMatch?.map}
            />
            <StatCard
              label="Meilleure carte"
              value={trends.bestMapName ?? "—"}
              hint={
                trends.bestMapWinPercent !== null
                  ? `${trends.bestMapWinPercent.toFixed(0)}% de victoires`
                  : undefined
              }
            />
          </div>

          <Panel className="h-72 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trends.perMatch} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#7A8590", fontFamily: MONO }}
                  minTickGap={20}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#7A8590", fontFamily: MONO }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#171C22",
                    border: "1px solid #22282F",
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
                          ? "#3A424B"
                          : "#E8ECEF",
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
                    name={s.label}
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
        </>
      )}
    </div>
  );
}
