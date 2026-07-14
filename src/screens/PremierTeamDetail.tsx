import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SkeletonScreen } from "../components/Skeleton";

import { usePremierTeam, usePremierTeamHistory } from "../hooks/usePremier";
import ErrorState from "../components/ErrorState";
import Panel from "../components/Panel";
import StaleDataBanner from "../components/StaleDataBanner";

export default function PremierTeamDetail() {
  const { t } = useTranslation("competitive");
  const { teamId } = useParams<{ teamId: string }>();
  const team = usePremierTeam({ teamId });
  const history = usePremierTeamHistory({ teamId });

  if (team.isError) return <ErrorState error={team.error} />;
  if (team.isLoading) return <SkeletonScreen className="p-6" />;

  const data = team.data?.data;
  if (!data) return <p className="text-sm text-lo">{t("premierTeamDetail.teamNotFound")}</p>;

  const c = data.customization;
  const leagueMatches = history.data?.data.league_matches ?? [];
  const tournamentMatches = history.data?.data.tournament_matches ?? [];

  return (
    <div className="space-y-4">
      <Link to="/premier" className="text-sm text-accent hover:underline">
        {t("premierTeamDetail.backToPremier")}
      </Link>

      {team.data?.stale && <StaleDataBanner cachedAt={team.data.cached_at} />}

      <Panel className="flex flex-wrap items-center gap-5 px-5 py-4">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center border"
          style={{
            backgroundColor: c?.primary ?? "rgb(var(--line-rgb))",
            borderColor: c?.secondary ?? "rgb(var(--line-rgb))",
          }}
        >
          <span className="font-display text-lg font-bold" style={{ color: c?.tertiary ?? "rgb(var(--hi-rgb))" }}>
            {data.tag}
          </span>
        </div>
        <div>
          <h1 className="font-display text-lg font-bold uppercase tracking-hud text-hi">{data.name}</h1>
          <p className="stat-value text-sm text-lo">
            #{data.tag} · {data.enrolled ? t("premierTeamDetail.enrolled") : t("premierTeamDetail.notEnrolled")}
          </p>
        </div>
        <div className="ml-auto flex gap-6">
          <Stat label={t("premierTeamDetail.stats.ranking")} value={data.placement ? `#${data.placement.place ?? "?"}` : "—"} />
          <Stat
            label={t("premierTeamDetail.stats.conference")}
            value={
              data.placement
                ? t("premierTeamDetail.stats.conferenceDivision", {
                    conference: data.placement.conference ?? "?",
                    division: data.placement.division ?? "?",
                  })
                : "—"
            }
          />
          <Stat label={t("premierTeamDetail.stats.points")} value={data.placement?.points?.toString() ?? "—"} />
        </div>
      </Panel>

      {data.stats && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <MiniStat label={t("premierTeamDetail.stats.matches")} value={data.stats.matches ?? 0} />
          <MiniStat label={t("premierTeamDetail.stats.wins")} value={data.stats.wins ?? 0} accent="text-accent" />
          <MiniStat label={t("premierTeamDetail.stats.losses")} value={data.stats.losses ?? 0} accent="text-crit" />
          <MiniStat
            label={t("premierTeamDetail.stats.roundsWonLost")}
            value={`${data.stats.rounds_won ?? 0}/${data.stats.rounds_lost ?? 0}`}
          />
        </div>
      )}

      <Panel className="p-4">
        <p className="hud-label mb-3">{t("premierTeamDetail.roster", { count: data.member.length })}</p>
        <div className="flex flex-wrap gap-2">
          {data.member.map((m) => (
            <span key={m.puuid} className="panel-clip-sm px-3 py-1.5 text-sm text-hi">
              {m.name ?? "?"}
              <span className="text-lo">#{m.tag ?? "?"}</span>
            </span>
          ))}
          {data.member.length === 0 && <p className="text-sm text-lo">{t("premierTeamDetail.rosterEmpty")}</p>}
        </div>
      </Panel>

      {(leagueMatches.length > 0 || tournamentMatches.length > 0) && (
        <Panel className="p-4">
          <p className="hud-label mb-3">{t("premierTeamDetail.seasonHistory")}</p>
          <div className="space-y-1.5">
            {leagueMatches.map((m) => (
              <div key={m.id} className="flex items-center justify-between border-b border-line/40 py-1.5 text-sm">
                <span className="text-lo">
                  {m.started_at ? new Date(m.started_at).toLocaleDateString("fr-FR") : "—"}
                </span>
                <span className="stat-value text-hi">
                  {t("premierTeamDetail.pointsTransition", {
                    before: m.points_before ?? "?",
                    after: m.points_after ?? "?",
                  })}
                  <span className={(m.points_after ?? 0) >= (m.points_before ?? 0) ? "text-accent" : "text-crit"}>
                    {" "}
                    ({(m.points_after ?? 0) - (m.points_before ?? 0) >= 0 ? "+" : ""}
                    {(m.points_after ?? 0) - (m.points_before ?? 0)})
                  </span>
                </span>
              </div>
            ))}
            {tournamentMatches.map((tm) => (
              <div key={tm.tournament_id} className="flex items-center justify-between border-b border-line/40 py-1.5 text-sm">
                <span className="text-lo">{t("premierTeamDetail.tournament", { count: tm.matches.length })}</span>
                <span className="stat-value text-hi">
                  {t("premierTeamDetail.tournamentPlacement", {
                    placement: tm.placement ?? "?",
                    before: tm.points_before ?? "?",
                    after: tm.points_after ?? "?",
                  })}
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
