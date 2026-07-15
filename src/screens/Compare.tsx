import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";

import { useAccount } from "../hooks/usePlayer";
import { useMatches } from "../hooks/useMatches";
import { useSelfAccountsStore } from "../store/selfAccountsStore";
import { Skeleton } from "../components/Skeleton";
import Panel from "../components/Panel";
import ErrorState from "../components/ErrorState";
import EmptyState from "../components/EmptyState";
import StaleDataBanner from "../components/StaleDataBanner";
import SampleSizeSwitch, { type SampleSize } from "../components/SampleSizeSwitch";
import { computeOverview, type Overview } from "../lib/stats";
import { formatPercent, getRegions, splitRiotId } from "../lib/format";

interface Side {
  region: string;
  name: string;
  tag: string;
}

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 5;

// TODO stats & analyse joueur : Compare.tsx étendu de 2 à N joueurs (squad, radar chart) —
// palette fixe indexée par colonne plutôt que dérivée d'une teinte par joueur, pour rester
// lisible/cohérente entre le radar chart et les colonnes.
const SIDE_COLORS = [
  "rgb(var(--accent-rgb))",
  "rgb(var(--crit-rgb))",
  "rgb(var(--chart-kills-rgb))",
  "rgb(var(--chart-headshots-rgb))",
  "rgb(var(--lo-rgb))",
];

/** Backlog #11 (étendu au-delà de 2 joueurs, voir TODO backlog) : comparaison côte à côte de
 * 2 à 5 Riot ID sur le même échantillon de matchs — aucune donnée persistée, tout vit dans
 * l'état local de cet écran. */
