import { create } from "zustand";

// Overlay & détection en jeu (TODO#3) : réorganisation drag & drop des blocs de l'overlay
// en layout "full" (roster, rôle manquant, top agents, session, sparkline) — même mécanique
// que homeOrderStore.ts (préférence d'affichage purement locale, persistée en localStorage,
// fusion défensive avec l'ordre par défaut). Uniquement actionnable en mode interactif
// (Ctrl+Shift+V) : l'overlay est click-through par défaut, donc le drag n'a de sens que
// quand la fenêtre accepte déjà les événements souris.

const STORAGE_KEY = "val-tracker:overlay-order";

interface OverlayOrderState {
  order: string[];
  reorder: (defaultKeys: readonly string[], fromKey: string, toKey: string) => void;
}

function readStoredOrder(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.every((k) => typeof k === "string") ? parsed : [];
  } catch {
    return [];
  }
}

export function resolveOverlayOrder(defaultKeys: readonly string[]): string[] {
  const stored = readStoredOrder().filter((k) => defaultKeys.includes(k));
  const missing = defaultKeys.filter((k) => !stored.includes(k));
  return [...stored, ...missing];
}

export const useOverlayOrderStore = create<OverlayOrderState>((set) => ({
  order: [],
  reorder: (defaultKeys, fromKey, toKey) => {
    set((s) => {
      const current = s.order.length > 0 ? s.order : resolveOverlayOrder(defaultKeys);
      const next = [...current];
      const fromIndex = next.indexOf(fromKey);
      const toIndex = next.indexOf(toKey);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return { order: current };
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* best-effort */
      }
      return { order: next };
    });
  },
}));
