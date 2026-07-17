import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Skeleton } from "../components/Skeleton";

import { useAccount, useMmr } from "../hooks/usePlayer";
import { useMatches, useAllMatchHighlights } from "../hooks/useMatches";
import MatchRow from "../components/MatchRow";
import ErrorState from "../components/ErrorState";
import StaleDataBanner from "../components/StaleDataBanner";
import EmptyState from "../components/EmptyState";
import { formatSessionHeader, groupMatchesIntoSessions, rankInfo } from "../lib/format";
import { downloadBlob } from "../lib/downloadFile";
import { computeOverview } from "../lib/stats";
import { buildPdfReport } from "../lib/pdfReport";
import i18n from "../i18n";
import type { MatchEntry, MatchHighlight } from "../lib/tauriApi";
import { useSavedViewsStore } from "../store/savedViewsStore";

const MATCH_HISTORY_SIZE = 20;

type ResultFilter = "all" | "win" | "loss";

function matchResult(match: MatchEntry, puuid: string): boolean | null | undefined {
  const player = match.players.find((p) => p.puuid === puuid);
  const team = match.teams.find((t) => t.team_id === player?.team_id);
  return team?.won;
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`hud-label whitespace-nowrap border px-2.5 py-1 text-[11px] transition-colors ${
        active
          ? "border-accent text-accent"
          : "border-line text-lo hover:border-accent hover:text-hi"
      }`}
    >
      {label}
    </button>
  );
}

function csvEscape(value: string | number): string {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** Backlog #20 : export CSV/JSON de l'échantillon de matchs actuellement chargé. */
function exportMatches(matches: MatchEntry[], puuid: string, riotId: string, format: "csv" | "json") {
  if (format === "json") {
    const blob = new Blob([JSON.stringify(matches, null, 2)], { type: "application/json" });
    downloadBlob(blob, `matchs-${riotId}.json`);
    return;
  }

  const header = [
    i18n.t("matches:history.csv.header.date"),
    i18n.t("matches:history.csv.header.map"),
    i18n.t("matches:history.csv.header.mode"),
    i18n.t("matches:history.csv.header.agent"),
    i18n.t("matches:history.csv.header.result"),
    i18n.t("matches:history.csv.header.kills"),
    i18n.t("matches:history.csv.header.deaths"),
    i18n.t("matches:history.csv.header.assists"),
    i18n.t("matches:history.csv.header.score"),
  ];
  const rows = matches.map((match) => {
    const player = match.players.find((p) => p.puuid === puuid);
    const team = match.teams.find((t) => t.team_id === player?.team_id);
    const resultat =
      team?.won === true
        ? i18n.t("matches:history.csv.result.win")
        : team?.won === false
          ? i18n.t("matches:history.csv.result.loss")
          : i18n.t("matches:history.csv.result.empty");
    const stats = player?.stats;
    return [
      match.metadata.started_at ?? "",
      match.metadata.map?.name ?? "",
      match.metadata.queue?.name ?? "",
      player?.agent?.name ?? "",
      resultat,
      stats?.kills ?? 0,
      stats?.deaths ?? 0,
      stats?.assists ?? 0,
      stats?.score ?? 0,
    ];
  });
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `matchs-${riotId}.csv`);
}

