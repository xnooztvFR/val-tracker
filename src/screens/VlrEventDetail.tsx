import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Skeleton } from "../components/Skeleton";

import { useVlrEventMatches } from "../hooks/useVlr";
import ErrorState from "../components/ErrorState";
import Panel from "../components/Panel";
import EmptyState from "../components/EmptyState";

export default function VlrEventDetail() {
  const { t } = useTranslation("esports");
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const matches = useVlrEventMatches(eventId ? Number(eventId) : undefined);

  const list = matches.data?.data ?? [];

  return (
    <div className="space-y-4">
      <Link to="/esport/evenements" className="text-sm text-accent hover:underline">
        {t("vlrEventDetail.backLink")}
      </Link>
      <h1 className="hud-label text-sm">{list[0]?.event ?? t("vlrEventDetail.fallbackTitle")}</h1>

      {matches.isError && <ErrorState error={matches.error} />}
      {matches.isLoading && <Skeleton className="h-32 w-full" />}
      {matches.data && list.length === 0 && <EmptyState icon="match" title={t("vlrEventDetail.empty.title")} />}

      <div className="space-y-2">
        {list.map((match) => (
          <Panel
            key={match.id}
            className="flex flex-wrap items-center gap-4 px-4 py-3 transition-colors hover:bg-raised/50"
            onClick={() => navigate(`/esport/match/${match.id}`)}
          >
            <div className="w-32 shrink-0">
              <p className="stat-value text-sm text-hi">
                {match.date ? new Date(match.date).toLocaleDateString("fr-FR") : "—"}
              </p>
              <p className="text-[11px] text-lo">{match.series ?? ""}</p>
            </div>
            <div className="flex flex-1 items-center justify-center gap-4">
              {match.teams.map((team, i) => (
                <span key={i} className={`text-sm ${team.is_winner ? "font-semibold text-accent" : "text-hi"}`}>
                  {team.name} {team.score != null && <span className="stat-value text-lo">{team.score}</span>}
                  {i === 0 && match.teams.length > 1 && (
                    <span className="mx-2 text-lo">{t("vlrEventDetail.vs")}</span>
                  )}
                </span>
              ))}
            </div>
            <div className="flex gap-1">
              {match.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="border border-line px-1.5 py-0.5 text-[10px] uppercase text-lo">
                  {tag}
                </span>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
