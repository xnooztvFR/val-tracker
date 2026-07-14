import { useState } from "react";
import { useTranslation } from "react-i18next";

import { tauriApi } from "../../lib/tauriApi";
import { INPUT_CLASS, SectionTitle } from "./shared";

export default function CrosshairSection() {
  const { t } = useTranslation("settings");
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setState("loading");
    setPreview(null);
    try {
      const base64 = await tauriApi.fetchCrosshairPreview(code.trim());
      setPreview(`data:image/png;base64,${base64}`);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>{t("crosshair.title")}</SectionTitle>
      <p className="text-sm text-lo">{t("crosshair.description")}</p>

      <form onSubmit={handlePreview} className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t("crosshair.placeholder")}
          className={`flex-1 font-mono ${INPUT_CLASS}`}
        />
        <button
          type="submit"
          disabled={!code.trim() || state === "loading"}
          className="btn-clip bg-accent px-4 py-2 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-accent-dim disabled:opacity-50"
        >
          {state === "loading" ? t("crosshair.generating") : t("crosshair.preview")}
        </button>
      </form>

      {state === "error" && (
        <p className="text-sm text-crit">{t("crosshair.error")}</p>
      )}

      {preview && (
        <div className="panel-clip flex items-center justify-center bg-[#0B0E11] p-8">
          <img src={preview} alt={t("crosshair.previewAlt")} className="max-h-40" />
        </div>
      )}
    </div>
  );
}
