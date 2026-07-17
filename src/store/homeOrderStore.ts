import { create } from "zustand";

// TODO Fonctionnalités#10 : réorganisation drag & drop des blocs de l'écran Accueil
// (goals/overview/queue/recommandations/timeline) — mêmes mécanique et raisonnement que
// tabOrderStore.ts (préférence d'affichage purement locale, persistée en localStorage,
// fusion défensive avec l'ordre par défaut pour rester robuste si un bloc est ajouté/retiré
// dans une future version). `HomeStatusBar` n'en fait pas partie : elle porte les contrôles
// globaux (rafraîchir, taille d'échantillon, carte de visite) et reste fixe en haut.

const STORAGE_KEY = "val-tracker:home-order";

interface HomeOrderState {
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

export function resolveHomeOrder(defaultKeys: readonly string[]): string[] {
  const stored = readStoredOrder().filter((k) => defaultKeys.includes(k));
  const missing = defaultKeys.filter((k) => !stored.includes(k));
  return [...stored, ...missing];
}

export const useHomeOrderStore = create<HomeOrderState>((set) => ({
  order: [],
  reorder: (defaultKeys, fromKey, toKey) => {
    set((s) => {
      const current = s.order.length > 0 ? s.order : resolveHomeOrder(defaultKeys);
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
