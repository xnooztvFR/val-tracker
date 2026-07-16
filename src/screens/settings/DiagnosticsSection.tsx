import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { tauriApi, type DiagnosticsReport, type TaskDiagnostic } from "../../lib/tauriApi";
import { formatRelativeTime } from "../../lib/format";
import { SectionTitle } from "./shared";
import CopyButton from "../../components/CopyButton";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/** Vue d'ensemble des tâches de fond (poller riot_local, status watcher, rappel
 * d'inactivité, thread Discord RPC) : elles tournent indépendamment, best-effort, sans
 * jamais faire échouer l'app — ce qui les rendait auparavant invisibles sans lire le
 * fichier de log brut en cas de souci. */
export default function DiagnosticsSection() {
  const { t } = useTranslation("settings");
  const [tasks, setTasks] = useState<TaskDiagnostic[] | null>(null);
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [tasksResult, reportResult] = await Promise.all([
        tauriApi.getBackgroundDiagnostics(),
        tauriApi.getDiagnosticsReport(),
      ]);
      setTasks(tasksResult);
      setReport(reportResult);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const reportText = report
    ? [
        `${t("diagnostics.appVersion")}: ${report.app_version}`,
        `${t("diagnostics.overlayEnabled")}: ${report.overlay_enabled ? t("diagnostics.enabled") : t("diagnostics.disabled")}`,
        `${t("diagnostics.dbSize")}: ${report.db_size_bytes != null ? formatBytes(report.db_size_bytes) : "?"}`,
        `${t("diagnostics.lastHenrikError")}: ${
          report.last_henrik_error
            ? `${report.last_henrik_error} (${formatRelativeTime(report.last_henrik_error_at)})`
            : t("diagnostics.noError")
        }`,
        ...report.background_tasks.map(
          (task) =>
            `${t(`diagnostics.tasks.${task.name}`)}: ${
              task.last_tick_at ? formatRelativeTime(task.last_tick_at) : t("diagnostics.never")
            }${task.last_error ? ` — ${task.last_error}` : ""}`,
        ),
      ].join("\n")
    : "";

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

      {report && (
        <div className="space-y-2 border border-line p-4">
          <div className="flex items-center justify-between gap-4">
            <p className="font-display text-xs font-semibold uppercase tracking-hud text-hi">
              {t("diagnostics.reportTitle")}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-lo">{t("diagnostics.copyReport")}</span>
              <CopyButton text={reportText} label={t("diagnostics.copyReport")} />
            </div>
          </div>
          <p className="text-xs text-lo">{t("diagnostics.reportDescription")}</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-lo">{t("diagnostics.appVersion")}</dt>
            <dd className="text-hi">{report.app_version}</dd>
            <dt className="text-lo">{t("diagnostics.overlayEnabled")}</dt>
            <dd className="text-hi">
              {report.overlay_enabled ? t("diagnostics.enabled") : t("diagnostics.disabled")}
            </dd>
            <dt className="text-lo">{t("diagnostics.dbSize")}</dt>
            <dd className="text-hi">
              {report.db_size_bytes != null ? formatBytes(report.db_size_bytes) : "?"}
            </dd>
            <dt className="text-lo">{t("diagnostics.lastHenrikError")}</dt>
            <dd className={report.last_henrik_error ? "text-crit" : "text-hi"}>
              {report.last_henrik_error
                ? `${report.last_henrik_error} (${formatRelativeTime(report.last_henrik_error_at)})`
                : t("diagnostics.noError")}
            </dd>
          </dl>
        </div>
      )}

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
