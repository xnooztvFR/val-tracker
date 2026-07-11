import { Link, useParams } from "react-router-dom";
import { SkeletonScreen } from "../components/Skeleton";

import { usePremierTeam, usePremierTeamHistory } from "../hooks/usePremier";
import ErrorState from "../components/ErrorState";
import Panel from "../components/Panel";
import StaleDataBanner from "../components/StaleDataBanner";

export default function PremierTeamDetail() {
  const { teamId } = useParams<{ teamId: string }>();
  const team = usePremierTeam({ teamId });
  const history = usePremierTeamHistory({ teamId });

  if (team.isError) return <ErrorState error={team.error} />;
  if (team.isLoading) return <SkeletonScreen className="p-6" />;

  const data = team.data?.data;
  if (!data) return <p className="text-sm text-lo">Équipe introuvable.</p>;

  const c = data.customization;
  const leagueMatches = history.data?.data.league_matches ?? [];
  const tournamentMatches = history.data?.data.tournament_matches ?? [];

  return (
    <div className="space-y-4">
      <Link to="/premier" className="text-sm text-accent hover:underline">
        ← Retour à Premier
      </Link>

      {team.data?.stale && <StaleDataBanner cachedAt={team.data.cached_at} />}

      <Panel className="flex flex-wrap items-center gap-5 px-5 py-4">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center border"
          style={{ backgroundColor: c?.primary ?? "#22282F", borderColor: c?.secondary ?? "#22282F" }}
        >
          <span className="font-display text-lg font-bold" style={{ color: c?.tertiary ?? "#fff" }}>
            {data.tag}
          </span>
        </div>
        <div>
          <h1 className="font-display text-lg font-bold uppercase tracking-hud text-hi">{data.name}</h1>
          <p className="stat-value text-sm text-lo">
            #{data.tag} · {data.enrolled ? "Inscrite à la saison en cours" : "Non inscrite"}
          </p>
        </div>
        <div className="ml-auto flex gap-6">
          <Stat label="Classement" value={data.placement ? `#${data.placement.place ?? "?"}` : "—"} />
          <Stat
            label="Conférence"
            value={data.placement ? `${data.placement.conference ?? "?"} · Div ${data.placement.division ?? "?"}` : "—"}
          />
          <Stat label="Points" value={data.placement?.points?.toString() ?? "—"} />
        </div>
      </Panel>

      {data.stats && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <MiniStat label="Matchs" value={data.stats.matches ?? 0} />
          <MiniStat label="Victoires" value={data.stats.wins ?? 0} accent="text-accent" />
          <MiniStat label="Défaites" value={data.stats.losses ?? 0} accent="text-crit" />
          <MiniStat
            label="Rounds G/P"
            value={`${data.stats.rounds_won ?? 0}/${data.stats.rounds_lost ?? 0}`}
          />
        </div>
      )}

      <Panel className="p-4">
        <p className="hud-label mb-3">Roster ({data.member.length})</p>
        <div className="flex flex-wrap gap-2">
          {data.member.map((m) => (
            <span key={m.puuid} className="panel-clip-sm px-3 py-1.5 text-sm text-hi">
              {m.name ?? "?"}
              <span className="text-lo">#{m.tag ?? "?"}</span>
            </span>
          ))}
          {data.member.length === 0 && <p className="text-sm text-lo">Roster non communiqué.</p>}
        </div>
      </Panel>

      {(leagueMatches.length > 0 || tournamentMatches.length > 0) && (
        <Panel className="p-4">
          <p className="hud-label mb-3">Historique de saison</p>
          <div className="space-y-1.5">
            {leagueMatches.map((m) => (
              <div key={m.id} className="flex items-center justify-between border-b border-line/40 py-1.5 text-sm">
                <span className="text-lo">
                  {m.started_at ? new Date(m.started_at).toLocaleDateString("fr-FR") : "—"}
                </span>
                <span className="stat-value text-hi">
                  {m.points_before ?? "?"} → {m.points_after ?? "?"} pts
                  <span className={(m.points_after ?? 0) >= (m.points_before ?? 0) ? "text-accent" : "text-crit"}>
                    {" "}
                    ({(m.points_after ?? 0) - (m.points_before ?? 0) >= 0 ? "+" : ""}
                    {(m.points_after ?? 0) - (m.points_before ?? 0)})
                  </span>
                </span>
              </div>
            ))}
            {tournamentMatches.map((t) => (
              <div key={t.tournament_id} className="flex items-center justify-between border-b border-line/40 py-1.5 text-sm">
                <span className="text-lo">Tournoi · {t.matches.length} matchs</span>
                <span className="stat-value text-hi">
                  Place #{t.placement ?? "?"} · {t.points_before ?? "?"} → {t.points_after ?? "?"} pts
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <p className="hud-label text-[10px]">{label}</p>
      <p className="stat-value text-sm text-hi">{value}</p>
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="panel-clip-sm px-3 py-2 text-center">
      <p className={`stat-value text-base font-bold ${accent ?? ""}`}>{value}</p>
      <p className="hud-label mt-0.5 text-[9px]">{label}</p>
    </div>
  );
}
