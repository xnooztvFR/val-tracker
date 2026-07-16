import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { MmrHistoryEntry, RankSnapshot } from "../lib/tauriApi";
import { formatDateTimeShort } from "../lib/format";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion";
import Panel from "./Panel";

interface RankHistoryChartProps {
  /** Snapshots collectés localement à chaque ouverture de l'app sur ce profil. */
  snapshots: RankSnapshot[];
  /** Historique de RR renvoyé par l'API Henrik (v2/mmr-history) — remonte plus loin dans
   * le temps que les snapshots locaux, disponible dès la première visite d'un profil. */
  serverHistory?: MmrHistoryEntry[];
}

interface Point {
  timestampMs: number;
  tier: number;
  label: string;
  rr: number | null;
  map: string | null;
  change: number | null;
}

const MIN_POINTS_FOR_CHART = 3;
const LINE_COLOR = "rgb(var(--accent-rgb))";
const MONO = '"JetBrains Mono", Consolas, monospace';
/** Deux points à moins de 2 min d'écart avec le même tier/RR sont considérés comme la
 * même partie vue depuis les deux sources (snapshot local + historique serveur). */
const DEDUPE_WINDOW_MS = 2 * 60_000;

function mergeHistory(snapshots: RankSnapshot[], serverHistory: MmrHistoryEntry[], unknownLabel: string): Point[] {
  const fromServer: Point[] = serverHistory
    .map((entry) => {
      const ts = entry.date ? new Date(entry.date).getTime() : NaN;
      if (Number.isNaN(ts) || entry.tier == null) return null;
      return {
        timestampMs: ts,
        tier: entry.tier.id ?? 0,
        label: entry.tier.name ?? unknownLabel,
        rr: entry.rr,
        map: entry.map?.name ?? null,
        change: entry.last_change,
      } satisfies Point;
    })
    .filter((p): p is Point => p !== null);

  const fromLocal: Point[] = snapshots.map((s) => ({
    timestampMs: s.recorded_at * 1000,
    tier: s.tier,
    label: s.tier_patched,
    rr: s.rr,
    map: null,
    change: null,
  }));

  const merged: Point[] = [...fromServer];
  for (const local of fromLocal) {
    const isDuplicate = fromServer.some(
      (server) =>
        Math.abs(server.timestampMs - local.timestampMs) < DEDUPE_WINDOW_MS &&
        server.tier === local.tier &&
        server.rr === local.rr,
    );
    if (!isDuplicate) merged.push(local);
  }

  return merged.sort((a, b) => a.timestampMs - b.timestampMs);
}

