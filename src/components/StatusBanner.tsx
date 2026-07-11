import { useState } from "react";

import { useServerStatus } from "../hooks/useMeta";
import { useActivePlayerStore } from "../store/activePlayerStore";
import { useSettingsStore } from "../store/settingsStore";
import type { StatusIncident } from "../lib/tauriApi";

function pickTitle(incident: StatusIncident): string {
  const fr = incident.titles.find((t) => t.locale?.startsWith("fr"));
  const en = incident.titles.find((t) => t.locale?.startsWith("en"));
  return fr?.content ?? en?.content ?? incident.titles[0]?.content ?? "Incident en cours";
}

/** Bandeau global d'alerte : incidents/maintenances Riot en cours sur la région active
 * (ou la région par défaut si aucun joueur n'est encore suivi). Discret : une ligne fine,
 * masquable pour la session, en haut de l'app sous la barre de navigation. */
export default function StatusBanner() {
  const player = useActivePlayerStore((s) => s.player);
  const defaultRegion = useSettingsStore((s) => s.settings?.default_region);
  const region = player?.region ?? defaultRegion ?? "eu";

  const status = useServerStatus(region);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const incidents = [...(status.data?.data.incidents ?? []), ...(status.data?.data.maintenances ?? [])].filter(
    (i) => i.id != null && !dismissed.has(i.id),
  );

  if (incidents.length === 0) return null;

  const incident = incidents[0];
  const isMaintenance = Boolean(incident.maintenance_status);

  return (
    <div
      className={`flex items-center gap-3 border-b px-4 py-1.5 text-xs ${
        isMaintenance ? "border-line bg-surface text-lo" : "border-crit/40 bg-crit/10 text-crit"
      }`}
    >
      <span className="hud-label text-[10px]">{isMaintenance ? "Maintenance" : "Incident"} · {region.toUpperCase()}</span>
      <span className="flex-1 truncate">{pickTitle(incident)}</span>
      {incidents.length > 1 && <span className="text-[10px] opacity-70">+{incidents.length - 1} autre(s)</span>}
      <button
        type="button"
        onClick={() => incident.id != null && setDismissed((prev) => new Set(prev).add(incident.id!))}
        className="shrink-0 opacity-70 hover:opacity-100"
        aria-label="Masquer"
      >
        ✕
      </button>
    </div>
  );
}
