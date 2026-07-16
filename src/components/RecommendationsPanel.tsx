import { useTranslation } from "react-i18next";

import Panel from "./Panel";
import { useRecommendations } from "../hooks/useMatches";
import { formatPercent } from "../lib/format";

interface RecommendationsPanelProps {
  puuid: string | undefined;
}

/** TODO Fonctionnalités#14 : recommandation de carte/agent basée sur l'historique perso
 * (winrate), agrégée côté Rust sur les détails de match déjà en cache — n'affiche rien tant
 * qu'aucune carte/agent n'atteint le seuil minimal de matchs (bruit sinon). */
export default function RecommendationsPanel({ puuid }: RecommendationsPanelProps) {
  const { t } = useTranslation("componentsExtra");
  const recommendations = useRecommendations(puuid);

  const bestMap = recommendations.data?.best_maps[0];
  const bestAgent = recommendations.data?.best_agents[0];

  if (!bestMap && !bestAgent) return null;

  return (
    <Panel className="p-4">
      <p className="hud-label mb-3">{t("recommendationsPanel.title")}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {bestMap && (
          <div>
            <p className="text-xs text-lo">{t("recommendationsPanel.bestMap")}</p>
            <p className="mt-1 text-sm font-semibold text-hi">{bestMap.map}</p>
            <p className="stat-value text-xs text-accent">
              {formatPercent(Math.round(bestMap.win_percent))}{" "}
              <span className="text-lo">
                {t("recommendationsPanel.statsLine", {
                  wins: bestMap.matches_won,
                  played: bestMap.matches_played,
                })}
              </span>
            </p>
          </div>
        )}
        {bestAgent && (
          <div>
            <p className="text-xs text-lo">{t("recommendationsPanel.bestAgent")}</p>
            <p className="mt-1 text-sm font-semibold text-hi">{bestAgent.agent}</p>
            <p className="stat-value text-xs text-accent">
              {formatPercent(Math.round(bestAgent.win_percent))}{" "}
              <span className="text-lo">
                {t("recommendationsPanel.statsLine", {
                  wins: bestAgent.matches_won,
                  played: bestAgent.matches_played,
                })}
              </span>
            </p>
          </div>
        )}
      </div>
    </Panel>
  );
}
