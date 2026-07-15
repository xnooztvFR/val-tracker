import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { SectionTitle } from "./shared";

const STATIC_SHORTCUT_KEYS = ["Ctrl+Shift+Space", "Ctrl+Shift+F", "Ctrl+K"] as const;
const STATIC_SHORTCUT_DESCRIPTION_KEYS: Record<(typeof STATIC_SHORTCUT_KEYS)[number], string> = {
  "Ctrl+Shift+Space": "shortcuts.ctrlShiftSpace",
  "Ctrl+Shift+F": "shortcuts.ctrlShiftF",
  "Ctrl+K": "shortcuts.ctrlK",
};

interface ShortcutsSectionProps {
  shortcutOverlayToggle: string;
  shortcutMainWindowToggle: string;
  onChangeShortcutOverlayToggle: (shortcut: string) => Promise<void>;
  onChangeShortcutMainWindowToggle: (shortcut: string) => Promise<void>;
}

/** Capture la prochaine combinaison de touches pressée pour construire un accelerator au
 * format `tauri-plugin-global-shortcut` (ex. `"ctrl+shift+v"`) — ne gère que les touches
 * modificatrices standard + une touche finale, suffisant pour rebinder un raccourci global
 * pris par une autre appli (backlog sécurité : Ctrl+Shift+V/H étaient en dur). */
function useShortcutRecorder(onCapture: (accelerator: string) => void) {
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;

    function handleKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(false);
        return;
      }
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;

      const parts: string[] = [];
      if (e.ctrlKey) parts.push("ctrl");
      if (e.altKey) parts.push("alt");
      if (e.shiftKey) parts.push("shift");
      if (e.metaKey) parts.push("super");
      let key = e.key.toLowerCase();
      if (key === " ") key = "space";
      parts.push(key);

      setRecording(false);
      onCapture(parts.join("+"));
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [recording, onCapture]);

  return { recording, startRecording: () => setRecording(true) };
}

interface EditableShortcutRowProps {
  descriptionKey: string;
  value: string;
  onSave: (shortcut: string) => Promise<void>;
}

function EditableShortcutRow({ descriptionKey, value, onSave }: EditableShortcutRowProps) {
  const { t } = useTranslation("settings");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const { recording, startRecording } = useShortcutRecorder(async (accelerator) => {
    setStatus("saving");
    try {
      await onSave(accelerator);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  });

  return (
    <div className="flex items-start gap-4 px-4 py-3">
      <button
        type="button"
        onClick={startRecording}
        className={`hud-label shrink-0 border px-2 py-1 font-mono text-[11px] transition-colors ${
          recording ? "border-accent text-accent" : "border-line bg-surface text-hi hover:border-accent"
        }`}
      >
        {recording ? t("shortcuts.recording") : value.toUpperCase()}
      </button>
      <div className="flex-1">
        <p className="text-sm text-lo">{t(descriptionKey)}</p>
        {status === "error" && <p className="mt-1 text-xs text-crit">{t("shortcuts.saveError")}</p>}
        {status === "saved" && <p className="mt-1 text-xs text-accent">{t("shortcuts.saved")}</p>}
      </div>
    </div>
  );
}

/** Backlog sécurité : `Ctrl+Shift+V` (overlay) et `Ctrl+Shift+H` (fenêtre principale) sont
 * les deux seuls raccourcis OS globaux (indépendants du focus applicatif, via
 * `tauri-plugin-global-shortcut`) — sujets à conflit avec une autre appli (overlay GPU,
 * Discord...), donc reconfigurables ici. Les autres (Ctrl+Shift+Espace, Ctrl+Shift+F, Ctrl+K)
 * restent statiques : Ctrl+Shift+Espace est un maintien plutôt qu'un simple toggle, les deux
 * derniers ne fonctionnent qu'avec la fenêtre principale au focus donc bien moins sujets à
 * collision avec un autre logiciel. */
export default function ShortcutsSection({
  shortcutOverlayToggle,
  shortcutMainWindowToggle,
  onChangeShortcutOverlayToggle,
  onChangeShortcutMainWindowToggle,
}: ShortcutsSectionProps) {
  const { t } = useTranslation("settings");
  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>{t("shortcuts.title")}</SectionTitle>
      <p className="text-sm text-lo">{t("shortcuts.description")}</p>

      <div className="divide-y divide-line border border-line">
        <EditableShortcutRow
          descriptionKey="shortcuts.ctrlShiftV"
          value={shortcutOverlayToggle}
          onSave={onChangeShortcutOverlayToggle}
        />
        <EditableShortcutRow
          descriptionKey="shortcuts.ctrlShiftH"
          value={shortcutMainWindowToggle}
          onSave={onChangeShortcutMainWindowToggle}
        />
        {STATIC_SHORTCUT_KEYS.map((keys) => (
          <div key={keys} className="flex items-start gap-4 px-4 py-3">
            <span className="hud-label shrink-0 border border-line bg-surface px-2 py-1 font-mono text-[11px] text-hi">
              {keys}
            </span>
            <p className="text-sm text-lo">{t(STATIC_SHORTCUT_DESCRIPTION_KEYS[keys])}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
