import { useTranslation } from "react-i18next";

import { SectionTitle } from "./shared";

const SHORTCUT_KEYS = ["Ctrl+Shift+V", "Ctrl+Shift+H", "Ctrl+Shift+Space", "Ctrl+Shift+F", "Ctrl+K"] as const;
const SHORTCUT_DESCRIPTION_KEYS: Record<(typeof SHORTCUT_KEYS)[number], string> = {
  "Ctrl+Shift+V": "shortcuts.ctrlShiftV",
  "Ctrl+Shift+H": "shortcuts.ctrlShiftH",
  "Ctrl+Shift+Space": "shortcuts.ctrlShiftSpace",
  "Ctrl+Shift+F": "shortcuts.ctrlShiftF",
  "Ctrl+K": "shortcuts.ctrlK",
};

export default function ShortcutsSection() {
  const { t } = useTranslation("settings");
  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>{t("shortcuts.title")}</SectionTitle>
      <p className="text-sm text-lo">{t("shortcuts.description")}</p>

      <div className="divide-y divide-line border border-line">
        {SHORTCUT_KEYS.map((keys) => (
          <div key={keys} className="flex items-start gap-4 px-4 py-3">
            <span className="hud-label shrink-0 border border-line bg-surface px-2 py-1 font-mono text-[11px] text-hi">
              {keys}
            </span>
            <p className="text-sm text-lo">{t(SHORTCUT_DESCRIPTION_KEYS[keys])}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
