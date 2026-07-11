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
  setUsageMetricsEnabled: (enabled: boolean) => Promise<void>;
  setUiTheme: (theme: string) => Promise<void>;
  setUiAccent: (accent: string) => Promise<void>;
  setOverlayDensity: (density: string) => Promise<void>;
  setLossStreakAlertEnabled: (enabled: boolean) => Promise<void>;
  setLossStreakAlertCount: (count: number) => Promise<void>;
  setInactivityReminderEnabled: (enabled: boolean) => Promise<void>;
  setInactivityReminderDays: (days: number) => Promise<void>;
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

  setUsageMetricsEnabled: async (enabled: boolean) => {
    await tauriApi.saveUsageMetricsEnabled(enabled);
    await get().refresh();
  },

  setUiTheme: async (theme: string) => {
    await tauriApi.saveUiTheme(theme);
    await get().refresh();
  },

  setUiAccent: async (accent: string) => {
    await tauriApi.saveUiAccent(accent);
    await get().refresh();
  },

  setOverlayDensity: async (density: string) => {
    await tauriApi.saveOverlayDensity(density);
    await get().refresh();
  },

  setLossStreakAlertEnabled: async (enabled: boolean) => {
    await tauriApi.saveLossStreakAlertEnabled(enabled);
    await get().refresh();
  },

  setLossStreakAlertCount: async (count: number) => {
    await tauriApi.saveLossStreakAlertCount(count);
    await get().refresh();
  },

  setInactivityReminderEnabled: async (enabled: boolean) => {
    await tauriApi.saveInactivityReminderEnabled(enabled);
    await get().refresh();
  },

  setInactivityReminderDays: async (days: number) => {
    await tauriApi.saveInactivityReminderDays(days);
    await get().refresh();
  },
}));
