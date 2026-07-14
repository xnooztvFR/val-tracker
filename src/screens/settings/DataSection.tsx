import { useState } from "react";
import { useTranslation } from "react-i18next";

import { tauriApi } from "../../lib/tauriApi";
import { SectionTitle } from "./shared";

export default function DataSection() {
  const { t } = useTranslation("settings");
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");

  async function handleReset() {
    const confirmed = window.confirm(t("data.resetConfirm"));
    if (!confirmed) return;

    setStatus("working");
    try {
      await tauriApi.resetLocalStats();
      setStatus("done");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>{t("data.title")}</SectionTitle>
      <p className="text-sm text-lo">{t("data.description")}</p>

      <div className="relative border border-crit/30 bg-crit/5 p-4">
        <span className="absolute inset-y-0 left-0 w-[3px] bg-crit" />
        <h2 className="text-sm font-semibold text-hi">{t("data.resetTitle")}</h2>
        <p className="mt-1 text-xs text-lo">{t("data.resetDescription")}</p>
        <button
          type="button"
          onClick={handleReset}
          disabled={status === "working"}
          className="mt-3 border border-crit/60 px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-crit transition-colors hover:bg-crit/10 disabled:opacity-50"
        >
          {status === "working" ? t("data.deleting") : t("data.delete")}
        </button>
        {status === "done" && <p className="mt-2 text-sm text-accent">{t("data.deleted")}</p>}
        {status === "error" && <p className="mt-2 text-sm text-crit">{t("data.deleteError")}</p>}
      </div>
    </div>
  );
}
