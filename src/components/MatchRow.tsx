import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { MatchEntry } from "../lib/tauriApi";
import { formatDurationMs, formatKda, formatKdRatio, formatRelativeTime } from "../lib/format";
import { setMatchDragPayload } from "../lib/matchDrag";
import AgentIcon from "./AgentIcon";

interface MatchRowProps {
  match: MatchEntry;
  puuid: string;
  onClick?: () => void;
  /** Backlog Fonctionnalités#6 : identité du profil consulté (pas forcément `puuid`, qui
   * identifie la ligne dans le match) — nécessaire pour construire le payload de glisser-
   * déposer vers Compare/Notes. `MatchRow` n'est draggable que si les trois sont fournis. */
  region?: string;
  name?: string;
  tag?: string;
}

// Backlog Fonctionnalités#7 : délai avant d'afficher l'aperçu au survol — évite un popover
// qui clignote quand la souris traverse simplement la liste pour atteindre autre chose.
const HOVER_PREVIEW_DELAY_MS = 500;

/** Ligne de la timeline d'engagements (Historique) : barre d'accent verticale fine
 * (cyan = victoire, rouge = défaite), fond neutre, colonnes numériques en mono. */
export default function MatchRow({ match, puuid, onClick, region, name, tag }: MatchRowProps) {
  const { t } = useTranslation("componentsExtra");
  const player = match.players.find((p) => p.puuid === puuid);
  const team = match.teams.find((t) => t.team_id === player?.team_id);
  const won = team?.won;
  const [showPreview, setShowPreview] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleMouseEnter() {
    hoverTimer.current = setTimeout(() => setShowPreview(true), HOVER_PREVIEW_DELAY_MS);
  }

  function handleMouseLeave() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setShowPreview(false);
  }

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
  const enemyTeam = match.teams.find((t) => t.team_id !== player?.team_id);

  return (
    <div className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <button
        type="button"
        onClick={onClick}
        draggable={Boolean(region && name && tag && match.metadata.match_id)}
        onDragStart={(e) => {
          if (!region || !name || !tag || !match.metadata.match_id) return;
          setMatchDragPayload(e.dataTransfer, {
            matchId: match.metadata.match_id,
            mapName: match.metadata.map?.name ?? "",
            region,
            name,
            tag,
          });
        }}
        className="relative flex w-full items-center gap-3.5 border border-line bg-surface py-2.5 pl-4 pr-3.5 text-left transition-colors hover:bg-raised active:cursor-grabbing"
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
        <AgentIcon
          agentId={player.agent.id}
          agentName={player.agent.name}
          className="h-9 w-9 shrink-0 border border-line object-cover"
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

      {showPreview && (
        <div className="panel-clip-sm absolute left-1/2 top-full z-20 mt-1 w-72 -translate-x-1/2 bg-raised p-3 shadow-lg">
          <p className="stat-value mb-2 text-center text-sm font-semibold text-hi">
            {t("matchRow.scoreVs", { won: team?.rounds?.won ?? 0, lost: team?.rounds?.lost ?? 0 })}
          </p>
          <div className="flex items-center justify-center gap-4">
            <RosterPreview match={match} teamId={team?.team_id} />
            <span className="text-[10px] text-lo">{t("matchRow.vs")}</span>
            <RosterPreview match={match} teamId={enemyTeam?.team_id} />
          </div>
        </div>
      )}
    </div>
  );
}

function RosterPreview({ match, teamId }: { match: MatchEntry; teamId: string | null | undefined }) {
  const roster = match.players.filter((p) => p.team_id === teamId);
  return (
    <div className="flex gap-1">
      {roster.map((p) =>
        p.agent?.id ? (
          <AgentIcon
            key={p.puuid}
            agentId={p.agent.id}
            agentName={p.agent.name ?? ""}
            className="h-6 w-6 border border-line object-cover"
          />
        ) : (
          <div key={p.puuid} className="h-6 w-6 border border-line bg-base" />
        ),
      )}
    </div>
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
