import { useTranslation } from "react-i18next";

import { formatDateTimeShort } from "../lib/format";

interface StaleDataBannerProps {
  cachedAt: number | null | undefined;
}

/** Bandeau "Données en cache" affiché en repli quand le réseau/l'API Henrik est en panne
 * mais qu'un dernier cache SQLite connu a pu être servi (voir README §6). */
export default function StaleDataBanner({ cachedAt }: StaleDataBannerProps) {
  const { t } = useTranslation("componentsCore");
  return (
    <div className="relative border border-line bg-surface py-2 pl-4 pr-3 text-xs text-lo">
      <span className="absolute inset-y-0 left-0 w-[3px] bg-lo" />
      <span className="hud-label mr-2 text-[10px]">{t("staleDataBanner.label")}</span>
      {t("staleDataBanner.message", { date: formatDateTimeShort(cachedAt) })}
    </div>
  );
}
