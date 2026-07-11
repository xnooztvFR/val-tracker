import { useState } from "react";

import { useSettingsStore } from "../store/settingsStore";
import { tauriApi } from "../lib/tauriApi";
import { REGIONS } from "../lib/format";

type Step = 1 | 2 | 3;

/** Backlog #28 : wizard en 3 étapes au premier lancement (pas de clé API configurée),
 * affiché par Search.tsx à la place du formulaire de recherche désactivé. */
export default function OnboardingWizard({ onFinish }: { onFinish: () => void }) {
  const { setApiKey, setDefaultRegion } = useSettingsStore();
  const [step, setStep] = useState<Step>(1);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [verifyState, setVerifyState] = useState<"idle" | "checking" | "valid" | "invalid" | "error">("idle");
  const [region, setRegion] = useState("eu");
  const [detected, setDetected] = useState<"idle" | "checking" | "found" | "not_found">("idle");

  async function handleVerifyAndSave() {
    if (!apiKeyInput.trim()) return;
    setVerifyState("checking");
    try {
      const valid = await tauriApi.verifyHenrikApiKey(apiKeyInput.trim());
      if (valid) {
        await setApiKey(apiKeyInput.trim());
        setVerifyState("valid");
      } else {
        setVerifyState("invalid");
      }
    } catch {
      setVerifyState("error");
    }
  }

  async function handleSaveRegion() {
    await setDefaultRegion(region);
    setStep(3);
    setDetected("checking");
    try {
      const account = await tauriApi.detectLocalAccount();
      setDetected(account ? "found" : "not_found");
    } catch {
      setDetected("not_found");
    }
  }

  return (
    <div className="panel-clip mt-8 w-full max-w-md p-6">
      <div className="mb-4 flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <span
            key={s}
            className={`h-1 flex-1 ${s <= step ? "bg-accent" : "bg-line"}`}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <h2 className="font-display text-sm font-bold uppercase tracking-hud text-hi">
            1. Clé API Henrik
          </h2>
          <p className="text-xs text-lo">
            Nécessaire pour interroger l'API Henrik Dev (rank, matchs). Rejoins le Discord
            Henrik Dev pour en obtenir une (voir le README).
          </p>
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => {
              setApiKeyInput(e.target.value);
              setVerifyState("idle");
            }}
            placeholder="Colle ta clé API Henrik ici"
            className="w-full border border-line bg-surface px-3 py-2 font-mono text-sm text-hi placeholder:text-lo/60 focus:border-accent focus:outline-none"
          />
          {verifyState === "invalid" && <p className="text-xs text-crit">Clé invalide.</p>}
          {verifyState === "error" && <p className="text-xs text-crit">Impossible de vérifier (panne réseau ?).</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleVerifyAndSave}
              disabled={!apiKeyInput.trim() || verifyState === "checking"}
              className="border border-line px-3 py-1.5 text-xs text-hi hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {verifyState === "checking" ? "Vérification…" : "Vérifier et enregistrer"}
            </button>
            {verifyState === "valid" && (
              <button
                type="button"
                onClick={() => setStep(2)}
                className="btn-clip bg-accent px-4 py-1.5 text-xs font-bold uppercase tracking-hud text-base"
              >
                Suivant
              </button>
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <h2 className="font-display text-sm font-bold uppercase tracking-hud text-hi">
            2. Région par défaut
          </h2>
          <p className="text-xs text-lo">Utilisée pour les recherches et le classement.</p>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="w-full border border-line bg-surface px-3 py-2 text-sm text-hi focus:border-accent focus:outline-none"
          >
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSaveRegion}
              className="btn-clip bg-accent px-4 py-1.5 text-xs font-bold uppercase tracking-hud text-base"
            >
              Suivant
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <h2 className="font-display text-sm font-bold uppercase tracking-hud text-hi">
            3. Détection automatique de partie
          </h2>
          {detected === "checking" && <p className="text-xs text-lo">Recherche du client Riot local…</p>}
          {detected === "found" && (
            <p className="text-xs text-accent">
              Client Riot détecté — l'overlay et la détection de partie fonctionneront
              automatiquement.
            </p>
          )}
          {detected === "not_found" && (
            <p className="text-xs text-lo">
              Client Riot non détecté pour l'instant (pas grave, l'app repasse en mode
              recherche manuelle) — relance le client Riot puis vérifie dans Paramètres →
              Overlay si besoin.
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onFinish}
              className="btn-clip bg-accent px-4 py-1.5 text-xs font-bold uppercase tracking-hud text-base"
            >
              Terminé
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
