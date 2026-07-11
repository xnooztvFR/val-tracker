import { create } from "zustand";

import { isCommandError } from "../lib/tauriApi";

export type ApiHealthStatus = "ok" | "rate_limited" | "circuit_open" | "network";

interface ApiHealthState {
  status: ApiHealthStatus;
  detail: string | null;
  reportError: (error: unknown) => void;
  reportSuccess: () => void;
}

/** État agrégé de la connexion à l'API Henrik, alimenté globalement par le QueryCache de
 * React Query (voir main.tsx) — n'importe quel hook usePlayer/useMatches/useMeta/... qui
 * échoue avec un rate_limited/circuit_open/network met à jour ce store, pour un badge
 * permanent dans TopNav sans devoir naviguer vers un écran pour voir l'état (TODO #40). */
export const useApiHealthStore = create<ApiHealthState>((set) => ({
  status: "ok",
  detail: null,

  reportError: (error: unknown) => {
    if (!isCommandError(error)) return;
    switch (error.kind) {
      case "rate_limited":
        set({
          status: "rate_limited",
          detail: error.retry_after_secs
            ? `Rate limit — réessaie dans ${error.retry_after_secs}s`
            : "Rate limit atteint",
        });
        return;
      case "circuit_open":
        set({ status: "circuit_open", detail: "Trop d'échecs récents vers l'API Henrik" });
        return;
      case "network":
        set({ status: "network", detail: "Panne réseau — API Henrik injoignable" });
        return;
      default:
        // Les autres erreurs (clé manquante, 404, réponse invalide...) ne reflètent pas
        // un problème de connexion à l'API, on ne dégrade pas le badge pour ça.
        return;
    }
  },

  reportSuccess: () => set({ status: "ok", detail: null }),
}));
