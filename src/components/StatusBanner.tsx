import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useServerStatus } from "../hooks/useMeta";
import { useActivePlayerStore } from "../store/activePlayerStore";
import { useSettingsStore } from "../store/settingsStore";
import type { StatusIncident } from "../lib/tauriApi";

function pickTitle(incident: StatusIncident, fallback: string): string {
  const fr = incident.titles.find((t) => t.locale?.startsWith("fr"));
  const en = incident.titles.find((t) => t.locale?.startsWith("en"));
  return fr?.content ?? en?.content ?? incident.titles[0]?.content ?? fallback;
}

/** Bandeau global d'alerte : incidents/maintenances Riot en cours sur la région active
 * (ou la région par défaut si aucun joueur n'est encore suivi). Discret : une ligne fine,
 * masquable pour la session, en haut de l'app sous la barre de navigation. */
export default function StatusBanner() {
  const { t } = useTranslation("componentsCore");
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
      <span className="hud-label text-[10px]">
        {isMaintenance ? t("statusBanner.maintenance") : t("statusBanner.incident")} · {region.toUpperCase()}
      </span>
      <span className="flex-1 truncate">{pickTitle(incident, t("statusBanner.defaultIncidentTitle"))}</span>
      {incidents.length > 1 && (
        <span className="text-[10px] opacity-70">{t("statusBanner.moreOthers", { count: incidents.length - 1 })}</span>
      )}
      <button
        type="button"
        onClick={() => incident.id != null && setDismissed((prev) => new Set(prev).add(incident.id!))}
        className="shrink-0 opacity-70 hover:opacity-100"
        aria-label={t("statusBanner.dismiss")}
      >
        ✕
      </button>
    </div>
  );
}
