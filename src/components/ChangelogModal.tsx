import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";

import Panel from "./Panel";

interface PendingChangelog {
  version: string;
  notes: string;
}

/** Backlog #72 : modal "Quoi de neuf" au premier lancement suivant une mise à jour
 * silencieuse (NSIS) — évite de devoir aller lire la release GitHub. Se déclenche une
 * seule fois : `useUpdater.installNow` écrit le changelog côté Rust (SQLite) juste avant
 * `relaunch()` (voir `set_pending_changelog`), ce composant le lit puis l'efface
 * immédiatement au montage suivant via `take_pending_changelog` (lecture unique côté
 * backend, pas de `localStorage` — un `setItem()` juste avant de tuer le process n'offrait
 * aucune garantie de flush sur disque avant WebView2, ce qui faisait que la popup
 * n'apparaissait jamais malgré une mise à jour réussie). */
export default function ChangelogModal() {
  const { t } = useTranslation("componentsExtra");
  const [changelog, setChangelog] = useState<PendingChangelog | null>(null);

  useEffect(() => {
    invoke<PendingChangelog | null>("take_pending_changelog")
      .then((pending) => {
        if (pending) setChangelog(pending);
      })
      .catch(() => {});
  }, []);

  if (!changelog) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <Panel className="w-full max-w-md p-5">
        <p className="hud-label text-accent">{t("changelogModal.title")}</p>
        <p className="mt-2 text-base font-semibold text-hi">
          {t("changelogModal.version", { version: changelog.version })}
        </p>
        {changelog.notes ? (
          <p className="mt-3 whitespace-pre-line text-sm text-lo">{changelog.notes}</p>
        ) : (
          <p className="mt-3 text-sm text-lo">{t("changelogModal.noNotes")}</p>
        )}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => setChangelog(null)}
            className="btn-clip bg-accent px-4 py-1.5 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-[#FF5969]"
          >
            {t("changelogModal.close")}
          </button>
        </div>
      </Panel>
    </div>
  );
}
