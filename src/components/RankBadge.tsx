import { rankInfo } from "../lib/format";

interface RankBadgeProps {
  tier: number | null | undefined;
  tierPatched?: string | null;
  rr?: number | null;
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASSES: Record<NonNullable<RankBadgeProps["size"]>, string> = {
  sm: "w-8 h-8",
  md: "w-12 h-12",
  lg: "w-20 h-20",
};

export default function RankBadge({ tier, tierPatched, rr, size = "md" }: RankBadgeProps) {
  const info = rankInfo(tier);
  const label = tierPatched || info.name;

  return (
    <div className="flex items-center gap-3">
      <img
        src={info.iconUrl}
        alt={label}
        className={`${SIZE_CLASSES[size]} object-contain drop-shadow`}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
        }}
      />
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
