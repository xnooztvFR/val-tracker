import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { tauriApi } from "../../lib/tauriApi";
import { useSettingsStore } from "../../store/settingsStore";
import { SectionTitle } from "./shared";

/** Aucun moyen de revoir le wizard d'onboarding (`OnboardingWizard.tsx`) une fois
 * `onboarding_completed` marqué vrai, sinon réinstaller — ce bouton réinitialise le flag
 * côté backend puis renvoie vers `/` où `Search.tsx` le réaffiche automatiquement. */
export default function OnboardingReplaySection() {
  const { t } = useTranslation("settings");
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  async function handleReplay() {
    setLoading(true);
    try {
      await tauriApi.resetOnboarding();
      await useSettingsStore.getState().refresh();
      navigate("/");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="max-w-xl space-y-2">
      <SectionTitle>{t("onboardingReplay.title")}</SectionTitle>
      <p className="text-xs text-lo">{t("onboardingReplay.hint")}</p>
      <button
        type="button"
        onClick={handleReplay}
        disabled={loading}
        className="panel-clip-sm border border-line px-4 py-2 text-sm font-medium text-hi transition-colors hover:bg-raised disabled:opacity-50"
      >
        {t("onboardingReplay.button")}
      </button>
    </section>
  );
}
