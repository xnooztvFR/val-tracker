import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import Panel from "./Panel";

interface ConfirmDialogProps {
  open: boolean;
  message: string;
  /** Rouge/destructif par défaut (cas d'usage principal : suppression, reset) — passer
   * `false` pour un simple "es-tu sûr ?" non destructif. */
  danger?: boolean;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Dialogue de confirmation dans le thème HUD, remplaçant `window.confirm()` (natif, hors
 * charte — coins arrondis, police système) pour les actions destructives locales
 * (`reset_local_stats`, désactivation du verrou PIN...). */
export default function ConfirmDialog({
  open,
  message,
  danger = true,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation("componentsCore");

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <Panel className="w-full max-w-sm p-5">
        <p className="text-sm text-hi">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="border border-line px-4 py-1.5 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent"
          >
            {t("confirmDialog.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className={
              danger
                ? "btn-clip border border-crit/60 bg-crit/10 px-4 py-1.5 font-display text-xs font-bold uppercase tracking-hud text-crit transition-colors hover:bg-crit/20"
                : "btn-clip bg-accent px-4 py-1.5 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-accent-dim"
            }
          >
            {confirmLabel ?? t("confirmDialog.confirm")}
          </button>
        </div>
      </Panel>
    </div>
  );
}
