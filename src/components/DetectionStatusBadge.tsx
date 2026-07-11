import { useNavigate } from "react-router-dom";

import { useLiveDetectionState } from "../hooks/useLiveState";

const LABELS: Record<string, { label: string; dotClass: string }> = {
  desactive: { label: "Détection désactivée", dotClass: "bg-lo/50" },
  hors_jeu: { label: "Détection active", dotClass: "bg-lo/50" },
  menu: { label: "Détection active", dotClass: "bg-lo/50" },
  pregame: { label: "Partie détectée", dotClass: "bg-accent" },
  in_game: { label: "Partie détectée", dotClass: "bg-accent" },
  post_game: { label: "Partie détectée", dotClass: "bg-accent" },
};

/** Rend visible en permanence, dans la barre de nav principale, si la détection auto de
 * partie (API locale Riot) tourne, est en pause (hors-jeu/menu), a repéré une partie, ou
 * est désactivée dans Paramètres — pour que la bascule vers le mode recherche manuelle
 * (quand l'API locale devient indisponible) ne soit jamais une surprise silencieuse. */
export default function DetectionStatusBadge() {
  const navigate = useNavigate();
  const snapshot = useLiveDetectionState();
  if (!snapshot) return null;

  const info = LABELS[snapshot.state] ?? LABELS.hors_jeu;

  return (
    <button
      type="button"
      onClick={() => navigate("/parametres?section=overlay")}
      title="Overlay en jeu — voir les paramètres"
      className="flex shrink-0 items-center gap-1.5 self-center px-2 text-lo transition-colors hover:text-hi"
    >
      <span className={`h-1.5 w-1.5 ${info.dotClass}`} />
      <span className="hud-label text-[10px]">{info.label}</span>
    </button>
  );
}
