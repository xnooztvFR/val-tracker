import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import Panel from "./Panel";
import { tauriApi } from "../lib/tauriApi";
import { useSettingsStore } from "../store/settingsStore";

interface PlayerNotesPanelProps {
  puuid: string;
  initialNotes: string | null;
}

const SAVE_DEBOUNCE_MS = 800;

/** Backlog #12 : note libre attachée à un joueur suivi (tags "smurf"/"toxique"/"duo
 * régulier"...), sauvegardée avec un léger debounce pendant la frappe.
 *
 * Backlog #99 : si `notes_pin_enabled` (Paramètres → Confidentialité), le contenu reste
 * masqué derrière un écran de saisie PIN tant que l'utilisateur ne l'a pas déverrouillé —
 * état local, pas persistant : redemandé à chaque remount (changement de profil via `key`
 * côté Home.tsx, ou fermeture/réouverture de l'app), pensé pour l'usage stream/écran
 * partagé plutôt que comme un vrai coffre-fort. */
export default function PlayerNotesPanel({ puuid, initialNotes }: PlayerNotesPanelProps) {
  const { t } = useTranslation("componentsExtra");
  const notesPinEnabled = useSettingsStore((s) => s.settings?.notes_pin_enabled ?? false);
  const [value, setValue] = useState(initialNotes ?? "");
  const [saved, setSaved] = useState(true);
  const [unlocked, setUnlocked] = useState(!notesPinEnabled);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  async function handleUnlock() {
    const ok = await tauriApi.verifyNotesPin(pinInput);
    if (ok) {
      setUnlocked(true);
      setPinInput("");
      setPinError(false);
    } else {
      setPinError(true);
    }
  }

  if (notesPinEnabled && !unlocked) {
    return (
      <Panel className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="hud-label">{t("playerNotesPanel.title")}</p>
          <span className="text-[10px] text-lo">{t("playerNotesPanel.locked")}</span>
        </div>
        <div className="flex gap-2">
          <input
            type="password"
            inputMode="numeric"
            value={pinInput}
            onChange={(e) => {
              setPinInput(e.target.value);
              setPinError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleUnlock();
            }}
            placeholder={t("playerNotesPanel.pinPlaceholder")}
            className="w-24 border border-line bg-base px-2.5 py-2 text-sm text-hi placeholder:text-lo/60 focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={handleUnlock}
            className="border border-line px-3 py-2 text-sm text-hi transition-colors hover:border-accent"
          >
            {t("playerNotesPanel.unlock")}
          </button>
        </div>
        {pinError && <p className="mt-2 text-xs text-crit">{t("playerNotesPanel.pinIncorrect")}</p>}
      </Panel>
    );
  }

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="hud-label">{t("playerNotesPanel.title")}</p>
        <span className="text-[10px] text-lo">{saved ? t("playerNotesPanel.saved") : t("playerNotesPanel.saving")}</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={t("playerNotesPanel.notesPlaceholder")}
        rows={3}
        className="w-full resize-none border border-line bg-base px-2.5 py-2 text-sm text-hi placeholder:text-lo/60 focus:border-accent focus:outline-none"
      />
    </Panel>
  );
}
