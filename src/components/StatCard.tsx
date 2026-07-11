import type { ReactNode } from "react";

import Panel from "./Panel";

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  /** Pourcentage (0-100) représenté par une jauge linéaire fine, ex. winrate. */
  gaugePercent?: number;
  gaugeColor?: string;
  icon?: ReactNode;
  /** Fait ressortir la carte (valeur plus grande) dans une grille asymétrique. */
  emphasis?: boolean;
}

export default function StatCard({
  label,
  value,
  hint,
  gaugePercent,
  gaugeColor = "#7CE8D3",
  icon,
  emphasis = false,
}: StatCardProps) {
  return (
    <Panel hoverable className="flex h-full flex-col justify-between px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-left">
          <p className="hud-label truncate">{label}</p>
          <p className={`stat-value mt-1.5 font-bold leading-none ${emphasis ? "text-2xl" : "text-xl"}`}>
            {value}
          </p>
          {hint && <p className="mt-1.5 truncate text-[11px] text-lo">{hint}</p>}
        </div>
        {icon && gaugePercent === undefined && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center text-lo">{icon}</div>
        )}
      </div>

      {gaugePercent !== undefined && (
        <div className="mt-3 flex items-center gap-2">
          <div className="h-[3px] flex-1 bg-line">
            <div
              className="h-full transition-all"
              style={{
                width: `${Math.max(0, Math.min(100, gaugePercent))}%`,
                backgroundColor: gaugeColor,
              }}
            />
          </div>
          <span className="stat-value text-[10px] text-lo">{Math.round(gaugePercent)}%</span>
        </div>
      )}
    </Panel>
  );
}
