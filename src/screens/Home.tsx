import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton, SkeletonScreen } from "../components/Skeleton";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAccount, useAccountTimeline, useMmr, useMmrHistory, useRankSnapshots } from "../hooks/usePlayer";
import { useMatches } from "../hooks/useMatches";
import { useCountdown, formatCountdown } from "../hooks/useCountdown";
import CopyButton from "../components/CopyButton";
import StatCard from "../components/StatCard";
import SampleSizeSwitch, { SAMPLE_SIZES } from "../components/SampleSizeSwitch";
import Panel from "../components/Panel";
import ProfileCardModal from "../components/ProfileCardModal";
import PeriodRecapModal from "../components/PeriodRecapModal";
import AccountTimeline from "../components/AccountTimeline";
import RankBadge from "../components/RankBadge";
import RankHistoryChart from "../components/RankHistoryChart";
import QueueStatusStrip from "../components/QueueStatusStrip";
import ErrorState from "../components/ErrorState";
import StaleDataBanner from "../components/StaleDataBanner";
import PlayerNotesPanel from "../components/PlayerNotesPanel";
import ProgressionGoalPanel from "../components/ProgressionGoalPanel";
import WeeklyGoalsPanel from "../components/WeeklyGoalsPanel";
import LeaderboardPercentileCard from "../components/LeaderboardPercentileCard";
import { tauriApi, type MatchEntry } from "../lib/tauriApi";
import {
  agentPortraitUrl,
  formatKdRatio,
  formatPercent,
  mapSplashUrl,
  playerCardIconUrl,
  rankGlowColor,
} from "../lib/format";
import { computeOverview, computePeriodRecap, type PeriodRecap } from "../lib/stats";
import { buildProfileCardData } from "../lib/profileCard";

const MMR_TTL_SECONDS = 600;
// Backlog : auto-actualisation périodique — rafraîchit toutes les données (MMR, matchs,
// historique de rang) si l'utilisateur n'a pas cliqué sur "Rafraîchir" entre-temps (le
// minuteur est réarmé à chaque refresh manuel, voir scheduleAutoRefresh).
const AUTO_REFRESH_INTERVAL_MS = 10 * 60_000;

