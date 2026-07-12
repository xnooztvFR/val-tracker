import { create } from "zustand";

// Backlog #64 : réordonnancement des onglets TopNav par drag & drop, même mécanique HTML5
// drag-and-drop que les favoris (#27, voir Search.tsx). Contrairement aux favoris, l'ordre
// des onglets est une pure préférence d'affichage locale (pas de données à synchroniser
// entre appareils) — persistée en localStorage plutôt que côté backend SQLite.

const STORAGE_KEY = "val-tracker:tab-order";

interface TabOrderState {
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

/** Fusionne l'ordre stocké avec l'ordre par défaut courant : garde la préférence utilisateur
 * pour les clés connues, ajoute en fin les nouvelles clés (nouvel onglet livré par une
 * future version) et retire les clés obsolètes (onglet supprimé depuis). */
export function resolveTabOrder(defaultKeys: readonly string[]): string[] {
  const stored = readStoredOrder().filter((k) => defaultKeys.includes(k));
  const missing = defaultKeys.filter((k) => !stored.includes(k));
  return [...stored, ...missing];
}

export const useTabOrderStore = create<TabOrderState>((set) => ({
  order: [],
  reorder: (defaultKeys, fromKey, toKey) => {
    set((s) => {
      const current = s.order.length > 0 ? s.order : resolveTabOrder(defaultKeys);
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
