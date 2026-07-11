import { create } from "zustand";

export interface ActivePlayer {
  region: string;
  name: string;
  tag: string;
}

interface ActivePlayerState {
  player: ActivePlayer | null;
  setPlayer: (player: ActivePlayer) => void;
  clear: () => void;
}

/** Joueur actuellement suivi — synchronisé depuis les paramètres de route par PlayerShell,
 * lu par TopNav (onglets + chip de profil) même sur des écrans hors /joueur/* comme
 * Paramètres, pour garder la navigation et le profil connecté cohérents. */
export const useActivePlayerStore = create<ActivePlayerState>((set) => ({
  player: null,
  setPlayer: (player) => set({ player }),
  clear: () => set({ player: null }),
}));
