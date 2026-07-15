import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { tauriApi } from "../../lib/tauriApi";
import { getRegions } from "../../lib/format";
import { INPUT_CLASS, SectionTitle } from "./shared";

type VerifyState = "idle" | "checking" | "valid" | "invalid" | "error";

interface GeneralSectionProps {
  apiKeySet: boolean;
  savedApiKey: string;
  defaultRegion: string;
  /** `true` si un blob DPAPI existe pour la clé API Henrik mais n'a pas pu être déchiffré
   * (réinstallation Windows, migration de compte...) — distinct de "jamais configurée". */
  dpapiUnreadable: boolean;
  onSaveApiKey: (key: string) => Promise<void>;
  onSaveRegion: (region: string) => Promise<void>;
}

export default function GeneralSection({
  apiKeySet,
  savedApiKey,
  defaultRegion,
  dpapiUnreadable,
  onSaveApiKey,
  onSaveRegion,
}: GeneralSectionProps) {
  const { t } = useTranslation("settings");
  const [apiKeyInput, setApiKeyInput] = useState(savedApiKey);
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [saveState, setSaveState] = useState<"idle" | "saved">("idle");

  useEffect(() => {
    setApiKeyInput(savedApiKey);
  }, [savedApiKey]);

  async function handleVerify() {
    if (!apiKeyInput.trim()) return;
    setVerifyState("checking");
    try {
      const valid = await tauriApi.verifyHenrikApiKey(apiKeyInput.trim());
      setVerifyState(valid ? "valid" : "invalid");
    } catch {
      setVerifyState("error");
    }
  }

  async function handleSaveKey() {
    await onSaveApiKey(apiKeyInput.trim());
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 2000);
  }

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <SectionTitle>{t("general.title")}</SectionTitle>
        <p className="mt-1 text-sm text-lo">
          {apiKeySet ? t("general.apiKeySet") : t("general.apiKeyNotSet")}
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="hud-label">{t("general.apiKeyLabel")}</h2>
        {dpapiUnreadable && (
          <p className="border border-crit/40 bg-crit/10 px-3 py-2 text-xs text-crit">
            {t("general.apiKeyDpapiUnreadable")}
          </p>
        )}
        <div className="flex gap-2">
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => {
              setApiKeyInput(e.target.value);
              setVerifyState("idle");
            }}
            placeholder={t("general.apiKeyPlaceholder")}
            className={`flex-1 font-mono ${INPUT_CLASS}`}
          />
          <button
            type="button"
            onClick={handleVerify}
            disabled={!apiKeyInput.trim() || verifyState === "checking"}
            className="border border-line px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {verifyState === "checking" ? t("general.verifying") : t("general.verify")}
          </button>
          <button
            type="button"
            onClick={handleSaveKey}
            disabled={!apiKeyInput.trim()}
            className="btn-clip bg-accent px-4 py-2 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-accent-dim disabled:opacity-50"
          >
            {t("general.save")}
          </button>
        </div>

        {verifyState === "valid" && <p className="text-sm text-accent">{t("general.keyValid")}</p>}
        {verifyState === "invalid" && (
          <p className="text-sm text-crit">{t("general.keyInvalid")}</p>
        )}
        {verifyState === "error" && (
          <p className="text-sm text-crit">{t("general.keyVerifyError")}</p>
        )}
        {saveState === "saved" && <p className="text-sm text-accent">{t("general.keySaved")}</p>}

        <p className="text-xs text-lo">{t("general.apiKeyHint")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="hud-label">{t("general.regionLabel")}</h2>
        <select value={defaultRegion} onChange={(e) => onSaveRegion(e.target.value)} className={INPUT_CLASS}>
          {getRegions().map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </section>
    </div>
  );
}
