import { useTranslation } from "react-i18next";

import type { AccountTimelineEvent } from "../lib/tauriApi";
import { formatDateTimeShort, rankGlowColor } from "../lib/format";
import Panel from "./Panel";

interface AccountTimelineProps {
  events: AccountTimelineEvent[];
}

/** Backlog #57 : frise "vie du compte" — rank_snapshots, objectifs hebdo atteints et note
 * perso sur un seul axe temporel narratif (voir hooks/usePlayer::useAccountTimeline). */
export default function AccountTimeline({ events }: AccountTimelineProps) {
  const { t } = useTranslation("componentsExtra");

  if (events.length === 0) {
    return <p className="text-sm text-lo">{t("accountTimeline.empty")}</p>;
  }

  return (
    <div className="space-y-0">
      {events.map((event, index) => (
        <div key={`${event.event_type}-${event.occurred_at}-${index}`} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: dotColor(event) }}
            />
            {index < events.length - 1 && <span className="w-px flex-1 bg-line" />}
          </div>
          <Panel className="mb-3 flex-1 p-3">
            <p className="text-xs text-lo">{formatDateTimeShort(event.occurred_at)}</p>
            <p className="mt-0.5 text-sm text-hi">{eventLabel(event, t)}</p>
          </Panel>
        </div>
      ))}
    </div>
  );
}

function dotColor(event: AccountTimelineEvent): string {
  if (event.event_type === "rank_change") return rankGlowColor(event.tier);
  if (event.event_type === "goal_achieved") return "rgb(var(--color-accent))";
  return "rgb(var(--color-lo))";
}

function eventLabel(event: AccountTimelineEvent, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (event.event_type === "rank_change") {
    return t("accountTimeline.rankChange", {
      tier: event.tier_patched ?? "—",
      rr: event.rr ?? 0,
    });
  }
  if (event.event_type === "goal_achieved") {
    const goalLabel =
      event.goal_type === "weekly_matches"
        ? t("accountTimeline.goalMatches")
        : t("accountTimeline.goalWinrate");
    return t("accountTimeline.goalAchieved", { goal: goalLabel });
  }
  return t("accountTimeline.noteUpdated");
}
