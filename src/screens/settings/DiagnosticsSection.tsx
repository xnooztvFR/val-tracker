import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { tauriApi, type TaskDiagnostic } from "../../lib/tauriApi";
import { formatRelativeTime } from "../../lib/format";
import { SectionTitle } from "./shared";

/** Vue d'ensemble des tâches de fond (poller riot_local, status watcher, rappel
 * d'inactivité, thread Discord RPC) : elles tournent indépendamment, best-effort, sans
 * jamais faire échouer l'app — ce qui les rendait auparavant invisibles sans lire le
 * fichier de log brut en cas de souci. */
export default function DiagnosticsSection() {
  const { t } = useTranslation("settings");
  const [tasks, setTasks] = useState<TaskDiagnostic[] | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setTasks(await tauriApi.getBackgroundDiagnostics());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="max-w-3xl space-y-4">
      <SectionTitle>{t("diagnostics.title")}</SectionTitle>
      <p className="text-sm text-lo">{t("diagnostics.description")}</p>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="border border-line px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:bg-surface disabled:opacity-50"
        >
          {loading ? t("diagnostics.refreshing") : t("diagnostics.refresh")}
        </button>
      </div>

      <div className="divide-y divide-line border border-line">
        {(tasks ?? []).map((task) => (
          <div key={task.name} className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <p className="text-sm text-hi">{t(`diagnostics.tasks.${task.name}`)}</p>
              <p className="text-xs text-lo">
                {t("diagnostics.lastTick")}{" "}
                {task.last_tick_at
                  ? formatRelativeTime(task.last_tick_at)
                  : t("diagnostics.never")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`h-1.5 w-1.5 rounded-full ${task.last_error ? "bg-crit" : "bg-accent"}`}
              />
              {task.last_error ? (
                <p
                  className="max-w-xs truncate text-xs text-crit"
                  title={task.last_error}
                >
                  {task.last_error}
                </p>
              ) : (
                <p className="text-xs text-lo">{t("diagnostics.noError")}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
