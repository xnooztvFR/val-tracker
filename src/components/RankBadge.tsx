import { rankInfo } from "../lib/format";

interface RankBadgeProps {
  tier: number | null | undefined;
  tierPatched?: string | null;
  rr?: number | null;
  size?: "sm" | "md" | "lg";
  /** Backlog #36 : micro-interaction (anneau accent/crit) quand `rank_snapshots` vient de
   * détecter une promotion (`"up"`) ou un dérank (`"down"`) — voir `.rank-pulse-*` dans
   * index.css. `null`/`undefined` = pas d'animation. */
  pulse?: "up" | "down" | null;
}

const SIZE_CLASSES: Record<NonNullable<RankBadgeProps["size"]>, string> = {
  sm: "w-8 h-8",
  md: "w-12 h-12",
  lg: "w-20 h-20",
};

export default function RankBadge({ tier, tierPatched, rr, size = "md", pulse }: RankBadgeProps) {
  const info = rankInfo(tier);
  const label = tierPatched || info.name;
  const pulseClass = pulse === "up" ? "rank-pulse-up" : pulse === "down" ? "rank-pulse-down" : "";

  return (
    <div className="flex items-center gap-3">
      <div className={`${SIZE_CLASSES[size]} rounded-full ${pulseClass}`}>
        <img
          src={info.iconUrl}
          alt={label}
          className="h-full w-full object-contain drop-shadow"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
          }}
        />
      </div>
      <div>
        <p className={`font-display font-semibold uppercase tracking-hud ${info.colorClass}`}>
          {label}
        </p>
        {rr !== null && rr !== undefined && (
          <p className="stat-value text-sm text-lo">{rr} RR</p>
        )}
      </div>
    </div>
  );
}
