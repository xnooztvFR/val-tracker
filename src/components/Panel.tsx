import type { KeyboardEvent, ReactNode } from "react";

interface PanelProps {
  children: ReactNode;
  className?: string;
  hoverable?: boolean;
  onClick?: () => void;
}

/** Conteneur standard du design system HUD : coin coupé en diagonale (.panel-clip),
 * fond surface, liseré hairline. `hoverable` ajoute l'effet "verrouillage de cible"
 * (crochets cyan en coin) au survol. `onClick` transforme le panneau en élément
 * interactif (accessible au clavier). */
export default function Panel({ children, className = "", hoverable = false, onClick }: PanelProps) {
  const interactiveProps = onClick
    ? {
        onClick,
        role: "button" as const,
        tabIndex: 0,
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        },
      }
    : {};

  if (hoverable) {
    return (
      <div className="target-lock h-full">
        <div
          className={`panel-clip flex h-full flex-col transition-colors hover:bg-raised ${className}`}
          {...interactiveProps}
        >
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className={`panel-clip ${className}`} {...interactiveProps}>
      {children}
    </div>
  );
}
