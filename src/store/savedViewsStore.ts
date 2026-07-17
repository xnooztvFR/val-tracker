import { create } from "zustand";

// TODO Fonctionnalités#4 : vues sauvegardées combinées ("mes ranked Duelist sur Ascent ce
// mois") réutilisables en un clic dans MatchHistory.tsx, façon playlist intelligente —
// preset des 6 filtres déjà exposés par l'écran. Purement local (localStorage), aucune
// donnée sensible, même esprit que tabOrderStore.ts.

const STORAGE_KEY = "val-tracker:saved-match-views";

export interface SavedMatchView {
  id: string;
  name: string;
  resultFilter: "all" | "win" | "loss";
  agentFilter: string | null;
  mapFilter: string | null;
  modeFilter: string | null;
  dateFrom: string;
  dateTo: string;
}

interface SavedViewsState {
  views: SavedMatchView[];
  save: (view: Omit<SavedMatchView, "id">) => void;
  remove: (id: string) => void;
}

function readStored(): SavedMatchView[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as SavedMatchView[]) : [];
  } catch {
    return [];
  }
}

function persist(list: SavedMatchView[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* best-effort */
  }
}

export const useSavedViewsStore = create<SavedViewsState>((set) => ({
  views: readStored(),

  save: (view) => {
    set((s) => {
      const next = [...s.views, { ...view, id: crypto.randomUUID() }];
      persist(next);
      return { views: next };
    });
  },

  remove: (id) => {
    set((s) => {
      const next = s.views.filter((v) => v.id !== id);
      persist(next);
      return { views: next };
    });
  },
}));
