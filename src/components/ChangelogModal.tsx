import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";

import Panel from "./Panel";
import { resolveChangelogNotes } from "../lib/format";

interface PendingChangelog {
  version: string;
  notes: string;
}

/** Backlog #72 : modal "Quoi de neuf" au premier lancement suivant une mise à jour
 * silencieuse (NSIS) — évite de devoir aller lire la release GitHub. Se déclenche une
 * seule fois : `useUpdater.installNow` écrit le changelog côté Rust (SQLite) avant même de
 * lancer `downloadAndInstall` (voir `set_pending_changelog`), ce composant le lit puis
 * l'efface immédiatement au montage suivant via `take_pending_changelog` (lecture unique
 * côté backend, pas de `localStorage`). Écrit tôt (avant l'install, pas juste avant
 * `relaunch()`) pour éviter toute fenêtre de course avec le process qui se termine — en
 * contrepartie une entrée peut rester orpheline si l'install échoue ensuite, d'où la
 * comparaison à `getVersion()` : on n'affiche que si la version installée correspond
 * effectivement à celle du changelog écrit. */
export default function ChangelogModal() {
  const { t, i18n } = useTranslation("componentsExtra");
  const [changelog, setChangelog] = useState<PendingChangelog | null>(null);

  useEffect(() => {
    invoke<PendingChangelog | null>("take_pending_changelog")
      .then(async (pending) => {
        if (!pending) return;
        const currentVersion = await getVersion().catch(() => null);
        if (currentVersion === pending.version) setChangelog(pending);
      })
      .catch(() => {});
  }, []);

  if (!changelog) return null;

  const notes = resolveChangelogNotes(changelog.notes, i18n.language);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <Panel className="w-full max-w-md p-5">
        <p className="hud-label text-accent">{t("changelogModal.title")}</p>
        <p className="mt-2 text-base font-semibold text-hi">
          {t("changelogModal.version", { version: changelog.version })}
        </p>
        {notes ? (
          <p className="mt-3 whitespace-pre-line text-sm text-lo">{notes}</p>
        ) : (
          <p className="mt-3 text-sm text-lo">{t("changelogModal.noNotes")}</p>
        )}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => setChangelog(null)}
            className="btn-clip bg-accent px-4 py-1.5 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-accent-dim"
          >
            {t("changelogModal.close")}
          </button>
        </div>
      </Panel>
    </div>
  );
}
