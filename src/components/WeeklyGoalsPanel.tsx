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
    await tauriApi.saveWeeklyGoal(puuid, newType, newValue);
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

  // Backlog #57 : marque les objectifs atteints sur la frise "vie du compte" — idempotent
  // côté Rust (dédupliqué par semaine ISO), donc sans risque à rappeler à chaque rendu tant
  // que l'objectif reste atteint.
  useEffect(() => {
    const periodKey = isoWeekKey(new Date());
    for (const goal of activeGoals) {
      const isMatches = goal.goal_type === "weekly_matches";
      const target = goal.target_value ?? 0;
      const current = isMatches ? weekly.matches : Math.round(weekly.winPercent);
      if (current >= target && target > 0) {
        void tauriApi.recordGoalAchieved(puuid, goal.goal_type, periodKey);
      }
    }
  }, [puuid, activeGoals, weekly.matches, weekly.winPercent]);

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="hud-label">{t("weeklyGoalsPanel.title")}</p>
        {!adding && (canAddMatches || canAddWinrate) && (
          <button
            type="button"
            onClick={() => {
              setNewType(canAddMatches ? "weekly_matches" : "weekly_winrate");
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
            onChange={(e) => setNewType(e.target.value as WeeklyGoalType)}
            className="w-full border border-line bg-base px-2.5 py-1.5 text-sm text-hi focus:border-accent focus:outline-none"
          >
            {canAddMatches && <option value="weekly_matches">{t("weeklyGoalsPanel.typeMatches")}</option>}
            {canAddWinrate && <option value="weekly_winrate">{t("weeklyGoalsPanel.typeWinrate")}</option>}
          </select>
          <div className="flex items-center gap-2">
            <label className="hud-label text-[10px] text-lo">
              {newType === "weekly_matches" ? t("weeklyGoalsPanel.matchesLabel") : t("weeklyGoalsPanel.winrateLabel")}
            </label>
            <input
              type="number"
              min={1}
              max={newType === "weekly_winrate" ? 100 : 999}
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
            const isMatches = goal.goal_type === "weekly_matches";
            const target = goal.target_value ?? 0;
            const current = isMatches ? weekly.matches : Math.round(weekly.winPercent);
            const percent = target > 0 ? Math.min(100, (current / target) * 100) : 0;
            const reached = current >= target;

            return (
              <div key={goal.goal_type} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-hi">
                    {isMatches
                      ? t("weeklyGoalsPanel.matchesProgress", { current: weekly.matches, target })
                      : t("weeklyGoalsPanel.winrateProgress", {
                          current: Math.round(weekly.winPercent),
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
