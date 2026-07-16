import { useTranslation } from "react-i18next";

import { INPUT_CLASS, SectionTitle } from "./shared";

interface NotificationsSectionProps {
  statusWatcherEnabled: boolean;
  onChangeStatusWatcher: (enabled: boolean) => Promise<void>;
  rankChangeAlertEnabled: boolean;
  onChangeRankChangeAlertEnabled: (enabled: boolean) => Promise<void>;
  lossStreakAlertEnabled: boolean;
  lossStreakAlertCount: number;
  onChangeLossStreakAlertEnabled: (enabled: boolean) => Promise<void>;
  onChangeLossStreakAlertCount: (count: number) => Promise<void>;
  winStreakAlertEnabled: boolean;
  winStreakAlertCount: number;
  onChangeWinStreakAlertEnabled: (enabled: boolean) => Promise<void>;
  onChangeWinStreakAlertCount: (count: number) => Promise<void>;
  inactivityReminderEnabled: boolean;
  inactivityReminderDays: number;
  onChangeInactivityReminderEnabled: (enabled: boolean) => Promise<void>;
  onChangeInactivityReminderDays: (days: number) => Promise<void>;
}

export default function NotificationsSection({
  statusWatcherEnabled,
  onChangeStatusWatcher,
  rankChangeAlertEnabled,
  onChangeRankChangeAlertEnabled,
  lossStreakAlertEnabled,
  lossStreakAlertCount,
  onChangeLossStreakAlertEnabled,
  onChangeLossStreakAlertCount,
  winStreakAlertEnabled,
  winStreakAlertCount,
  onChangeWinStreakAlertEnabled,
  onChangeWinStreakAlertCount,
  inactivityReminderEnabled,
  inactivityReminderDays,
  onChangeInactivityReminderEnabled,
  onChangeInactivityReminderDays,
}: NotificationsSectionProps) {
  const { t } = useTranslation("settings");
  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>{t("notifications.title")}</SectionTitle>

      <section className="space-y-2">
        <h2 className="hud-label">{t("notifications.rankChangeTitle")}</h2>
        <label className="flex items-center gap-2.5 text-sm text-hi">
          <input
            type="checkbox"
            checked={rankChangeAlertEnabled}
            onChange={(e) => onChangeRankChangeAlertEnabled(e.target.checked)}
            className="h-4 w-4 border-line bg-surface accent-accent"
          />
          {t("notifications.rankChangeBody")}
        </label>
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
        <h2 className="hud-label">{t("notifications.winStreakTitle")}</h2>
        <label className="flex items-center gap-2.5 text-sm text-hi">
          <input
            type="checkbox"
            checked={winStreakAlertEnabled}
            onChange={(e) => onChangeWinStreakAlertEnabled(e.target.checked)}
            className="h-4 w-4 border-line bg-surface accent-accent"
          />
          {t("notifications.winStreakLabel")}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={20}
            value={winStreakAlertCount}
            onChange={(e) => onChangeWinStreakAlertCount(Number(e.target.value))}
            disabled={!winStreakAlertEnabled}
            className={`w-20 disabled:opacity-50 ${INPUT_CLASS}`}
          />
          <span className="text-sm text-lo">{t("notifications.winStreakUnit")}</span>
        </div>
        <p className="text-xs text-lo">{t("notifications.winStreakHint")}</p>
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
