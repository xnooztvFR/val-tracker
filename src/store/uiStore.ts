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
  /** Backlog Fonctionnalités#11 : mode incognito ponctuel — une recherche faite pendant que
   * ce toggle est actif ne s'enregistre pas dans l'historique récent (`tracked_players`
   * n'est pas upserté, voir Search.tsx). Éphémère et non persisté comme `compact`/`focus` :
   * se réinitialise à chaque redémarrage de l'app plutôt que de rester activé par erreur
   * d'une session à l'autre. */
  incognito: boolean;
  toggleIncognito: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  compact: false,
  toggleCompact: () => set((s) => ({ compact: !s.compact })),
  focus: false,
  toggleFocus: () => set((s) => ({ focus: !s.focus })),
  incognito: false,
  toggleIncognito: () => set((s) => ({ incognito: !s.incognito })),
}));
