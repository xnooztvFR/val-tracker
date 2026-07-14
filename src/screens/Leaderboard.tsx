import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Skeleton } from "../components/Skeleton";
import { useNavigate } from "react-router-dom";
import { List, type RowComponentProps } from "react-window";

import { useLeaderboard } from "../hooks/useMeta";
import ErrorState from "../components/ErrorState";
import StaleDataBanner from "../components/StaleDataBanner";
import Panel from "../components/Panel";
import { playerCardIconUrl, rankIconUrl, rankInfo, getRegions, splitRiotId } from "../lib/format";
import type { LeaderboardPlayer } from "../lib/tauriApi";

const PAGE_SIZE = 50;
const ROW_HEIGHT = 45;
// Backlog #83 : au-delà de ce seuil, react-window prend le relais du rendu natif du tableau
// — pour PAGE_SIZE=50 le gain est marginal, mais évite un re-render coûteux si la taille de
// page grossit un jour (ex. recherche croisée région entière).
const VIRTUALIZE_THRESHOLD = 30;

export default function Leaderboard() {
  const { t } = useTranslation("competitive");
  const [region, setRegion] = useState<string>("eu");
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState<{ name: string; tag: string } | null>(null);
  const navigate = useNavigate();

  const leaderboard = useLeaderboard({
    region,
    size: PAGE_SIZE,
    startIndex: search ? 1 : page * PAGE_SIZE + 1,
    name: search?.name,
    tag: search?.tag,
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const parsed = splitRiotId(searchInput);
    if (parsed) setSearch(parsed);
  }

  function handleRegionChange(value: string) {
    setRegion(value);
    setPage(0);
    setSearch(null);
    setSearchInput("");
  }

  const players = leaderboard.data?.data.players ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="hud-label text-sm">{t("leaderboard.title")}</h1>
        <div className="flex items-center gap-2">
          <select
            value={region}
            onChange={(e) => handleRegionChange(e.target.value)}
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
              placeholder={t("leaderboard.searchPlaceholder")}
              className="w-40 border border-line bg-surface px-3 py-1.5 text-sm text-hi placeholder:text-lo/60 focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              className="border border-line px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent"
            >
              {t("leaderboard.locate")}
            </button>
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch(null);
                  setSearchInput("");
                }}
                className="border border-line px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-hud text-lo transition-colors hover:text-hi"
              >
                {t("leaderboard.reset")}
              </button>
            )}
          </form>
        </div>
      </div>

      {leaderboard.isError && <ErrorState error={leaderboard.error} />}
      {leaderboard.data?.stale && <StaleDataBanner cachedAt={leaderboard.data.cached_at} />}
      {leaderboard.isLoading && <Skeleton className="h-32 w-full" />}

      {leaderboard.data?.data.updated_at && (
        <p className="text-xs text-lo">
          {t("leaderboard.updatedAt", {
            date: new Date(leaderboard.data.data.updated_at).toLocaleString("fr-FR"),
          })}
        </p>
      )}

      {players.length > 0 && (
        <Panel className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className={`${GRID_COLUMNS} border-b border-line text-left`}>
              <span className="hud-label px-4 py-3 font-semibold">{t("leaderboard.columns.rank")}</span>
              <span className="hud-label px-4 py-3 font-semibold">{t("leaderboard.columns.player")}</span>
              <span className="hud-label px-4 py-3 font-semibold">{t("leaderboard.columns.tier")}</span>
              <span className="hud-label px-4 py-3 font-semibold">{t("leaderboard.columns.rr")}</span>
              <span className="hud-label px-4 py-3 font-semibold">{t("leaderboard.columns.wins")}</span>
            </div>
            {players.length > VIRTUALIZE_THRESHOLD ? (
              <List
                rowComponent={LeaderboardVirtualRow}
                rowCount={players.length}
                rowHeight={ROW_HEIGHT}
                rowProps={{ players, region, navigate, t }}
                style={{ height: Math.min(players.length, 12) * ROW_HEIGHT, width: "100%" }}
              />
            ) : (
              <div className="divide-y divide-line/60">
                {players.map((p) => (
                  <LeaderboardRow
                    key={`${p.leaderboard_rank}-${p.name}`}
                    player={p}
                    region={region}
                    navigate={navigate}
                    t={t}
                  />
                ))}
              </div>
            )}
          </div>
        </Panel>
      )}

      {!search && players.length > 0 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="border border-line px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
          >
            {t("leaderboard.previous")}
          </button>
          <span className="stat-value text-xs text-lo">{t("leaderboard.page", { page: page + 1 })}</span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            className="border border-line px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent"
          >
            {t("leaderboard.next")}
          </button>
        </div>
      )}
    </div>
  );
}

const GRID_COLUMNS = "grid grid-cols-[90px_1fr_180px_90px_90px] items-center";

type TFunc = TFunction<"competitive">;

function LeaderboardRow({
  player: p,
  region,
  navigate,
  t,
}: {
  player: LeaderboardPlayer;
  region: string;
  navigate: ReturnType<typeof useNavigate>;
  t: TFunc;
}) {
  const info = rankInfo(p.tier);
  return (
    <div
      className={`${GRID_COLUMNS} h-[45px] cursor-pointer text-hi/90 transition-colors hover:bg-raised/50`}
      onClick={() => !p.is_anonymized && navigate(`/joueur/${region}/${p.name}/${p.tag}`)}
    >
      <span className="stat-value px-4 text-lo">#{p.leaderboard_rank ?? "—"}</span>
      <div className="flex min-w-0 items-center gap-3 px-4">
        {p.card ? (
          <img
            src={playerCardIconUrl(p.card)}
            alt=""
            className="h-7 w-7 shrink-0 border border-line object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
            }}
          />
        ) : (
          <div className="h-7 w-7 shrink-0 border border-line bg-base" />
        )}
        <span className="truncate font-medium">
          {p.is_anonymized ? t("leaderboard.anonymousPlayer") : p.name}
          {!p.is_anonymized && <span className="text-lo">#{p.tag}</span>}
        </span>
        {p.is_banned && (
          <span className="shrink-0 border border-crit/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-crit">
            {t("leaderboard.banned")}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 px-4">
        <img src={rankIconUrl(p.tier ?? 0)} alt="" className="h-5 w-5" />
        <span className={`font-display text-xs font-semibold uppercase tracking-hud ${info.colorClass}`}>
          {info.name}
        </span>
      </div>
      <span className="stat-value px-4">{p.rr ?? "—"}</span>
      <span className="stat-value px-4">{p.wins ?? "—"}</span>
    </div>
  );
}

/** Backlog #83 : rendu de ligne pour `List` (react-window v2) — au-delà de
 * `VIRTUALIZE_THRESHOLD` joueurs, seules les lignes visibles à l'écran sont montées dans le
 * DOM, pour éviter le lag si `PAGE_SIZE` grossit un jour. */
function LeaderboardVirtualRow({
  index,
  style,
  players,
  region,
  navigate,
  t,
}: RowComponentProps<{
  players: LeaderboardPlayer[];
  region: string;
  navigate: ReturnType<typeof useNavigate>;
  t: TFunc;
}>) {
  const p = players[index];
  return (
    <div style={style} className="border-b border-line/60">
      <LeaderboardRow player={p} region={region} navigate={navigate} t={t} />
    </div>
  );
}
