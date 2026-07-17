import { useTranslation } from "react-i18next";

import Panel from "./Panel";
import type { MatchHighlight } from "../lib/tauriApi";

/** TODO Fonctionnalités#4/#33 : liste des clutchs/multikills détectés sur ce match (voir
 * `highlights.rs` côté Rust), triés par round. Purement dérivé des données déjà en cache
 * (aucun fetch). */
export default function HighlightsPanel({ highlights }: { highlights: MatchHighlight[] }) {
  const { t } = useTranslation("componentsExtra");
  const sorted = [...highlights].sort((a, b) => a.round_number - b.round_number);

  return (
    <Panel className="p-4">
      <p className="hud-label mb-3">{t("highlightsPanel.title")}</p>
      <ul className="flex flex-wrap gap-2">
        {sorted.map((h, i) => (
          <li
            key={`${h.round_number}-${h.kind}-${i}`}
            className={`hud-label border px-2 py-1 text-[11px] ${
              h.kind === "clutch" ? "border-accent/50 text-accent" : "border-hi/40 text-hi"
            }`}
          >
            {t("highlightsPanel.roundLabel", { round: h.round_number })} — {h.label}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
