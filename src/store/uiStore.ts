import { create } from "zustand";

interface UiState {
  /** Mode "mini" pensé pour un futur overlay en jeu : masque le rail latéral détaillé et
   * la nav par onglets, ne garde qu'un résumé condensé, et réduit la fenêtre Tauri. */
  compact: boolean;
  toggleCompact: () => void;
  /** Backlog #63 : mode "focus" pour un partage d'écran/stream propre — masque titlebar,
   * nav, bandeaux d'update/statut, ne garde que l'écran courant en plein cadre. Distinct de
   * `compact` (qui condense en vue résumée plutôt que de juste masquer le chrome). */
  focus: boolean;
  toggleFocus: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  compact: false,
  toggleCompact: () => set((s) => ({ compact: !s.compact })),
  focus: false,
  toggleFocus: () => set((s) => ({ focus: !s.focus })),
}));
