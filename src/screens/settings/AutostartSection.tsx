import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { tauriApi } from "../../lib/tauriApi";
import { SectionTitle } from "./shared";

/** Backlog #69 : pas de champ dans `AppSettings` — l'état de la tâche planifiée gérée par
 * le plugin autostart fait déjà foi (voir commands.rs), donc requête directe plutôt que de
 * dupliquer un flag dans le store zustand des settings. */
export default function AutostartSection() {
  const { t } = useTranslation("settings");
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tauriApi
      .getAutostartEnabled()
      .then(setEnabled)
      .catch(() => setEnabled(false))
      .finally(() => setLoading(false));
  }, []);

  async function handleChange(value: boolean) {
    setEnabled(value);
    try {
      await tauriApi.saveAutostartEnabled(value);
    } catch {
      setEnabled(!value);
    }
  }

  return (
    <section className="max-w-xl space-y-2">
      <SectionTitle>{t("autostart.title")}</SectionTitle>
      <label className="flex items-center gap-2.5 text-sm text-hi">
        <input
          type="checkbox"
          checked={enabled}
          disabled={loading}
          onChange={(e) => handleChange(e.target.checked)}
          className="h-4 w-4 border-line bg-surface accent-accent"
        />
        {t("autostart.label")}
      </label>
      <p className="text-xs text-lo">{t("autostart.hint")}</p>
    </section>
  );
}
