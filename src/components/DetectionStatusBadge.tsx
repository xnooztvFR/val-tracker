import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useLiveDetectionState } from "../hooks/useLiveState";

/** Rend visible en permanence, dans la barre de nav principale, si la détection auto de
 * partie (API locale Riot) tourne, est en pause (hors-jeu/menu), a repéré une partie, ou
 * est désactivée dans Paramètres — pour que la bascule vers le mode recherche manuelle
 * (quand l'API locale devient indisponible) ne soit jamais une surprise silencieuse.
 * Juste un point de couleur (tooltip pour le détail) plutôt qu'un label texte : la barre
 * de nav a une largeur fixe et un label toujours affiché la faisait déborder. */
export default function DetectionStatusBadge() {
  const { t } = useTranslation("componentsCore");
  const navigate = useNavigate();
  const snapshot = useLiveDetectionState();
  if (!snapshot) return null;

  const LABELS: Record<string, { label: string; dotClass: string }> = {
    desactive: { label: t("detectionStatusBadge.disabled"), dotClass: "bg-lo/50" },
    hors_jeu: { label: t("detectionStatusBadge.active"), dotClass: "bg-lo/50" },
    menu: { label: t("detectionStatusBadge.active"), dotClass: "bg-lo/50" },
    pregame: { label: t("detectionStatusBadge.detected"), dotClass: "bg-accent" },
    in_game: { label: t("detectionStatusBadge.detected"), dotClass: "bg-accent" },
    post_game: { label: t("detectionStatusBadge.detected"), dotClass: "bg-accent" },
  };
  const info = LABELS[snapshot.state] ?? LABELS.hors_jeu;

  return (
    <button
      type="button"
      onClick={() => navigate("/parametres?section=game")}
      title={t("detectionStatusBadge.tooltip", { label: info.label })}
      aria-label={info.label}
      className="flex h-8 w-8 shrink-0 items-center justify-center self-center text-lo transition-colors hover:text-hi"
    >
      <span className={`h-2 w-2 rounded-full ${info.dotClass}`} />
    </button>
  );
}
