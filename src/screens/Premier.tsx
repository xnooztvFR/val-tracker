import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "../components/Skeleton";
import { useNavigate } from "react-router-dom";

import { usePremierLeaderboard, usePremierSearch } from "../hooks/usePremier";
import ErrorState from "../components/ErrorState";
import StaleDataBanner from "../components/StaleDataBanner";
import Panel from "../components/Panel";
import EmptyState from "../components/EmptyState";
import { getRegions } from "../lib/format";
import type { PremierTeamLite } from "../lib/tauriApi";

const PAGE_SIZE = 50;

export default function Premier() {
  const { t } = useTranslation("competitive");
  const [region, setRegion] = useState<string>("eu");
  const [searchInput, setSearchInput] = useState("");
  const [searchName, setSearchName] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(0);
  const navigate = useNavigate();

  const search = usePremierSearch(searchName);
  const leaderboard = usePremierLeaderboard(region);

  const showingSearch = Boolean(searchName);
  const active = showingSearch ? search : leaderboard;
  const allTeams = active.data?.data ?? [];

  // Le classement Premier renvoie la région entière en un seul appel (pas de pagination
  // côté API) — jusqu'à plusieurs centaines d'équipes. Tout rendre d'un coup fait ramer
  // le tableau, donc on paginate côté client.
  const pageCount = Math.max(1, Math.ceil(allTeams.length / PAGE_SIZE));
  const teams = useMemo(
    () => allTeams.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [allTeams, page],
  );

  useEffect(() => {
    setPage(0);
  }, [region, searchName]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchInput.trim()) setSearchName(searchInput.trim());
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="hud-label text-sm">{t("premier.title")}</h1>
        <div className="flex items-center gap-2">
          <select
            value={region}
            onChange={(e) => {
              setRegion(e.target.value);
              setSearchName(undefined);
              setSearchInput("");
            }}
            className="border border-line bg-surface px-3 py-1.5 text-sm text-hi focus:border-accent focus:outline-none"
          >
            {getRegions().map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("premier.teamNamePlaceholder")}
              className="w-40 border border-line bg-surface px-3 py-1.5 text-sm text-hi placeholder:text-lo/60 focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              className="border border-line px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent"
            >
              {t("premier.search")}
            </button>
            {showingSearch && (
              <button
                type="button"
                onClick={() => {
                  setSearchName(undefined);
                  setSearchInput("");
                }}
                className="border border-line px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-hud text-lo transition-colors hover:text-hi"
              >
                {t("premier.reset")}
              </button>
            )}
          </form>
        </div>
      </div>

      {active.isError && <ErrorState error={active.error} />}
      {active.data?.stale && <StaleDataBanner cachedAt={active.data.cached_at} />}
      {active.isLoading && <Skeleton className="h-32 w-full" />}
      {active.data && allTeams.length === 0 && (
        <EmptyState icon="team" title={t("premier.emptyTitle")} detail={t("premier.emptyDetail")} />
      )}
      {allTeams.length > 0 && (
        <p className="text-xs text-lo">
          {t("premier.teamCount", { count: allTeams.length, page: page + 1, pageCount })}
        </p>
      )}

      {teams.length > 0 && (
        <Panel className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left">
              <tr>
                <th className="hud-label px-4 py-3 font-semibold">{t("premier.columns.rank")}</th>
                <th className="hud-label px-4 py-3 font-semibold">{t("premier.columns.team")}</th>
                <th className="hud-label px-4 py-3 font-semibold">{t("premier.columns.conferenceDivision")}</th>
                <th className="hud-label px-4 py-3 font-semibold">{t("premier.columns.score")}</th>
                <th className="hud-label px-4 py-3 font-semibold">{t("premier.columns.winsLosses")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {teams.map((team: PremierTeamLite) => (
                <tr
                  key={team.id}
                  className="cursor-pointer text-hi/90 transition-colors hover:bg-raised/50"
                  onClick={() => navigate(`/premier/equipe/${team.id}`)}
                >
                  <td className="stat-value px-4 py-2.5 text-lo">
                    {team.ranking != null ? `#${team.ranking}` : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-6 w-6 shrink-0 border border-line"
                        style={{ backgroundColor: team.customization?.primary ?? "#22282F" }}
                      />
                      <span className="font-medium">
                        {team.name} <span className="text-lo">#{team.tag}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-lo">
                    {team.conference ?? "—"} {team.division != null ? t("premier.division", { division: team.division }) : ""}
                  </td>
                  <td className="stat-value px-4 py-2.5">{team.score ?? "—"}</td>
                  <td className="stat-value px-4 py-2.5">
                    <span className="text-accent">{team.wins ?? 0}</span>
                    <span className="text-lo"> / </span>
                    <span className="text-crit">{team.losses ?? 0}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="border border-line px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
          >
            {t("premier.previous")}
          </button>
          <span className="stat-value text-xs text-lo">
            {t("premier.pageOf", { page: page + 1, pageCount })}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
            className="border border-line px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
          >
            {t("premier.next")}
          </button>
        </div>
      )}
    </div>
  );
}