export default function Home() {
  const { t } = useTranslation("home");
  const { region, name, tag } = useParams<{ region: string; name: string; tag: string }>();
  const [sampleSize, setSampleSize] = useState<(typeof SAMPLE_SIZES)[number]>(20);
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [periodRecap, setPeriodRecap] = useState<PeriodRecap | null>(null);

  const account = useAccount(name, tag);
  const puuid = account.data?.data.puuid;
  const mmr = useMmr({ puuid, region, name, tag });
  const snapshots = useRankSnapshots(puuid);
  const mmrHistory = useMmrHistory({ region, name, tag });
  const accountTimeline = useAccountTimeline(puuid);
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

  const autoRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Force-refetch MMR + matchs + historique de rang (le snapshot local est réécrit côté
  // Rust dans fetch_mmr dès que la donnée vient réellement du réseau, voir commands.rs).
  const refreshAll = useCallback(async () => {
    if (!puuid || !region || !name || !tag) return;
    setRefreshing(true);
    try {
      await Promise.all([
        tauriApi.fetchMmr(puuid, region, name, tag, true),
        tauriApi.fetchMatches(region, name, tag, sampleSize, true),
        tauriApi.fetchMmrHistory(region, name, tag, true),
      ]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mmr", puuid, region, name, tag] }),
        queryClient.invalidateQueries({ queryKey: ["matches", region, name, tag, sampleSize] }),
        queryClient.invalidateQueries({ queryKey: ["mmr_history", region, name, tag] }),
        queryClient.invalidateQueries({ queryKey: ["rank_snapshots", puuid] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [puuid, region, name, tag, sampleSize, queryClient]);

  const scheduleAutoRefresh = useCallback(() => {
    if (autoRefreshTimer.current) clearTimeout(autoRefreshTimer.current);
    autoRefreshTimer.current = setTimeout(() => {
      void refreshAll().finally(scheduleAutoRefresh);
    }, AUTO_REFRESH_INTERVAL_MS);
  }, [refreshAll]);

  useEffect(() => {
    scheduleAutoRefresh();
    return () => {
      if (autoRefreshTimer.current) clearTimeout(autoRefreshTimer.current);
    };
  }, [scheduleAutoRefresh]);

  async function handleRefresh() {
    await refreshAll();
    scheduleAutoRefresh();
  }

  // Backlog #56 : agrégation locale sur les matchs déjà chargés (sampleSize courant) et les
  // snapshots de rang locaux — aucun fetch supplémentaire déclenché ici.
  function openPeriodRecap(period: "week" | "month") {
    if (!puuid || !matches.data) return;
    setPeriodRecap(computePeriodRecap(matches.data.data, snapshots.data ?? [], puuid, period));
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

  // Backlog #74 : export "carte de visite" du profil, réutilise le pipeline canvas de
  // RecapCardModal.tsx — ne dépend que de données déjà chargées ici (aucun appel réseau).
  const profileCardData =
    region && name && tag
      ? buildProfileCardData({
          name,
          tag,
          region,
          currentTier: current?.currenttier,
          rr: current?.ranking_in_tier,
          overview,
        })
      : null;

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
            <p className="hud-label text-[10px]">{t("statusBar.operator", { region })}</p>
            <p className="flex items-center gap-1.5 truncate font-display text-lg font-bold text-hi">
              {name}
              <span className="text-lo">#{tag}</span>
              {name && tag && (
                <CopyButton text={`${name}#${tag}`} label={t("statusBar.copyRiotId")} />
              )}
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
                <p className="hud-label text-[10px]">{t("statusBar.summary", { n: sampleSize })}</p>
                <p className="stat-value mt-1 text-sm">
                  <span className="text-accent">{t("statusBar.wins", { n: overview.wins })}</span>
                  <span className="text-lo"> / </span>
                  <span className="text-crit">{t("statusBar.losses", { n: overview.losses })}</span>
                  <span className="text-lo">
                    {" "}
                    · {formatPercent(overview.winPercent)} {t("statusBar.winrateShort")}
                  </span>
                </p>
              </div>
            </div>
          </>
        )}

        <div className="ml-auto flex flex-col items-end justify-center gap-1.5">
          <span className="stat-value text-[11px] text-lo">
            {remaining !== null && remaining > 0
              ? t("statusBar.updateIn", { time: formatCountdown(remaining) })
              : t("statusBar.refreshAvailable")}
          </span>
          <div className="flex items-center gap-1.5">
            {profileCardData && (
              <button
                type="button"
                onClick={() => setShowProfileCard(true)}
                className="flex items-center gap-1.5 border border-line px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent"
              >
                {t("statusBar.exportCard")}
              </button>
            )}
            {puuid && matches.data && (
              <>
                <button
                  type="button"
                  onClick={() => openPeriodRecap("week")}
                  className="flex items-center gap-1.5 border border-line px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent"
                >
                  {t("statusBar.recapWeek")}
                </button>
                <button
                  type="button"
                  onClick={() => openPeriodRecap("month")}
                  className="flex items-center gap-1.5 border border-line px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent"
                >
                  {t("statusBar.recapMonth")}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing || !puuid}
              className="flex items-center gap-1.5 border border-line px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
            >
              <RefreshIcon spinning={refreshing} />
              {t("statusBar.refresh")}
            </button>
          </div>
        </div>
      </Panel>

      {showProfileCard && profileCardData && (
        <ProfileCardModal data={profileCardData} onClose={() => setShowProfileCard(false)} />
      )}

      {periodRecap && name && tag && (
        <PeriodRecapModal recap={periodRecap} playerLabel={`${name}#${tag}`} onClose={() => setPeriodRecap(null)} />
      )}

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
          <WeeklyGoalsPanel key={`weekly-${puuid}`} puuid={puuid} matches={matches.data?.data ?? []} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <LeaderboardPercentileCard region={region} name={name} tag={tag} currentTier={current?.currenttier} />
      </div>

      <div className="flex items-center justify-between">
        <h1 className="hud-label text-sm">{t("overview.title")}</h1>
        <SampleSizeSwitch value={sampleSize} onChange={setSampleSize} />
      </div>

      {matches.isError && <ErrorState error={matches.error} />}
      {matches.data?.stale && <StaleDataBanner cachedAt={matches.data.cached_at} />}
      {matches.isLoading && <Skeleton className="h-32 w-full" />}

      {overview && (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatCard
              label={t("overview.stats.winrate")}
              value={formatPercent(overview.winPercent)}
              hint={t("overview.winLossHint", { wins: overview.wins, losses: overview.losses })}
              gaugePercent={overview.winPercent}
              gaugeColor={overview.winPercent >= 50 ? "rgb(var(--color-accent))" : "rgb(var(--color-crit))"}
            />
            <StatCard
              label={t("overview.stats.kd")}
              value={overview.kd}
              hint={t("overview.stats.kdHint", { n: overview.kills })}
              icon={<KdIcon />}
              tooltip={t("overview.stats.tooltip.kd")}
            />
            <StatCard
              label={t("overview.stats.headshotPercent")}
              value={formatPercent(overview.hsPercent)}
              gaugePercent={overview.hsPercent}
              gaugeColor="rgb(var(--color-accent))"
              tooltip={t("overview.stats.tooltip.headshotPercent")}
            />
            <StatCard
              label={t("overview.stats.acs")}
              value={overview.acs.toString()}
              icon={<TargetIcon />}
              tooltip={t("overview.stats.tooltip.acs")}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <MiniStat label={t("overview.miniStats.wins")} value={overview.wins} accent="text-accent" />
            <MiniStat label={t("overview.miniStats.losses")} value={overview.losses} accent="text-crit" />
            <MiniStat label={t("overview.miniStats.kills")} value={overview.kills} />
            <MiniStat label={t("overview.miniStats.deaths")} value={overview.deaths} />
            <MiniStat label={t("overview.miniStats.assists")} value={overview.assists} />
            <MiniStat label={t("overview.miniStats.headshots")} value={overview.headshots} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Panel className="p-4">
              <p className="hud-label mb-3">{t("overview.topAgent.title")}</p>
              {overview.topAgent ? (
                <div className="flex items-center gap-4">
                  <img
                    src={agentPortraitUrl(overview.topAgent.id)}
                    alt={overview.topAgent.name}
                    className="h-16 w-16 border border-line object-cover object-top"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                    }}
                  />
                  <div>
                    <p className="font-display font-semibold text-hi">{overview.topAgent.name}</p>
                    <p className="tnum text-xs text-lo">
                      {t("overview.topAgent.stats", {
                        matches: overview.topAgent.matches,
                        winPercent: formatPercent(
                          (overview.topAgent.wins / overview.topAgent.matches) * 100,
                        ),
                        kd: formatKdRatio(overview.topAgent.kills, overview.topAgent.deaths),
                      })}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-lo">{t("overview.notEnoughData")}</p>
              )}
            </Panel>

            <Panel className="p-4">
              <p className="hud-label mb-3">{t("overview.accuracy.title")}</p>
              <div className="space-y-2.5">
                <AccuracyBar
                  label={t("overview.accuracy.head")}
                  percent={overview.hsPercent}
                  color="rgb(var(--color-accent))"
                />
                <AccuracyBar
                  label={t("overview.accuracy.body")}
                  percent={overview.bodyPercent}
                  color="rgb(var(--color-lo))"
                />
                <AccuracyBar label={t("overview.accuracy.legs")} percent={overview.legPercent} color="#3A424B" />
              </div>
            </Panel>

            {region && name && tag && matches.data && matches.data.data.length > 0 && (
              <LastMapWidget match={matches.data.data[0]} region={region} name={name} tag={tag} />
            )}
          </div>
        </>
      )}

      <QueueStatusStrip region={region} />

      <div>
        <h2 className="hud-label mb-2">{t("rankProgression")}</h2>
        <RankHistoryChart
          snapshots={snapshots.data ?? []}
          serverHistory={mmrHistory.data?.data.history ?? []}
        />
      </div>

      {puuid && (
        <div>
          <h2 className="hud-label mb-2">{t("accountTimeline.title")}</h2>
          <AccountTimeline events={accountTimeline.data ?? []} />
        </div>
      )}
    </div>
  );
}

/** Backlog #62 : mini-vignette de la carte du dernier match joué, entrée rapide vers
 * MapStats pour cette carte précise (surlignée là-bas via ?carte=, voir MapStats.tsx). */
function LastMapWidget({
  match,
  region,
  name,
  tag,
}: {
  match: MatchEntry;
  region: string;
  name: string;
  tag: string;
}) {
  const { t } = useTranslation("home");
  const map = match.metadata.map;
  if (!map?.name) return null;

  return (
    <Link
      to={`/joueur/${region}/${name}/${tag}/cartes?carte=${encodeURIComponent(map.name)}`}
      className="target-lock relative block h-full overflow-hidden panel-clip"
    >
      {map.id && (
        <img
          src={mapSplashUrl(map.id)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-40 transition-opacity hover:opacity-55"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
          }}
        />
      )}
      <div className="relative flex h-full flex-col justify-end bg-gradient-to-t from-surface via-surface/60 to-transparent p-4">
        <p className="hud-label text-lo">{t("overview.lastMap.title")}</p>
        <p className="font-display text-lg font-bold text-hi">{map.name}</p>
      </div>
    </Link>
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
