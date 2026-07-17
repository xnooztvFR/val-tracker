import { useTranslation } from "react-i18next";

import { SectionTitle } from "./shared";

const THEME_IDS = ["dark", "light"] as const;
const ACCENTS: Array<{ id: string; swatch: string | string[] }> = [
  { id: "red", swatch: "#FF3B4E" },
  { id: "cyan", swatch: "#7CE8D3" },
  { id: "violet", swatch: "#A672E0" },
  { id: "amber", swatch: "#D4AF37" },
  // TODO Design#2 : dérivé du rôle de l'agent le plus joué (voir dynamicAccentStore.ts) —
  // pas une teinte fixe, d'où le mini-damier des 4 couleurs possibles en aperçu.
  { id: "auto", swatch: ["#FF3B4E", "#7CE8D3", "#A672E0", "#D4AF37"] },
  // TODO Design#2 : variante bleu/orange basée sur les normes protanopie/deutéranopie.
  { id: "contrast", swatch: ["#4285F4", "#E67E22"] },
];

const DENSITY_IDS = ["comfortable", "compact"] as const;
const FONT_IDS = ["display", "mono"] as const;
const ICON_STYLE_IDS = ["official", "vector"] as const;

interface AppearanceSectionProps {
  theme: string;
  accent: string;
  density: string;
  font: string;
  presentationModeEnabled: boolean;
  wallpaperEnabled: boolean;
  cursorEnabled: boolean;
  iconStyle: string;
  onChangeTheme: (theme: string) => Promise<void>;
  onChangeAccent: (accent: string) => Promise<void>;
  onChangeDensity: (density: string) => Promise<void>;
  onChangeFont: (font: string) => Promise<void>;
  onChangePresentationMode: (enabled: boolean) => Promise<void>;
  onChangeWallpaper: (enabled: boolean) => Promise<void>;
  onChangeCursor: (enabled: boolean) => Promise<void>;
  onChangeIconStyle: (style: string) => Promise<void>;
}

export default function AppearanceSection({
  theme,
  accent,
  density,
  font,
  presentationModeEnabled,
  wallpaperEnabled,
  cursorEnabled,
  iconStyle,
  onChangeTheme,
  onChangeAccent,
  onChangeDensity,
  onChangeFont,
  onChangePresentationMode,
  onChangeWallpaper,
  onChangeCursor,
  onChangeIconStyle,
}: AppearanceSectionProps) {
  const { t } = useTranslation("settings");
  return (
    <div className="max-w-xl space-y-6">
      <SectionTitle>{t("appearance.title")}</SectionTitle>

      <section className="space-y-2">
        <h2 className="hud-label">{t("appearance.themeLabel")}</h2>
        <div className="flex gap-2">
          {THEME_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onChangeTheme(id)}
              className={`border px-4 py-2 text-sm transition-colors ${
                theme === id
                  ? "border-accent text-hi"
                  : "border-line text-lo hover:border-line hover:text-hi"
              }`}
            >
              {t(`appearance.theme.${id}`)}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="hud-label">{t("appearance.accentLabel")}</h2>
        <p className="text-xs text-lo">{t("appearance.accentHint")}</p>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onChangeAccent(a.id)}
              className={`flex items-center gap-2 border px-3 py-2 text-sm transition-colors ${
                accent === a.id ? "border-hi text-hi" : "border-line text-lo hover:text-hi"
              }`}
            >
              {Array.isArray(a.swatch) ? (
                <span className="flex h-3 w-3 shrink-0 overflow-hidden rounded-full">
                  {a.swatch.map((c, i) => (
                    <span key={i} className="h-full flex-1" style={{ backgroundColor: c }} />
                  ))}
                </span>
              ) : (
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: a.swatch }}
                />
              )}
              {t(`appearance.accent.${a.id}`)}
            </button>
          ))}
        </div>
        {accent === "contrast" && (
          <p className="text-xs text-lo">{t("appearance.contrastDisclaimer")}</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="hud-label">{t("appearance.fontLabel")}</h2>
        <p className="text-xs text-lo">{t("appearance.fontHint")}</p>
        <div className="flex gap-2">
          {FONT_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onChangeFont(id)}
              className={`border px-4 py-2 text-sm transition-colors ${
                font === id
                  ? "border-accent text-hi"
                  : "border-line text-lo hover:border-line hover:text-hi"
              } ${id === "mono" ? "font-mono" : "font-display"}`}
            >
              {t(`appearance.font.${id}`)}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="hud-label">{t("appearance.densityLabel")}</h2>
        <p className="text-xs text-lo">{t("appearance.densityHint")}</p>
        <div className="flex gap-2">
          {DENSITY_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onChangeDensity(id)}
              className={`border px-4 py-2 text-sm transition-colors ${
                density === id
                  ? "border-accent text-hi"
                  : "border-line text-lo hover:border-line hover:text-hi"
              }`}
            >
              {t(`appearance.density.${id}`)}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="hud-label">{t("appearance.iconStyleLabel")}</h2>
        <p className="text-xs text-lo">{t("appearance.iconStyleHint")}</p>
        <div className="flex gap-2">
          {ICON_STYLE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onChangeIconStyle(id)}
              className={`border px-4 py-2 text-sm transition-colors ${
                iconStyle === id
                  ? "border-accent text-hi"
                  : "border-line text-lo hover:border-line hover:text-hi"
              }`}
            >
              {t(`appearance.iconStyle.${id}`)}
            </button>
          ))}
        </div>
      </section>

      <ToggleRow
        label={t("appearance.presentationModeLabel")}
        hint={t("appearance.presentationModeHint")}
        checked={presentationModeEnabled}
        onChange={onChangePresentationMode}
      />
      <ToggleRow
        label={t("appearance.wallpaperLabel")}
        hint={t("appearance.wallpaperHint")}
        checked={wallpaperEnabled}
        onChange={onChangeWallpaper}
      />
      <ToggleRow
        label={t("appearance.cursorLabel")}
        hint={t("appearance.cursorHint")}
        checked={cursorEnabled}
        onChange={onChangeCursor}
      />
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (enabled: boolean) => Promise<void>;
}) {
  return (
    <section className="space-y-1">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 accent-[rgb(var(--accent-rgb))]"
        />
        <span className="hud-label">{label}</span>
      </label>
      <p className="text-xs text-lo">{hint}</p>
    </section>
  );
}
