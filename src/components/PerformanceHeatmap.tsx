import { Fragment } from "react";

import type { HeatmapCell } from "../lib/stats";

const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/** Backlog #15 : grille jour x heure — l'opacité reflète le winrate, la présence de cellule
 * (vs. fond neutre) reflète juste qu'il y a eu au moins un match sur ce créneau. */
export default function PerformanceHeatmap({ cells }: { cells: HeatmapCell[] }) {
  const maxMatches = Math.max(1, ...cells.map((c) => c.matches));

  return (
    <div className="overflow-x-auto">
      <div className="inline-grid grid-cols-[2.5rem_repeat(24,1fr)] gap-[2px]">
        <div />
        {Array.from({ length: 24 }, (_, hour) => (
          <div key={hour} className="text-center text-[9px] text-lo">
            {hour % 4 === 0 ? hour : ""}
          </div>
        ))}
        {DAY_LABELS.map((label, day) => (
          <Fragment key={day}>
            <div className="flex items-center text-[10px] text-lo">{label}</div>
            {Array.from({ length: 24 }, (_, hour) => {
              const cell = cells.find((c) => c.day === day && c.hour === hour);
              const matches = cell?.matches ?? 0;
              const winPercent = matches > 0 ? ((cell?.wins ?? 0) / matches) * 100 : null;
              const intensity = matches > 0 ? Math.min(1, matches / maxMatches) : 0;
              const color =
                winPercent === null
                  ? "rgb(var(--color-line) / 0.4)"
                  : winPercent >= 50
                    ? `rgb(var(--color-accent) / ${0.25 + intensity * 0.65})`
                    : `rgb(var(--color-crit) / ${0.25 + intensity * 0.65})`;
              return (
                <div
                  key={`${day}-${hour}`}
                  title={
                    matches > 0
                      ? `${label} ${hour}h — ${matches} match${matches > 1 ? "s" : ""}, ${Math.round(winPercent ?? 0)}% de victoires`
                      : `${label} ${hour}h — aucun match`
                  }
                  className="h-3.5 w-3.5"
                  style={{ backgroundColor: color }}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
