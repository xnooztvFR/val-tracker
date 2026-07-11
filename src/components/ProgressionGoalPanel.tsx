import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import Panel from "./Panel";
import { tauriApi } from "../lib/tauriApi";
import { computeGoalProgress, FULL_TIER_LABELS } from "../lib/format";

interface ProgressionGoalPanelProps {
  puuid: string;
  currentTier: number | null | undefined;
  currentRr: number | null | undefined;
}

/** Backlog #13 : objectif de progression ("atteindre Diamant 2") — barre de progression
 * face au rank/RR actuel, éditable inline. */
export default function ProgressionGoalPanel({ puuid, currentTier, currentRr }: ProgressionGoalPanelProps) {
  const queryClient = useQueryClient();
  const goal = useQuery({
    queryKey: ["progressionGoal", puuid],
    queryFn: () => tauriApi.getProgressionGoal(puuid),
  });
  const [editing, setEditing] = useState(false);
  const [selectedTier, setSelectedTier] = useState(FULL_TIER_LABELS[15].tier); // Diamant 1
  const [targetRr, setTargetRr] = useState(0);

  async function handleSave() {
    const label = FULL_TIER_LABELS.find((t) => t.tier === selectedTier)?.label ?? "";
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
    activeGoal && currentTier != null && currentRr != null
      ? computeGoalProgress(currentTier, currentRr, activeGoal.target_tier, activeGoal.target_rr)
      : null;

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="hud-label">Objectif de progression</p>
        {activeGoal && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[11px] text-lo transition-colors hover:text-hi"
          >
            Modifier
          </button>
        )}
      </div>

      {!activeGoal && !editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full border border-line py-2 text-sm text-lo transition-colors hover:border-accent hover:text-hi"
        >
          Définir un objectif
        </button>
      )}

      {editing && (
        <div className="space-y-2.5">
          <select
            value={selectedTier}
            onChange={(e) => setSelectedTier(Number(e.target.value))}
            className="w-full border border-line bg-base px-2.5 py-1.5 text-sm text-hi focus:border-accent focus:outline-none"
          >
            {FULL_TIER_LABELS.map((t) => (
              <option key={t.tier} value={t.tier}>
                {t.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <label className="hud-label text-[10px] text-lo">RR cible</label>
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
              Enregistrer
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-3 py-1 text-[11px] text-lo transition-colors hover:text-hi"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {activeGoal && !editing && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-hi">
              {activeGoal.target_tier_patched}
              {activeGoal.target_rr != null ? ` (${activeGoal.target_rr} RR)` : ""}
            </span>
            {progress?.reached && <span className="text-accent">Atteint</span>}
          </div>
          <div className="h-[3px] bg-line">
            <div
              className={`h-full transition-all ${progress?.reached ? "bg-accent" : "bg-hi"}`}
              style={{ width: `${progress?.percent ?? 0}%` }}
            />
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="text-[11px] text-lo transition-colors hover:text-crit"
          >
            Retirer l'objectif
          </button>
        </div>
      )}
    </Panel>
  );
}
