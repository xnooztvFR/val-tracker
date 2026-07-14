import { useTranslation } from "react-i18next";

import { useApiHealthStore } from "../store/apiHealthStore";

const DOT_CLASSES: Record<string, string> = {
  ok: "bg-accent",
  rate_limited: "bg-warn",
  circuit_open: "bg-crit",
  network: "bg-crit",
};

/** Badge permanent dans TopNav reflétant l'état de la connexion à l'API Henrik (OK / rate
 * limit / circuit breaker ouvert / panne réseau), alimenté par apiHealthStore — évite de
 * devoir attendre une erreur affichée en plein écran pour comprendre pourquoi les données
 * ne rafraîchissent plus (TODO #40). Ne s'affiche que si un souci est en cours, pour rester
 * discret le reste du temps (cohérent avec StatusBanner). */
export default function ApiStatusBadge() {
  const { t } = useTranslation("componentsCore");
  const { status, detail } = useApiHealthStore();
  if (status === "ok") return null;

  const LABELS: Record<string, string> = {
    ok: t("apiStatusBadge.ok"),
    rate_limited: t("apiStatusBadge.rateLimited"),
    circuit_open: t("apiStatusBadge.circuitOpen"),
    network: t("apiStatusBadge.network"),
  };
  const label = LABELS[status];
  const dotClass = DOT_CLASSES[status];

  return (
    <span
      title={detail ?? label}
      className="flex shrink-0 items-center gap-1.5 self-center px-2 text-lo"
    >
      <span className={`h-1.5 w-1.5 animate-pulse ${dotClass}`} />
      <span className="hud-label text-[10px]">{label}</span>
    </span>
  );
}
