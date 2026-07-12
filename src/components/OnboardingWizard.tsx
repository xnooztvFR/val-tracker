import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useSettingsStore } from "../store/settingsStore";
import { tauriApi } from "../lib/tauriApi";
import { getRegions } from "../lib/format";

type Step = 1 | 2 | 3;

/** Backlog #28 : wizard en 3 étapes au premier lancement (pas de clé API configurée),
 * affiché par Search.tsx à la place du formulaire de recherche désactivé. */
export default function OnboardingWizard({ onFinish }: { onFinish: () => void }) {
  const { t } = useTranslation("componentsExtra");
  const { setApiKey, setDefaultRegion } = useSettingsStore();
  const [step, setStep] = useState<Step>(1);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [verifyState, setVerifyState] = useState<"idle" | "checking" | "valid" | "invalid" | "error">("idle");
  const [region, setRegion] = useState("eu");
  const [detected, setDetected] = useState<"idle" | "checking" | "found" | "not_found">("idle");

  async function handleVerifyAndSave() {
    if (!apiKeyInput.trim()) return;
    setVerifyState("checking");
    try {
      const valid = await tauriApi.verifyHenrikApiKey(apiKeyInput.trim());
      if (valid) {
        await setApiKey(apiKeyInput.trim());
        setVerifyState("valid");
      } else {
        setVerifyState("invalid");
      }
    } catch {
      setVerifyState("error");
    }
  }

  async function handleSaveRegion() {
    await setDefaultRegion(region);
    setStep(3);
    setDetected("checking");
    try {
      const account = await tauriApi.detectLocalAccount();
      setDetected(account ? "found" : "not_found");
    } catch {
      setDetected("not_found");
    }
  }

  return (
    <div className="panel-clip mt-8 w-full max-w-md p-6">
      <div className="mb-4 flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <span
            key={s}
            className={`h-1 flex-1 ${s <= step ? "bg-accent" : "bg-line"}`}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <h2 className="font-display text-sm font-bold uppercase tracking-hud text-hi">
            {t("onboardingWizard.step1.title")}
          </h2>
          <p className="text-xs text-lo">
            {t("onboardingWizard.step1.description")}
          </p>
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => {
              setApiKeyInput(e.target.value);
              setVerifyState("idle");
            }}
            placeholder={t("onboardingWizard.step1.placeholder")}
            className="w-full border border-line bg-surface px-3 py-2 font-mono text-sm text-hi placeholder:text-lo/60 focus:border-accent focus:outline-none"
          />
          {verifyState === "invalid" && <p className="text-xs text-crit">{t("onboardingWizard.step1.invalid")}</p>}
          {verifyState === "error" && <p className="text-xs text-crit">{t("onboardingWizard.step1.networkError")}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleVerifyAndSave}
              disabled={!apiKeyInput.trim() || verifyState === "checking"}
              className="border border-line px-3 py-1.5 text-xs text-hi hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {verifyState === "checking" ? t("onboardingWizard.step1.verifying") : t("onboardingWizard.step1.verifyAndSave")}
            </button>
            {verifyState === "valid" && (
              <button
                type="button"
                onClick={() => setStep(2)}
                className="btn-clip bg-accent px-4 py-1.5 text-xs font-bold uppercase tracking-hud text-base"
              >
                {t("onboardingWizard.step1.next")}
              </button>
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <h2 className="font-display text-sm font-bold uppercase tracking-hud text-hi">
            {t("onboardingWizard.step2.title")}
          </h2>
          <p className="text-xs text-lo">{t("onboardingWizard.step2.description")}</p>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="w-full border border-line bg-surface px-3 py-2 text-sm text-hi focus:border-accent focus:outline-none"
          >
            {getRegions().map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSaveRegion}
              className="btn-clip bg-accent px-4 py-1.5 text-xs font-bold uppercase tracking-hud text-base"
            >
              {t("onboardingWizard.step2.next")}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <h2 className="font-display text-sm font-bold uppercase tracking-hud text-hi">
            {t("onboardingWizard.step3.title")}
          </h2>
          {detected === "checking" && <p className="text-xs text-lo">{t("onboardingWizard.step3.checking")}</p>}
          {detected === "found" && (
            <p className="text-xs text-accent">
              {t("onboardingWizard.step3.found")}
            </p>
          )}
          {detected === "not_found" && (
            <p className="text-xs text-lo">
              {t("onboardingWizard.step3.notFound")}
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onFinish}
              className="btn-clip bg-accent px-4 py-1.5 text-xs font-bold uppercase tracking-hud text-base"
            >
              {t("onboardingWizard.step3.finish")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