export default function MatchHistory() {
  const { t } = useTranslation("matches");
  const { region, name, tag } = useParams<{ region: string; name: string; tag: string }>();
  const navigate = useNavigate();

  const account = useAccount(name, tag);
  const matches = useMatches({ region, name, tag, size: MATCH_HISTORY_SIZE });

  const puuid = account.data?.data.puuid;
  const mmr = useMmr({ puuid, region, name, tag });
  const riotId = name && tag ? `${name}-${tag}` : "joueur";

  // TODO Fonctionnalités#4/#33 : badges clutch/multikill par ligne — best-effort, ne couvre
  // que les matchs déjà ouverts en détail (voir `useAllMatchHighlights`).
  const allHighlights = useAllMatchHighlights(puuid);
  const highlightsByMatch = useMemo(() => {
    const map = new Map<string, MatchHighlight[]>();
    for (const h of allHighlights.data ?? []) {
      const list = map.get(h.match_id) ?? [];
      list.push(h);
      map.set(h.match_id, list);
    }
    return map;
  }, [allHighlights.data]);

  function exportPdf() {
    if (!matches.data || !puuid || !region || !name || !tag) return;
    const overview = computeOverview(matches.data.data, puuid);
    const current = mmr.data?.data.current_data;
    const info = rankInfo(current?.currenttier);
    const doc = buildPdfReport({
      playerLabel: `${name}#${tag}`,
      region,
      rankName: current?.currenttierpatched || info.name,
      rr: current?.ranking_in_tier ?? null,
      overview,
      matches: matches.data.data,
      puuid,
    });
    doc.save(`rapport-${riotId}.pdf`);
  }

  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [mapFilter, setMapFilter] = useState<string | null>(null);
  const [modeFilter, setModeFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const savedViews = useSavedViewsStore((s) => s.views);
  const saveView = useSavedViewsStore((s) => s.save);
  const removeView = useSavedViewsStore((s) => s.remove);
  const [savingView, setSavingView] = useState(false);
  const [newViewName, setNewViewName] = useState("");

  function applyView(view: (typeof savedViews)[number]) {
    setResultFilter(view.resultFilter);
    setAgentFilter(view.agentFilter);
    setMapFilter(view.mapFilter);
    setModeFilter(view.modeFilter);
    setDateFrom(view.dateFrom);
    setDateTo(view.dateTo);
  }

  function confirmSaveView() {
    const name = newViewName.trim();
    if (!name) return;
    saveView({ name, resultFilter, agentFilter, mapFilter, modeFilter, dateFrom, dateTo });
    setNewViewName("");
    setSavingView(false);
  }

  const { agents, maps, modes } = useMemo(() => {
    const agentSet = new Map<string, string>();
    const mapSet = new Set<string>();
    const modeSet = new Set<string>();
    if (matches.data && puuid) {
      for (const match of matches.data.data) {
        const player = match.players.find((p) => p.puuid === puuid);
        if (player?.agent?.name) agentSet.set(player.agent.name, player.agent.name);
        if (match.metadata.map?.name) mapSet.add(match.metadata.map.name);
        if (match.metadata.queue?.name) modeSet.add(match.metadata.queue.name);
      }
    }
    return { agents: [...agentSet.keys()].sort(), maps: [...mapSet].sort(), modes: [...modeSet].sort() };
  }, [matches.data, puuid]);

  const filteredMatches = useMemo(() => {
    if (!matches.data || !puuid) return [];
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo ? new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1 : null;
    return matches.data.data.filter((match) => {
      if (resultFilter !== "all") {
        const won = matchResult(match, puuid);
        if (resultFilter === "win" && won !== true) return false;
        if (resultFilter === "loss" && won !== false) return false;
      }
      if (agentFilter) {
        const player = match.players.find((p) => p.puuid === puuid);
        if (player?.agent?.name !== agentFilter) return false;
      }
      if (mapFilter && match.metadata.map?.name !== mapFilter) return false;
      if (modeFilter && match.metadata.queue?.name !== modeFilter) return false;
      if (fromTs !== null || toTs !== null) {
        const startedAt = match.metadata.started_at ? new Date(match.metadata.started_at).getTime() : null;
        if (startedAt === null) return false;
        if (fromTs !== null && startedAt < fromTs) return false;
        if (toTs !== null && startedAt > toTs) return false;
      }
      return true;
    });
  }, [matches.data, puuid, resultFilter, agentFilter, mapFilter, modeFilter, dateFrom, dateTo]);

  const hasActiveFilters =
    resultFilter !== "all" ||
    agentFilter !== null ||
    mapFilter !== null ||
    modeFilter !== null ||
    dateFrom !== "" ||
    dateTo !== "";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="hud-label text-sm">
            {t("history.title", { count: MATCH_HISTORY_SIZE })}
          </h1>
          {matches.data && puuid && matches.data.data.length > 0 && (
            <p className="mt-0.5 text-[10px] text-lo/60">{t("history.dragHint")}</p>
          )}
        </div>
        {matches.data && puuid && matches.data.data.length > 0 && (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => exportMatches(matches.data!.data, puuid, riotId, "csv")}
              className="hud-label border border-line px-2.5 py-1 text-[11px] text-lo transition-colors hover:border-accent hover:text-hi"
            >
              {t("history.exportCsv")}
            </button>
            <button
              type="button"
              onClick={() => exportMatches(matches.data!.data, puuid, riotId, "json")}
              className="hud-label border border-line px-2.5 py-1 text-[11px] text-lo transition-colors hover:border-accent hover:text-hi"
            >
              {t("history.exportJson")}
            </button>
            <button
              type="button"
              onClick={exportPdf}
              className="hud-label border border-line px-2.5 py-1 text-[11px] text-lo transition-colors hover:border-accent hover:text-hi"
            >
              {t("history.exportPdf")}
            </button>
          </div>
        )}
      </div>

      {matches.isError && <ErrorState error={matches.error} />}
      {matches.data?.stale && <StaleDataBanner cachedAt={matches.data.cached_at} />}
      {matches.isLoading && <Skeleton className="h-32 w-full" />}

      {savedViews.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="hud-label text-[11px] text-lo">{t("history.savedViews.title")}</span>
          {savedViews.map((view) => (
            <span
              key={view.id}
              className="panel-clip-sm flex items-center gap-1 border border-line py-1 pl-2.5 pr-1 text-[11px] text-lo transition-colors hover:border-accent hover:text-hi"
            >
              <button type="button" onClick={() => applyView(view)}>
                {view.name}
              </button>
              <button
                type="button"
                onClick={() => removeView(view.id)}
                aria-label={t("history.savedViews.remove")}
                className="flex h-4 w-4 items-center justify-center text-lo/60 hover:text-crit"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {matches.data && puuid && matches.data.data.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            label={t("history.filters.resultAll")}
            active={resultFilter === "all"}
            onClick={() => setResultFilter("all")}
          />
          <Chip
            label={t("history.filters.resultWin")}
            active={resultFilter === "win"}
            onClick={() => setResultFilter((f) => (f === "win" ? "all" : "win"))}
          />
          <Chip
            label={t("history.filters.resultLoss")}
            active={resultFilter === "loss"}
            onClick={() => setResultFilter((f) => (f === "loss" ? "all" : "loss"))}
          />
          <span className="mx-1 h-4 w-px bg-line" />
          {agents.map((agent) => (
            <Chip
              key={agent}
              label={agent}
              active={agentFilter === agent}
              onClick={() => setAgentFilter((a) => (a === agent ? null : agent))}
            />
          ))}
          <span className="mx-1 h-4 w-px bg-line" />
          {maps.map((mapName) => (
            <Chip
              key={mapName}
              label={mapName}
              active={mapFilter === mapName}
              onClick={() => setMapFilter((m) => (m === mapName ? null : mapName))}
            />
          ))}
          {modes.length > 1 && (
            <>
              <span className="mx-1 h-4 w-px bg-line" />
              {modes.map((mode) => (
                <Chip
                  key={mode}
                  label={mode}
                  active={modeFilter === mode}
                  onClick={() => setModeFilter((m) => (m === mode ? null : mode))}
                />
              ))}
            </>
          )}
          <span className="mx-1 h-4 w-px bg-line" />
          <label className="hud-label flex items-center gap-1 text-[11px] text-lo">
            {t("history.filters.dateFrom")}
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-line bg-transparent px-1.5 py-0.5 text-hi"
            />
          </label>
          <label className="hud-label flex items-center gap-1 text-[11px] text-lo">
            {t("history.filters.dateTo")}
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-line bg-transparent px-1.5 py-0.5 text-hi"
            />
          </label>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setResultFilter("all");
                setAgentFilter(null);
                setMapFilter(null);
                setModeFilter(null);
                setDateFrom("");
                setDateTo("");
              }}
              className="hud-label whitespace-nowrap px-2 py-1 text-[11px] text-lo underline decoration-dotted hover:text-hi"
            >
              {t("history.filters.reset")}
            </button>
          )}
          {hasActiveFilters && !savingView && (
            <button
              type="button"
              onClick={() => setSavingView(true)}
              className="hud-label whitespace-nowrap border border-line px-2.5 py-1 text-[11px] text-lo transition-colors hover:border-accent hover:text-hi"
            >
              {t("history.savedViews.save")}
            </button>
          )}
          {savingView && (
            <span className="flex items-center gap-1.5">
              <input
                autoFocus
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmSaveView();
                  if (e.key === "Escape") setSavingView(false);
                }}
                placeholder={t("history.savedViews.namePlaceholder")}
                className="w-36 border border-line bg-transparent px-1.5 py-0.5 text-[11px] text-hi focus:outline-none"
              />
              <button
                type="button"
                onClick={confirmSaveView}
                className="hud-label px-2 py-1 text-[11px] text-accent hover:text-hi"
              >
                {t("history.savedViews.confirm")}
              </button>
            </span>
          )}
        </div>
      )}

      {matches.data && puuid && (
        <div className="space-y-5">
          {matches.data.data.length === 0 && (
            <EmptyState
              icon="match"
              title={t("history.empty.title")}
              detail={t("history.empty.detail")}
            />
          )}
          {matches.data.data.length > 0 && filteredMatches.length === 0 && (
            <EmptyState
              icon="match"
              title={t("history.filters.noMatch.title")}
              detail={t("history.filters.noMatch.detail")}
            />
          )}
          {groupMatchesIntoSessions(filteredMatches, puuid).map((session, index) => (
            <div key={session.matches[0]?.metadata.match_id ?? index} className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="hud-label text-[11px] text-lo">
                  {formatSessionHeader(session.startedAt)} ·{" "}
                  {t("history.session.matchCount", { count: session.matches.length })}
                </h2>
                <span className="stat-value text-[11px] text-lo">
                  {t("history.session.record", { wins: session.wins, losses: session.losses })}
                </span>
              </div>
              {session.matches.map((match) => (
                <MatchRow
                  key={match.metadata.match_id ?? Math.random()}
                  match={match}
                  puuid={puuid}
                  region={region}
                  name={name}
                  tag={tag}
                  highlights={match.metadata.match_id ? highlightsByMatch.get(match.metadata.match_id) : undefined}
                  onClick={() =>
                    match.metadata.match_id &&
                    navigate(`/joueur/${region}/${name}/${tag}/matchs/${match.metadata.match_id}`)
                  }
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
