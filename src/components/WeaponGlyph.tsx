import { weaponCategory } from "../lib/weaponCategories";

interface WeaponGlyphProps {
  weaponName: string | null | undefined;
  className?: string;
}

/** Backlog Design#2 : icône vectorielle maison par catégorie d'arme (pas par modèle exact —
 * Henrik ne renvoie qu'un nom, et une silhouette précise par arme serait un travail
 * d'illustration disproportionné) : une forme géométrique simple distinguant
 * pistolet/mitraillette/fusil à pompe/fusil/sniper/mitrailleuse lourde/corps-à-corps, sans
 * dépendance à un CDN externe — contrairement aux icônes d'agent, il n'y avait jusqu'ici
 * aucune icône d'arme dans l'app (juste le nom en texte, voir MatchDetail.tsx). */
export default function WeaponGlyph({ weaponName, className }: WeaponGlyphProps) {
  const category = weaponCategory(weaponName);
  if (!category) return null;

  return (
    <svg viewBox="0 0 24 12" fill="none" aria-hidden="true" className={className}>
      {renderShape(category)}
    </svg>
  );
}

function renderShape(category: ReturnType<typeof weaponCategory>) {
  switch (category) {
    case "sidearm":
      return <rect x="8" y="4" width="12" height="4" rx="1" fill="currentColor" />;
    case "smg":
      return <rect x="4" y="4" width="17" height="4" rx="1" fill="currentColor" />;
    case "shotgun":
      return (
        <>
          <rect x="2" y="5" width="20" height="2.5" rx="1" fill="currentColor" />
          <rect x="17" y="3" width="4" height="2" fill="currentColor" />
        </>
      );
    case "rifle":
      return (
        <>
          <rect x="1" y="4.5" width="22" height="3" rx="1" fill="currentColor" />
          <rect x="4" y="2" width="3" height="3" fill="currentColor" />
        </>
      );
    case "sniper":
      return (
        <>
          <rect x="0" y="5" width="24" height="2" rx="1" fill="currentColor" />
          <rect x="15" y="1.5" width="6" height="2" fill="currentColor" />
        </>
      );
    case "heavy":
      return (
        <>
          <rect x="0" y="4" width="24" height="4" rx="1" fill="currentColor" />
          <rect x="2" y="8" width="3" height="3" fill="currentColor" />
          <rect x="19" y="8" width="3" height="3" fill="currentColor" />
        </>
      );
    case "melee":
      return <path d="M2 10L18 2l2 2L6 12z" fill="currentColor" />;
    default:
      return null;
  }
}
