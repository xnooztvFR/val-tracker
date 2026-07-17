import { create } from "zustand";

// TODO Fonctionnalités#6 : glisser-déposer un match depuis l'historique vers l'onglet
// Compare (/vs) — relais éphémère entre TopNav (cible du drop, montée globalement) et
// Compare.tsx (qui consomme la valeur au montage puis la vide) : un `navigate("/vs")`
// classique ne transporte pas de payload, ce petit store sert de "boîte aux lettres"
// in-memory (pas de persistance, une seule lecture).

export interface CompareDropPayload {
  region: string;
  name: string;
  tag: string;
}

interface CompareDropState {
  pending: CompareDropPayload | null;
  setPending: (payload: CompareDropPayload) => void;
  consume: () => CompareDropPayload | null;
}

export const useCompareDropStore = create<CompareDropState>((set, get) => ({
  pending: null,
  setPending: (payload) => set({ pending: payload }),
  consume: () => {
    const value = get().pending;
    if (value) set({ pending: null });
    return value;
  },
}));
