import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Skeleton } from "../components/Skeleton";

import { useAccount, useRankSnapshots } from "../hooks/usePlayer";
import { useMatches } from "../hooks/useMatches";
import MatchRow from "../components/MatchRow";
import StatCard from "../components/StatCard";
import ErrorState from "../components/ErrorState";
import EmptyState from "../components/EmptyState";
import Panel from "../components/Panel";
import PeriodRecapModal from "../components/PeriodRecapModal";
import { computeSessionRecap, computeTodayStats, isSessionOver, type PeriodRecap } from "../lib/stats";
import { formatKdRatio, formatPercent } from "../lib/format";

const SAMPLE_SIZE = 20;

/** TODO Fonctionnalités#13 : vue "aujourd'hui" — dashboard condensé (winrate du jour,
 * dernières games, tendance), distincte de Home.tsx qui couvre un horizon plus large
 * (dernier échantillon complet, historique de rang...). Réutilise le même échantillon de
 * matchs que MatchHistory (`useMatches`), aucun appel réseau supplémentaire. */
export default function Today() {
  const { t } = useTranslation("home");
  const { region, name, tag } = useParams<{ region: string; name: string; tag: string }>();
  const navigate = useNavigate();

  const account = useAccount(name, tag);
  const puuid = account.data?.data.puuid;
  const matches = useMatches({ region, name, tag, size: SAMPLE_SIZE });
  const snapshots = useRankSnapshots(puuid);
  const [sessionRecap, setSessionRecap] = useState<PeriodRecap | null>(null);

  // Backlog Fonctionnalités#3 : résumé proactif de fin de session, aussi sur Today (pas
  // seulement Home, voir useHomeData::autoSessionRecap) — même clé de déduplication
  // localStorage `session-recap-shown:${puuid}` que Home.tsx, pour ne l'afficher qu'une
  // seule fois au total quel que soit l'écran visité en premier après la session. Réutilise
  // l'échantillon de matchs déjà chargé par `useMatches` ci-dessus, aucun appel réseau
  // supplémentaire.
  useEffect(() => {
    if (!puuid || !matches.data) return;
    const list = matches.data.data;
    if (!isSessionOver(list)) return;
    const lastShownKey = `session-recap-shown:${puuid}`;
    const latestMatchId = list[0]?.metadata.match_id;
    if (!latestMatchId) return;
    if (localStorage.getItem(lastShownKey) === latestMatchId) return;

    const recap = computeSessionRecap(list, snapshots.data ?? [], puuid);
    if (!recap) return;
    setSessionRecap(recap);
    localStorage.setItem(lastShownKey, latestMatchId);
  }, [puuid, matches.data, snapshots.data]);

  const today = useMemo(
    () => (matches.data && puuid ? computeTodayStats(matches.data.data, puuid) : null),
    [matches.data, puuid],
  );

  const todayMatches = useMemo(() => {
    if (!matches.data || !puuid) return [];
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return matches.data.data.filter((m) => {
      const startedAt = m.metadata.started_at;
      if (!startedAt) return false;
      const date = new Date(startedAt);
      return !Number.isNaN(date.getTime()) && date >= startOfDay;
    });
  }, [matches.data, puuid]);

  if (account.isLoading || matches.isLoading) return <Skeleton className="h-48 w-full" />;
  if (matches.isError) return <ErrorState error={matches.error} />;
  if (!puuid) return null;

  return (
    <div className="space-y-4">
      {sessionRecap && name && tag && (
        <PeriodRecapModal recap={sessionRecap} playerLabel={`${name}#${tag}`} onClose={() => setSessionRecap(null)} />
      )}

      <div className="flex items-center justify-between gap-3">
        <h1 className="hud-label text-sm">{t("today.title")}</h1>
        {/* TODO Social/multi-comptes#38 : point d'entrée vers le carnet de session de groupe
         * exportable (écran /partage, voir SharedImport.tsx) — la construction du carnet
         * couvre déjà tous les comptes "à soi", pas seulement celui affiché ici. */}
        <Link to="/partage" className="hud-label text-[11px] text-lo underline decoration-dotted hover:text-accent">
          {t("today.shareSessionLink")}
        </Link>
      </div>

      {today && today.matches === 0 && (
        <EmptyState icon="match" title={t("today.emptyTitle")} detail={t("today.emptyDetail")} />
      )}

      {today && today.matches > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatCard
              label={t("today.stats.matches")}
              value={String(today.matches)}
              hint={t("today.stats.winLossHint", { wins: today.wins, losses: today.matches - today.wins })}
            />
            <StatCard
              label={t("today.stats.winrate")}
              value={formatPercent(Math.round(today.winPercent))}
              gaugePercent={today.winPercent}
              gaugeColor={today.winPercent >= 50 ? "rgb(var(--accent-rgb))" : "rgb(var(--crit-rgb))"}
            />
            <StatCard label={t("today.stats.kd")} value={formatKdRatio(today.kills, today.deaths)} />
            <StatCard label={t("today.stats.hs")} value={formatPercent(Math.round(today.hsPercent))} />
          </div>

          <Panel className="space-y-2 p-4">
            <p className="hud-label mb-1">{t("today.recentTitle")}</p>
            {todayMatches.map((match) => (
              <MatchRow
                key={match.metadata.match_id ?? Math.random()}
                match={match}
                puuid={puuid}
                region={region}
                name={name}
                tag={tag}
                onClick={() =>
                  match.metadata.match_id &&
                  navigate(`/joueur/${region}/${name}/${tag}/matchs/${match.metadata.match_id}`)
                }
              />
            ))}
          </Panel>
        </>
      )}
    </div>
  );
}
