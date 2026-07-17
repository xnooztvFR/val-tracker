import { create } from "zustand";

import { agentRole, type AgentRole } from "../lib/agentRoles";

// TODO Design#2 : accent "auto" (ui_accent) — mappe le rôle de l'agent le plus joué vers une
// des 4 teintes déjà définies dans index.css (`[data-accent]`), plutôt que d'inventer de
// nouvelles couleurs. Duelist reste rouge (défaut, agression), Sentinel cyan (défense),
// Controller violet, Initiator ambre — cohérent avec l'ordre AGENT_ROLE_ORDER existant.
const ACCENT_BY_ROLE: Record<AgentRole, string> = {
  Duelist: "red",
  Sentinel: "cyan",
  Controller: "violet",
  Initiator: "amber",
};

interface DynamicAccentState {
  accent: string | null;
  setFromTopAgent: (agentName: string | null | undefined) => void;
}

/** Recalculé à chaque visite de l'écran Home (voir useHomeData.ts) depuis l'agent le plus
 * joué de l'échantillon de matchs courant — App.tsx applique cette valeur comme `data-accent`
 * quand `ui_accent === "auto"`, faute de quoi le libellé "auto" n'aurait pas de couleur avant
 * la première visite d'un profil. */
export const useDynamicAccentStore = create<DynamicAccentState>((set) => ({
  accent: null,
  setFromTopAgent: (agentName) => {
    const role = agentRole(agentName);
    set({ accent: role ? ACCENT_BY_ROLE[role] : null });
  },
}));
