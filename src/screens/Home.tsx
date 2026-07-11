import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { useAccount, useMmr, useMmrHistory, useRankSnapshots } from "../hooks/usePlayer";
import { useMatches } from "../hooks/useMatches";
import { useCountdown, formatCountdown } from "../hooks/useCountdown";
import StatCard from "../components/StatCard";
import SampleSizeSwitch, { SAMPLE_SIZES } from "../components/SampleSizeSwitch";
import Panel from "../components/Panel";
import RankBadge from "../components/RankBadge";
import RankHistoryChart from "../components/RankHistoryChart";
import QueueStatusStrip from "../components/QueueStatusStrip";
import ErrorState from "../components/ErrorState";
import StaleDataBanner from "../components/StaleDataBanner";
import { tauriApi } from "../lib/tauriApi";
import type { MatchEntry } from "../lib/tauriApi";
import { agentIconUrl, formatKdRatio, formatPercent, playerCardIconUrl, rankGlowColor } from "../lib/format";

const MMR_TTL_SECONDS = 600;

interface AgentTally {
  id: string;
  name: string;
  matches: number;
  wins: number;
  kills: number;
  deaths: number;
}

function computeOverview(matches: MatchEntry[], puuid: string) {
  let wins = 0;
  let played = 0;
  let kills = 0;
  let deaths = 0;
  let assists = 0;
  let headshots = 0;
  let bodyshots = 0;
  let legshots = 0;
  let scoreSum = 0;
  let roundsSum = 0;
  const agents = new Map<string, AgentTally>();

  for (const match of matches) {
    const player = match.players.find((p) => p.puuid === puuid);
    if (!player?.stats) continue;
    played += 1;

    kills += player.stats.kills ?? 0;
    deaths += player.stats.deaths ?? 0;
    assists += player.stats.assists ?? 0;
    headshots += player.stats.headshots ?? 0;
    bodyshots += player.stats.bodyshots ?? 0;
    legshots += player.stats.legshots ?? 0;
    scoreSum += player.stats.score ?? 0;

    const team = match.teams.find((t) => t.team_id === player.team_id);
    const won = Boolean(team?.won);
    if (won) wins += 1;
    const roundsPlayed = (team?.rounds?.won ?? 0) + (team?.rounds?.lost ?? 0);
    roundsSum += roundsPlayed > 0 ? roundsPlayed : 1;

    const agentId = player.agent?.id;
    if (agentId) {
      const tally = agents.get(agentId) ?? {
        id: agentId,
        name: player.agent?.name ?? "Agent inconnu",
        matches: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
      };
      tally.matches += 1;
      if (won) tally.wins += 1;
      tally.kills += player.stats.kills ?? 0;
      tally.deaths += player.stats.deaths ?? 0;
      agents.set(agentId, tally);
    }
  }

  const totalShots = headshots + bodyshots + legshots;
  const topAgent = [...agents.values()].sort((a, b) => b.matches - a.matches)[0] ?? null;

  return {
    played,
    wins,
    losses: played - wins,
    kills,
    deaths,
    assists,
    headshots,
    winPercent: played > 0 ? (wins / played) * 100 : 0,
    kd: formatKdRatio(kills, deaths),
    hsPercent: totalShots > 0 ? (headshots / totalShots) * 100 : 0,
    bodyPercent: totalShots > 0 ? (bodyshots / totalShots) * 100 : 0,
    legPercent: totalShots > 0 ? (legshots / totalShots) * 100 : 0,
    acs: played > 0 ? Math.round(scoreSum / Math.max(roundsSum, 1)) : 0,
    topAgent,
  };
}

