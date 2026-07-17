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
  setDiscordWebhookEnabled: (enabled: boolean) => Promise<void>;
  setDiscordWebhookUrl: (url: string) => Promise<void>;
  setStatusWatcherEnabled: (enabled: boolean) => Promise<void>;
  setUsageMetricsEnabled: (enabled: boolean) => Promise<void>;
  setUiTheme: (theme: string) => Promise<void>;
  setUiAccent: (accent: string) => Promise<void>;
  setUiLanguage: (language: string) => Promise<void>;
  setUiDensity: (density: string) => Promise<void>;
  setOverlayDensity: (density: string) => Promise<void>;
  setOverlayLayout: (layout: string) => Promise<void>;
  setOverlayMonitor: (monitorId: string) => Promise<void>;
  setLossStreakAlertEnabled: (enabled: boolean) => Promise<void>;
  setLossStreakAlertCount: (count: number) => Promise<void>;
  setWinStreakAlertEnabled: (enabled: boolean) => Promise<void>;
  setWinStreakAlertCount: (count: number) => Promise<void>;
  setRankChangeAlertEnabled: (enabled: boolean) => Promise<void>;
  setRankGapAlertEnabled: (enabled: boolean) => Promise<void>;
  setRankGapAlertThreshold: (threshold: number) => Promise<void>;
  setInactivityReminderEnabled: (enabled: boolean) => Promise<void>;
  setInactivityReminderDays: (days: number) => Promise<void>;
  setNotesPin: (pin: string) => Promise<void>;
  clearNotesPin: () => Promise<void>;
  setShortcutOverlayToggle: (shortcut: string) => Promise<void>;
  setShortcutMainWindowToggle: (shortcut: string) => Promise<void>;
  setUiFont: (font: string) => Promise<void>;
  setPresentationModeEnabled: (enabled: boolean) => Promise<void>;
  setWallpaperEnabled: (enabled: boolean) => Promise<void>;
  setHudSoundsEnabled: (enabled: boolean) => Promise<void>;
  setHudSoundsVolume: (volume: number) => Promise<void>;
  setCursorEnabled: (enabled: boolean) => Promise<void>;
  setIconStyle: (style: string) => Promise<void>;
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

  setDiscordWebhookEnabled: async (enabled: boolean) => {
    await tauriApi.saveDiscordWebhookEnabled(enabled);
    await get().refresh();
  },

  setDiscordWebhookUrl: async (url: string) => {
    await tauriApi.saveDiscordWebhookUrl(url);
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

  setUiLanguage: async (language: string) => {
    await tauriApi.saveUiLanguage(language);
    await get().refresh();
  },

  setUiDensity: async (density: string) => {
    await tauriApi.saveUiDensity(density);
    await get().refresh();
  },

  setOverlayDensity: async (density: string) => {
    await tauriApi.saveOverlayDensity(density);
    await get().refresh();
  },

  setOverlayLayout: async (layout: string) => {
    await tauriApi.saveOverlayLayout(layout);
    await get().refresh();
  },

  setOverlayMonitor: async (monitorId: string) => {
    await tauriApi.saveOverlayMonitor(monitorId);
    await get().refresh();
  },

  setShortcutOverlayToggle: async (shortcut: string) => {
    await tauriApi.saveShortcutOverlayToggle(shortcut);
    await get().refresh();
  },

  setShortcutMainWindowToggle: async (shortcut: string) => {
    await tauriApi.saveShortcutMainWindowToggle(shortcut);
    await get().refresh();
  },

  setUiFont: async (font: string) => {
    await tauriApi.saveUiFont(font);
    await get().refresh();
  },

  setPresentationModeEnabled: async (enabled: boolean) => {
    await tauriApi.savePresentationModeEnabled(enabled);
    await get().refresh();
  },

  setWallpaperEnabled: async (enabled: boolean) => {
    await tauriApi.saveWallpaperEnabled(enabled);
    await get().refresh();
  },

  setHudSoundsEnabled: async (enabled: boolean) => {
    await tauriApi.saveHudSoundsEnabled(enabled);
    await get().refresh();
  },

  setHudSoundsVolume: async (volume: number) => {
    await tauriApi.saveHudSoundsVolume(volume);
    await get().refresh();
  },

  setCursorEnabled: async (enabled: boolean) => {
    await tauriApi.saveCursorEnabled(enabled);
    await get().refresh();
  },

  setIconStyle: async (style: string) => {
    await tauriApi.saveIconStyle(style);
    await get().refresh();
  },

  setLossStreakAlertEnabled: async (enabled: boolean) => {
    await tauriApi.saveLossStreakAlertEnabled(enabled);
    await get().refresh();
  },

  setRankChangeAlertEnabled: async (enabled: boolean) => {
    await tauriApi.saveRankChangeAlertEnabled(enabled);
    await get().refresh();
  },

  setLossStreakAlertCount: async (count: number) => {
    await tauriApi.saveLossStreakAlertCount(count);
    await get().refresh();
  },

  setWinStreakAlertEnabled: async (enabled: boolean) => {
    await tauriApi.saveWinStreakAlertEnabled(enabled);
    await get().refresh();
  },

  setWinStreakAlertCount: async (count: number) => {
    await tauriApi.saveWinStreakAlertCount(count);
    await get().refresh();
  },

  setRankGapAlertEnabled: async (enabled: boolean) => {
    await tauriApi.saveRankGapAlertEnabled(enabled);
    await get().refresh();
  },

  setRankGapAlertThreshold: async (threshold: number) => {
    await tauriApi.saveRankGapAlertThreshold(threshold);
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

  setNotesPin: async (pin: string) => {
    await tauriApi.saveNotesPin(pin);
    await get().refresh();
  },

  clearNotesPin: async () => {
    await tauriApi.clearNotesPin();
    await get().refresh();
  },
}));
