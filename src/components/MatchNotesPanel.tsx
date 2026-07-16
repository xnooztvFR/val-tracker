import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import Panel from "./Panel";
import { tauriApi } from "../lib/tauriApi";
import { formatDateTimeShort } from "../lib/format";

interface MatchNotesPanelProps {
  matchId: string;
  puuid: string;
}

/** TODO Fonctionnalités#15 : notes horodatées liées à ce match précis, distinctes de la
 * note libre unique par joueur (PlayerNotesPanel.tsx). Plusieurs notes possibles, chacune
 * avec son propre horodatage. */
export default function MatchNotesPanel({ matchId, puuid }: MatchNotesPanelProps) {
  const { t } = useTranslation("componentsExtra");
  const queryClient = useQueryClient();
  const notes = useQuery({
    queryKey: ["match_notes", matchId, puuid],
    queryFn: () => tauriApi.listMatchNotes(matchId, puuid),
  });
  const [draft, setDraft] = useState("");

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ["match_notes", matchId, puuid] });
  }

  async function handleAdd() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    await tauriApi.addMatchNote(matchId, puuid, trimmed);
    setDraft("");
    await invalidate();
  }

  async function handleDelete(id: number) {
    await tauriApi.deleteMatchNote(id);
    await invalidate();
  }

  return (
    <Panel className="p-4">
      <p className="hud-label mb-3">{t("matchNotesPanel.title")}</p>

      <div className="mb-3 flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          placeholder={t("matchNotesPanel.placeholder")}
          maxLength={500}
          className="flex-1 border border-line bg-base px-2.5 py-1.5 text-sm text-hi placeholder:text-lo/60 focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!draft.trim()}
          className="hud-label border border-line px-3 py-1.5 text-xs text-hi transition-colors hover:border-accent disabled:opacity-50"
        >
          {t("matchNotesPanel.add")}
        </button>
      </div>

      {(notes.data?.length ?? 0) === 0 && (
        <p className="text-xs text-lo">{t("matchNotesPanel.empty")}</p>
      )}

      {(notes.data?.length ?? 0) > 0 && (
        <ul className="space-y-2">
          {notes.data!.map((n) => (
            <li key={n.id} className="flex items-start justify-between gap-2 border-l-2 border-line pl-2.5">
              <div>
                <p className="text-sm text-hi">{n.note}</p>
                <p className="text-[10px] text-lo">{formatDateTimeShort(n.created_at)}</p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(n.id)}
                className="shrink-0 text-[11px] text-lo transition-colors hover:text-crit"
              >
                {t("matchNotesPanel.remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
