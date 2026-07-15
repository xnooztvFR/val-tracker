import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useSettingsStore } from "../store/settingsStore";
import GeneralSection from "./settings/GeneralSection";
import AppearanceSection from "./settings/AppearanceSection";
import LanguageSection from "./settings/LanguageSection";
import AutostartSection from "./settings/AutostartSection";
import OverlaySection from "./settings/OverlaySection";
import DiscordSection from "./settings/DiscordSection";
import CrosshairSection from "./settings/CrosshairSection";
import ShortcutsSection from "./settings/ShortcutsSection";
import NotificationsSection from "./settings/NotificationsSection";
import PrivacySection from "./settings/PrivacySection";
import UpdatesSection from "./settings/UpdatesSection";
import DataSection from "./settings/DataSection";
import LogsSection from "./settings/LogsSection";
import HealthSection from "./settings/HealthSection";
import DiagnosticsSection from "./settings/DiagnosticsSection";
import AboutSection from "./settings/AboutSection";

// Regroupement en 6 catégories (au lieu de 13) : chaque page peut empiler plusieurs
// sections thématiquement proches (séparées par SectionDivider) plutôt qu'une entrée de
// nav par réglage isolé.
type Category = "general" | "game" | "alerts" | "updates" | "data" | "about";

const CATEGORY_IDS: Category[] = ["general", "game", "alerts", "updates", "data", "about"];

function isCategory(value: string | null): value is Category {
  return CATEGORY_IDS.includes(value as Category);
}

