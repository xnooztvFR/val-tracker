import { useMemo, useState } from "react";
import { Skeleton, SkeletonScreen } from "../components/Skeleton";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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
import PlayerNotesPanel from "../components/PlayerNotesPanel";
import ProgressionGoalPanel from "../components/ProgressionGoalPanel";
import { tauriApi } from "../lib/tauriApi";
import { agentIconUrl, formatKdRatio, formatPercent, playerCardIconUrl, rankGlowColor } from "../lib/format";
import { computeOverview } from "../lib/stats";

const MMR_TTL_SECONDS = 600;

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
  // Backlog #12 : la note libre vit sur `tracked_players` (upsertée à chaque vue de profil
  // par `fetch_account`) — pas de commande dédiée "get one", on relit la liste récente et on
  // filtre par puuid plutôt que d'ajouter un aller-retour réseau supplémentaire.
  const trackedPlayer = useQuery({
    queryKey: ["trackedPlayer", puuid],
    queryFn: () => tauriApi.listTrackedPlayers(200),
    enabled: Boolean(puuid),
    select: (players) => players.find((p) => p.puuid === puuid) ?? null,
  });

  const remaining = useCountdown(mmr.data?.cached_at, MMR_TTL_SECONDS);

  const overview = useMemo(
    () => (matches.data && puuid ? computeOverview(matches.data.data, puuid) : null),
    [matches.data, puuid],
  );

  // Backlog #36 : pulse sur le badge de rang si le dernier snapshot enregistré diffère du
  // précédent ET vient d'être écrit il y a moins de 2 min (cette session) — pas d'animation
  // en revisitant un profil dont le rank a changé il y a plusieurs jours.
  const rankPulse = useMemo((): "up" | "down" | null => {
    const list = snapshots.data;
    if (!list || list.length < 2) return null;
    const latest = list[list.length - 1];
    const previous = list[list.length - 2];
    if (latest.tier === previous.tier) return null;
    const ageSeconds = Date.now() / 1000 - latest.recorded_at;
    if (ageSeconds > 120) return null;
    return latest.tier > previous.tier ? "up" : "down";
  }, [snapshots.data]);

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
    return <SkeletonScreen className="p-6" />;
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
            pulse={rankPulse}
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

      {puuid && (
        <div className="grid gap-3 sm:grid-cols-2">
          <ProgressionGoalPanel
            key={puuid}
            puuid={puuid}
            currentTier={current?.currenttier}
            currentRr={current?.ranking_in_tier}
          />
          <PlayerNotesPanel
            // Remonte une fois les notes chargées, pour ne pas figer le textarea sur une
            // valeur initiale vide capturée avant la résolution de la requête.
            key={`${puuid}-${trackedPlayer.data ? "loaded" : "pending"}`}
            puuid={puuid}
            initialNotes={trackedPlayer.data?.notes ?? null}
          />
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="hud-label text-sm">Vue d'ensemble</h1>
        <SampleSizeSwitch value={sampleSize} onChange={setSampleSize} />
      </div>

      {matches.isError && <ErrorState error={matches.error} />}
      {matches.data?.stale && <StaleDataBanner cachedAt={matches.data.cached_at} />}
      {matches.isLoading && <Skeleton className="h-32 w-full" />}

      {overview && (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatCard
              label="Winrate"
              value={formatPercent(overview.winPercent)}
              hint={`${overview.wins}V — ${overview.losses}D`}
              gaugePercent={overview.winPercent}
              gaugeColor={overview.winPercent >= 50 ? "rgb(var(--color-accent))" : "rgb(var(--color-crit))"}
            />
            <StatCard label="K/D" value={overview.kd} hint={`${overview.kills} kills`} icon={<KdIcon />} />
            <StatCard
              label="Headshot %"
              value={formatPercent(overview.hsPercent)}
              gaugePercent={overview.hsPercent}
              gaugeColor="rgb(var(--color-accent))"
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
                <AccuracyBar label="Tête" percent={overview.hsPercent} color="rgb(var(--color-accent))" />
                <AccuracyBar label="Corps" percent={overview.bodyPercent} color="rgb(var(--color-lo))" />
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
