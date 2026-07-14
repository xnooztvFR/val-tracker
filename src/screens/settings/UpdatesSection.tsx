import { useTranslation } from "react-i18next";

import { useUpdater } from "../../hooks/useUpdater";
import { SectionTitle } from "./shared";

interface UpdatesSectionProps {
  enabled: boolean;
  onChange: (enabled: boolean) => Promise<void>;
}

export default function UpdatesSection({ enabled, onChange }: UpdatesSectionProps) {
  const { t } = useTranslation("settings");
  const { status, version, error, checkNow, installNow } = useUpdater();

  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>{t("updates.title")}</SectionTitle>
      <label className="flex items-center gap-2.5 text-sm text-hi">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 border-line bg-surface accent-accent"
        />
        {t("updates.autoCheckLabel")}
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => checkNow()}
          disabled={status === "checking" || status === "downloading"}
          className="border border-line px-3 py-1.5 text-xs text-hi hover:bg-surface disabled:opacity-50"
        >
          {status === "checking" ? t("updates.checking") : t("updates.checkNow")}
        </button>
        {status === "up-to-date" && (
          <span className="text-xs text-lo">{t("updates.upToDate")}</span>
        )}
        {status === "available" && (
          <button
            type="button"
            onClick={() => installNow()}
            className="border border-accent/50 px-3 py-1.5 text-xs text-accent hover:bg-accent/10"
          >
            {t("updates.installVersion", { version })}
          </button>
        )}
        {status === "downloading" && (
          <span className="text-xs text-lo">{t("updates.downloading")}</span>
        )}
        {status === "error" && (
          <span className="text-xs text-crit">{t("updates.error", { error })}</span>
        )}
      </div>

      <p className="text-xs text-lo">{t("updates.distributionNote")}</p>
    </div>
  );
}
