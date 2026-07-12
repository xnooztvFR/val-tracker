import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";

import { useSettingsStore } from "../store/settingsStore";
import { tauriApi, type UsageMetricsSummary } from "../lib/tauriApi";
import { getRegions } from "../lib/format";
import { useUpdater } from "../hooks/useUpdater";
import StatCard from "../components/StatCard";

type VerifyState = "idle" | "checking" | "valid" | "invalid" | "error";
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
    setLossStreakAlertEnabled,
    setLossStreakAlertCount,
    setInactivityReminderEnabled,
    setInactivityReminderDays,
    setNotesPin,
    clearNotesPin,
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
            <ShortcutsSection />
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

const INPUT_CLASS =
  "border border-line bg-surface px-3 py-2 text-sm text-hi placeholder:text-lo/60 focus:border-accent focus:outline-none";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="font-display text-lg font-bold uppercase tracking-hud text-hi">{children}</h1>;
}

function GeneralSection({
  apiKeySet,
  savedApiKey,
  defaultRegion,
  onSaveApiKey,
  onSaveRegion,
}: {
  apiKeySet: boolean;
  savedApiKey: string;
  defaultRegion: string;
  onSaveApiKey: (key: string) => Promise<void>;
  onSaveRegion: (region: string) => Promise<void>;
}) {
  const { t } = useTranslation("settings");
  const [apiKeyInput, setApiKeyInput] = useState(savedApiKey);
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [saveState, setSaveState] = useState<"idle" | "saved">("idle");

  useEffect(() => {
    setApiKeyInput(savedApiKey);
  }, [savedApiKey]);

  async function handleVerify() {
    if (!apiKeyInput.trim()) return;
    setVerifyState("checking");
    try {
      const valid = await tauriApi.verifyHenrikApiKey(apiKeyInput.trim());
      setVerifyState(valid ? "valid" : "invalid");
    } catch {
      setVerifyState("error");
    }
  }

  async function handleSaveKey() {
    await onSaveApiKey(apiKeyInput.trim());
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 2000);
  }

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <SectionTitle>{t("general.title")}</SectionTitle>
        <p className="mt-1 text-sm text-lo">
          {apiKeySet ? t("general.apiKeySet") : t("general.apiKeyNotSet")}
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="hud-label">{t("general.apiKeyLabel")}</h2>
        <div className="flex gap-2">
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => {
              setApiKeyInput(e.target.value);
              setVerifyState("idle");
            }}
            placeholder={t("general.apiKeyPlaceholder")}
            className={`flex-1 font-mono ${INPUT_CLASS}`}
          />
          <button
            type="button"
            onClick={handleVerify}
            disabled={!apiKeyInput.trim() || verifyState === "checking"}
            className="border border-line px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {verifyState === "checking" ? t("general.verifying") : t("general.verify")}
          </button>
          <button
            type="button"
            onClick={handleSaveKey}
            disabled={!apiKeyInput.trim()}
            className="btn-clip bg-accent px-4 py-2 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-[#FF5969] disabled:opacity-50"
          >
            {t("general.save")}
          </button>
        </div>

        {verifyState === "valid" && <p className="text-sm text-accent">{t("general.keyValid")}</p>}
        {verifyState === "invalid" && (
          <p className="text-sm text-crit">{t("general.keyInvalid")}</p>
        )}
        {verifyState === "error" && (
          <p className="text-sm text-crit">{t("general.keyVerifyError")}</p>
        )}
        {saveState === "saved" && <p className="text-sm text-accent">{t("general.keySaved")}</p>}

        <p className="text-xs text-lo">{t("general.apiKeyHint")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="hud-label">{t("general.regionLabel")}</h2>
        <select value={defaultRegion} onChange={(e) => onSaveRegion(e.target.value)} className={INPUT_CLASS}>
          {getRegions().map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </section>
    </div>
  );
}

