import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useAccount } from "../hooks/usePlayer";
import { useMatches } from "../hooks/useMatches";
import ErrorState from "../components/ErrorState";
import StaleDataBanner from "../components/StaleDataBanner";
import Panel from "../components/Panel";
import SampleSizeSwitch, { type SampleSize } from "../components/SampleSizeSwitch";
import { formatKdRatio, formatPercent } from "../lib/format";
import type { MatchEntry } from "../lib/tauriApi";

const MONO = '"JetBrains Mono", Consolas, monospace';

interface MapAggregate {
  map: string;
  played: number;
  wins: number;
  kills: number;
  deaths: number;
}

function aggregateByMap(matches: MatchEntry[], puuid: string): MapAggregate[] {
  const byMap = new Map<string, MapAggregate>();

  for (const match of matches) {
    const player = match.players.find((p) => p.puuid === puuid);
    if (!player) continue;

    const mapName = match.metadata.map?.name ?? "Carte inconnue";
    const team = match.teams.find((t) => t.team_id === player.team_id);

    const entry = byMap.get(mapName) ?? { map: mapName, played: 0, wins: 0, kills: 0, deaths: 0 };
    entry.played += 1;
    if (team?.won) entry.wins += 1;
    entry.kills += player.stats?.kills ?? 0;
    entry.deaths += player.stats?.deaths ?? 0;
    byMap.set(mapName, entry);
  }

  return [...byMap.values()].sort((a, b) => b.played - a.played);
}

export default function MapStats() {
  const { region, name, tag } = useParams<{ region: string; name: string; tag: string }>();
  const [sampleSize, setSampleSize] = useState<SampleSize>(20);

  const account = useAccount(name, tag);
  const matches = useMatches({ region, name, tag, size: sampleSize });

  const puuid = account.data?.data.puuid;
  const rows = useMemo(
    () => (matches.data && puuid ? aggregateByMap(matches.data.data, puuid) : []),
    [matches.data, puuid],
  );

  const chartData = rows.map((row) => ({
    map: row.map,
    winPercent: Math.round((row.wins / row.played) * 100),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="hud-label text-sm">Stats par carte</h1>
        <SampleSizeSwitch value={sampleSize} onChange={setSampleSize} />
      </div>

      {matches.isError && <ErrorState error={matches.error} />}
      {matches.data?.stale && <StaleDataBanner cachedAt={matches.data.cached_at} />}
      {matches.isLoading && <p className="text-sm text-lo">Chargement…</p>}

      {chartData.length > 0 && (
        <Panel className="h-56 p-4">
          <p className="hud-label mb-2">Winrate par carte</p>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={chartData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }} barCategoryGap="35%">
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis
                dataKey="map"
                tick={{ fontSize: 10, fill: "#7A8590", fontFamily: MONO }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#7A8590", fontFamily: MONO }}
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={{
                  background: "#171C22",
                  border: "1px solid #22282F",
                  borderRadius: 0,
                  fontSize: 12,
                  fontFamily: MONO,
                }}
                formatter={(value: number) => [`${value}%`, "Winrate"]}
              />
              <Bar dataKey="winPercent" fill="#7CE8D3" fillOpacity={0.85} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      )}

      {rows.length > 0 && (
        <Panel className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left">
              <tr>
                <th className="hud-label px-4 py-3 font-semibold">Carte</th>
                <th className="hud-label px-4 py-3 font-semibold">Matchs</th>
                <th className="hud-label px-4 py-3 font-semibold">Winrate</th>
                <th className="hud-label px-4 py-3 font-semibold">K/D</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {rows.map((row) => (
                <tr key={row.map} className="text-hi/90 transition-colors hover:bg-raised/50">
                  <td className="px-4 py-2.5 font-medium">{row.map}</td>
                  <td className="stat-value px-4 py-2.5">{row.played}</td>
                  <td className="stat-value px-4 py-2.5">{formatPercent((row.wins / row.played) * 100)}</td>
                  <td className="stat-value px-4 py-2.5">{formatKdRatio(row.kills, row.deaths)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {matches.data && rows.length === 0 && (
        <p className="text-sm text-lo">Aucune donnée de carte sur cet échantillon.</p>
      )}
    </div>
  );
}
