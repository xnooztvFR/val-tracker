import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { tauriApi } from "../../lib/tauriApi";
import { SectionTitle } from "./shared";

export default function LogsSection() {
  const { t } = useTranslation("settings");
  const [snapshot, setSnapshot] = useState<{ path: string | null; content: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  async function load() {
    setLoading(true);
    try {
      setSnapshot(await tauriApi.getRecentLogs());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCopy() {
    if (!snapshot?.content) return;
    await navigator.clipboard.writeText(snapshot.content);
    setCopyState("copied");
    setTimeout(() => setCopyState("idle"), 2000);
  }

  return (
    <div className="max-w-3xl space-y-4">
      <SectionTitle>{t("logs.title")}</SectionTitle>
      <p className="text-sm text-lo">{t("logs.description")}</p>
      {snapshot?.path && (
        <p className="font-mono text-xs text-lo/70 break-all">{snapshot.path}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="border border-line px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:bg-surface disabled:opacity-50"
        >
          {loading ? t("logs.refreshing") : t("logs.refresh")}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!snapshot?.content}
          className="border border-line px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:bg-surface disabled:opacity-50"
        >
          {copyState === "copied" ? t("logs.copied") : t("logs.copy")}
        </button>
      </div>

      <pre className="max-h-[60vh] overflow-auto border border-line bg-surface p-4 font-mono text-[11px] leading-relaxed text-lo">
        {snapshot?.content ? snapshot.content : t("logs.empty")}
      </pre>
    </div>
  );
}
