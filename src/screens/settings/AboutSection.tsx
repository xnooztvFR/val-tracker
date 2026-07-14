import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";

import { SectionTitle } from "./shared";

export default function AboutSection() {
  const { t } = useTranslation("settings");
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-xl space-y-2">
      <SectionTitle>{t("about.title")}</SectionTitle>
      <p className="text-sm text-lo">{t("about.version", { version: version ?? "…" })}</p>
      <p className="text-xs text-lo">{t("about.disclaimer")}</p>
    </div>
  );
}
