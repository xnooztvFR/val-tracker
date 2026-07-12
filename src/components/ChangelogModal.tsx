import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";

import { PENDING_CHANGELOG_KEY } from "../hooks/useUpdater";
import Panel from "./Panel";

interface PendingChangelog {
  version: string;
  notes: string;
}

function readPendingChangelog(): PendingChangelog | null {
  try {
    const raw = localStorage.getItem(PENDING_CHANGELOG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingChangelog>;
    if (typeof parsed.version !== "string") return null;
    return { version: parsed.version, notes: typeof parsed.notes === "string" ? parsed.notes : "" };
  } catch {
    return null;
  }
}

/** Backlog #72 : modal "Quoi de neuf" au premier lancement suivant une mise à jour
 * silencieuse (NSIS) — évite de devoir aller lire la release GitHub. Se déclenche une
 * seule fois : `useUpdater.installNow` écrit le changelog en `localStorage` juste avant
 * `relaunch()`, ce composant le lit puis l'efface immédiatement au montage suivant, ne
 * comparant la version stockée à la version courante que pour éviter un affichage
 * fantôme si l'entrée localStorage traîne après un rollback manuel. */
export default function ChangelogModal() {
  const { t } = useTranslation("componentsExtra");
  const [changelog, setChangelog] = useState<PendingChangelog | null>(null);

  useEffect(() => {
    const pending = readPendingChangelog();
    if (!pending) return;
    localStorage.removeItem(PENDING_CHANGELOG_KEY);
    getVersion()
      .then((currentVersion) => {
        if (currentVersion === pending.version) setChangelog(pending);
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
