interface EmptyStateProps {
  title: string;
  detail?: string;
  icon?: "radar" | "match" | "map" | "team";
}

/** Écran/section vide au traitement HUD cohérent (coins de scan + icône ligne fine) au lieu
 * d'un simple <p> de texte — remplace les messages "Aucun·e ..." bruts dispersés dans les
 * écrans de liste (historique de matchs, stats par carte/agent, équipes, événements...). */
export default function EmptyState({ title, detail, icon = "radar" }: EmptyStateProps) {
  return (
    <div className="relative flex flex-col items-center gap-3 border border-dashed border-line px-6 py-10 text-center">
      <span className="absolute left-0 top-0 h-2.5 w-2.5 border-l border-t border-line" />
      <span className="absolute right-0 top-0 h-2.5 w-2.5 border-r border-t border-line" />
      <span className="absolute bottom-0 left-0 h-2.5 w-2.5 border-b border-l border-line" />
      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 border-b border-r border-line" />

      <EmptyStateIcon variant={icon} />
      <div>
        <p className="hud-label text-xs">{title}</p>
        {detail && <p className="mt-1.5 text-xs text-lo">{detail}</p>}
      </div>
    </div>
  );
}

function EmptyStateIcon({ variant }: { variant: NonNullable<EmptyStateProps["icon"]> }) {
  const common = {
    viewBox: "0 0 32 32",
    fill: "none",
    className: "h-7 w-7 text-lo/50",
  } as const;

  switch (variant) {
    case "match":
      return (
        <svg {...common}>
          <rect x="5" y="8" width="22" height="16" rx="0.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M5 13h22M12 8v16" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      );
    case "map":
      return (
        <svg {...common}>
          <path
            d="M4 8l8-3 8 3 8-3v19l-8 3-8-3-8 3V8z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path d="M12 5v19M20 8v19" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      );
    case "team":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="21" cy="14" r="3.2" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M6 25c0-3.6 2.7-6 6-6s6 2.4 6 6M17 25c.3-3 2.2-5 5-5s5 1.8 5 5"
            stroke="currentColor"
            strokeWidth="1.3"
          />
        </svg>
      );
    case "radar":
    default:
      return (
        <svg {...common}>
          <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="16" cy="16" r="6" stroke="currentColor" strokeWidth="1.1" opacity="0.6" />
          <path d="M16 16L23 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="16" cy="16" r="1.4" fill="currentColor" />
        </svg>
      );
  }
}
