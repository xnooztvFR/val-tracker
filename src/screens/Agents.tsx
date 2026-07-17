import { useMemo, useState } from "react";
import { Skeleton } from "../components/Skeleton";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAccount } from "../hooks/usePlayer";
import { useMatches } from "../hooks/useMatches";
import ErrorState from "../components/ErrorState";
import StaleDataBanner from "../components/StaleDataBanner";
import Panel from "../components/Panel";
import EmptyState from "../components/EmptyState";
import SampleSizeSwitch, { type SampleSize } from "../components/SampleSizeSwitch";
import type { MatchEntry } from "../lib/tauriApi";
import { formatKdRatio, formatPercent } from "../lib/format";
import AgentIcon from "../components/AgentIcon";
import { AGENT_ROLE_ORDER, agentRole, agentRoleLabel, type AgentRole } from "../lib/agentRoles";
import i18n from "../i18n";

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
      name: player.agent.name ?? i18n.t("stats:agents.unknownAgent"),
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

interface RoleStats {
  role: AgentRole;
  matches: number;
  wins: number;
  kills: number;
  deaths: number;
}

/** Backlog #17 : regroupe les stats déjà agrégées par agent (computeAgentStats) par rôle
 * (Duelist/Controller/Initiator/Sentinel) — pas de nouvel appel réseau, juste une deuxième
 * passe sur des données déjà en mémoire. */
function computeRoleStats(rows: AgentStats[]): RoleStats[] {
  const byRole = new Map<AgentRole, RoleStats>();
  for (const row of rows) {
    const role = agentRole(row.name);
    if (!role) continue;
    const entry = byRole.get(role) ?? { role, matches: 0, wins: 0, kills: 0, deaths: 0 };
    entry.matches += row.matches;
    entry.wins += row.wins;
    entry.kills += row.kills;
    entry.deaths += row.deaths;
    byRole.set(role, entry);
  }
  return AGENT_ROLE_ORDER.map((role) => byRole.get(role)).filter((r): r is RoleStats => Boolean(r));
}

export default function Agents() {
  const { t } = useTranslation("stats");
  const { region, name, tag } = useParams<{ region: string; name: string; tag: string }>();
  const [sampleSize, setSampleSize] = useState<SampleSize>(20);
  const [mapFilter, setMapFilter] = useState<string>("all");

  const account = useAccount(name, tag);
  const puuid = account.data?.data.puuid;
  const matches = useMatches({ region, name, tag, size: sampleSize });

  // TODO stats & analyse joueur : croisement MapStats × Agents ("Jett sur Ascent" vs "Jett
  // globalement") — même agrégation que computeAgentStats, appliquée à un sous-ensemble des
  // matchs déjà en cache filtré par carte plutôt qu'à une commande dédiée.
  const mapNames = useMemo(() => {
    if (!matches.data) return [];
    const seen = new Set<string>();
    for (const match of matches.data.data) {
      const mapName = match.metadata.map?.name;
      if (mapName) seen.add(mapName);
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [matches.data]);

  const filteredMatches = useMemo(() => {
    if (!matches.data) return [];
    if (mapFilter === "all") return matches.data.data;
    return matches.data.data.filter((m) => m.metadata.map?.name === mapFilter);
  }, [matches.data, mapFilter]);

  const rows = useMemo(
    () => (puuid ? computeAgentStats(filteredMatches, puuid) : []),
    [filteredMatches, puuid],
  );
  const roleRows = useMemo(() => computeRoleStats(rows), [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="hud-label text-sm">{t("agents.title")}</h1>
        <div className="flex items-center gap-3">
          {mapNames.length > 0 && (
            <select
              value={mapFilter}
              onChange={(e) => setMapFilter(e.target.value)}
              className="hud-label border border-line bg-raised px-2 py-1.5 text-xs text-hi"
            >
              <option value="all">{t("agents.mapFilter.all")}</option>
              {mapNames.map((mapName) => (
                <option key={mapName} value={mapName}>
                  {mapName}
                </option>
              ))}
            </select>
          )}
          <SampleSizeSwitch value={sampleSize} onChange={setSampleSize} />
        </div>
      </div>

      {matches.isError && <ErrorState error={matches.error} />}
      {matches.data?.stale && <StaleDataBanner cachedAt={matches.data.cached_at} />}
      {matches.isLoading && <Skeleton className="h-32 w-full" />}

      {roleRows.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {roleRows.map((role) => (
            <Panel key={role.role} className="p-3">
              <p className="hud-label text-[10px]">{agentRoleLabel(role.role)}</p>
              <p className="stat-value mt-1 text-lg font-bold text-hi">
                {formatPercent((role.wins / role.matches) * 100)}
              </p>
              <p className="stat-value text-[11px] text-lo">
                {t("agents.roleStats", { count: role.matches, kd: formatKdRatio(role.kills, role.deaths) })}
              </p>
            </Panel>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <Panel className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left">
              <tr>
                <th className="hud-label px-4 py-3 font-semibold">{t("agents.table.agent")}</th>
                <th className="hud-label px-4 py-3 font-semibold">{t("agents.table.time")}</th>
                <th className="hud-label px-4 py-3 font-semibold">{t("agents.table.matches")}</th>
                <th className="hud-label px-4 py-3 font-semibold">{t("agents.table.winPercent")}</th>
                <th className="hud-label px-4 py-3 font-semibold">{t("agents.table.kd")}</th>
                <th className="hud-label px-4 py-3 font-semibold">{t("agents.table.hsPercent")}</th>
                <th className="hud-label px-4 py-3 font-semibold">{t("agents.table.acs")}</th>
                <th className="hud-label px-4 py-3 font-semibold">{t("agents.table.kills")}</th>
                <th className="hud-label px-4 py-3 font-semibold">{t("agents.table.deaths")}</th>
                <th className="hud-label px-4 py-3 font-semibold">{t("agents.table.assists")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {rows.map((row) => (
                <tr key={row.id} className="text-hi/90 transition-colors hover:bg-raised/50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <AgentIcon agentId={row.id} agentName={row.name} className="h-8 w-8 border border-line object-cover" />
                      <span className="font-medium">{row.name}</span>
                    </div>
                  </td>
                  <td className="stat-value px-4 py-2.5 text-lo">
                    {t("agents.table.hoursValue", { hours: (row.msPlayed / 3_600_000).toFixed(1) })}
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
        <EmptyState
          icon="radar"
          title={t("agents.empty.title")}
          detail={t("agents.empty.detail")}
        />
      )}
    </div>
  );
}