const THEME_IDS = ["dark", "light"] as const;
const ACCENTS: Array<{ id: string; swatch: string }> = [
  { id: "red", swatch: "#FF3B4E" },
  { id: "cyan", swatch: "#7CE8D3" },
  { id: "violet", swatch: "#A672E0" },
  { id: "amber", swatch: "#D4AF37" },
];

const DENSITY_IDS = ["comfortable", "compact"] as const;

function AppearanceSection({
  theme,
  accent,
  density,
  onChangeTheme,
  onChangeAccent,
  onChangeDensity,
}: {
  theme: string;
  accent: string;
  density: string;
  onChangeTheme: (theme: string) => Promise<void>;
  onChangeAccent: (accent: string) => Promise<void>;
  onChangeDensity: (density: string) => Promise<void>;
}) {
  const { t } = useTranslation("settings");
  return (
    <div className="max-w-xl space-y-6">
      <SectionTitle>{t("appearance.title")}</SectionTitle>

      <section className="space-y-2">
        <h2 className="hud-label">{t("appearance.themeLabel")}</h2>
        <div className="flex gap-2">
          {THEME_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onChangeTheme(id)}
              className={`border px-4 py-2 text-sm transition-colors ${
                theme === id
                  ? "border-accent text-hi"
                  : "border-line text-lo hover:border-line hover:text-hi"
              }`}
            >
              {t(`appearance.theme.${id}`)}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="hud-label">{t("appearance.accentLabel")}</h2>
        <p className="text-xs text-lo">{t("appearance.accentHint")}</p>
        <div className="flex gap-2">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onChangeAccent(a.id)}
              className={`flex items-center gap-2 border px-3 py-2 text-sm transition-colors ${
                accent === a.id ? "border-hi text-hi" : "border-line text-lo hover:text-hi"
              }`}
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: a.swatch }}
              />
              {t(`appearance.accent.${a.id}`)}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="hud-label">{t("appearance.densityLabel")}</h2>
        <p className="text-xs text-lo">{t("appearance.densityHint")}</p>
        <div className="flex gap-2">
          {DENSITY_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onChangeDensity(id)}
              className={`border px-4 py-2 text-sm transition-colors ${
                density === id
                  ? "border-accent text-hi"
                  : "border-line text-lo hover:border-line hover:text-hi"
              }`}
            >
              {t(`appearance.density.${id}`)}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

const LANGUAGE_IDS = ["fr", "en"] as const;

