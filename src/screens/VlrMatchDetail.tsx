import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SkeletonScreen } from "../components/Skeleton";

import { useVlrMatch } from "../hooks/useVlr";
import ErrorState from "../components/ErrorState";
import Panel from "../components/Panel";
import ExternalImage from "../components/ExternalImage";
import type { VlrMatchGame } from "../lib/tauriApi";

export default function VlrMatchDetail() {
  const { t } = useTranslation("esports");
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const match = useVlrMatch(matchId ? Number(matchId) : undefined);

  if (match.isError) return <ErrorState error={match.error} />;
  if (match.isLoading) return <SkeletonScreen className="p-6" />;

  const data = match.data?.data;
  if (!data) return <p className="text-sm text-lo">{t("vlrMatchDetail.notFound")}</p>;

  return (
    <div className="space-y-4">
      <Link to="/esport" className="text-sm text-accent hover:underline">
        {t("vlrMatchDetail.backLink")}
      </Link>

      <Panel className="flex flex-wrap items-center gap-6 px-5 py-4">
        {data.teams.map((team, i) => (
          <div key={team.id} className={`flex items-center gap-3 ${i === 1 ? "ml-auto flex-row-reverse text-right" : ""}`}>
            {team.icon && <ExternalImage src={team.icon} alt="" className="h-10 w-10 object-contain" />}
            <div>
              <button
                type="button"
                onClick={() => navigate(`/esport/equipe/${team.id}`)}
                className="font-display text-base font-bold uppercase tracking-hud text-hi hover:text-accent"
              >
                {team.name}
              </button>
              <p className="stat-value text-xl text-accent">{team.score ?? "—"}</p>
            </div>
          </div>
        ))}
      </Panel>

      <p className="text-center text-xs text-lo">
        {data.metadata.event?.title} · {data.metadata.format} · {t("vlrMatchDetail.patch", { patch: data.metadata.patch })}
        {data.metadata.date && ` · ${new Date(data.metadata.date).toLocaleString("fr-FR")}`}
      </p>

      {data.games.map((game, i) => (
        <GamePanel key={i} game={game} index={i} onPlayerClick={(id) => navigate(`/esport/joueur/${id}`)} />
      ))}
    </div>
  );
}

function GamePanel({
  game,
  index,
  onPlayerClick,
}: {
  game: VlrMatchGame;
  index: number;
  onPlayerClick: (id: number) => void;
}) {
  const { t } = useTranslation("esports");
  return (
    <Panel className="overflow-x-auto p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="hud-label">
          {t("vlrMatchDetail.mapHeader", { index: index + 1, map: game.map })}
        </p>
        <p className="stat-value text-sm text-lo">
          {game.teams.map((t) => `${t.name} ${t.score ?? "?"}`).join(" – ")}
        </p>
      </div>
      {game.teams.map((team) => (
        <table key={team.name} className="mb-3 w-full text-xs last:mb-0">
          <thead className="border-b border-line text-left">
            <tr>
              <th className={`px-2 py-1.5 font-semibold ${team.is_winner ? "text-accent" : "text-lo"}`}>
                {team.name}
              </th>
              <th className="hud-label px-2 py-1.5">{t("vlrMatchDetail.columns.agent")}</th>
              <th className="hud-label px-2 py-1.5">{t("vlrMatchDetail.columns.rating")}</th>
              <th className="hud-label px-2 py-1.5">{t("vlrMatchDetail.columns.acs")}</th>
              <th className="hud-label px-2 py-1.5">{t("vlrMatchDetail.columns.kda")}</th>
              <th className="hud-label px-2 py-1.5">{t("vlrMatchDetail.columns.adr")}</th>
              <th className="hud-label px-2 py-1.5">{t("vlrMatchDetail.columns.kast")}</th>
              <th className="hud-label px-2 py-1.5">{t("vlrMatchDetail.columns.hsPct")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/40">
            {team.players.map((p) => (
              <tr key={p.player.id} className="text-hi/90 hover:bg-raised/50">
                <td className="px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => onPlayerClick(p.player.id)}
                    className="font-medium hover:text-accent"
                  >
                    {p.player.name}
                  </button>
                </td>
                <td className="px-2 py-1.5 text-lo">{p.agent}</td>
                <td className="stat-value px-2 py-1.5">{p.stats?.rating?.toFixed(2) ?? "—"}</td>
                <td className="stat-value px-2 py-1.5">{p.stats?.acs ?? "—"}</td>
                <td className="stat-value px-2 py-1.5">
                  {p.stats?.kills ?? 0}/{p.stats?.deaths ?? 0}/{p.stats?.assists ?? 0}
                </td>
                <td className="stat-value px-2 py-1.5">{p.stats?.adr?.toFixed(0) ?? "—"}</td>
                <td className="stat-value px-2 py-1.5">
                  {p.stats?.kast != null ? `${Math.round(p.stats.kast)}%` : "—"}
                </td>
                <td className="stat-value px-2 py-1.5">
                  {p.stats?.hs_pct != null ? `${Math.round(p.stats.hs_pct)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </Panel>
  );
}
