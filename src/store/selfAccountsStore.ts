import { create } from "zustand";

import { tauriApi, type TrackedPlayer } from "../lib/tauriApi";

interface SelfAccountsState {
  accounts: TrackedPlayer[];
  loading: boolean;
  refresh: () => Promise<void>;
  setSelf: (puuid: string, isSelf: boolean) => Promise<void>;
}

/** Comptes Valorant marqués "à soi" (V4, multi-comptes) — alimente le sélecteur de
 * comptes de TopNav. Pas de RSO/OAuth Riot possible pour cette app, donc "lier son
 * compte" ne fait que marquer un Riot ID déjà consulté (voir `commands::set_self_account`
 * côté Rust). */
export const useSelfAccountsStore = create<SelfAccountsState>((set, get) => ({
  accounts: [],
  loading: false,

  refresh: async () => {
    set({ loading: true });
    try {
      const accounts = await tauriApi.listSelfAccounts();
      set({ accounts, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  setSelf: async (puuid: string, isSelf: boolean) => {
    await tauriApi.setSelfAccount(puuid, isSelf);
    await get().refresh();
  },
}));
