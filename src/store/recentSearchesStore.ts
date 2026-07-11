import { create } from "zustand";

import { tauriApi, type TrackedPlayer } from "../lib/tauriApi";

const RECENT_LIMIT = 5;

interface RecentSearchesState {
  players: TrackedPlayer[];
  loading: boolean;
  refresh: () => Promise<void>;
  toggleFavorite: (puuid: string) => Promise<void>;
}

export const useRecentSearchesStore = create<RecentSearchesState>((set, get) => ({
  players: [],
  loading: false,

  refresh: async () => {
    set({ loading: true });
    try {
      const players = await tauriApi.listTrackedPlayers(RECENT_LIMIT);
      set({ players, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  toggleFavorite: async (puuid: string) => {
    await tauriApi.toggleFavoritePlayer(puuid);
    await get().refresh();
  },
}));
