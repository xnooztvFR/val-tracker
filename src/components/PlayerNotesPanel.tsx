import { useEffect, useRef, useState } from "react";

import Panel from "./Panel";
import { tauriApi } from "../lib/tauriApi";

interface PlayerNotesPanelProps {
  puuid: string;
  initialNotes: string | null;
}

const SAVE_DEBOUNCE_MS = 800;

/** Backlog #12 : note libre attachée à un joueur suivi (tags "smurf"/"toxique"/"duo
 * régulier"...), sauvegardée avec un léger debounce pendant la frappe. */
export default function PlayerNotesPanel({ puuid, initialNotes }: PlayerNotesPanelProps) {
  const [value, setValue] = useState(initialNotes ?? "");
  const [saved, setSaved] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Le panneau est monté une fois par profil (puuid change entraîne un remount via `key`
  // côté Home.tsx) — pas besoin de resynchroniser `value` à chaque refetch de la liste.
  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  function handleChange(next: string) {
    setValue(next);
    setSaved(false);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      await tauriApi.savePlayerNotes(puuid, next);
      setSaved(true);
    }, SAVE_DEBOUNCE_MS);
  }

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="hud-label">Notes</p>
        <span className="text-[10px] text-lo">{saved ? "Enregistré" : "…"}</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Smurf, duo régulier, à re-jouer..."
        rows={3}
        className="w-full resize-none border border-line bg-base px-2.5 py-2 text-sm text-hi placeholder:text-lo/60 focus:border-accent focus:outline-none"
      />
    </Panel>
  );
}
