import { useTranslation } from "react-i18next";

import { SectionTitle } from "./shared";

const LANGUAGE_IDS = ["fr", "en", "es", "pt-BR"] as const;

interface LanguageSectionProps {
  language: string;
  onChangeLanguage: (language: string) => Promise<void>;
}

export default function LanguageSection({ language, onChangeLanguage }: LanguageSectionProps) {
  const { t } = useTranslation("settings");
  return (
    <div className="max-w-xl space-y-2">
      <SectionTitle>{t("language.title")}</SectionTitle>
      <p className="text-xs text-lo">{t("language.hint")}</p>
      <div className="flex flex-wrap gap-2">
        {LANGUAGE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onChangeLanguage(id)}
            className={`border px-4 py-2 text-sm transition-colors ${
              language === id
                ? "border-accent text-hi"
                : "border-line text-lo hover:border-line hover:text-hi"
            }`}
          >
            {t(`language.${id}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
