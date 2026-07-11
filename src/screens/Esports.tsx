import { useMemo, useState } from "react";
import { Skeleton } from "../components/Skeleton";
import { Link } from "react-router-dom";

import { useEsportsSchedule } from "../hooks/useMeta";
import ErrorState from "../components/ErrorState";
import Panel from "../components/Panel";
import EmptyState from "../components/EmptyState";
import type { EsportsMatchTeam, EsportsScheduleEntry } from "../lib/tauriApi";

const STATE_LABELS: Record<string, string> = {
  completed: "Terminé",
  ongoing: "En cours",
  unstarted: "À venir",
};

function groupByDate(entries: EsportsScheduleEntry[]) {
  const groups = new Map<string, EsportsScheduleEntry[]>();
  for (const entry of entries) {
    if (!entry.date) continue;
    const day = new Date(entry.date).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const list = groups.get(day) ?? [];
    list.push(entry);
    groups.set(day, list);
  }
  return [...groups.entries()];
}

export default function Esports() {
  const [league, setLeague] = useState<string>("");
  const schedule = useEsportsSchedule({ league: league || undefined });

  const entries = schedule.data?.data ?? [];
  const leagues = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      if (e.league?.name) set.add(e.league.name);
    }
    return [...set].sort();
  }, [entries]);

  const grouped = useMemo(() => groupByDate(entries), [entries]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="hud-label text-sm">Calendrier esport (VCT)</h1>
          <Link to="/esport/evenements" className="text-xs text-accent hover:underline">
            Parcourir les événements, équipes et joueurs pro →
          </Link>
        </div>
        <select
          value={league}
          onChange={(e) => setLeague(e.target.value)}
          className="border border-line bg-surface px-3 py-1.5 text-sm text-hi focus:border-accent focus:outline-none"
        >
          <option value="">Toutes les ligues</option>
          {leagues.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {schedule.isError && <ErrorState error={schedule.error} />}
      {schedule.isLoading && <Skeleton className="h-32 w-full" />}
      {schedule.data && entries.length === 0 && (
        <EmptyState icon="match" title="Aucun match programmé" detail="Rien à afficher pour le moment." />
      )}

      {grouped.map(([day, dayEntries]) => (
        <div key={day}>
          <p className="hud-label mb-2 capitalize">{day}</p>
          <div className="space-y-2">
            {dayEntries.map((entry, i) => (
              <MatchRow key={`${entry.match_?.id ?? i}-${entry.date}`} entry={entry} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MatchRow({ entry }: { entry: EsportsScheduleEntry }) {
  const teams = entry.match_?.teams ?? [];
  const [teamA, teamB] = teams;
  const stateLabel = entry.state ? STATE_LABELS[entry.state] ?? entry.state : "?";
  const time = entry.date
    ? new Date(entry.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <Panel className="flex flex-wrap items-center gap-4 px-4 py-3">
      <div className="w-16 shrink-0">
        <p className="stat-value text-sm text-hi">{time}</p>
        <p
          className={`hud-label text-[9px] ${
            entry.state === "ongoing" ? "text-accent" : entry.state === "completed" ? "text-lo" : "text-lo"
          }`}
        >
          {stateLabel}
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center gap-4 min-w-0">
        <TeamChip team={teamA} />
        <span className="font-display text-xs font-semibold text-lo">VS</span>
        <TeamChip team={teamB} reverse />
      </div>

      <div className="w-40 shrink-0 text-right">
        <p className="truncate text-xs text-hi">{entry.league?.name ?? "—"}</p>
        <p className="truncate text-[11px] text-lo">{entry.tournament?.name ?? ""}</p>
      </div>
    </Panel>
  );
}

function TeamChip({ team, reverse }: { team?: EsportsMatchTeam; reverse?: boolean }) {
  if (!team) {
    return <span className="w-28 text-center text-sm text-lo">À déterminer</span>;
  }
  const content = (
    <>
      {team.icon && (
        <img
          src={team.icon}
          alt=""
          className="h-6 w-6 object-contain"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
          }}
        />
      )}
      <span className={`text-sm ${team.has_won ? "font-semibold text-accent" : "text-hi"}`}>
        {team.code || team.name}
      </span>
      {team.game_wins != null && <span className="stat-value text-xs text-lo">{team.game_wins}</span>}
    </>
  );
  return (
    <div className={`flex w-28 items-center gap-2 ${reverse ? "flex-row-reverse text-right" : ""}`}>{content}</div>
  );
}
