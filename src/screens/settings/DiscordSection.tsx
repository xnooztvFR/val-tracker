import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { INPUT_CLASS, SectionTitle } from "./shared";

interface DiscordSectionProps {
  enabled: boolean;
  clientId: string;
  onChangeEnabled: (enabled: boolean) => Promise<void>;
  onSaveClientId: (clientId: string) => Promise<void>;
}

export default function DiscordSection({
  enabled,
  clientId,
  onChangeEnabled,
  onSaveClientId,
}: DiscordSectionProps) {
  const { t } = useTranslation("settings");
  const [input, setInput] = useState(clientId);
  const [saveState, setSaveState] = useState<"idle" | "saved">("idle");

  useEffect(() => {
    setInput(clientId);
  }, [clientId]);

  async function handleSave() {
    await onSaveClientId(input.trim());
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 2000);
  }

  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>{t("discord.title")}</SectionTitle>
      <p className="text-sm text-lo">{t("discord.description")}</p>

      <label className="flex items-center gap-2.5 text-sm text-hi">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChangeEnabled(e.target.checked)}
          className="h-4 w-4 border-line bg-surface accent-accent"
        />
        {t("discord.enableLabel")}
      </label>

      <section className="space-y-2">
        <h2 className="hud-label">{t("discord.clientIdLabel")}</h2>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("discord.clientIdPlaceholder")}
            className={`flex-1 font-mono ${INPUT_CLASS}`}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!input.trim()}
            className="btn-clip bg-accent px-4 py-2 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-accent-dim disabled:opacity-50"
          >
            {t("discord.save")}
          </button>
        </div>
        {saveState === "saved" && <p className="text-sm text-accent">{t("discord.saved")}</p>}
        <p className="text-xs text-lo">
          <Trans
            t={t}
            i18nKey="discord.clientIdHint"
            components={{ portal: <span className="font-mono text-hi" /> }}
          />
        </p>
      </section>

      <div className="panel-clip-sm space-y-1.5 p-3 text-xs text-lo">
        <p>{t("discord.bestEffort")}</p>
      </div>
    </div>
  );
}
