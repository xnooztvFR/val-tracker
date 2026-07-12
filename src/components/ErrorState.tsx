import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import { isCommandError, type CommandError } from "../lib/tauriApi";

interface ErrorStateProps {
  error: unknown;
}

function messageFor(
  error: CommandError,
  t: TFunction<"componentsCore">,
): { title: string; detail?: string; showSettingsLink?: boolean } {
  switch (error.kind) {
    case "missing_api_key":
      return {
        title: t("errorState.missingApiKey"),
        showSettingsLink: true,
      };
    case "not_found":
      return { title: t("errorState.notFound") };
    case "rate_limited":
      return {
        title: error.retry_after_secs
          ? t("errorState.rateLimitedWithDelay", { seconds: error.retry_after_secs })
          : t("errorState.rateLimited"),
      };
    case "circuit_open":
      return { title: t("errorState.circuitOpen") };
    case "network":
      return { title: t("errorState.network") };
    case "api":
      return { title: t("errorState.api", { status: error.status }), detail: error.message || undefined };
    case "database":
    case "unknown":
      return { title: t("errorState.unknown"), detail: error.message };
  }
}

export default function ErrorState({ error }: ErrorStateProps) {
  const { t } = useTranslation("componentsCore");
  if (!error) return null;

  const cmdError = isCommandError(error) ? error : null;
  const { title, detail, showSettingsLink } = cmdError
    ? messageFor(cmdError, t)
    : { title: t("errorState.unknown"), detail: undefined, showSettingsLink: false };

  return (
    <div className="relative border border-crit/30 bg-crit/5 py-3 pl-4 pr-3 text-sm text-hi">
      <span className="absolute inset-y-0 left-0 w-[3px] bg-crit" />
      <p className="hud-label !text-crit">{t("errorState.alertLabel")}</p>
      <p className="mt-1">{title}</p>
      {detail && <p className="mt-1 font-mono text-xs text-lo">{detail}</p>}
      {showSettingsLink && (
        <Link to="/parametres" className="mt-2 inline-block text-accent underline underline-offset-2">
          {t("errorState.goToSettings")}
        </Link>
      )}
    </div>
  );
}