export default function Settings() {
  const { t } = useTranslation("settings");
  const {
    settings,
    refresh,
    setApiKey,
    setDefaultRegion,
    setAutoUpdateEnabled,
    setRiotLocalDisabled,
    setDiscordRpcEnabled,
    setDiscordRpcClientId,
    setStatusWatcherEnabled,
    setUsageMetricsEnabled,
    setUiTheme,
    setUiAccent,
    setUiLanguage,
    setUiDensity,
    setOverlayDensity,
    setOverlayLayout,
    setOverlayMonitor,
    setRankGapAlertEnabled,
    setRankGapAlertThreshold,
    setLossStreakAlertEnabled,
    setLossStreakAlertCount,
    setInactivityReminderEnabled,
    setInactivityReminderDays,
    setNotesPin,
    clearNotesPin,
    setShortcutOverlayToggle,
    setShortcutMainWindowToggle,
  } = useSettingsStore();
  const [searchParams] = useSearchParams();
  const initialCategory = searchParams.get("section");
  const [category, setCategory] = useState<Category>(
    isCategory(initialCategory) ? initialCategory : "general",
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="flex h-full">
      <nav className="w-52 shrink-0 border-r border-line bg-base p-4">
        <p className="hud-label mb-3 px-3">{t("nav.title")}</p>
        {CATEGORY_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setCategory(id)}
            className={`relative block w-full px-3 py-2 text-left text-sm font-medium transition-colors ${
              category === id ? "bg-surface text-hi" : "text-lo hover:bg-surface/60 hover:text-hi"
            }`}
          >
            {category === id && <span className="absolute inset-y-0 left-0 w-[2px] bg-accent" />}
            {t(`nav.${id}`)}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto p-6">
        {category === "general" && (
          <div className="space-y-10">
            <GeneralSection
              apiKeySet={settings?.henrik_api_key_set ?? false}
              savedApiKey={settings?.henrik_api_key ?? ""}
              defaultRegion={settings?.default_region ?? "eu"}
              dpapiUnreadable={settings?.henrik_api_key_dpapi_unreadable ?? false}
              onSaveApiKey={setApiKey}
              onSaveRegion={setDefaultRegion}
            />
            <SectionDivider />
            <AppearanceSection
              theme={settings?.ui_theme ?? "dark"}
              accent={settings?.ui_accent ?? "red"}
              density={settings?.ui_density ?? "comfortable"}
              onChangeTheme={setUiTheme}
              onChangeAccent={setUiAccent}
              onChangeDensity={setUiDensity}
            />
            <SectionDivider />
            <LanguageSection
              language={settings?.ui_language ?? "fr"}
              onChangeLanguage={setUiLanguage}
            />
            <SectionDivider />
            <AutostartSection />
          </div>
        )}
        {category === "game" && (
          <div className="space-y-10">
            <OverlaySection
              disabled={settings?.riot_local_disabled ?? false}
              onChange={setRiotLocalDisabled}
              density={settings?.overlay_density ?? "detailed"}
              onChangeDensity={setOverlayDensity}
              layout={settings?.overlay_layout ?? "full"}
              onChangeLayout={setOverlayLayout}
              rankGapAlertEnabled={settings?.rank_gap_alert_enabled ?? false}
              rankGapAlertThreshold={settings?.rank_gap_alert_threshold ?? 9}
              onChangeRankGapAlertEnabled={setRankGapAlertEnabled}
              onChangeRankGapAlertThreshold={setRankGapAlertThreshold}
              monitorId={settings?.overlay_monitor ?? "auto"}
              onChangeMonitor={setOverlayMonitor}
            />
            <SectionDivider />
            <DiscordSection
              enabled={settings?.discord_rpc_enabled ?? false}
              clientId={settings?.discord_rpc_client_id ?? ""}
              onChangeEnabled={setDiscordRpcEnabled}
              onSaveClientId={setDiscordRpcClientId}
            />
            <SectionDivider />
            <CrosshairSection />
            <SectionDivider />
            <ShortcutsSection
              shortcutOverlayToggle={settings?.shortcut_overlay_toggle ?? "ctrl+shift+v"}
              shortcutMainWindowToggle={settings?.shortcut_main_window_toggle ?? "ctrl+shift+h"}
              onChangeShortcutOverlayToggle={setShortcutOverlayToggle}
              onChangeShortcutMainWindowToggle={setShortcutMainWindowToggle}
            />
          </div>
        )}
        {category === "alerts" && (
          <div className="space-y-10">
            <NotificationsSection
              statusWatcherEnabled={settings?.status_watcher_enabled ?? false}
              onChangeStatusWatcher={setStatusWatcherEnabled}
              lossStreakAlertEnabled={settings?.loss_streak_alert_enabled ?? false}
              lossStreakAlertCount={settings?.loss_streak_alert_count ?? 3}
              onChangeLossStreakAlertEnabled={setLossStreakAlertEnabled}
              onChangeLossStreakAlertCount={setLossStreakAlertCount}
              inactivityReminderEnabled={settings?.inactivity_reminder_enabled ?? false}
              inactivityReminderDays={settings?.inactivity_reminder_days ?? 3}
              onChangeInactivityReminderEnabled={setInactivityReminderEnabled}
              onChangeInactivityReminderDays={setInactivityReminderDays}
            />
            <SectionDivider />
            <PrivacySection
              enabled={settings?.notes_pin_enabled ?? false}
              dpapiUnreadable={settings?.notes_pin_dpapi_unreadable ?? false}
              onSavePin={setNotesPin}
              onClearPin={clearNotesPin}
            />
          </div>
        )}
        {category === "updates" && (
          <UpdatesSection
            enabled={settings?.auto_update_enabled ?? true}
            onChange={setAutoUpdateEnabled}
          />
        )}
        {category === "data" && (
          <div className="space-y-10">
            <DataSection />
            <SectionDivider />
            <LogsSection />
            <SectionDivider />
            <HealthSection
              enabled={settings?.usage_metrics_enabled ?? false}
              onChange={setUsageMetricsEnabled}
            />
            <SectionDivider />
            <DiagnosticsSection />
          </div>
        )}
        {category === "about" && <AboutSection />}
      </div>
    </div>
  );
}

function SectionDivider() {
  return <div className="border-t border-line" />;
}
