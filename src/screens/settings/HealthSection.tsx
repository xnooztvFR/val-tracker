import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { tauriApi, type UsageMetricsSummary } from "../../lib/tauriApi";
import StatCard from "../../components/StatCard";
import { SectionTitle } from "./shared";

interface HealthSectionProps {
  enabled: boolean;
  onChange: (enabled: boolean) => Promise<void>;
}

export default function HealthSection({ enabled, onChange }: HealthSectionProps) {
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
