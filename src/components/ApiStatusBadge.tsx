import { useApiHealthStore } from "../store/apiHealthStore";

const LABELS: Record<string, { label: string; dotClass: string }> = {
  ok: { label: "API OK", dotClass: "bg-accent" },
  rate_limited: { label: "Rate limit", dotClass: "bg-[#F5C542]" },
  circuit_open: { label: "API en pause", dotClass: "bg-crit" },
  network: { label: "Hors ligne", dotClass: "bg-crit" },
};

/** Badge permanent dans TopNav reflétant l'état de la connexion à l'API Henrik (OK / rate
 * limit / circuit breaker ouvert / panne réseau), alimenté par apiHealthStore — évite de
 * devoir attendre une erreur affichée en plein écran pour comprendre pourquoi les données
 * ne rafraîchissent plus (TODO #40). Ne s'affiche que si un souci est en cours, pour rester
 * discret le reste du temps (cohérent avec StatusBanner). */
export default function ApiStatusBadge() {
  const { status, detail } = useApiHealthStore();
  if (status === "ok") return null;

  const info = LABELS[status];

  return (
    <span
      title={detail ?? info.label}
      className="flex shrink-0 items-center gap-1.5 self-center px-2 text-lo"
    >
      <span className={`h-1.5 w-1.5 animate-pulse ${info.dotClass}`} />
      <span className="hud-label text-[10px]">{info.label}</span>
    </span>
  );
}
