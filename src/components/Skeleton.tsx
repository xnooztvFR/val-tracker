interface SkeletonProps {
  className?: string;
}

/** Placeholder de chargement façon HUD (scanline en boucle, voir `.skeleton` dans
 * index.css) — remplace les `<p>Chargement…</p>` bruts dispersés dans les écrans. */
export function Skeleton({ className = "h-24 w-full" }: SkeletonProps) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/** Composition prête à l'emploi pour un écran/section entière en cours de chargement
 * (barre de titre + un ou plusieurs blocs de contenu). */
export function SkeletonScreen({ rows = 2, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      <Skeleton className="h-7 w-1/3" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-32 w-full" />
      ))}
    </div>
  );
}
