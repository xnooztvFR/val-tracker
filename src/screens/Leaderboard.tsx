import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useLeaderboard } from "../hooks/useMeta";
import ErrorState from "../components/ErrorState";
import StaleDataBanner from "../components/StaleDataBanner";
import Panel from "../components/Panel";
import { playerCardIconUrl, rankIconUrl, rankInfo, REGIONS, splitRiotId } from "../lib/format";

const PAGE_SIZE = 50;

export default function Leaderboard() {
  const [region, setRegion] = useState<(typeof REGIONS)[number]["value"]>("eu");
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

  function handleRegionChange(value: (typeof REGIONS)[number]["value"]) {
    setRegion(value);
    setPage(0);
    setSearch(null);
    setSearchInput("");
  }

  const players = leaderboard.data?.data.players ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="hud-label text-sm">Classement compétitif</h1>
        <div className="flex items-center gap-2">
          <select
            value={region}
            onChange={(e) => handleRegionChange(e.target.value as (typeof REGIONS)[number]["value"])}
            className="border border-line bg-surface px-3 py-1.5 text-sm text-hi focus:border-accent focus:outline-none"
          >
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Pseudo#Tag"
              className="w-40 border border-line bg-surface px-3 py-1.5 text-sm text-hi placeholder:text-lo/60 focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              className="border border-line px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent"
            >
              Localiser
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
                Réinitialiser
              </button>
            )}
          </form>
        </div>
      </div>

      {leaderboard.isError && <ErrorState error={leaderboard.error} />}
      {leaderboard.data?.stale && <StaleDataBanner cachedAt={leaderboard.data.cached_at} />}
      {leaderboard.isLoading && <p className="text-sm text-lo">Chargement…</p>}

      {leaderboard.data?.data.updated_at && (
        <p className="text-xs text-lo">
          Mis à jour : {new Date(leaderboard.data.data.updated_at).toLocaleString("fr-FR")}
        </p>
      )}

      {players.length > 0 && (
        <Panel className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left">
              <tr>
                <th className="hud-label px-4 py-3 font-semibold">Rang</th>
                <th className="hud-label px-4 py-3 font-semibold">Joueur</th>
                <th className="hud-label px-4 py-3 font-semibold">Tier</th>
                <th className="hud-label px-4 py-3 font-semibold">RR</th>
                <th className="hud-label px-4 py-3 font-semibold">Victoires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {players.map((p) => {
                const info = rankInfo(p.tier);
                return (
                  <tr
                    key={`${p.leaderboard_rank}-${p.name}`}
                    className="cursor-pointer text-hi/90 transition-colors hover:bg-raised/50"
                    onClick={() => !p.is_anonymized && navigate(`/joueur/${region}/${p.name}/${p.tag}`)}
                  >
                    <td className="stat-value px-4 py-2.5 text-lo">#{p.leaderboard_rank ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        {p.card ? (
                          <img
                            src={playerCardIconUrl(p.card)}
                            alt=""
                            className="h-7 w-7 border border-line object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                            }}
                          />
                        ) : (
                          <div className="h-7 w-7 border border-line bg-base" />
                        )}
                        <span className="font-medium">
                          {p.is_anonymized ? "Joueur anonyme" : p.name}
                          {!p.is_anonymized && <span className="text-lo">#{p.tag}</span>}
                        </span>
                        {p.is_banned && (
                          <span className="border border-crit/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-crit">
                            Banni
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <img src={rankIconUrl(p.tier ?? 0)} alt="" className="h-5 w-5" />
                        <span className={`font-display text-xs font-semibold uppercase tracking-hud ${info.colorClass}`}>
                          {info.name}
                        </span>
                      </div>
                    </td>
                    <td className="stat-value px-4 py-2.5">{p.rr ?? "—"}</td>
                    <td className="stat-value px-4 py-2.5">{p.wins ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
            Précédent
          </button>
          <span className="stat-value text-xs text-lo">Page {page + 1}</span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            className="border border-line px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent"
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}
