import { useTranslation } from "react-i18next";

import { SectionTitle } from "./shared";

const THEME_IDS = ["dark", "light"] as const;
const ACCENTS: Array<{ id: string; swatch: string }> = [
  { id: "red", swatch: "#FF3B4E" },
  { id: "cyan", swatch: "#7CE8D3" },
  { id: "violet", swatch: "#A672E0" },
  { id: "amber", swatch: "#D4AF37" },
];

const DENSITY_IDS = ["comfortable", "compact"] as const;

interface AppearanceSectionProps {
  theme: string;
  accent: string;
  density: string;
  onChangeTheme: (theme: string) => Promise<void>;
  onChangeAccent: (accent: string) => Promise<void>;
  onChangeDensity: (density: string) => Promise<void>;
}

export default function AppearanceSection({
  theme,
  accent,
  density,
  onChangeTheme,
  onChangeAccent,
  onChangeDensity,
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
        <div className="flex gap-2">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onChangeAccent(a.id)}
              className={`flex items-center gap-2 border px-3 py-2 text-sm transition-colors ${
                accent === a.id ? "border-hi text-hi" : "border-line text-lo hover:text-hi"
              }`}
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: a.swatch }}
              />
              {t(`appearance.accent.${a.id}`)}
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
    </div>
  );
}
