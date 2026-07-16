import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SkeletonScreen } from "../components/Skeleton";
import { Link, useParams } from "react-router-dom";

import { useAccount } from "../hooks/usePlayer";
import { useMapAverageStats, useMatchDetail } from "../hooks/useMatches";
import ErrorState from "../components/ErrorState";
import InfoTooltip from "../components/InfoTooltip";
import Panel from "../components/Panel";
import StaleDataBanner from "../components/StaleDataBanner";
import MatchNotesPanel from "../components/MatchNotesPanel";
import { formatDurationMs, formatKda, formatKdRatio } from "../lib/format";
import { tauriApi } from "../lib/tauriApi";
import type { MapAverageStat, MatchDetailPlayer, MatchDetailRound } from "../lib/tauriApi";

function endTypeLabel(t: (key: string) => string, endType: string | null | undefined): string {
  const key: Record<string, string> = {
    Elimination: "detail.endType.elimination",
    Bomb: "detail.endType.bomb",
    Defuse: "detail.endType.defuse",
    Round_Timer_Expired: "detail.endType.roundTimerExpired",
    Surrendered: "detail.endType.surrendered",
  };
  if (!endType || !key[endType]) return endType ?? "?";
  return t(key[endType]);
}

export default function MatchDetail() {
  const { t } = useTranslation("matches");
  const { region, name, tag, matchId } = useParams<{
    region: string;
    name: string;
    tag: string;
    matchId: string;
  }>();
  const [selectedRound, setSelectedRound] = useState<number | null>(null);

  const account = useAccount(name, tag);
  const puuid = account.data?.data.puuid;

  const detail = useMatchDetail(matchId);
  // TODO stats & analyse joueur : comparaison à la moyenne perso sur cette carte — le hook
  // doit être appelé inconditionnellement (avant les early return ci-dessous), donc on lit
  // la carte via optional chaining plutôt que d'attendre `data`.
  const mapAverage = useMapAverageStats(puuid, detail.data?.data.metadata.map ?? undefined);

  // Best-effort, ne bloque jamais l'affichage : reconstruit les stats de duo/squad
  // (party_id) à partir du détail de match tout juste chargé, sans appel réseau
  // supplémentaire (voir commands::record_party_from_match — relit juste le cache).
  useEffect(() => {
    if (!matchId || !puuid || !detail.data) return;
    tauriApi.recordPartyFromMatch(matchId, puuid).catch(() => {});
  }, [matchId, puuid, detail.data]);

  if (detail.isError) return <ErrorState error={detail.error} />;
  if (detail.isLoading) return <SkeletonScreen className="p-6" />;

  const data = detail.data?.data;
  if (!data) {
    return (
      <div>
        <BackLink region={region} name={name} tag={tag} />
        <p className="mt-4 text-sm text-lo">{t("detail.notFound")}</p>
      </div>
    );
  }

  const players = [...data.players.all_players].sort((a, b) => {
    const teamCompare = a.team.localeCompare(b.team);
    if (teamCompare !== 0) return teamCompare;
    return (b.stats?.score ?? 0) - (a.stats?.score ?? 0);
  });

  const activePlayer = players.find((p) => p.puuid === puuid);
  const roundsPlayed = data.metadata.rounds_played ?? data.rounds.length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <BackLink region={region} name={name} tag={tag} />
          <h1 className="mt-2 font-display text-lg font-bold uppercase tracking-hud text-hi">
            {data.metadata.map ?? t("detail.unknownMap")}
          </h1>
          <p className="stat-value text-sm text-lo">
            {formatDurationMs((data.metadata.game_length ?? 0) * 1000)} ·{" "}
            {data.metadata.mode ?? "?"} ·{" "}
            <span className="text-accent">{data.teams.blue?.rounds_won ?? "?"}</span>
            {" – "}
            <span className="text-crit">{data.teams.red?.rounds_won ?? "?"}</span>
          </p>
        </div>
        {puuid && (
          <Link
            to={`/joueur/${region}/${name}/${tag}/matchs/${matchId}/rapport`}
            className="btn-clip mt-1 shrink-0 bg-accent px-4 py-2 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-accent-dim"
          >
            {t("detail.reportButton")}
          </Link>
        )}
      </div>

      {detail.data?.stale && <StaleDataBanner cachedAt={detail.data.cached_at} />}

      {data.rounds.length > 0 && (
        <Panel className="p-3">
          <p className="hud-label mb-2">
            {t("detail.roundTimeline.title", { count: roundsPlayed })}
          </p>
          <RoundTimeline
            rounds={data.rounds}
            activePuuid={puuid}
            selected={selectedRound}
            onSelect={setSelectedRound}
          />
        </Panel>
      )}

      {selectedRound !== null && data.rounds[selectedRound] && (
        <RoundDetailPanel
          round={data.rounds[selectedRound]}
          roundNumber={selectedRound + 1}
          activePuuid={puuid}
        />
      )}

      <Panel className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left">
            <tr>
              <th className="hud-label px-4 py-3 font-semibold">{t("detail.table.player")}</th>
              <th className="hud-label px-4 py-3 font-semibold">{t("detail.table.team")}</th>
              <th className="hud-label px-4 py-3 font-semibold">
                <span className="inline-flex items-center gap-1">
                  {t("detail.table.kda")}
                  <InfoTooltip text={t("detail.table.tooltip.kda")} />
                </span>
              </th>
              <th className="hud-label px-4 py-3 font-semibold">
                <span className="inline-flex items-center gap-1">
                  {t("detail.table.kd")}
                  <InfoTooltip text={t("detail.table.tooltip.kd")} />
                </span>
              </th>
              <th className="hud-label px-4 py-3 font-semibold">
                <span className="inline-flex items-center gap-1">
                  {t("detail.table.score")}
                  <InfoTooltip text={t("detail.table.tooltip.score")} />
                </span>
              </th>
              <th className="hud-label px-4 py-3 font-semibold">
                <span className="inline-flex items-center gap-1">
                  {t("detail.table.acs")}
                  <InfoTooltip text={t("detail.table.tooltip.acs")} />
                </span>
              </th>
              <th className="hud-label px-4 py-3 font-semibold">
                <span className="inline-flex items-center gap-1">
                  {t("detail.table.headshotPercent")}
                  <InfoTooltip text={t("detail.table.tooltip.headshotPercent")} />
                </span>
              </th>
              <th className="hud-label px-4 py-3 font-semibold">
                <span className="inline-flex items-center gap-1">
                  {t("detail.table.damageDealtReceived")}
                  <InfoTooltip text={t("detail.table.tooltip.damageDealtReceived")} />
                </span>
              </th>
              <th className="hud-label px-4 py-3 font-semibold">
                <span className="inline-flex items-center gap-1">
                  {t("detail.table.avgEconomy")}
                  <InfoTooltip text={t("detail.table.tooltip.avgEconomy")} />
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {players.map((player) => (
              <PlayerRow key={player.puuid} player={player} isActive={player.puuid === puuid} roundsPlayed={roundsPlayed} />
            ))}
          </tbody>
        </table>
      </Panel>

      {activePlayer?.economy && (
        <Panel className="p-4">
          <p className="hud-label mb-2 inline-flex items-center gap-1">
            {t("detail.economy.title")}
            <InfoTooltip text={t("detail.economy.tooltip")} />
          </p>
          <p className="stat-value text-sm text-hi">
            {t("detail.economy.spent", {
              spent: activePlayer.economy.spent?.overall ?? "—",
              average: activePlayer.economy.spent?.average?.toFixed(0) ?? "—",
            })}
          </p>
          <p className="stat-value text-sm text-lo">
            {t("detail.economy.avgLoadout", {
              value: activePlayer.economy.loadout_value?.average?.toFixed(0) ?? "—",
            })}
          </p>
        </Panel>
      )}

      {activePlayer && mapAverage.data && roundsPlayed > 0 && (
        <MapAverageComparisonPanel
          player={activePlayer}
          roundsPlayed={roundsPlayed}
          mapName={data.metadata.map}
          average={mapAverage.data}
        />
      )}

      {matchId && puuid && <MatchNotesPanel matchId={matchId} puuid={puuid} />}
    </div>
  );
}

