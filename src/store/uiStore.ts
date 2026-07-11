import { create } from "zustand";

interface UiState {
  /** Mode "mini" pensé pour un futur overlay en jeu : masque le rail latéral détaillé et
   * la nav par onglets, ne garde qu'un résumé condensé, et réduit la fenêtre Tauri. */
  compact: boolean;
  toggleCompact: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  compact: false,
  toggleCompact: () => set((s) => ({ compact: !s.compact })),
}));
