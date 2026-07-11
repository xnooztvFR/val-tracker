import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { useAccount } from "../hooks/usePlayer";
import { useMatches } from "../hooks/useMatches";
import ErrorState from "../components/ErrorState";
import StaleDataBanner from "../components/StaleDataBanner";
import Panel from "../components/Panel";
import SampleSizeSwitch, { type SampleSize } from "../components/SampleSizeSwitch";
import type { MatchEntry } from "../lib/tauriApi";
import { agentIconUrl, formatKdRatio, formatPercent } from "../lib/format";

interface AgentStats {
  id: string;
  name: string;
  matches: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  totalShots: number;
  scoreSum: number;
  roundsSum: number;
  msPlayed: number;
}

function computeAgentStats(matches: MatchEntry[], puuid: string): AgentStats[] {
  const byAgent = new Map<string, AgentStats>();

  for (const match of matches) {
    const player = match.players.find((p) => p.puuid === puuid);
    if (!player?.agent?.id) continue;

    const stats = player.stats;
    const team = match.teams.find((t) => t.team_id === player.team_id);
    const roundsPlayed = (team?.rounds?.won ?? 0) + (team?.rounds?.lost ?? 0);

    const entry = byAgent.get(player.agent.id) ?? {
      id: player.agent.id,
      name: player.agent.name ?? "Agent inconnu",
      matches: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      headshots: 0,
      totalShots: 0,
      scoreSum: 0,
      roundsSum: 0,
      msPlayed: 0,
    };

    entry.matches += 1;
    if (team?.won) entry.wins += 1;
    entry.kills += stats?.kills ?? 0;
    entry.deaths += stats?.deaths ?? 0;
    entry.assists += stats?.assists ?? 0;
    entry.headshots += stats?.headshots ?? 0;
    entry.totalShots += (stats?.headshots ?? 0) + (stats?.bodyshots ?? 0) + (stats?.legshots ?? 0);
    entry.scoreSum += stats?.score ?? 0;
    entry.roundsSum += roundsPlayed > 0 ? roundsPlayed : 1;
    entry.msPlayed += match.metadata.game_length_in_ms ?? 0;

    byAgent.set(player.agent.id, entry);
  }

  return [...byAgent.values()].sort((a, b) => b.matches - a.matches);
}

export default function Agents() {
  const { region, name, tag } = useParams<{ region: string; name: string; tag: string }>();
  const [sampleSize, setSampleSize] = useState<SampleSize>(20);

  const account = useAccount(name, tag);
  const puuid = account.data?.data.puuid;
  const matches = useMatches({ region, name, tag, size: sampleSize });

  const rows = useMemo(
    () => (matches.data && puuid ? computeAgentStats(matches.data.data, puuid) : []),
    [matches.data, puuid],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="hud-label text-sm">Stats par agent</h1>
        <SampleSizeSwitch value={sampleSize} onChange={setSampleSize} />
      </div>

      {matches.isError && <ErrorState error={matches.error} />}
      {matches.data?.stale && <StaleDataBanner cachedAt={matches.data.cached_at} />}
      {matches.isLoading && <p className="text-sm text-lo">Chargement…</p>}

      {rows.length > 0 && (
        <Panel className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left">
              <tr>
                <th className="hud-label px-4 py-3 font-semibold">Agent</th>
                <th className="hud-label px-4 py-3 font-semibold">Temps</th>
                <th className="hud-label px-4 py-3 font-semibold">Matchs</th>
                <th className="hud-label px-4 py-3 font-semibold">Win %</th>
                <th className="hud-label px-4 py-3 font-semibold">K/D</th>
                <th className="hud-label px-4 py-3 font-semibold">HS %</th>
                <th className="hud-label px-4 py-3 font-semibold">ACS</th>
                <th className="hud-label px-4 py-3 font-semibold">Kills</th>
                <th className="hud-label px-4 py-3 font-semibold">Deaths</th>
                <th className="hud-label px-4 py-3 font-semibold">Assists</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {rows.map((row) => (
                <tr key={row.id} className="text-hi/90 transition-colors hover:bg-raised/50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={agentIconUrl(row.id)}
                        alt=""
                        className="h-8 w-8 border border-line object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                        }}
                      />
                      <span className="font-medium">{row.name}</span>
                    </div>
                  </td>
                  <td className="stat-value px-4 py-2.5 text-lo">
                    {(row.msPlayed / 3_600_000).toFixed(1)} h
                  </td>
                  <td className="stat-value px-4 py-2.5">{row.matches}</td>
                  <td className="stat-value px-4 py-2.5">{formatPercent((row.wins / row.matches) * 100)}</td>
                  <td className="stat-value px-4 py-2.5">{formatKdRatio(row.kills, row.deaths)}</td>
                  <td className="stat-value px-4 py-2.5">
                    {row.totalShots > 0
                      ? formatPercent((row.headshots / row.totalShots) * 100)
                      : "—"}
                  </td>
                  <td className="stat-value px-4 py-2.5">
                    {Math.round(row.scoreSum / Math.max(row.roundsSum, 1))}
                  </td>
                  <td className="stat-value px-4 py-2.5">{row.kills}</td>
                  <td className="stat-value px-4 py-2.5">{row.deaths}</td>
                  <td className="stat-value px-4 py-2.5">{row.assists}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {matches.data && rows.length === 0 && (
        <p className="text-sm text-lo">Aucune donnée d'agent sur cet échantillon.</p>
      )}
    </div>
  );
}