function LanguageSection({
  language,
  onChangeLanguage,
}: {
  language: string;
  onChangeLanguage: (language: string) => Promise<void>;
}) {
  const { t } = useTranslation("settings");
  return (
    <div className="max-w-xl space-y-2">
      <SectionTitle>{t("language.title")}</SectionTitle>
      <p className="text-xs text-lo">{t("language.hint")}</p>
      <div className="flex gap-2">
        {LANGUAGE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onChangeLanguage(id)}
            className={`border px-4 py-2 text-sm transition-colors ${
              language === id
                ? "border-accent text-hi"
                : "border-line text-lo hover:border-line hover:text-hi"
            }`}
          >
            {t(`language.${id}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Backlog #69 : pas de champ dans `AppSettings` — l'état de la tâche planifiée gérée par
 * le plugin autostart fait déjà foi (voir commands.rs), donc requête directe plutôt que de
 * dupliquer un flag dans le store zustand des settings. */
function AutostartSection() {
  const { t } = useTranslation("settings");
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tauriApi
      .getAutostartEnabled()
      .then(setEnabled)
      .catch(() => setEnabled(false))
      .finally(() => setLoading(false));
  }, []);

  async function handleChange(value: boolean) {
    setEnabled(value);
    try {
      await tauriApi.saveAutostartEnabled(value);
    } catch {
      setEnabled(!value);
    }
  }

  return (
    <section className="max-w-xl space-y-2">
      <SectionTitle>{t("autostart.title")}</SectionTitle>
      <label className="flex items-center gap-2.5 text-sm text-hi">
        <input
          type="checkbox"
          checked={enabled}
          disabled={loading}
          onChange={(e) => handleChange(e.target.checked)}
          className="h-4 w-4 border-line bg-surface accent-accent"
        />
        {t("autostart.label")}
      </label>
      <p className="text-xs text-lo">{t("autostart.hint")}</p>
    </section>
  );
}

function OverlaySection({
  disabled,
  onChange,
  density,
  onChangeDensity,
}: {
  disabled: boolean;
  onChange: (disabled: boolean) => Promise<void>;
  density: string;
  onChangeDensity: (density: string) => Promise<void>;
}) {
  const { t } = useTranslation("settings");
  const [shortcutRegistered, setShortcutRegistered] = useState<boolean | null>(null);

  useEffect(() => {
    tauriApi
      .getOverlayShortcutStatus()
      .then(setShortcutRegistered)
      .catch(() => setShortcutRegistered(null));
  }, []);

  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>{t("overlay.title")}</SectionTitle>
      <p className="text-sm text-lo">{t("overlay.description")}</p>

      <label className="flex items-center gap-2.5 text-sm text-hi">
        <input
          type="checkbox"
          checked={!disabled}
          onChange={(e) => onChange(!e.target.checked)}
          className="h-4 w-4 border-line bg-surface accent-accent"
        />
        {t("overlay.enableLabel")}
      </label>

      <section className="space-y-2">
        <h2 className="hud-label">{t("overlay.densityLabel")}</h2>
        <div className="flex gap-2">
          {OVERLAY_DENSITY_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onChangeDensity(id)}
              className={`border px-4 py-2 text-sm transition-colors ${
                density === id
                  ? "border-accent text-hi"
                  : "border-line text-lo hover:border-line hover:text-hi"
              }`}
            >
              {t(`overlay.density.${id}`)}
            </button>
          ))}
        </div>
        <p className="text-xs text-lo">{t("overlay.densityHint")}</p>
      </section>

      {shortcutRegistered === false && (
        <div className="relative border border-crit/30 bg-crit/5 py-2.5 pl-4 pr-3 text-xs text-hi">
          <span className="absolute inset-y-0 left-0 w-[3px] bg-crit" />
          <p className="hud-label !text-crit">{t("overlay.shortcutConflictTitle")}</p>
          <p className="mt-1 text-lo">
            <Trans
              t={t}
              i18nKey="overlay.shortcutConflictBody"
              components={{ shortcut: <span className="font-mono text-hi" /> }}
            />
          </p>
        </div>
      )}

      <div className="panel-clip-sm space-y-1.5 p-3 text-xs text-lo">
        <p>
          <span className="hud-label mr-2 text-[10px]">{t("overlay.shortcutLabel")}</span>
          <Trans
            t={t}
            i18nKey="overlay.shortcutHint"
            components={{ shortcut: <span className="font-mono text-hi" /> }}
          />
        </p>
        <p>{t("overlay.apiWarning")}</p>
      </div>
    </div>
  );
}

const OVERLAY_DENSITY_IDS = ["compact", "detailed"] as const;

function DiscordSection({
  enabled,
  clientId,
  onChangeEnabled,
  onSaveClientId,
}: {
  enabled: boolean;
  clientId: string;
  onChangeEnabled: (enabled: boolean) => Promise<void>;
  onSaveClientId: (clientId: string) => Promise<void>;
}) {
  const { t } = useTranslation("settings");
  const [input, setInput] = useState(clientId);
  const [saveState, setSaveState] = useState<"idle" | "saved">("idle");

  useEffect(() => {
    setInput(clientId);
  }, [clientId]);

  async function handleSave() {
    await onSaveClientId(input.trim());
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 2000);
  }

  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>{t("discord.title")}</SectionTitle>
      <p className="text-sm text-lo">{t("discord.description")}</p>

      <label className="flex items-center gap-2.5 text-sm text-hi">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChangeEnabled(e.target.checked)}
          className="h-4 w-4 border-line bg-surface accent-accent"
        />
        {t("discord.enableLabel")}
      </label>

      <section className="space-y-2">
        <h2 className="hud-label">{t("discord.clientIdLabel")}</h2>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("discord.clientIdPlaceholder")}
            className={`flex-1 font-mono ${INPUT_CLASS}`}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!input.trim()}
            className="btn-clip bg-accent px-4 py-2 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-[#FF5969] disabled:opacity-50"
          >
            {t("discord.save")}
          </button>
        </div>
        {saveState === "saved" && <p className="text-sm text-accent">{t("discord.saved")}</p>}
        <p className="text-xs text-lo">
          <Trans
            t={t}
            i18nKey="discord.clientIdHint"
            components={{ portal: <span className="font-mono text-hi" /> }}
          />
        </p>
      </section>

      <div className="panel-clip-sm space-y-1.5 p-3 text-xs text-lo">
        <p>{t("discord.bestEffort")}</p>
      </div>
    </div>
  );
}

function NotificationsSection({
  statusWatcherEnabled,
  onChangeStatusWatcher,
  lossStreakAlertEnabled,
  lossStreakAlertCount,
  onChangeLossStreakAlertEnabled,
  onChangeLossStreakAlertCount,
  inactivityReminderEnabled,
  inactivityReminderDays,
  onChangeInactivityReminderEnabled,
  onChangeInactivityReminderDays,
}: {
  statusWatcherEnabled: boolean;
  onChangeStatusWatcher: (enabled: boolean) => Promise<void>;
  lossStreakAlertEnabled: boolean;
  lossStreakAlertCount: number;
  onChangeLossStreakAlertEnabled: (enabled: boolean) => Promise<void>;
  onChangeLossStreakAlertCount: (count: number) => Promise<void>;
  inactivityReminderEnabled: boolean;
  inactivityReminderDays: number;
  onChangeInactivityReminderEnabled: (enabled: boolean) => Promise<void>;
  onChangeInactivityReminderDays: (days: number) => Promise<void>;
}) {
  const { t } = useTranslation("settings");
  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>{t("notifications.title")}</SectionTitle>

      <section className="space-y-2">
        <h2 className="hud-label">{t("notifications.rankChangeTitle")}</h2>
        <p className="text-sm text-lo">{t("notifications.rankChangeBody")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="hud-label">{t("notifications.statusTitle")}</h2>
        <label className="flex items-center gap-2.5 text-sm text-hi">
          <input
            type="checkbox"
            checked={statusWatcherEnabled}
            onChange={(e) => onChangeStatusWatcher(e.target.checked)}
            className="h-4 w-4 border-line bg-surface accent-accent"
          />
          {t("notifications.statusLabel")}
        </label>
        <p className="text-xs text-lo">{t("notifications.statusHint")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="hud-label">{t("notifications.lossStreakTitle")}</h2>
        <label className="flex items-center gap-2.5 text-sm text-hi">
          <input
            type="checkbox"
            checked={lossStreakAlertEnabled}
            onChange={(e) => onChangeLossStreakAlertEnabled(e.target.checked)}
            className="h-4 w-4 border-line bg-surface accent-accent"
          />
          {t("notifications.lossStreakLabel")}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={20}
            value={lossStreakAlertCount}
            onChange={(e) => onChangeLossStreakAlertCount(Number(e.target.value))}
            disabled={!lossStreakAlertEnabled}
            className={`w-20 disabled:opacity-50 ${INPUT_CLASS}`}
          />
          <span className="text-sm text-lo">{t("notifications.lossStreakUnit")}</span>
        </div>
        <p className="text-xs text-lo">{t("notifications.lossStreakHint")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="hud-label">{t("notifications.inactivityTitle")}</h2>
        <label className="flex items-center gap-2.5 text-sm text-hi">
          <input
            type="checkbox"
            checked={inactivityReminderEnabled}
            onChange={(e) => onChangeInactivityReminderEnabled(e.target.checked)}
            className="h-4 w-4 border-line bg-surface accent-accent"
          />
          {t("notifications.inactivityLabel")}
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-lo">{t("notifications.inactivityAfter")}</span>
          <input
            type="number"
            min={1}
            max={30}
            value={inactivityReminderDays}
            onChange={(e) => onChangeInactivityReminderDays(Number(e.target.value))}
            disabled={!inactivityReminderEnabled}
            className={`w-20 disabled:opacity-50 ${INPUT_CLASS}`}
          />
          <span className="text-sm text-lo">{t("notifications.inactivityUnit")}</span>
        </div>
        <p className="text-xs text-lo">{t("notifications.inactivityHint")}</p>
      </section>
    </div>
  );
}

function UpdatesSection({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => Promise<void>;
}) {
  const { t } = useTranslation("settings");
  const { status, version, error, checkNow, installNow } = useUpdater();

  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>{t("updates.title")}</SectionTitle>
      <label className="flex items-center gap-2.5 text-sm text-hi">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 border-line bg-surface accent-accent"
        />
        {t("updates.autoCheckLabel")}
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => checkNow()}
          disabled={status === "checking" || status === "downloading"}
          className="border border-line px-3 py-1.5 text-xs text-hi hover:bg-surface disabled:opacity-50"
        >
          {status === "checking" ? t("updates.checking") : t("updates.checkNow")}
        </button>
        {status === "up-to-date" && (
          <span className="text-xs text-lo">{t("updates.upToDate")}</span>
        )}
        {status === "available" && (
          <button
            type="button"
            onClick={() => installNow()}
            className="border border-accent/50 px-3 py-1.5 text-xs text-accent hover:bg-accent/10"
          >
            {t("updates.installVersion", { version })}
          </button>
        )}
        {status === "downloading" && (
          <span className="text-xs text-lo">{t("updates.downloading")}</span>
        )}
        {status === "error" && (
          <span className="text-xs text-crit">{t("updates.error", { error })}</span>
        )}
      </div>

      <p className="text-xs text-lo">{t("updates.distributionNote")}</p>
    </div>
  );
}

function CrosshairSection() {
  const { t } = useTranslation("settings");
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setState("loading");
    setPreview(null);
    try {
      const base64 = await tauriApi.fetchCrosshairPreview(code.trim());
      setPreview(`data:image/png;base64,${base64}`);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>{t("crosshair.title")}</SectionTitle>
      <p className="text-sm text-lo">{t("crosshair.description")}</p>

      <form onSubmit={handlePreview} className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t("crosshair.placeholder")}
          className={`flex-1 font-mono ${INPUT_CLASS}`}
        />
        <button
          type="submit"
          disabled={!code.trim() || state === "loading"}
          className="btn-clip bg-accent px-4 py-2 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-[#FF5969] disabled:opacity-50"
        >
          {state === "loading" ? t("crosshair.generating") : t("crosshair.preview")}
        </button>
      </form>

      {state === "error" && (
        <p className="text-sm text-crit">{t("crosshair.error")}</p>
      )}

      {preview && (
        <div className="panel-clip flex items-center justify-center bg-[#0B0E11] p-8">
          <img src={preview} alt={t("crosshair.previewAlt")} className="max-h-40" />
        </div>
      )}
    </div>
  );
}

/** Backlog #99 : verrouillage optionnel par PIN devant les notes perso (tags "smurf"/
 * "toxique" de #12, voir `PlayerNotesPanel.tsx`) — pensé pour l'usage stream/écran partagé,
 * pas comme un vrai coffre-fort (le PIN est un simple secret court, pas une passphrase). */
function PrivacySection({
  enabled,
  onSavePin,
  onClearPin,
}: {
  enabled: boolean;
  onSavePin: (pin: string) => Promise<void>;
  onClearPin: () => Promise<void>;
}) {
  const { t } = useTranslation("settings");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [status, setStatus] = useState<"idle" | "saved" | "mismatch" | "error">("idle");

  async function handleSave() {
    if (!pin.trim()) return;
    if (pin !== confirmPin) {
      setStatus("mismatch");
      return;
    }
    try {
      await onSavePin(pin);
      setPin("");
      setConfirmPin("");
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }

  async function handleClear() {
    const confirmed = window.confirm(t("privacy.confirmDisable"));
    if (!confirmed) return;
    await onClearPin();
  }

  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>{t("privacy.title")}</SectionTitle>
      <p className="text-sm text-lo">{t("privacy.description")}</p>

      {enabled ? (
        <div className="space-y-2">
          <p className="text-sm text-hi">{t("privacy.lockActive")}</p>
          <button
            type="button"
            onClick={handleClear}
            className="border border-crit/60 px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-crit transition-colors hover:bg-crit/10"
          >
            {t("privacy.disableLock")}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setStatus("idle");
              }}
              placeholder={t("privacy.newPin")}
              className={INPUT_CLASS}
            />
            <input
              type="password"
              inputMode="numeric"
              value={confirmPin}
              onChange={(e) => {
                setConfirmPin(e.target.value);
                setStatus("idle");
              }}
              placeholder={t("privacy.confirmPin")}
              className={INPUT_CLASS}
            />
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!pin.trim()}
            className="btn-clip bg-accent px-4 py-2 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-[#FF5969] disabled:opacity-50"
          >
            {t("privacy.activateLock")}
          </button>
          {status === "mismatch" && (
            <p className="text-xs text-crit">{t("privacy.mismatch")}</p>
          )}
          {status === "error" && (
            <p className="text-xs text-crit">{t("privacy.saveError")}</p>
          )}
          {status === "saved" && <p className="text-xs text-lo">{t("privacy.lockActivated")}</p>}
        </div>
      )}
    </div>
  );
}

function DataSection() {
  const { t } = useTranslation("settings");
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");

  async function handleReset() {
    const confirmed = window.confirm(t("data.resetConfirm"));
    if (!confirmed) return;

    setStatus("working");
    try {
      await tauriApi.resetLocalStats();
      setStatus("done");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>{t("data.title")}</SectionTitle>
      <p className="text-sm text-lo">{t("data.description")}</p>

      <div className="relative border border-crit/30 bg-crit/5 p-4">
        <span className="absolute inset-y-0 left-0 w-[3px] bg-crit" />
        <h2 className="text-sm font-semibold text-hi">{t("data.resetTitle")}</h2>
        <p className="mt-1 text-xs text-lo">{t("data.resetDescription")}</p>
        <button
          type="button"
          onClick={handleReset}
          disabled={status === "working"}
          className="mt-3 border border-crit/60 px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-crit transition-colors hover:bg-crit/10 disabled:opacity-50"
        >
          {status === "working" ? t("data.deleting") : t("data.delete")}
        </button>
        {status === "done" && <p className="mt-2 text-sm text-accent">{t("data.deleted")}</p>}
        {status === "error" && <p className="mt-2 text-sm text-crit">{t("data.deleteError")}</p>}
      </div>
    </div>
  );
}

const SHORTCUT_KEYS = ["Ctrl+Shift+V", "Ctrl+Shift+H", "Ctrl+Shift+F", "Ctrl+K"] as const;
const SHORTCUT_DESCRIPTION_KEYS: Record<(typeof SHORTCUT_KEYS)[number], string> = {
  "Ctrl+Shift+V": "shortcuts.ctrlShiftV",
  "Ctrl+Shift+H": "shortcuts.ctrlShiftH",
  "Ctrl+Shift+F": "shortcuts.ctrlShiftF",
  "Ctrl+K": "shortcuts.ctrlK",
};

function ShortcutsSection() {
  const { t } = useTranslation("settings");
  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>{t("shortcuts.title")}</SectionTitle>
      <p className="text-sm text-lo">{t("shortcuts.description")}</p>

      <div className="divide-y divide-line border border-line">
        {SHORTCUT_KEYS.map((keys) => (
          <div key={keys} className="flex items-start gap-4 px-4 py-3">
            <span className="hud-label shrink-0 border border-line bg-surface px-2 py-1 font-mono text-[11px] text-hi">
              {keys}
            </span>
            <p className="text-sm text-lo">{t(SHORTCUT_DESCRIPTION_KEYS[keys])}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function HealthSection({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => Promise<void>;
}) {
  const { t } = useTranslation("settings");
  const [summary, setSummary] = useState<UsageMetricsSummary | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setSummary(await tauriApi.getUsageMetricsSummary());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (enabled) load();
  }, [enabled]);

  const totalRequests = (summary?.cache_hits ?? 0) + (summary?.network_fetches ?? 0);
  const hitRate = totalRequests > 0 ? Math.round(((summary?.cache_hits ?? 0) / totalRequests) * 100) : 0;

  return (
    <div className="max-w-3xl space-y-4">
      <SectionTitle>{t("health.title")}</SectionTitle>
      <p className="text-sm text-lo">{t("health.description")}</p>

      <label className="flex items-center gap-2.5 text-sm text-hi">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 border-line bg-surface accent-accent"
        />
        {t("health.accumulateLabel")}
      </label>
      <p className="text-xs text-lo">{t("health.accumulateHint")}</p>

      {enabled && (
        <>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="border border-line px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:bg-surface disabled:opacity-50"
            >
              {loading ? t("health.refreshing") : t("health.refresh")}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label={t("health.cacheHitRate")}
              value={`${hitRate}%`}
              hint={t("health.cacheHitHint", { hits: summary?.cache_hits ?? 0, total: totalRequests })}
              gaugePercent={hitRate}
              gaugeColor="#7CE8D3"
            />
            <StatCard
              label={t("health.networkCalls")}
              value={String(summary?.network_fetches ?? 0)}
              hint={t("health.networkCallsHint")}
            />
            <StatCard
              label={t("health.apiErrors")}
              value={String(summary?.api_errors ?? 0)}
              hint={t("health.apiErrorsHint")}
            />
          </div>
        </>
      )}
    </div>
  );
}

function LogsSection() {
  const { t } = useTranslation("settings");
  const [snapshot, setSnapshot] = useState<{ path: string | null; content: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  async function load() {
    setLoading(true);
    try {
      setSnapshot(await tauriApi.getRecentLogs());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCopy() {
    if (!snapshot?.content) return;
    await navigator.clipboard.writeText(snapshot.content);
    setCopyState("copied");
    setTimeout(() => setCopyState("idle"), 2000);
  }

  return (
    <div className="max-w-3xl space-y-4">
      <SectionTitle>{t("logs.title")}</SectionTitle>
      <p className="text-sm text-lo">{t("logs.description")}</p>
      {snapshot?.path && (
        <p className="font-mono text-xs text-lo/70 break-all">{snapshot.path}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="border border-line px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:bg-surface disabled:opacity-50"
        >
          {loading ? t("logs.refreshing") : t("logs.refresh")}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!snapshot?.content}
          className="border border-line px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:bg-surface disabled:opacity-50"
        >
          {copyState === "copied" ? t("logs.copied") : t("logs.copy")}
        </button>
      </div>

      <pre className="max-h-[60vh] overflow-auto border border-line bg-surface p-4 font-mono text-[11px] leading-relaxed text-lo">
        {snapshot?.content ? snapshot.content : t("logs.empty")}
      </pre>
    </div>
  );
}

function AboutSection() {
  const { t } = useTranslation("settings");
  return (
    <div className="max-w-xl space-y-2">
      <SectionTitle>{t("about.title")}</SectionTitle>
      <p className="text-sm text-lo">{t("about.version", { version: "0.1.0" })}</p>
      <p className="text-xs text-lo">{t("about.disclaimer")}</p>
    </div>
  );
}