export default function Home() {
  const { region, name, tag } = useParams<{ region: string; name: string; tag: string }>();
  const [sampleSize, setSampleSize] = useState<(typeof SAMPLE_SIZES)[number]>(20);
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const account = useAccount(name, tag);
  const puuid = account.data?.data.puuid;
  const mmr = useMmr({ puuid, region, name, tag });
  const snapshots = useRankSnapshots(puuid);
  const mmrHistory = useMmrHistory({ region, name, tag });
  const matches = useMatches({ region, name, tag, size: sampleSize });

  const remaining = useCountdown(mmr.data?.cached_at, MMR_TTL_SECONDS);

  const overview = useMemo(
    () => (matches.data && puuid ? computeOverview(matches.data.data, puuid) : null),
    [matches.data, puuid],
  );

  async function handleRefresh() {
    if (!puuid || !region || !name || !tag) return;
    setRefreshing(true);
    try {
      await tauriApi.fetchMmr(puuid, region, name, tag, true);
      await queryClient.invalidateQueries({ queryKey: ["mmr", puuid, region, name, tag] });
    } finally {
      setRefreshing(false);
    }
  }

  if (account.isLoading) {
    return <p className="text-sm text-lo">Chargement du profil…</p>;
  }
  if (account.isError) {
    return <ErrorState error={account.error} />;
  }

  const accountData = account.data?.data;
  const current = mmr.data?.data.current_data;
  const glow = rankGlowColor(current?.currenttier);

  return (
    <div className="scanline-once space-y-6">
      {account.data?.stale && <StaleDataBanner cachedAt={account.data.cached_at} />}

      {/* Barre de statut "briefing" : identité, rang/RR, bilan de session, timer de MAJ. */}
      <Panel className="flex flex-wrap items-stretch gap-x-6 gap-y-4 px-5 py-4">
        <div className="flex min-w-0 items-center gap-4">
          {accountData?.card ? (
            <img
              src={playerCardIconUrl(accountData.card)}
              alt=""
              className="h-14 w-14 border object-cover"
              style={{ borderColor: glow }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
              }}
            />
          ) : (
            <div className="h-14 w-14 border bg-raised" style={{ borderColor: glow }} />
          )}
          <div className="min-w-0">
            <p className="hud-label text-[10px]">Opérateur · {region}</p>
            <p className="truncate font-display text-lg font-bold text-hi">
              {name}
              <span className="text-lo">#{tag}</span>
            </p>
          </div>
        </div>

        <div className="hidden w-px self-stretch bg-line sm:block" />

        <div className="flex items-center">
          <RankBadge
            tier={current?.currenttier}
            tierPatched={current?.currenttierpatched}
            rr={current?.ranking_in_tier}
            size="md"
          />
        </div>

        {overview && (
          <>
            <div className="hidden w-px self-stretch bg-line sm:block" />
            <div className="flex items-center">
              <div>
                <p className="hud-label text-[10px]">Bilan · {sampleSize} derniers</p>
                <p className="stat-value mt-1 text-sm">
                  <span className="text-accent">{overview.wins}V</span>
                  <span className="text-lo"> / </span>
                  <span className="text-crit">{overview.losses}D</span>
                  <span className="text-lo"> · {formatPercent(overview.winPercent)} WR</span>
                </p>
              </div>
            </div>
          </>
        )}

        <div className="ml-auto flex flex-col items-end justify-center gap-1.5">
          <span className="stat-value text-[11px] text-lo">
            {remaining !== null && remaining > 0
              ? `MAJ dans ${formatCountdown(remaining)}`
              : "Actualisation disponible"}
          </span>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || !puuid}
            className="flex items-center gap-1.5 border border-line px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
          >
            <RefreshIcon spinning={refreshing} />
            Actualiser
          </button>
        </div>
      </Panel>

      <div className="flex items-center justify-between">
        <h1 className="hud-label text-sm">Vue d'ensemble</h1>
        <SampleSizeSwitch value={sampleSize} onChange={setSampleSize} />
      </div>

      {matches.isError && <ErrorState error={matches.error} />}
      {matches.data?.stale && <StaleDataBanner cachedAt={matches.data.cached_at} />}
      {matches.isLoading && <p className="text-sm text-lo">Chargement des stats…</p>}

      {overview && (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatCard
              label="Winrate"
              value={formatPercent(overview.winPercent)}
              hint={`${overview.wins}V — ${overview.losses}D`}
              gaugePercent={overview.winPercent}
              gaugeColor={overview.winPercent >= 50 ? "#7CE8D3" : "#FF5F5F"}
            />
            <StatCard label="K/D" value={overview.kd} hint={`${overview.kills} kills`} icon={<KdIcon />} />
            <StatCard
              label="Headshot %"
              value={formatPercent(overview.hsPercent)}
              gaugePercent={overview.hsPercent}
              gaugeColor="#7CE8D3"
            />
            <StatCard label="ACS" value={overview.acs.toString()} icon={<TargetIcon />} />
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <MiniStat label="Victoires" value={overview.wins} accent="text-accent" />
            <MiniStat label="Défaites" value={overview.losses} accent="text-crit" />
            <MiniStat label="Kills" value={overview.kills} />
            <MiniStat label="Deaths" value={overview.deaths} />
            <MiniStat label="Assists" value={overview.assists} />
            <MiniStat label="Headshots" value={overview.headshots} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Panel className="p-4">
              <p className="hud-label mb-3">Agent le plus joué</p>
              {overview.topAgent ? (
                <div className="flex items-center gap-4">
                  <img
                    src={agentIconUrl(overview.topAgent.id)}
                    alt={overview.topAgent.name}
                    className="h-12 w-12 border border-line object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                    }}
                  />
                  <div>
                    <p className="font-display font-semibold text-hi">{overview.topAgent.name}</p>
                    <p className="tnum text-xs text-lo">
                      {overview.topAgent.matches} matchs ·{" "}
                      {formatPercent((overview.topAgent.wins / overview.topAgent.matches) * 100)} de
                      victoires · K/D {formatKdRatio(overview.topAgent.kills, overview.topAgent.deaths)}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-lo">Pas assez de données.</p>
              )}
            </Panel>

            <Panel className="p-4">
              <p className="hud-label mb-3">Précision (têtes / corps / jambes)</p>
              <div className="space-y-2.5">
                <AccuracyBar label="Tête" percent={overview.hsPercent} color="#7CE8D3" />
                <AccuracyBar label="Corps" percent={overview.bodyPercent} color="#7A8590" />
                <AccuracyBar label="Jambes" percent={overview.legPercent} color="#3A424B" />
              </div>
            </Panel>
          </div>
        </>
      )}

      <QueueStatusStrip region={region} />

      <div>
        <h2 className="hud-label mb-2">Progression du rank</h2>
        <RankHistoryChart
          snapshots={snapshots.data ?? []}
          serverHistory={mmrHistory.data?.data.history ?? []}
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="panel-clip-sm px-3 py-2 text-center">
      <p className={`stat-value text-base font-bold ${accent ?? "text-hi"}`}>{value}</p>
      <p className="hud-label mt-0.5 text-[9px] text-lo">{label}</p>
    </div>
  );
}

function AccuracyBar({ label, percent, color }: { label: string; percent: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-lo">{label}</span>
        <span className="stat-value">{formatPercent(percent)}</span>
      </div>
      <div className="h-[3px] bg-line">
        <div
          className="h-full transition-all"
          style={{ width: `${Math.min(100, percent)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function KdIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path
        d="M4 4l7 7M20 4l-7 7M4 20l7-7M20 20l-7-7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="0.5" fill="currentColor" stroke="currentColor" />
    </svg>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-3 w-3 ${spinning ? "animate-spin" : ""}`}
    >
      <path d="M15.312 5.312a5.5 5.5 0 10 1.414 1.414L18 5.5V2a1 1 0 00-1-1h-3.5l1.812 1.812z" />
      <path
        fillRule="evenodd"
        d="M4.5 10a5.5 5.5 0 019.192-4.096l1.415-1.415A7.5 7.5 0 102.5 10a1 1 0 002 0 5.5 5.5 0 01-.001-.001z"
        clipRule="evenodd"
      />
    </svg>
  );
}
