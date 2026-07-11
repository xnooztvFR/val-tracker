import { create } from "zustand";

import { tauriApi, type AppSettings } from "../lib/tauriApi";

interface SettingsState {
  settings: AppSettings | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setApiKey: (apiKey: string) => Promise<void>;
  setDefaultRegion: (region: string) => Promise<void>;
  setAutoUpdateEnabled: (enabled: boolean) => Promise<void>;
  setRiotLocalDisabled: (disabled: boolean) => Promise<void>;
  setDiscordRpcEnabled: (enabled: boolean) => Promise<void>;
  setDiscordRpcClientId: (clientId: string) => Promise<void>;
  setStatusWatcherEnabled: (enabled: boolean) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const settings = await tauriApi.getSettings();
      set({ settings, loading: false });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  setApiKey: async (apiKey: string) => {
    await tauriApi.saveHenrikApiKey(apiKey);
    await get().refresh();
  },

  setDefaultRegion: async (region: string) => {
    await tauriApi.saveDefaultRegion(region);
    await get().refresh();
  },

  setAutoUpdateEnabled: async (enabled: boolean) => {
    await tauriApi.saveAutoUpdateEnabled(enabled);
    await get().refresh();
  },

  setRiotLocalDisabled: async (disabled: boolean) => {
    await tauriApi.saveRiotLocalDisabled(disabled);
    await get().refresh();
  },

  setDiscordRpcEnabled: async (enabled: boolean) => {
    await tauriApi.saveDiscordRpcEnabled(enabled);
    await get().refresh();
  },

  setDiscordRpcClientId: async (clientId: string) => {
    await tauriApi.saveDiscordRpcClientId(clientId);
    await get().refresh();
  },

  setStatusWatcherEnabled: async (enabled: boolean) => {
    await tauriApi.saveStatusWatcherEnabled(enabled);
    await get().refresh();
  },
}));
