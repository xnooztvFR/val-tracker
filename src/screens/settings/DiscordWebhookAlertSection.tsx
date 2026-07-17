import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { INPUT_CLASS, SectionTitle } from "./shared";

interface DiscordWebhookAlertSectionProps {
  webhookEnabled: boolean;
  webhookUrl: string;
  onChangeWebhookEnabled: (enabled: boolean) => Promise<void>;
  onSaveWebhookUrl: (url: string) => Promise<void>;
}

export default function DiscordWebhookAlertSection({
  webhookEnabled,
  webhookUrl,
  onChangeWebhookEnabled,
  onSaveWebhookUrl,
}: DiscordWebhookAlertSectionProps) {
  const { t } = useTranslation("settings");
  const [webhookInput, setWebhookInput] = useState(webhookUrl);
  const [webhookSaveState, setWebhookSaveState] = useState<"idle" | "saved">("idle");

  useEffect(() => {
    setWebhookInput(webhookUrl);
  }, [webhookUrl]);

  async function handleSaveWebhook() {
    await onSaveWebhookUrl(webhookInput.trim());
    setWebhookSaveState("saved");
    setTimeout(() => setWebhookSaveState("idle"), 2000);
  }

  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>{t("discord.webhookTitle")}</SectionTitle>
      <p className="text-sm text-lo">{t("discord.webhookDescription")}</p>

      <label className="flex items-center gap-2.5 text-sm text-hi">
        <input
          type="checkbox"
          checked={webhookEnabled}
          onChange={(e) => onChangeWebhookEnabled(e.target.checked)}
          className="h-4 w-4 border-line bg-surface accent-accent"
        />
        {t("discord.webhookEnableLabel")}
      </label>

      <section className="space-y-2">
        <h2 className="hud-label">{t("discord.webhookUrlLabel")}</h2>
        <div className="flex gap-2">
          <input
            value={webhookInput}
            onChange={(e) => setWebhookInput(e.target.value)}
            placeholder={t("discord.webhookUrlPlaceholder")}
            className={`flex-1 font-mono ${INPUT_CLASS}`}
          />
          <button
            type="button"
            onClick={handleSaveWebhook}
            disabled={!webhookInput.trim()}
            className="btn-clip bg-accent px-4 py-2 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-accent-dim disabled:opacity-50"
          >
            {t("discord.save")}
          </button>
        </div>
        {webhookSaveState === "saved" && <p className="text-sm text-accent">{t("discord.saved")}</p>}
        <p className="text-xs text-lo">{t("discord.webhookUrlHint")}</p>
      </section>
    </div>
  );
}
