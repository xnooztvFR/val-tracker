import { useState } from "react";
import { SkeletonScreen } from "../components/Skeleton";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useVlrPlayer, useVlrPlayerMatches } from "../hooks/useVlr";
import ErrorState from "../components/ErrorState";
import Panel from "../components/Panel";
import ExternalImage from "../components/ExternalImage";

const TIMESPANS = [
  { value: "30d", label: "30 jours" },
  { value: "60d", label: "60 jours" },
  { value: "90d", label: "90 jours" },
  { value: "all", label: "Carrière" },
] as const;

export default function VlrPlayerDetail() {
  const { playerId } = useParams<{ playerId: string }>();
  const navigate = useNavigate();
  const id = playerId ? Number(playerId) : undefined;
  const [timespan, setTimespan] = useState<(typeof TIMESPANS)[number]["value"]>("90d");

  const player = useVlrPlayer(id, timespan);
  const matches = useVlrPlayerMatches(id);

  if (player.isError) return <ErrorState error={player.error} />;
  if (player.isLoading) return <SkeletonScreen className="p-6" />;

  const data = player.data?.data;
  if (!data) return <p className="text-sm text-lo">Joueur introuvable.</p>;

  return (
    <div className="space-y-4">
      <Link to="/esport" className="text-sm text-accent hover:underline">
        ← Esport
      </Link>

      <Panel className="flex flex-wrap items-center gap-4 px-5 py-4">
        {data.avatar && <ExternalImage src={data.avatar} alt="" className="h-14 w-14 rounded-full object-cover" />}
        <div>
          <h1 className="font-display text-lg font-bold uppercase tracking-hud text-hi">{data.name}</h1>
          <p className="stat-value text-sm text-lo">
            {data.real_name ?? ""} {data.country?.name ? `· ${data.country.name}` : ""}
          </p>
          {data.current_teams.length > 0 && (
            <div className="mt-1 flex gap-2">
              {data.current_teams.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => navigate(`/esport/equipe/${t.id}`)}
                  className="text-xs text-accent hover:underline"
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <div className="flex items-center justify-between">
        <p className="hud-label text-sm">Stats par agent</p>
        <select
          value={timespan}
          onChange={(e) => setTimespan(e.target.value as typeof timespan)}
          className="border border-line bg-surface px-3 py-1.5 text-sm text-hi focus:border-accent focus:outline-none"
        >
          {TIMESPANS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {data.agent_stats.length > 0 ? (
        <Panel className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left">
              <tr>
                <th className="hud-label px-4 py-3 font-semibold">Agent</th>
                <th className="hud-label px-4 py-3 font-semibold">Usage</th>
                <th className="hud-label px-4 py-3 font-semibold">Rating</th>
                <th className="hud-label px-4 py-3 font-semibold">ACS</th>
                <th className="hud-label px-4 py-3 font-semibold">K/D</th>
                <th className="hud-label px-4 py-3 font-semibold">ADR</th>
                <th className="hud-label px-4 py-3 font-semibold">KAST</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {data.agent_stats.map((a) => (
                <tr key={a.agent} className="text-hi/90 hover:bg-raised/40">
                  <td className="px-4 py-2.5 font-medium">{a.agent}</td>
                  <td className="stat-value px-4 py-2.5 text-lo">
                    {a.usage?.percentage != null ? `${Math.round(a.usage.percentage)}%` : "—"} (
                    {a.usage?.count ?? 0})
                  </td>
                  <td className="stat-value px-4 py-2.5">{a.stats?.rating?.toFixed(2) ?? "—"}</td>
                  <td className="stat-value px-4 py-2.5">{a.stats?.acs?.toFixed(0) ?? "—"}</td>
                  <td className="stat-value px-4 py-2.5">{a.stats?.kd?.toFixed(2) ?? "—"}</td>
                  <td className="stat-value px-4 py-2.5">{a.stats?.adr?.toFixed(0) ?? "—"}</td>
                  <td className="stat-value px-4 py-2.5">
                    {a.stats?.kast != null ? `${Math.round(a.stats.kast)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ) : (
        <p className="text-sm text-lo">Pas de statistiques sur cette période.</p>
      )}

      {(matches.data?.data.length ?? 0) > 0 && (
        <Panel className="p-4">
          <p className="hud-label mb-3">Derniers matchs</p>
          <div className="space-y-1.5">
            {matches.data!.data.map((m) => (
              <button
                key={m.match.id}
                type="button"
                onClick={() => navigate(`/esport/match/${m.match.id}`)}
                className="flex w-full items-center justify-between border-b border-line/40 py-1.5 text-left text-sm hover:bg-raised/40"
              >
                <span className="text-lo">
                  {m.date ? new Date(m.date).toLocaleDateString("fr-FR") : "—"} · {m.league?.name ?? ""}
                </span>
                <span className="stat-value text-hi">
                  {m.teams.map((t) => `${t.tag ?? t.name} ${t.score ?? "?"}`).join(" – ")}
                </span>
              </button>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