/** TODO Fonctionnalités#16 : début du mois calendaire, `monthsAgo` mois avant `now`. */
function startOfMonth(now: Date, monthsAgo: number): Date {
  const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

interface MonthDelta {
  scoreChange: number;
  endLabel: string;
  endRR: number | null;
}

/** TODO Fonctionnalités#16 : comparaison de progression entre deux périodes — delta de
 * score continu (tier*100 + RR) entre le début et la fin du mois `monthsAgo` mois avant
 * aujourd'hui (0 = mois en cours). `null` si aucun point n'existe dans cette fenêtre. Le
 * point de départ est le dernier point *avant* la fenêtre (état hérité du mois précédent),
 * pas le premier point de la fenêtre elle-même, pour ne pas sous-compter le début de mois. */
function computeMonthDelta(points: Point[], now: Date, monthsAgo: number): MonthDelta | null {
  const start = startOfMonth(now, monthsAgo).getTime();
  const end = monthsAgo === 0 ? now.getTime() : startOfMonth(now, monthsAgo - 1).getTime();
  const inRange = points.filter((p) => p.timestampMs >= start && p.timestampMs < end);
  if (inRange.length === 0) return null;

  const before = points.filter((p) => p.timestampMs < start);
  const startPoint = before.length > 0 ? before[before.length - 1] : inRange[0];
  const endPoint = inRange[inRange.length - 1];
  const startScore = startPoint.tier * 100 + (startPoint.rr ?? 0);
  const endScore = endPoint.tier * 100 + (endPoint.rr ?? 0);

  return { scoreChange: endScore - startScore, endLabel: endPoint.label, endRR: endPoint.rr };
}

export default function RankHistoryChart({ snapshots, serverHistory = [] }: RankHistoryChartProps) {
  const { t } = useTranslation("componentsExtra");
  const reducedMotion = usePrefersReducedMotion();
  const points = useMemo(
    () => mergeHistory(snapshots, serverHistory, t("rankHistoryChart.unknownTier")),
    [snapshots, serverHistory, t],
  );

  const monthComparison = useMemo(() => {
    const now = new Date();
    const thisMonth = computeMonthDelta(points, now, 0);
    const lastMonth = computeMonthDelta(points, now, 1);
    return thisMonth || lastMonth ? { thisMonth, lastMonth } : null;
  }, [points]);

  if (points.length < MIN_POINTS_FOR_CHART) {
    return (
      <div className="flex h-48 flex-col items-center justify-center border border-dashed border-line text-center text-sm text-lo">
        <p className="hud-label">{t("rankHistoryChart.limitedHistoryTitle")}</p>
        <p className="mt-2 max-w-xs text-xs">
          {t("rankHistoryChart.limitedHistoryBody")}
        </p>
      </div>
    );
  }

  // "Score" continu = tier*100 + RR, pour dessiner une seule courbe monotone-ish
  // couvrant les changements de tier autant que les variations de RR.
  const data = points.map((p) => ({
    score: p.tier * 100 + (p.rr ?? 0),
    label: p.label,
    rr: p.rr,
    map: p.map,
    change: p.change,
    date: formatDateTimeShort(Math.floor(p.timestampMs / 1000)),
  }));

  return (
    <div className="space-y-2">
      {monthComparison && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-lo">
          <span>
            {t("rankHistoryChart.thisMonth")}{" "}
            {monthComparison.thisMonth ? (
              <span className={monthComparison.thisMonth.scoreChange >= 0 ? "text-accent" : "text-crit"}>
                {monthComparison.thisMonth.scoreChange >= 0 ? "+" : ""}
                {monthComparison.thisMonth.scoreChange} ({monthComparison.thisMonth.endLabel}
                {monthComparison.thisMonth.endRR != null ? ` ${monthComparison.thisMonth.endRR} RR` : ""})
              </span>
            ) : (
              t("rankHistoryChart.noData")
            )}
          </span>
          <span>
            {t("rankHistoryChart.lastMonth")}{" "}
            {monthComparison.lastMonth ? (
              <span className={monthComparison.lastMonth.scoreChange >= 0 ? "text-accent" : "text-crit"}>
                {monthComparison.lastMonth.scoreChange >= 0 ? "+" : ""}
                {monthComparison.lastMonth.scoreChange} ({monthComparison.lastMonth.endLabel}
                {monthComparison.lastMonth.endRR != null ? ` ${monthComparison.lastMonth.endRR} RR` : ""})
              </span>
            ) : (
              t("rankHistoryChart.noData")
            )}
          </span>
        </div>
      )}
      <Panel className="h-48 p-3">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgb(var(--lo-rgb) / 0.15)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "rgb(var(--lo-rgb))", fontFamily: MONO }}
            minTickGap={30}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide domain={["dataMin - 20", "dataMax + 20"]} />
          <Tooltip
            contentStyle={{
              background: "rgb(var(--raised-rgb))",
              border: "1px solid rgb(var(--line-rgb))",
              borderRadius: 0,
              fontSize: 12,
              fontFamily: MONO,
            }}
            formatter={((
              _value: unknown,
              _name: unknown,
              item: { payload: { label: string; rr: number | null; map: string | null; change: number | null } },
            ) => [
              `${item.payload.label} — ${item.payload.rr ?? "?"} RR${
                item.payload.change != null ? ` (${item.payload.change >= 0 ? "+" : ""}${item.payload.change})` : ""
              }${item.payload.map ? ` · ${item.payload.map}` : ""}`,
              t("rankHistoryChart.tooltipLabel"),
            ]) as never}
            labelFormatter={(label) => label}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke={LINE_COLOR}
            strokeWidth={1.5}
            dot={{ r: 2, fill: LINE_COLOR, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive={!reducedMotion}
          />
        </LineChart>
      </ResponsiveContainer>
      </Panel>
    </div>
  );
}
