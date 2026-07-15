import { useState } from "react";
import { useTranslation } from "react-i18next";

import ConfirmDialog from "../../components/ConfirmDialog";
import { INPUT_CLASS, SectionTitle } from "./shared";

interface PrivacySectionProps {
  enabled: boolean;
  /** `true` si un blob DPAPI existe pour le PIN mais n'a pas pu être déchiffré
   * (réinstallation Windows, migration de compte...) — distinct de "jamais configuré". */
  dpapiUnreadable: boolean;
  onSavePin: (pin: string) => Promise<void>;
  onClearPin: () => Promise<void>;
}

/** Backlog #99 : verrouillage optionnel par PIN devant les notes perso (tags "smurf"/
 * "toxique" de #12, voir `PlayerNotesPanel.tsx`) — pensé pour l'usage stream/écran partagé,
 * pas comme un vrai coffre-fort (le PIN est un simple secret court, pas une passphrase). */
export default function PrivacySection({
  enabled,
  dpapiUnreadable,
  onSavePin,
  onClearPin,
}: PrivacySectionProps) {
  const { t } = useTranslation("settings");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [status, setStatus] = useState<"idle" | "saved" | "mismatch" | "error">("idle");
  const [confirmingClear, setConfirmingClear] = useState(false);

  async function handleSave() {
    if (!pin.trim()) return;
    if (pin !== confirmPin) {
      setStatus("mismatch");
      return;
    }
    try {
      await onSavePin(pin);
      setPin("");
      setConfirmPin("");
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }

  async function handleClear() {
    setConfirmingClear(false);
    await onClearPin();
  }

  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>{t("privacy.title")}</SectionTitle>
      <p className="text-sm text-lo">{t("privacy.description")}</p>
      {dpapiUnreadable && (
        <p className="border border-crit/40 bg-crit/10 px-3 py-2 text-xs text-crit">
          {t("privacy.dpapiUnreadable")}
        </p>
      )}

      {enabled ? (
        <div className="space-y-2">
          <p className="text-sm text-hi">{t("privacy.lockActive")}</p>
          <button
            type="button"
            onClick={() => setConfirmingClear(true)}
            className="border border-crit/60 px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-crit transition-colors hover:bg-crit/10"
          >
            {t("privacy.disableLock")}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setStatus("idle");
              }}
              placeholder={t("privacy.newPin")}
              className={INPUT_CLASS}
            />
            <input
              type="password"
              inputMode="numeric"
              value={confirmPin}
              onChange={(e) => {
                setConfirmPin(e.target.value);
                setStatus("idle");
              }}
              placeholder={t("privacy.confirmPin")}
              className={INPUT_CLASS}
            />
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!pin.trim()}
            className="btn-clip bg-accent px-4 py-2 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-accent-dim disabled:opacity-50"
          >
            {t("privacy.activateLock")}
          </button>
          {status === "mismatch" && (
            <p className="text-xs text-crit">{t("privacy.mismatch")}</p>
          )}
          {status === "error" && (
            <p className="text-xs text-crit">{t("privacy.saveError")}</p>
          )}
          {status === "saved" && <p className="text-xs text-lo">{t("privacy.lockActivated")}</p>}
        </div>
      )}

      <ConfirmDialog
        open={confirmingClear}
        message={t("privacy.confirmDisable")}
        confirmLabel={t("privacy.disableLock")}
        onConfirm={handleClear}
        onCancel={() => setConfirmingClear(false)}
      />
    </div>
  );
}
