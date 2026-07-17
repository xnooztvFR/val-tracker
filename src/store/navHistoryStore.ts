import { create } from "zustand";

// TODO Fonctionnalités#2 : navigation précédent/suivant façon navigateur, au-delà du seul
// historique de recherche (recentSearchesStore). Pile custom plutôt que `window.history`
// natif : `back()`/`forward()` doivent savoir précisément s'il reste quelque chose à
// visiter (désactiver les boutons), ce que l'API History du navigateur n'expose pas
// directement. Store non persisté (pure session courante, comme uiStore.ts).

interface NavHistoryState {
  stack: string[];
  index: number;
  /** Empêche `record` de traiter la navigation déclenchée par back()/forward() elle-même
   * comme une nouvelle branche d'historique. */
  suppressNext: boolean;
  record: (path: string) => void;
  back: () => string | null;
  forward: () => string | null;
}

export const useNavHistoryStore = create<NavHistoryState>((set, get) => ({
  stack: [],
  index: -1,
  suppressNext: false,

  record: (path) => {
    const { stack, index, suppressNext } = get();
    if (suppressNext) {
      set({ suppressNext: false });
      return;
    }
    if (stack[index] === path) return;
    const truncated = stack.slice(0, index + 1);
    truncated.push(path);
    set({ stack: truncated, index: truncated.length - 1 });
  },

  back: () => {
    const { stack, index } = get();
    if (index <= 0) return null;
    const nextIndex = index - 1;
    set({ index: nextIndex, suppressNext: true });
    return stack[nextIndex];
  },

  forward: () => {
    const { stack, index } = get();
    if (index >= stack.length - 1) return null;
    const nextIndex = index + 1;
    set({ index: nextIndex, suppressNext: true });
    return stack[nextIndex];
  },
}));