export default function Compare() {
  const { t } = useTranslation("stats");
  const [sampleSize, setSampleSize] = useState<SampleSize>(20);
  const [inputs, setInputs] = useState<{ value: string; region: string }[]>([
    { value: "", region: "eu" },
    { value: "", region: "eu" },
  ]);
  const [sides, setSides] = useState<Side[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const selfAccounts = useSelfAccountsStore((s) => s.accounts);
  const refreshSelfAccounts = useSelfAccountsStore((s) => s.refresh);
  useEffect(() => {
    refreshSelfAccounts();
  }, [refreshSelfAccounts]);

  // TODO Social/multi-comptes : court-circuite le formulaire pour pré-remplir directement
  // depuis les comptes "à soi" (is_self) — réutilise l'infrastructure existante de Compare.tsx
  // plutôt qu'une recherche manuelle.
  function compareMyAccounts() {
    if (selfAccounts.length < MIN_PLAYERS) return;
    const picked = selfAccounts.slice(0, MAX_PLAYERS);
    setFormError(null);
    setInputs(picked.map((a) => ({ value: `${a.name}#${a.tag}`, region: a.region })));
    setSides(picked.map((a) => ({ region: a.region, name: a.name, tag: a.tag })));
  }

  function updateInput(index: number, patch: Partial<{ value: string; region: string }>) {
    setInputs((prev) => prev.map((input, i) => (i === index ? { ...input, ...patch } : input)));
  }

  function addSlot() {
    if (inputs.length >= MAX_PLAYERS) return;
    setInputs((prev) => [...prev, { value: "", region: "eu" }]);
  }

  function removeSlot(index: number) {
    if (inputs.length <= MIN_PLAYERS) return;
    setInputs((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = inputs.map((input) => ({ region: input.region, riotId: splitRiotId(input.value) }));
    if (parsed.some((p) => !p.riotId)) {
      setFormError(t("compare.error.format"));
      return;
    }
    setFormError(null);
    setSides(parsed.map((p) => ({ region: p.region, name: p.riotId!.name, tag: p.riotId!.tag })));
  }

  // Hooks appelés inconditionnellement MAX_PLAYERS fois (rules of hooks) — les slots
  // au-delà de `sides.length` reçoivent `side: null` et restent désactivés.
  const columnData = [0, 1, 2, 3, 4].map((i) => usePlayerColumnData(sides?.[i] ?? null, sampleSize));
  const activeColumns = sides ? columnData.slice(0, sides.length) : [];

  const radarData = useMemo(() => buildRadarData(sides, activeColumns, t), [sides, activeColumns, t]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="hud-label text-sm">{t("compare.title")}</h1>
        {sides && <SampleSizeSwitch value={sampleSize} onChange={setSampleSize} />}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {inputs.map((input, i) => (
            <RiotIdField
              key={i}
              label={t("compare.form.playerLabel", { n: i + 1 })}
              value={input.value}
              onChange={(v) => updateInput(i, { value: v })}
              region={input.region}
              onChangeRegion={(v) => updateInput(i, { region: v })}
              onRemove={inputs.length > MIN_PLAYERS ? () => removeSlot(i) : undefined}
            />
          ))}
        </div>
        <div className="flex gap-2">
          {inputs.length < MAX_PLAYERS && (
            <button
              type="button"
              onClick={addSlot}
              className="border border-line px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent"
            >
              {t("compare.form.addPlayer")}
            </button>
          )}
          <button
            type="button"
            onClick={compareMyAccounts}
            disabled={selfAccounts.length < MIN_PLAYERS}
            title={
              selfAccounts.length < MIN_PLAYERS ? t("compare.form.compareMyAccountsDisabled") : undefined
            }
            className="border border-line px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-hi"
          >
            {t("compare.form.compareMyAccounts")}
          </button>
          <button
            type="submit"
            className="btn-clip flex-1 bg-accent px-4 py-2 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-accent-dim"
          >
            {t("compare.form.submit")}
          </button>
        </div>
      </form>

      {formError && <p className="text-sm text-crit">{formError}</p>}

      {sides ? (
        <>
          {radarData.length > 0 && (
            <Panel className="h-80 p-4">
              <p className="hud-label mb-2">{t("compare.radar.title")}</p>
              <ResponsiveContainer width="100%" height="90%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="rgb(var(--lo-rgb) / 0.2)" />
                  <PolarAngleAxis
                    dataKey="metric"
                    tick={{ fontSize: 11, fill: "rgb(var(--lo-rgb))" }}
                  />
                  {sides.map((side, i) => (
                    <Radar
                      key={`${side.name}#${side.tag}`}
                      name={`${side.name}#${side.tag}`}
                      dataKey={`p${i}`}
                      stroke={SIDE_COLORS[i % SIDE_COLORS.length]}
                      fill={SIDE_COLORS[i % SIDE_COLORS.length]}
                      fillOpacity={0.15}
                    />
                  ))}
                </RadarChart>
              </ResponsiveContainer>
            </Panel>
          )}

          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(220px, 1fr))` }}>
            {sides.map((side, i) => (
              <PlayerColumn key={`${side.name}#${side.tag}`} side={side} data={columnData[i]} color={SIDE_COLORS[i % SIDE_COLORS.length]} />
            ))}
          </div>
        </>
      ) : (
        <EmptyState icon="team" title={t("compare.initial.title")} detail={t("compare.initial.detail")} />
      )}
    </div>
  );
}

function RiotIdField({
  label,
  value,
  onChange,
  region,
  onChangeRegion,
  onRemove,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  region: string;
  onChangeRegion: (v: string) => void;
  onRemove?: () => void;
}) {
  const { t } = useTranslation("stats");
  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("compare.form.placeholder", { label })}
        className="flex-1 border border-line bg-surface px-3 py-2 font-mono text-sm text-hi placeholder:text-lo/60 focus:border-accent focus:outline-none"
      />
      <select
        value={region}
        onChange={(e) => onChangeRegion(e.target.value)}
        className="shrink-0 border border-line bg-surface px-2 text-sm text-hi focus:border-accent focus:outline-none"
      >
        {getRegions().map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 border border-line px-2 text-sm text-lo transition-colors hover:border-crit hover:text-crit"
          aria-label={t("compare.form.removePlayer")}
        >
          ×
        </button>
      )}
    </div>
  );
}

