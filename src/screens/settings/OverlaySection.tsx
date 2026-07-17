import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { tauriApi, type MonitorInfo } from "../../lib/tauriApi";
import { INPUT_CLASS, SectionTitle } from "./shared";

const OVERLAY_DENSITY_IDS = ["compact", "detailed"] as const;
const OVERLAY_LAYOUT_IDS = ["full", "mini", "minimal", "coach"] as const;

interface OverlaySectionProps {
  disabled: boolean;
  onChange: (disabled: boolean) => Promise<void>;
  density: string;
  onChangeDensity: (density: string) => Promise<void>;
  layout: string;
  onChangeLayout: (layout: string) => Promise<void>;
  rankGapAlertEnabled: boolean;
  rankGapAlertThreshold: number;
  onChangeRankGapAlertEnabled: (enabled: boolean) => Promise<void>;
  onChangeRankGapAlertThreshold: (threshold: number) => Promise<void>;
  monitorId: string;
  onChangeMonitor: (monitorId: string) => Promise<void>;
  secondaryMonitorId: string;
  onChangeSecondaryMonitor: (monitorId: string) => Promise<void>;
  postgameSummaryEnabled: boolean;
  onChangePostgameSummaryEnabled: (enabled: boolean) => Promise<void>;
  postgameSummaryAutodismissSecs: number;
  onChangePostgameSummaryAutodismissSecs: (secs: number) => Promise<void>;
  friendLiveNotifyEnabled: boolean;
  onChangeFriendLiveNotifyEnabled: (enabled: boolean) => Promise<void>;
}

export default function OverlaySection({
  disabled,
  onChange,
  density,
  onChangeDensity,
  layout,
  onChangeLayout,
  rankGapAlertEnabled,
  rankGapAlertThreshold,
  onChangeRankGapAlertEnabled,
  onChangeRankGapAlertThreshold,
  monitorId,
  onChangeMonitor,
  secondaryMonitorId,
  onChangeSecondaryMonitor,
  postgameSummaryEnabled,
  onChangePostgameSummaryEnabled,
  postgameSummaryAutodismissSecs,
  onChangePostgameSummaryAutodismissSecs,
  friendLiveNotifyEnabled,
  onChangeFriendLiveNotifyEnabled,
}: OverlaySectionProps) {
  const { t } = useTranslation("settings");
  const [shortcutRegistered, setShortcutRegistered] = useState<boolean | null>(null);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);

  useEffect(() => {
    tauriApi
      .getOverlayShortcutStatus()
      .then(setShortcutRegistered)
      .catch(() => setShortcutRegistered(null));
  }, []);

  useEffect(() => {
    tauriApi
      .listOverlayMonitors()
      .then(setMonitors)
      .catch(() => setMonitors([]));
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
        <h2 className="hud-label">{t("overlay.layoutLabel")}</h2>
        <div className="flex gap-2">
          {OVERLAY_LAYOUT_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onChangeLayout(id)}
              className={`border px-4 py-2 text-sm transition-colors ${
                layout === id
                  ? "border-accent text-hi"
                  : "border-line text-lo hover:border-line hover:text-hi"
              }`}
            >
              {t(`overlay.layout.${id}`)}
            </button>
          ))}
        </div>
        <p className="text-xs text-lo">{t("overlay.layoutHint")}</p>
      </section>

      {layout === "full" && (
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
      )}

      <section className="space-y-2">
        <h2 className="hud-label">{t("overlay.monitorLabel")}</h2>
        <select
          value={monitorId}
          onChange={(e) => onChangeMonitor(e.target.value)}
          className={INPUT_CLASS}
        >
          <option value="auto">{t("overlay.monitor.auto")}</option>
          {monitors.map((m) => (
            <option key={m.id} value={m.id}>
              {m.width}×{m.height}
              {m.is_primary ? ` — ${t("overlay.monitor.primary")}` : ""}
            </option>
          ))}
        </select>
        <p className="text-xs text-lo">{t("overlay.monitorHint")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="hud-label">{t("overlay.secondaryMonitorLabel")}</h2>
        <select
          value={secondaryMonitorId}
          onChange={(e) => onChangeSecondaryMonitor(e.target.value)}
          className={INPUT_CLASS}
        >
          <option value="none">{t("overlay.secondaryMonitor.none")}</option>
          {monitors.map((m) => (
            <option key={m.id} value={m.id}>
              {m.width}×{m.height}
              {m.is_primary ? ` — ${t("overlay.monitor.primary")}` : ""}
            </option>
          ))}
        </select>
        <p className="text-xs text-lo">{t("overlay.secondaryMonitorHint")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="hud-label">{t("overlay.postgameSummaryTitle")}</h2>
        <label className="flex items-center gap-2.5 text-sm text-hi">
          <input
            type="checkbox"
            checked={postgameSummaryEnabled}
            onChange={(e) => onChangePostgameSummaryEnabled(e.target.checked)}
            className="h-4 w-4 border-line bg-surface accent-accent"
          />
          {t("overlay.postgameSummaryLabel")}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={60}
            value={postgameSummaryAutodismissSecs}
            onChange={(e) => onChangePostgameSummaryAutodismissSecs(Number(e.target.value))}
            disabled={!postgameSummaryEnabled}
            className={`w-20 disabled:opacity-50 ${INPUT_CLASS}`}
          />
          <span className="text-sm text-lo">{t("overlay.postgameSummaryAutodismissUnit")}</span>
        </div>
        <p className="text-xs text-lo">{t("overlay.postgameSummaryHint")}</p>
      </section>

      <section className="space-y-2">
        <label className="flex items-center gap-2.5 text-sm text-hi">
          <input
            type="checkbox"
            checked={friendLiveNotifyEnabled}
            onChange={(e) => onChangeFriendLiveNotifyEnabled(e.target.checked)}
            className="h-4 w-4 border-line bg-surface accent-accent"
          />
          {t("overlay.friendLiveNotifyLabel")}
        </label>
        <p className="text-xs text-lo">{t("overlay.friendLiveNotifyHint")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="hud-label">{t("overlay.rankGapAlertTitle")}</h2>
        <label className="flex items-center gap-2.5 text-sm text-hi">
          <input
            type="checkbox"
            checked={rankGapAlertEnabled}
            onChange={(e) => onChangeRankGapAlertEnabled(e.target.checked)}
            className="h-4 w-4 border-line bg-surface accent-accent"
          />
          {t("overlay.rankGapAlertLabel")}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={24}
            value={rankGapAlertThreshold}
            onChange={(e) => onChangeRankGapAlertThreshold(Number(e.target.value))}
            disabled={!rankGapAlertEnabled}
            className={`w-20 disabled:opacity-50 ${INPUT_CLASS}`}
          />
          <span className="text-sm text-lo">{t("overlay.rankGapAlertUnit")}</span>
        </div>
        <p className="text-xs text-lo">{t("overlay.rankGapAlertHint")}</p>
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