/** TODO stats & analyse joueur : compare ADR/K-D/score du match affiché à la moyenne perso du
 * joueur suivi sur cette carte, calculée côté Rust sur les matchs déjà en cache (voir
 * `useMapAverageStats`) — évite d'afficher des chiffres bruts seuls sans point de repère. */
function MapAverageComparisonPanel({
  player,
  roundsPlayed,
  mapName,
  average,
}: {
  player: MatchDetailPlayer;
  roundsPlayed: number;
  mapName: string | null | undefined;
  average: MapAverageStat;
}) {
  const { t } = useTranslation("matches");
  const adr = (player.damage_made ?? 0) / roundsPlayed;
  const kills = player.stats?.kills ?? 0;
  const deaths = player.stats?.deaths ?? 0;
  const kd = deaths > 0 ? kills / deaths : kills;
  const score = player.stats?.score ?? 0;

  const rows: { label: string; value: number; avg: number; decimals: number }[] = [
    { label: t("detail.mapAverage.adr"), value: adr, avg: average.avg_adr, decimals: 0 },
    { label: t("detail.mapAverage.kd"), value: kd, avg: average.avg_kd, decimals: 2 },
    { label: t("detail.mapAverage.score"), value: score, avg: average.avg_score, decimals: 0 },
  ];

  return (
    <Panel className="p-4">
      <p className="hud-label mb-2">{t("detail.mapAverage.title", { map: mapName ?? "?" })}</p>
      <p className="mb-2 text-xs text-lo">
        {t("detail.mapAverage.description", { count: average.matches_considered })}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {rows.map((row) => {
          const delta = row.value - row.avg;
          const deltaColor = delta > 0 ? "text-accent" : delta < 0 ? "text-crit" : "text-lo";
          return (
            <div key={row.label}>
              <p className="hud-label text-[10px] text-lo">{row.label}</p>
              <p className="stat-value text-lg font-bold text-hi">{row.value.toFixed(row.decimals)}</p>
              <p className={`stat-value text-[11px] ${deltaColor}`}>
                {delta >= 0 ? "+" : ""}
                {delta.toFixed(row.decimals)} {t("detail.mapAverage.vsAverage", { avg: row.avg.toFixed(row.decimals) })}
              </p>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function BackLink({ region, name, tag }: { region?: string; name?: string; tag?: string }) {
  const { t } = useTranslation("matches");
  return (
    <Link to={`/joueur/${region}/${name}/${tag}/matchs`} className="text-sm text-accent hover:underline">
      {t("detail.backToHistory")}
    </Link>
  );
}

function PlayerRow({
  player,
  isActive,
  roundsPlayed,
}: {
  player: MatchDetailPlayer;
  isActive: boolean;
  roundsPlayed: number;
}) {
  const teamColor = player.team === "Blue" ? "text-accent" : player.team === "Red" ? "text-crit" : "text-lo";
  const totalShots =
    (player.stats?.headshots ?? 0) + (player.stats?.bodyshots ?? 0) + (player.stats?.legshots ?? 0);
  const acs = roundsPlayed > 0 ? Math.round((player.stats?.score ?? 0) / roundsPlayed) : 0;

  return (
    <tr
      className={`relative transition-colors ${isActive ? "bg-raised text-hi" : "text-hi/80 hover:bg-raised/50"}`}
    >
      <td className="relative px-4 py-2.5">
        {isActive && <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" />}
        <div className="flex items-center gap-3">
          {player.assets?.agent?.small ? (
            <img
              src={player.assets.agent.small}
              alt=""
              className={`h-8 w-8 border object-cover ${isActive ? "border-accent/60" : "border-line"}`}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
              }}
            />
          ) : (
            <div className="h-8 w-8 border border-line bg-base" />
          )}
          <div>
            <p className={isActive ? "font-semibold" : ""}>
              {player.name}
              <span className="text-lo">#{player.tag}</span>
            </p>
            <p className="text-xs text-lo">{player.currenttier_patched ?? "—"}</p>
          </div>
        </div>
      </td>
      <td className={`px-4 py-2.5 font-display text-xs font-semibold uppercase tracking-hud ${teamColor}`}>
        {player.team}
      </td>
      <td className="stat-value px-4 py-2.5">
        {formatKda(player.stats?.kills ?? 0, player.stats?.deaths ?? 0, player.stats?.assists ?? 0)}
      </td>
      <td className="stat-value px-4 py-2.5">{formatKdRatio(player.stats?.kills ?? 0, player.stats?.deaths ?? 0)}</td>
      <td className="stat-value px-4 py-2.5">{player.stats?.score ?? "—"}</td>
      <td className="stat-value px-4 py-2.5">{acs || "—"}</td>
      <td className="stat-value px-4 py-2.5">
        {totalShots > 0 ? `${Math.round(((player.stats?.headshots ?? 0) / totalShots) * 100)}%` : "—"}
      </td>
      <td className="stat-value px-4 py-2.5">
        {player.damage_made ?? "—"} / {player.damage_received ?? "—"}
      </td>
      <td className="stat-value px-4 py-2.5">
        {player.economy?.loadout_value?.average != null ? Math.round(player.economy.loadout_value.average) : "—"}
      </td>
    </tr>
  );
}

function RoundTimeline({
  rounds,
  activePuuid,
  selected,
  onSelect,
}: {
  rounds: MatchDetailRound[];
  activePuuid: string | undefined;
  selected: number | null;
  onSelect: (index: number | null) => void;
}) {
  const { t } = useTranslation("matches");
  const activeTeam = activePuuid
    ? rounds
        .flatMap((r) => r.player_stats)
        .find((p) => p.player_puuid === activePuuid)?.player_team
    : undefined;

  return (
    <div className="flex flex-wrap gap-1">
      {rounds.map((round, index) => {
        const won = activeTeam ? round.winning_team === activeTeam : undefined;
        const isSelected = selected === index;
        const bg =
          won === undefined ? "bg-raised text-lo" : won ? "bg-accent/20 text-accent" : "bg-crit/15 text-crit";
        return (
          <button
            key={index}
            type="button"
            onClick={() => onSelect(isSelected ? null : index)}
            title={t("detail.roundTimeline.roundTooltip", {
              number: index + 1,
              endType: endTypeLabel(t, round.end_type),
            })}
            className={`flex h-8 w-8 items-center justify-center border text-[11px] font-semibold transition-colors ${bg} ${
              isSelected ? "border-hi" : "border-line"
            }`}
          >
            {index + 1}
          </button>
        );
      })}
    </div>
  );
}

function RoundDetailPanel({
  round,
  roundNumber,
  activePuuid,
}: {
  round: MatchDetailRound;
  roundNumber: number;
  activePuuid: string | undefined;
}) {
  const { t } = useTranslation("matches");
  const sorted = useMemo(
    () =>
      [...round.player_stats].sort((a, b) => {
        const teamCompare = (a.player_team ?? "").localeCompare(b.player_team ?? "");
        if (teamCompare !== 0) return teamCompare;
        return (b.score ?? 0) - (a.score ?? 0);
      }),
    [round.player_stats],
  );

  return (
    <Panel className="overflow-x-auto p-3">
      <p className="hud-label mb-2">
        {t("detail.roundDetail.title", { number: roundNumber, endType: endTypeLabel(t, round.end_type) })}
        {round.bomb_planted ? t("detail.roundDetail.bombPlanted") : ""}
        {round.bomb_defused ? t("detail.roundDetail.bombDefused") : ""}
      </p>
      <table className="w-full text-xs">
        <thead className="border-b border-line text-left">
          <tr>
            <th className="hud-label px-2 py-2 font-semibold">{t("detail.roundDetail.table.player")}</th>
            <th className="hud-label px-2 py-2 font-semibold">{t("detail.roundDetail.table.kills")}</th>
            <th className="hud-label px-2 py-2 font-semibold">{t("detail.roundDetail.table.damage")}</th>
            <th className="hud-label px-2 py-2 font-semibold">{t("detail.roundDetail.table.weapon")}</th>
            <th className="hud-label px-2 py-2 font-semibold">{t("detail.roundDetail.table.loadout")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/60">
          {sorted.map((p) => (
            <tr
              key={p.player_puuid}
              className={p.player_puuid === activePuuid ? "bg-raised text-hi" : "text-hi/80"}
            >
              <td className="px-2 py-1.5">{p.player_display_name ?? "—"}</td>
              <td className="stat-value px-2 py-1.5">{p.kills ?? 0}</td>
              <td className="stat-value px-2 py-1.5">{p.damage ?? 0}</td>
              <td className="px-2 py-1.5 text-lo">{p.economy?.weapon?.name ?? "—"}</td>
              <td className="stat-value px-2 py-1.5">{p.economy?.loadout_value ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