interface PlayerColumnData {
  accountError: unknown;
  isLoading: boolean;
  isError: boolean;
  overview: Overview | null;
  stale: boolean;
  cachedAt: number | null;
}

function usePlayerColumnData(side: Side | null, sampleSize: SampleSize): PlayerColumnData {
  const account = useAccount(side?.name, side?.tag);
  const puuid = account.data?.data.puuid;
  const matches = useMatches({ region: side?.region, name: side?.name, tag: side?.tag, size: sampleSize });

  const overview = useMemo(
    () => (matches.data && puuid ? computeOverview(matches.data.data, puuid) : null),
    [matches.data, puuid],
  );

  return {
    accountError: account.error,
    isLoading: account.isLoading || matches.isLoading,
    isError: account.isError,
    overview,
    stale: Boolean(matches.data?.stale),
    cachedAt: matches.data?.cached_at ?? null,
  };
}

function buildRadarData(
  sides: Side[] | null,
  columns: PlayerColumnData[],
  t: (key: string) => string,
): { metric: string; [key: string]: string | number }[] {
  if (!sides || columns.length < 2 || columns.some((c) => !c.overview || c.overview.played === 0)) return [];

  const overviews = columns.map((c) => c.overview!);
  const metrics: { label: string; value: (o: Overview) => number }[] = [
    { label: "compare.radar.metrics.winrate", value: (o) => o.winPercent },
    { label: "compare.radar.metrics.kd", value: (o) => Number(o.kd) },
    { label: "compare.radar.metrics.hsPercent", value: (o) => o.hsPercent },
    { label: "compare.radar.metrics.acs", value: (o) => o.acs },
  ];

  return metrics.map((m) => {
    const values = overviews.map(m.value);
    const max = Math.max(...values, 0.0001);
    const row: { metric: string; [key: string]: string | number } = { metric: t(m.label) };
    overviews.forEach((o, i) => {
      row[`p${i}`] = Math.round((m.value(o) / max) * 100);
    });
    return row;
  });
}

function PlayerColumn({ side, data, color }: { side: Side; data: PlayerColumnData; color: string }) {
  const { t } = useTranslation("stats");

  if (data.isError) return <ErrorState error={data.accountError} />;
  if (data.isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Panel className="space-y-3 p-4">
      <p className="flex items-center gap-2 font-display text-base font-bold text-hi">
        <span className="h-2.5 w-2.5 shrink-0" style={{ backgroundColor: color }} />
        {side.name}
        <span className="text-lo">#{side.tag}</span>
      </p>
      {data.stale && <StaleDataBanner cachedAt={data.cachedAt} />}
      {data.overview && data.overview.played > 0 ? (
        <OverviewRows overview={data.overview} />
      ) : (
        <EmptyState icon="match" title={t("compare.column.noData")} />
      )}
    </Panel>
  );
}

function OverviewRows({ overview }: { overview: Overview }) {
  const { t } = useTranslation("stats");
  const rows: Array<[string, string]> = [
    [
      t("compare.rows.winrate"),
      t("compare.rows.winrateValue", {
        percent: formatPercent(overview.winPercent),
        wins: overview.wins,
        losses: overview.losses,
      }),
    ],
    [t("compare.rows.kd"), overview.kd],
    [t("compare.rows.kills"), String(overview.kills)],
    [t("compare.rows.deaths"), String(overview.deaths)],
    [t("compare.rows.assists"), String(overview.assists)],
    [t("compare.rows.hsPercent"), formatPercent(overview.hsPercent)],
    [t("compare.rows.acs"), String(overview.acs)],
    [t("compare.rows.topAgent"), overview.topAgent?.name ?? "—"],
  ];
  return (
    <div className="divide-y divide-line/60">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between py-1.5 text-sm">
          <span className="text-lo">{label}</span>
          <span className="stat-value text-hi">{value}</span>
        </div>
      ))}
    </div>
  );
}
