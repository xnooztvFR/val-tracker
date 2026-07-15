import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { tauriApi, type ChangelogHistoryEntry } from "../../lib/tauriApi";
import { formatDateTimeShort, resolveChangelogNotes } from "../../lib/format";
import { SectionTitle } from "./shared";

/** "Nouveautés" consultable — `ChangelogModal.tsx` n'affiche le changelog qu'une fois,
 * juste après l'auto-update ; cette section relit l'historique persisté côté backend
 * (voir `db::changelog`) pour l'utilisateur qui l'a fermé trop vite ou veut comparer deux
 * versions. */
export default function ChangelogHistorySection() {
  const { t, i18n } = useTranslation("settings");
  const [history, setHistory] = useState<ChangelogHistoryEntry[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    tauriApi
      .listChangelogHistory()
      .then(setHistory)
      .catch(() => setHistory([]));
  }, []);

  return (
    <section className="max-w-xl space-y-2">
      <SectionTitle>{t("changelogHistory.title")}</SectionTitle>
      {history === null ? (
        <p className="text-xs text-lo">{t("changelogHistory.loading")}</p>
      ) : history.length === 0 ? (
        <p className="text-xs text-lo">{t("changelogHistory.empty")}</p>
      ) : (
        <ul className="divide-y divide-line border border-line">
          {history.map((entry) => {
            const isOpen = expanded === entry.version;
            const notes = resolveChangelogNotes(entry.notes, i18n.language);
            return (
              <li key={entry.version}>
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : entry.version)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-raised"
                >
                  <span className="text-sm font-medium text-hi">
                    {t("changelogHistory.version", { version: entry.version })}
                  </span>
                  <span className="text-[11px] text-lo">{formatDateTimeShort(entry.installed_at)}</span>
                </button>
                {isOpen && (
                  <p className="whitespace-pre-line border-t border-line bg-surface px-3 py-2 text-xs text-lo">
                    {notes || t("changelogHistory.noNotes")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
