import { Link, useNavigate, useParams } from "react-router-dom";
import { SkeletonScreen } from "../components/Skeleton";

import { useVlrTeam, useVlrTeamMatches } from "../hooks/useVlr";
import ErrorState from "../components/ErrorState";
import Panel from "../components/Panel";

export default function VlrTeamDetail() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const id = teamId ? Number(teamId) : undefined;
  const team = useVlrTeam(id);
  const matches = useVlrTeamMatches(id);

  if (team.isError) return <ErrorState error={team.error} />;
  if (team.isLoading) return <SkeletonScreen className="p-6" />;

  const data = team.data?.data;
  if (!data) return <p className="text-sm text-lo">Équipe introuvable.</p>;

  return (
    <div className="space-y-4">
      <Link to="/esport" className="text-sm text-accent hover:underline">
        ← Esport
      </Link>

      <Panel className="flex flex-wrap items-center gap-4 px-5 py-4">
        {data.logo && <img src={data.logo} alt="" className="h-14 w-14 object-contain" />}
        <div>
          <h1 className="font-display text-lg font-bold uppercase tracking-hud text-hi">{data.name}</h1>
          <p className="stat-value text-sm text-lo">
            {data.tag ? `#${data.tag}` : ""} {data.country?.name ? `· ${data.country.name}` : ""}
          </p>
        </div>
        {data.total_winnings && (
          <div className="ml-auto text-right">
            <p className="hud-label text-[10px]">Gains totaux</p>
            <p className="stat-value text-sm text-accent">{data.total_winnings}</p>
          </div>
        )}
      </Panel>

      <Panel className="p-4">
        <p className="hud-label mb-3">Roster</p>
        <div className="flex flex-wrap gap-2">
          {data.roster.map((m) => (
            <span key={m.id} className="panel-clip-sm flex items-center gap-2 px-3 py-1.5 text-sm text-hi">
              {m.avatar && <img src={m.avatar} alt="" className="h-5 w-5 rounded-full object-cover" />}
              {m.alias}
              {m.is_captain && <span className="text-[10px] text-accent">(C)</span>}
            </span>
          ))}
          {data.roster.length === 0 && <p className="text-sm text-lo">Roster non communiqué.</p>}
        </div>
      </Panel>

      {data.event_placements.length > 0 && (
        <Panel className="p-4">
          <p className="hud-label mb-3">Palmarès</p>
          <div className="space-y-1.5">
            {data.event_placements.slice(0, 10).map((p, i) => (
              <div key={i} className="flex items-center justify-between border-b border-line/40 py-1.5 text-sm">
                <span className="text-hi">
                  {p.event?.name} <span className="text-lo">({p.year})</span>
                </span>
                <span className="stat-value text-lo">
                  {p.placements.map((pl) => pl.place).filter(Boolean).join(", ") || "—"}
                </span>
              </div>
            ))}
          </div>
        </Panel>
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
