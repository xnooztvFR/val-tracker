import { useState } from "react";
import { useTranslation } from "react-i18next";

import { tauriApi } from "../../lib/tauriApi";
import { buildLocalStatsExport, toCsv, toJson } from "../../lib/exportLocalStats";
import { downloadTextFile } from "../../lib/downloadFile";
import ConfirmDialog from "../../components/ConfirmDialog";
import { SectionTitle } from "./shared";

export default function DataSection() {
  const { t } = useTranslation("settings");
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [exportStatus, setExportStatus] = useState<"idle" | "working" | "error">("idle");
  const [confirmingReset, setConfirmingReset] = useState(false);

  async function handleReset() {
    setConfirmingReset(false);
    setStatus("working");
    try {
      await tauriApi.resetLocalStats();
      setStatus("done");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }

  async function handleExport(format: "csv" | "json") {
    setExportStatus("working");
    try {
      const data = await buildLocalStatsExport();
      const date = new Date().toISOString().slice(0, 10);
      if (format === "csv") {
        downloadTextFile(`valorant-tracker-stats-${date}.csv`, toCsv(data), "text/csv;charset=utf-8");
      } else {
        downloadTextFile(`valorant-tracker-stats-${date}.json`, toJson(data), "application/json");
      }
      setExportStatus("idle");
    } catch {
      setExportStatus("error");
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>{t("data.title")}</SectionTitle>
      <p className="text-sm text-lo">{t("data.description")}</p>

      <div className="border border-line p-4">
        <h2 className="text-sm font-semibold text-hi">{t("data.exportTitle")}</h2>
        <p className="mt-1 text-xs text-lo">{t("data.exportDescription")}</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => handleExport("csv")}
            disabled={exportStatus === "working"}
            className="border border-line px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {t("data.exportCsv")}
          </button>
          <button
            type="button"
            onClick={() => handleExport("json")}
            disabled={exportStatus === "working"}
            className="border border-line px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {t("data.exportJson")}
          </button>
        </div>
        {exportStatus === "error" && <p className="mt-2 text-sm text-crit">{t("data.exportError")}</p>}
      </div>

      <div className="relative border border-crit/30 bg-crit/5 p-4">
        <span className="absolute inset-y-0 left-0 w-[3px] bg-crit" />
        <h2 className="text-sm font-semibold text-hi">{t("data.resetTitle")}</h2>
        <p className="mt-1 text-xs text-lo">{t("data.resetDescription")}</p>
        <button
          type="button"
          onClick={() => setConfirmingReset(true)}
          disabled={status === "working"}
          className="mt-3 border border-crit/60 px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-crit transition-colors hover:bg-crit/10 disabled:opacity-50"
        >
          {status === "working" ? t("data.deleting") : t("data.delete")}
        </button>
        {status === "done" && <p className="mt-2 text-sm text-accent">{t("data.deleted")}</p>}
        {status === "error" && <p className="mt-2 text-sm text-crit">{t("data.deleteError")}</p>}
      </div>

      <ConfirmDialog
        open={confirmingReset}
        message={t("data.resetConfirm")}
        confirmLabel={t("data.delete")}
        onConfirm={handleReset}
        onCancel={() => setConfirmingReset(false)}
      />
    </div>
  );
}
