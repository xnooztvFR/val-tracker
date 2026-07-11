import { useNavigate, useParams } from "react-router-dom";
import { Skeleton } from "../components/Skeleton";

import { useAccount } from "../hooks/usePlayer";
import { useMatches } from "../hooks/useMatches";
import MatchRow from "../components/MatchRow";
import ErrorState from "../components/ErrorState";
import StaleDataBanner from "../components/StaleDataBanner";
import EmptyState from "../components/EmptyState";
import { formatSessionHeader, groupMatchesIntoSessions } from "../lib/format";
import type { MatchEntry } from "../lib/tauriApi";

const MATCH_HISTORY_SIZE = 20;

function csvEscape(value: string | number): string {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Backlog #20 : export CSV/JSON de l'échantillon de matchs actuellement chargé. */
function exportMatches(matches: MatchEntry[], puuid: string, riotId: string, format: "csv" | "json") {
  if (format === "json") {
    const blob = new Blob([JSON.stringify(matches, null, 2)], { type: "application/json" });
    downloadBlob(blob, `matchs-${riotId}.json`);
    return;
  }

  const header = ["date", "carte", "agent", "resultat", "kills", "deaths", "assists", "score"];
  const rows = matches.map((match) => {
    const player = match.players.find((p) => p.puuid === puuid);
    const team = match.teams.find((t) => t.team_id === player?.team_id);
    const resultat = team?.won === true ? "victoire" : team?.won === false ? "defaite" : "";
    const stats = player?.stats;
    return [
      match.metadata.started_at ?? "",
      match.metadata.map?.name ?? "",
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
  const { region, name, tag } = useParams<{ region: string; name: string; tag: string }>();
  const navigate = useNavigate();

  const account = useAccount(name, tag);
  const matches = useMatches({ region, name, tag, size: MATCH_HISTORY_SIZE });

  const puuid = account.data?.data.puuid;
  const riotId = name && tag ? `${name}-${tag}` : "joueur";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="hud-label text-sm">
          Historique · {MATCH_HISTORY_SIZE} derniers engagements
        </h1>
        {matches.data && puuid && matches.data.data.length > 0 && (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => exportMatches(matches.data!.data, puuid, riotId, "csv")}
              className="hud-label border border-line px-2.5 py-1 text-[11px] text-lo transition-colors hover:border-accent hover:text-hi"
            >
              Exporter CSV
            </button>
            <button
              type="button"
              onClick={() => exportMatches(matches.data!.data, puuid, riotId, "json")}
              className="hud-label border border-line px-2.5 py-1 text-[11px] text-lo transition-colors hover:border-accent hover:text-hi"
            >
              Exporter JSON
            </button>
          </div>
        )}
      </div>

      {matches.isError && <ErrorState error={matches.error} />}
      {matches.data?.stale && <StaleDataBanner cachedAt={matches.data.cached_at} />}
      {matches.isLoading && <Skeleton className="h-32 w-full" />}

      {matches.data && puuid && (
        <div className="space-y-5">
          {matches.data.data.length === 0 && (
            <EmptyState
              icon="match"
              title="Aucun match compétitif trouvé"
              detail="Ce profil n'a pas d'historique compétitif sur cet échantillon."
            />
          )}
          {groupMatchesIntoSessions(matches.data.data, puuid).map((session, index) => (
            <div key={session.matches[0]?.metadata.match_id ?? index} className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="hud-label text-[11px] text-lo">
                  {formatSessionHeader(session.startedAt)} · {session.matches.length} match
                  {session.matches.length > 1 ? "s" : ""}
                </h2>
                <span className="stat-value text-[11px] text-lo">
                  {session.wins}V - {session.losses}D
                </span>
              </div>
              {session.matches.map((match) => (
                <MatchRow
                  key={match.metadata.match_id ?? Math.random()}
                  match={match}
                  puuid={puuid}
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
