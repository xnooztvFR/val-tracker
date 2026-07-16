import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Skeleton } from "../components/Skeleton";

import { useAccount, useDuoStats, useFullRosterStats, useRivalryStats, useSquadStats } from "../hooks/usePlayer";
import Panel from "../components/Panel";
import ErrorState from "../components/ErrorState";
import EmptyState from "../components/EmptyState";
import { formatPercent, splitRiotId } from "../lib/format";
import { PLAYER_TAGS, tauriApi, type PlayerTag } from "../lib/tauriApi";

/** Winrate en duo/squad (V3), calculé à partir des `party_id` accumulés localement à
 * chaque consultation de match (voir hooks/usePlayer::useDuoStats) — grandit au fil de la
 * navigation dans l'historique, aucun appel réseau en masse. */
export default function Duo() {
  const { t } = useTranslation("stats");
  const { name, tag } = useParams<{ region: string; name: string; tag: string }>();

  const account = useAccount(name, tag);
  const puuid = account.data?.data.puuid;

  // TODO Social/multi-comptes : filtre de récence — "toutes les périodes" par défaut pour
  // ne pas changer le comportement existant tant que l'utilisateur n'a rien choisi.
  const [sinceDays, setSinceDays] = useState<number | null>(null);
  const duo = useDuoStats(puuid, 2, sinceDays);
  const squad = useSquadStats(puuid, 2, sinceDays);
  const fullRoster = useFullRosterStats(puuid, 2, sinceDays);
  const rivalry = useRivalryStats(puuid, 2, sinceDays);

  // TODO stats & analyse joueur : filtre par tag structuré (voir PlayerNotesPanel.tsx) sur
  // ces trois listes — les tags ne sont posés que sur des joueurs déjà suivis
  // (`tracked_players`), donc un coéquipier/adversaire jamais recherché séparément ne
  // matchera simplement aucun filtre plutôt que de planter.
  const [tagFilter, setTagFilter] = useState<PlayerTag | "all">("all");
  const trackedPlayers = useQuery({
    queryKey: ["tracked_players_for_tags"],
    queryFn: () => tauriApi.listTrackedPlayers(500),
  });
  const tagsByPuuid = useMemo(() => {
    const map = new Map<string, PlayerTag[]>();
    for (const p of trackedPlayers.data ?? []) map.set(p.puuid, p.tags);
    return map;
  }, [trackedPlayers.data]);
  const hasTag = (puuidToCheck: string) =>
    tagFilter === "all" || (tagsByPuuid.get(puuidToCheck) ?? []).includes(tagFilter);

  const filteredDuo = useMemo(
    () => (duo.data ?? []).filter((d) => hasTag(d.teammate_puuid)),
    [duo.data, tagFilter, tagsByPuuid],
  );
  const filteredSquad = useMemo(
    () => (squad.data ?? []).filter((s) => hasTag(s.teammate_a_puuid) || hasTag(s.teammate_b_puuid)),
    [squad.data, tagFilter, tagsByPuuid],
  );
  const filteredRivalry = useMemo(
    () => (rivalry.data ?? []).filter((r) => hasTag(r.opponent_puuid)),
    [rivalry.data, tagFilter, tagsByPuuid],
  );
  const filteredFullRoster = useMemo(
    () => (fullRoster.data ?? []).filter((r) => r.members.some((m) => hasTag(m.puuid))),
    [fullRoster.data, tagFilter, tagsByPuuid],
  );

  // TODO Social/multi-comptes : recherche manuelle d'un rival, rétro-peuplée depuis les
  // détails de match déjà en cache (aucun appel réseau) — voir
  // commands::retro_populate_rivalry.
  const queryClient = useQueryClient();
  const [opponentInput, setOpponentInput] = useState("");
  const [searchState, setSearchState] = useState<
    { status: "idle" } | { status: "searching" } | { status: "done"; count: number } | { status: "invalid" }
  >({ status: "idle" });

  async function searchOpponent() {
    if (!puuid) return;
    const split = splitRiotId(opponentInput);
    if (!split) {
      setSearchState({ status: "invalid" });
      return;
    }
    setSearchState({ status: "searching" });
    const count = await tauriApi.retroPopulateRivalry(puuid, split.name, split.tag);
    setSearchState({ status: "done", count });
    if (count > 0) {
      queryClient.invalidateQueries({ queryKey: ["rivalry_stats", puuid] });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="hud-label text-sm">{t("duo.title")}</h1>
          <p className="mt-1 text-xs text-lo">{t("duo.description")}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sinceDays ?? "all"}
            onChange={(e) => setSinceDays(e.target.value === "all" ? null : Number(e.target.value))}
            className="hud-label border border-line bg-raised px-2 py-1.5 text-xs text-hi"
          >
            <option value="all">{t("duo.recencyFilter.all")}</option>
            <option value={30}>{t("duo.recencyFilter.30d")}</option>
            <option value={90}>{t("duo.recencyFilter.90d")}</option>
          </select>
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value as PlayerTag | "all")}
            className="hud-label border border-line bg-raised px-2 py-1.5 text-xs text-hi"
          >
            <option value="all">{t("duo.tagFilter.all")}</option>
            {PLAYER_TAGS.map((t2) => (
              <option key={t2} value={t2}>
                {t(`duo.tagFilter.tags.${t2}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {duo.isError && <ErrorState error={duo.error} />}
      {duo.isLoading && <Skeleton className="h-32 w-full" />}

      {duo.data && filteredDuo.length === 0 && (
        <EmptyState icon="team" title={t("duo.emptyMessage")} />
      )}

      {duo.data && filteredDuo.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {filteredDuo.map((teammate) => {
            const winPercent = Math.round((teammate.matches_won / teammate.matches_played) * 100);
            return (
              <Panel key={teammate.teammate_puuid} className="p-4">
                <p className="text-sm font-semibold text-hi">
                  {teammate.teammate_name}
                  <span className="text-lo">#{teammate.teammate_tag}</span>
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <span
                    className={`font-display text-lg font-bold tracking-hud ${
                      winPercent >= 50 ? "text-accent" : "text-crit"
                    }`}
                  >
                    {formatPercent(winPercent)}
                  </span>
                  <span className="text-xs text-lo">
                    {t("duo.statsLine", { wins: teammate.matches_won, played: teammate.matches_played })}
                  </span>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {squad.data && filteredSquad.length > 0 && (
        <div className="space-y-2">
          <div>
            <h2 className="hud-label text-sm">{t("duo.squad.title")}</h2>
            <p className="mt-1 text-xs text-lo">{t("duo.squad.description")}</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {filteredSquad.map((s) => {
              const winPercent = Math.round((s.matches_won / s.matches_played) * 100);
              return (
                <Panel key={`${s.teammate_a_puuid}-${s.teammate_b_puuid}`} className="p-4">
                  <p className="text-sm font-semibold text-hi">
                    {s.teammate_a_name}
                    <span className="text-lo">#{s.teammate_a_tag}</span>
                    <span className="text-lo"> &amp; </span>
                    {s.teammate_b_name}
                    <span className="text-lo">#{s.teammate_b_tag}</span>
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <span
                      className={`font-display text-lg font-bold tracking-hud ${
                        winPercent >= 50 ? "text-accent" : "text-crit"
                      }`}
                    >
                      {formatPercent(winPercent)}
                    </span>
                    <span className="text-xs text-lo">
                      {t("duo.statsLine", { wins: s.matches_won, played: s.matches_played })}
                    </span>
                  </div>
                </Panel>
              );
            })}
          </div>
        </div>
      )}

      {squad.data && filteredSquad.length === 0 && (
        <div className="space-y-2">
          <div>
            <h2 className="hud-label text-sm">{t("duo.squad.title")}</h2>
            <p className="mt-1 text-xs text-lo">{t("duo.squad.description")}</p>
          </div>
          <EmptyState icon="team" title={t("duo.squad.emptyMessage")} />
        </div>
      )}

      {fullRoster.data && filteredFullRoster.length > 0 && (
        <div className="space-y-2">
          <div>
            <h2 className="hud-label text-sm">{t("duo.fullRoster.title")}</h2>
            <p className="mt-1 text-xs text-lo">{t("duo.fullRoster.description")}</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {filteredFullRoster.map((roster) => {
              const winPercent = Math.round((roster.matches_won / roster.matches_played) * 100);
              const key = roster.members.map((m) => m.puuid).join("-");
              return (
                <Panel key={key} className="p-4">
                  <p className="text-sm font-semibold text-hi">
                    {roster.members.map((m, i) => (
                      <span key={m.puuid}>
                        {i > 0 && <span className="text-lo"> · </span>}
                        {m.name}
                        <span className="text-lo">#{m.tag}</span>
                      </span>
                    ))}
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <span
                      className={`font-display text-lg font-bold tracking-hud ${
                        winPercent >= 50 ? "text-accent" : "text-crit"
                      }`}
                    >
                      {formatPercent(winPercent)}
                    </span>
                    <span className="text-xs text-lo">
                      {t("duo.statsLine", { wins: roster.matches_won, played: roster.matches_played })}
                    </span>
                  </div>
                </Panel>
              );
            })}
          </div>
        </div>
      )}

      <Panel className="space-y-2 p-4">
        <div>
          <h2 className="hud-label text-sm">{t("duo.rivalry.searchTitle")}</h2>
          <p className="mt-1 text-xs text-lo">{t("duo.rivalry.searchDescription")}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={opponentInput}
            onChange={(e) => {
              setOpponentInput(e.target.value);
              setSearchState({ status: "idle" });
            }}
            placeholder={t("duo.rivalry.searchPlaceholder")}
            className="flex-1 border border-line bg-base px-2 py-1.5 text-xs text-hi placeholder:text-lo/60"
          />
          <button
            type="button"
            onClick={searchOpponent}
            disabled={!opponentInput.trim() || searchState.status === "searching"}
            className="hud-label border border-line bg-raised px-3 py-1.5 text-xs text-hi hover:text-accent disabled:opacity-50"
          >
            {searchState.status === "searching" ? t("duo.rivalry.searchSearching") : t("duo.rivalry.searchButton")}
          </button>
        </div>
        {searchState.status === "invalid" && (
          <p className="text-xs text-crit">{t("duo.rivalry.searchInvalid")}</p>
        )}
        {searchState.status === "done" && searchState.count > 0 && (
          <p className="text-xs text-accent">
            {t("duo.rivalry.searchFound", { count: searchState.count })}
          </p>
        )}
        {searchState.status === "done" && searchState.count === 0 && (
          <p className="text-xs text-lo">{t("duo.rivalry.searchNotFound")}</p>
        )}
      </Panel>

      {rivalry.data && filteredRivalry.length > 0 && (
        <div className="space-y-2">
          <div>
            <h2 className="hud-label text-sm">{t("duo.rivalry.title")}</h2>
            <p className="mt-1 text-xs text-lo">{t("duo.rivalry.description")}</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {filteredRivalry.map((opponent) => {
              const winPercent = Math.round((opponent.matches_won / opponent.matches_played) * 100);
              return (
                <Panel key={opponent.opponent_puuid} className="p-4">
                  <p className="text-sm font-semibold text-hi">
                    {opponent.opponent_name}
                    <span className="text-lo">#{opponent.opponent_tag}</span>
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <span
                      className={`font-display text-lg font-bold tracking-hud ${
                        winPercent >= 50 ? "text-accent" : "text-crit"
                      }`}
                    >
                      {formatPercent(winPercent)}
                    </span>
                    <span className="text-xs text-lo">
                      {t("duo.rivalry.statsLine", { wins: opponent.matches_won, played: opponent.matches_played })}
                    </span>
                  </div>
                </Panel>
              );
            })}
          </div>
        </div>
      )}

      {rivalry.data && filteredRivalry.length === 0 && (
        <div className="space-y-2">
          <div>
            <h2 className="hud-label text-sm">{t("duo.rivalry.title")}</h2>
            <p className="mt-1 text-xs text-lo">{t("duo.rivalry.description")}</p>
          </div>
          <EmptyState icon="team" title={t("duo.rivalry.emptyMessage")} />
        </div>
      )}
    </div>
  );
}
