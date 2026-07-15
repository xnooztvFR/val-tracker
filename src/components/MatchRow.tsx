import { useTranslation } from "react-i18next";

import type { MatchEntry } from "../lib/tauriApi";
import { agentIconUrl, formatDurationMs, formatKda, formatKdRatio, formatRelativeTime } from "../lib/format";

interface MatchRowProps {
  match: MatchEntry;
  puuid: string;
  onClick?: () => void;
}

/** Ligne de la timeline d'engagements (Historique) : barre d'accent verticale fine
 * (cyan = victoire, rouge = défaite), fond neutre, colonnes numériques en mono. */
export default function MatchRow({ match, puuid, onClick }: MatchRowProps) {
  const { t } = useTranslation("componentsExtra");
  const player = match.players.find((p) => p.puuid === puuid);
  const team = match.teams.find((t) => t.team_id === player?.team_id);
  const won = team?.won;

  const resultLabel =
    won === true ? t("matchRow.victory") : won === false ? t("matchRow.defeat") : t("matchRow.noResult");
  const resultColor = won === true ? "text-accent" : won === false ? "text-crit" : "text-lo";
  const barColor = won === true ? "bg-accent" : won === false ? "bg-crit" : "bg-line";

  const stats = player?.stats;
  const kills = stats?.kills ?? 0;
  const deaths = stats?.deaths ?? 0;
  const assists = stats?.assists ?? 0;
  const roundsPlayed = (team?.rounds?.won ?? 0) + (team?.rounds?.lost ?? 0);
  const acs = roundsPlayed > 0 ? Math.round((stats?.score ?? 0) / roundsPlayed) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex w-full items-center gap-3.5 border border-line bg-surface py-2.5 pl-4 pr-3.5 text-left transition-colors hover:bg-raised"
    >
      <span className={`absolute inset-y-0 left-0 w-[3px] ${barColor}`} />

      <div className="w-[4.5rem] shrink-0">
        <p
          className={`flex items-center gap-1 font-display text-[11px] font-semibold uppercase tracking-hud ${resultColor}`}
        >
          <ResultIcon won={won} />
          {resultLabel}
        </p>
        <p className="mt-1 text-[11px] text-lo">{formatRelativeTime(match.metadata.started_at)}</p>
      </div>

      {player?.agent?.id ? (
        <img
          src={agentIconUrl(player.agent.id)}
          alt={player.agent.name ?? ""}
          className="h-9 w-9 shrink-0 border border-line object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
          }}
        />
      ) : (
        <div className="h-9 w-9 shrink-0 border border-line bg-base" />
      )}

      <div className="w-32 shrink-0">
        <p className="truncate text-sm text-hi">{match.metadata.map?.name ?? t("matchRow.unknownMap")}</p>
        <p className="truncate text-[11px] text-lo">{player?.agent?.name ?? t("matchRow.unknownAgent")}</p>
      </div>

      <div className="w-24 shrink-0">
        <p className="stat-value text-sm font-medium">{formatKda(kills, deaths, assists)}</p>
        <p className={`stat-value text-[11px] ${resultColor}`}>
          {t("matchRow.kdLabel", { ratio: formatKdRatio(kills, deaths) })}
        </p>
      </div>

      <div className="flex-1 text-right">
        <p className="stat-value text-sm font-medium">{t("matchRow.acsLabel", { acs: acs ?? "—" })}</p>
        <p className="stat-value text-[11px] text-lo">{t("matchRow.scoreLabel", { score: stats?.score ?? "—" })}</p>
      </div>

      <div className="stat-value w-16 shrink-0 text-right text-[11px] text-lo">
        {formatDurationMs(match.metadata.game_length_in_ms)}
      </div>
    </button>
  );
}

/** Icône (pas seulement la couleur) distinguant victoire/défaite pour l'accessibilité
 * daltonisme rouge-vert. */
function ResultIcon({ won }: { won: boolean | null | undefined }) {
  if (won === true) {
    return (
      <svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className="h-2.5 w-2.5 shrink-0">
        <path d="M2 6.5l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (won === false) {
    return (
      <svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className="h-2.5 w-2.5 shrink-0">
        <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className="h-2.5 w-2.5 shrink-0">
      <circle cx="6" cy="6" r="3.2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
