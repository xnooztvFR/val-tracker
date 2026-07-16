import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import Panel from "./Panel";
import { tauriApi, type MatchEntry, type WeeklyGoalType } from "../lib/tauriApi";
import { computeWeeklyMatchStats, isoWeekKey } from "../lib/stats";

interface WeeklyGoalsPanelProps {
  puuid: string;
  matches: MatchEntry[];
}

/** Backlog #55 : objectifs hebdomadaires custom ("X matchs cette semaine", "winrate ≥ 50%"),
 * en complément de l'objectif de rang (`ProgressionGoalPanel`) — même table
 * `progression_goals`, progression recalculée à chaque affichage sur les matchs de la
 * semaine ISO en cours déjà chargés par `useMatches` (aucun appel réseau dédié). */
export default function WeeklyGoalsPanel({ puuid, matches }: WeeklyGoalsPanelProps) {
  const { t } = useTranslation("componentsExtra");
  const queryClient = useQueryClient();
  const goals = useQuery({
    queryKey: ["weeklyGoals", puuid],
    queryFn: () => tauriApi.listWeeklyGoals(puuid),
  });
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState<WeeklyGoalType>("weekly_matches");
  const [newValue, setNewValue] = useState(10);

  const weekly = computeWeeklyMatchStats(matches, puuid);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ["weeklyGoals", puuid] });
  }

  async function handleSave() {
    // `weekly_kd` : l'utilisateur saisit un K/D décimal (ex. 1.3), stocké ×100 en base
    // (target_value est un entier) — voir `WeeklyGoalType` dans tauriApi.ts.
    const targetValue = newType === "weekly_kd" ? Math.round(newValue * 100) : Math.round(newValue);
    await tauriApi.saveWeeklyGoal(puuid, newType, targetValue);
    await invalidate();
    setAdding(false);
  }

  async function handleRemove(goalType: WeeklyGoalType) {
    await tauriApi.clearWeeklyGoal(puuid, goalType);
    await invalidate();
  }

  const activeGoals = goals.data ?? [];
  const canAddMatches = !activeGoals.some((g) => g.goal_type === "weekly_matches");
  const canAddWinrate = !activeGoals.some((g) => g.goal_type === "weekly_winrate");
  const canAddKd = !activeGoals.some((g) => g.goal_type === "weekly_kd");
  const canAddHs = !activeGoals.some((g) => g.goal_type === "weekly_hs");

  /** TODO Fonctionnalités#7 : valeur courante + cible affichée pour un goal_type donné.
   * `weekly_kd` stocke la cible × 100 (target_value entier), `weekly_hs` directement en %. */
  function currentAndTarget(goal: (typeof activeGoals)[number]): { current: number; target: number } {
    const target = goal.target_value ?? 0;
    switch (goal.goal_type) {
      case "weekly_matches":
        return { current: weekly.matches, target };
      case "weekly_kd":
        return { current: Math.round(weekly.kd * 100), target };
      case "weekly_hs":
        return { current: Math.round(weekly.hsPercent), target };
      default:
        return { current: Math.round(weekly.winPercent), target };
    }
  }

  // Backlog #57 : marque les objectifs atteints sur la frise "vie du compte" — idempotent
  // côté Rust (dédupliqué par semaine ISO), donc sans risque à rappeler à chaque rendu tant
  // que l'objectif reste atteint.
  useEffect(() => {
    const periodKey = isoWeekKey(new Date());
    for (const goal of activeGoals) {
      const { current, target } = currentAndTarget(goal);
      if (current >= target && target > 0) {
        void tauriApi.recordGoalAchieved(puuid, goal.goal_type, periodKey);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puuid, activeGoals, weekly.matches, weekly.winPercent, weekly.kd, weekly.hsPercent]);

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="hud-label">{t("weeklyGoalsPanel.title")}</p>
        {!adding && (canAddMatches || canAddWinrate || canAddKd || canAddHs) && (
          <button
            type="button"
            onClick={() => {
              setNewType(
                canAddMatches ? "weekly_matches" : canAddWinrate ? "weekly_winrate" : canAddKd ? "weekly_kd" : "weekly_hs",
              );
              setAdding(true);
            }}
            className="text-[11px] text-lo transition-colors hover:text-hi"
          >
            {t("weeklyGoalsPanel.addGoal")}
          </button>
        )}
      </div>

      {activeGoals.length === 0 && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full border border-line py-2 text-sm text-lo transition-colors hover:border-accent hover:text-hi"
        >
          {t("weeklyGoalsPanel.addGoal")}
        </button>
      )}

      {adding && (
        <div className="space-y-2.5">
          <select
            value={newType}
            onChange={(e) => {
              const type = e.target.value as WeeklyGoalType;
              setNewType(type);
              setNewValue(type === "weekly_kd" ? 1.3 : type === "weekly_hs" ? 25 : type === "weekly_winrate" ? 50 : 10);
            }}
            className="w-full border border-line bg-base px-2.5 py-1.5 text-sm text-hi focus:border-accent focus:outline-none"
          >
            {canAddMatches && <option value="weekly_matches">{t("weeklyGoalsPanel.typeMatches")}</option>}
            {canAddWinrate && <option value="weekly_winrate">{t("weeklyGoalsPanel.typeWinrate")}</option>}
            {canAddKd && <option value="weekly_kd">{t("weeklyGoalsPanel.typeKd")}</option>}
            {canAddHs && <option value="weekly_hs">{t("weeklyGoalsPanel.typeHs")}</option>}
          </select>
          <div className="flex items-center gap-2">
            <label className="hud-label text-[10px] text-lo">
              {newType === "weekly_matches" && t("weeklyGoalsPanel.matchesLabel")}
              {newType === "weekly_winrate" && t("weeklyGoalsPanel.winrateLabel")}
              {newType === "weekly_kd" && t("weeklyGoalsPanel.kdLabel")}
              {newType === "weekly_hs" && t("weeklyGoalsPanel.hsLabel")}
            </label>
            <input
              type="number"
              min={newType === "weekly_kd" ? 0.1 : 1}
              step={newType === "weekly_kd" ? 0.1 : 1}
              max={newType === "weekly_winrate" || newType === "weekly_hs" ? 100 : newType === "weekly_kd" ? 5 : 999}
              value={newValue}
              onChange={(e) => setNewValue(Number(e.target.value))}
              className="w-20 border border-line bg-base px-2 py-1 text-sm text-hi focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="border border-accent px-3 py-1 text-[11px] font-semibold uppercase tracking-hud text-accent"
            >
              {t("weeklyGoalsPanel.save")}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="px-3 py-1 text-[11px] text-lo transition-colors hover:text-hi"
            >
              {t("weeklyGoalsPanel.cancel")}
            </button>
          </div>
        </div>
      )}

      {activeGoals.length > 0 && (
        <div className="space-y-3">
          {activeGoals.map((goal) => {
            const { current, target } = currentAndTarget(goal);
            const percent = target > 0 ? Math.min(100, (current / target) * 100) : 0;
            const reached = current >= target;

            return (
              <div key={goal.goal_type} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-hi">
                    {goal.goal_type === "weekly_matches" &&
                      t("weeklyGoalsPanel.matchesProgress", { current: weekly.matches, target })}
                    {goal.goal_type === "weekly_winrate" &&
                      t("weeklyGoalsPanel.winrateProgress", {
                        current: Math.round(weekly.winPercent),
                        target,
                        matches: weekly.matches,
                      })}
                    {goal.goal_type === "weekly_kd" &&
                      t("weeklyGoalsPanel.kdProgress", {
                        current: weekly.kd.toFixed(2),
                        target: (target / 100).toFixed(2),
                        matches: weekly.matches,
                      })}
                    {goal.goal_type === "weekly_hs" &&
                      t("weeklyGoalsPanel.hsProgress", {
                        current: Math.round(weekly.hsPercent),
                        target,
                        matches: weekly.matches,
                      })}
                  </span>
                  {reached && <span className="text-accent">{t("weeklyGoalsPanel.reached")}</span>}
                </div>
                <div className="h-[3px] bg-line">
                  <div
                    className={`h-full transition-all ${reached ? "bg-accent" : "bg-hi"}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(goal.goal_type as WeeklyGoalType)}
                  className="text-[11px] text-lo transition-colors hover:text-crit"
                >
                  {t("weeklyGoalsPanel.remove")}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
