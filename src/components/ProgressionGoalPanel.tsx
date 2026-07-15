import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import Panel from "./Panel";
import { tauriApi } from "../lib/tauriApi";
import { computeGoalProgress, getFullTierLabels } from "../lib/format";
import { computeRankEta } from "../lib/stats";
import { useRankSnapshots } from "../hooks/usePlayer";

interface ProgressionGoalPanelProps {
  puuid: string;
  currentTier: number | null | undefined;
  currentRr: number | null | undefined;
}

/** Backlog #13 : objectif de progression ("atteindre Diamant 2") — barre de progression
 * face au rank/RR actuel, éditable inline. */
export default function ProgressionGoalPanel({ puuid, currentTier, currentRr }: ProgressionGoalPanelProps) {
  const { t } = useTranslation("componentsExtra");
  const queryClient = useQueryClient();
  const goal = useQuery({
    queryKey: ["progressionGoal", puuid],
    queryFn: () => tauriApi.getProgressionGoal(puuid),
  });
  const rankSnapshots = useRankSnapshots(puuid);
  const [editing, setEditing] = useState(false);
  // Défaut : Diamant 1 (tier 18 dans le référentiel Henrik/Riot — voir FULL_TIER_KEYS dans
  // lib/format.ts). On cherche par valeur de tier plutôt que par position dans le tableau
  // renvoyé par getFullTierLabels(), pour ne jamais dépendre de son ordre. Repli sur le
  // dernier tier disponible (le plus élevé, donc le plus "sûr" comme objectif par défaut)
  // si jamais le tier 18 disparaissait du référentiel, pour ne jamais planter.
  const DEFAULT_GOAL_TIER = 18;
  const [selectedTier, setSelectedTier] = useState(() => {
    const labels = getFullTierLabels();
    return labels.find((tier) => tier.tier === DEFAULT_GOAL_TIER)?.tier ?? labels[labels.length - 1]?.tier ?? 0;
  });
  const [targetRr, setTargetRr] = useState(0);

  async function handleSave() {
    const label = getFullTierLabels().find((tier) => tier.tier === selectedTier)?.label ?? "";
    await tauriApi.saveProgressionGoal(puuid, selectedTier, label, targetRr);
    await queryClient.invalidateQueries({ queryKey: ["progressionGoal", puuid] });
    setEditing(false);
  }

  async function handleClear() {
    await tauriApi.clearProgressionGoal(puuid);
    await queryClient.invalidateQueries({ queryKey: ["progressionGoal", puuid] });
  }

  const activeGoal = goal.data;
  const progress =
    activeGoal && currentTier != null && currentRr != null && activeGoal.target_tier != null
      ? computeGoalProgress(currentTier, currentRr, activeGoal.target_tier, activeGoal.target_rr)
      : null;

  // TODO stats & analyse joueur : ETA de progression de rang par régression linéaire sur
  // rank_snapshots — voir computeRankEta pour la limite volontaire au palier actuel.
  const targetRrForEta =
    activeGoal?.target_tier != null && currentTier != null && activeGoal.target_tier === currentTier
      ? (activeGoal.target_rr ?? 100)
      : 100;
  const rankEta =
    activeGoal && !progress?.reached && rankSnapshots.data
      ? computeRankEta(rankSnapshots.data, targetRrForEta)
      : null;

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="hud-label">{t("progressionGoalPanel.title")}</p>
        {activeGoal && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[11px] text-lo transition-colors hover:text-hi"
          >
            {t("progressionGoalPanel.edit")}
          </button>
        )}
      </div>

      {!activeGoal && !editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full border border-line py-2 text-sm text-lo transition-colors hover:border-accent hover:text-hi"
        >
          {t("progressionGoalPanel.setGoal")}
        </button>
      )}

      {editing && (
        <div className="space-y-2.5">
          <select
            value={selectedTier}
            onChange={(e) => setSelectedTier(Number(e.target.value))}
            className="w-full border border-line bg-base px-2.5 py-1.5 text-sm text-hi focus:border-accent focus:outline-none"
          >
            {getFullTierLabels().map((tier) => (
              <option key={tier.tier} value={tier.tier}>
                {tier.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <label className="hud-label text-[10px] text-lo">{t("progressionGoalPanel.targetRr")}</label>
            <input
              type="number"
              min={0}
              max={100}
              value={targetRr}
              onChange={(e) => setTargetRr(Number(e.target.value))}
              className="w-20 border border-line bg-base px-2 py-1 text-sm text-hi focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="border border-accent px-3 py-1 text-[11px] font-semibold uppercase tracking-hud text-accent"
            >
              {t("progressionGoalPanel.save")}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-3 py-1 text-[11px] text-lo transition-colors hover:text-hi"
            >
              {t("progressionGoalPanel.cancel")}
            </button>
          </div>
        </div>
      )}

      {activeGoal && !editing && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-hi">
              {activeGoal.target_tier_patched}
              {activeGoal.target_rr != null ? ` ${t("progressionGoalPanel.rrSuffix", { rr: activeGoal.target_rr })}` : ""}
            </span>
            {progress?.reached && <span className="text-accent">{t("progressionGoalPanel.reached")}</span>}
          </div>
          <div className="h-[3px] bg-line">
            <div
              className={`h-full transition-all ${progress?.reached ? "bg-accent" : "bg-hi"}`}
              style={{ width: `${progress?.percent ?? 0}%` }}
            />
          </div>
          {rankEta && rankEta.daysToTargetRr != null && (
            <p className="text-[11px] text-lo">
              {t("progressionGoalPanel.eta", { days: Math.ceil(rankEta.daysToTargetRr) })}
            </p>
          )}
          <button
            type="button"
            onClick={handleClear}
            className="text-[11px] text-lo transition-colors hover:text-crit"
          >
            {t("progressionGoalPanel.removeGoal")}
          </button>
        </div>
      )}
    </Panel>
  );
}
