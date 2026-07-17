// TODO Social/multi-comptes#2/#37/#38/#39 : export lecture-seule partageable — un fichier
// JSON autonome qu'un ami peut ouvrir dans l'app (écran `SharedImport.tsx`) sans jamais avoir
// besoin de sa propre clé API Henrik : toutes les données affichées sont déjà embarquées dans
// le fichier au moment de l'export, aucun appel réseau ni `invoke()` ne se produit à
// l'ouverture. Même esprit que `exportLocalStats.ts` (assemblé côté frontend depuis des
// commandes déjà exposées), mais orienté "à partager" plutôt que "sauvegarde perso" :
// - `PlayerCardExport` : la carte d'un seul compte (profil + stats + moments forts).
// - `GroupSessionExport` : carnet de session d'une soirée à plusieurs comptes suivis.
// Les deux embarquent `duo_stats`/`squad_stats`/`rivalry_stats` (déjà calculés localement,
// voir db/party.rs) pour permettre à qui reçoit le fichier de croiser "on a joué ensemble X
// fois" contre ses propres comptes (voir `SharedImport.tsx`).

import { tauriApi, type DuoStat, type MatchHighlight, type MatchNote, type RivalryStat, type SquadStat } from "./tauriApi";
import type { TrackerScoreResult } from "./tauriApi";
import { computeOverview, computeTodayStats, type Overview, type WeeklyMatchStats } from "./stats";

export const SHARE_EXPORT_VERSION = 1;

export interface PlayerCardExport {
  kind: "player_card";
  version: number;
  exported_at: string;
  puuid: string;
  name: string;
  tag: string;
  region: string;
  current_tier: number | null;
  current_tier_patched: string | null;
  rr: number | null;
  overview: Overview;
  tracker_score: TrackerScoreResult | null;
  highlights: MatchHighlight[];
  duo_stats: DuoStat[];
  squad_stats: SquadStat[];
  rivalry_stats: RivalryStat[];
  /** Vide si l'utilisateur n'a pas explicitement coché "inclure mes notes" à l'export — les
   * notes de match sont un texte libre potentiellement sensible, jamais incluses par défaut. */
  match_notes: MatchNote[];
}

export interface GroupSessionAccountSummary {
  puuid: string;
  name: string;
  tag: string;
  region: string;
  current_tier: number | null;
  current_tier_patched: string | null;
  rr: number | null;
  today: WeeklyMatchStats;
}

export interface GroupSessionExport {
  kind: "group_session";
  version: number;
  exported_at: string;
  accounts: GroupSessionAccountSummary[];
}

export type ShareExport = PlayerCardExport | GroupSessionExport;

export async function buildPlayerCardExport(params: {
  puuid: string;
  name: string;
  tag: string;
  region: string;
  includeMatchNotes: boolean;
}): Promise<PlayerCardExport> {
  const { puuid, name, tag, region, includeMatchNotes } = params;

  const [mmr, matches, highlights, duoStats, squadStats, rivalryStats] = await Promise.all([
    tauriApi.fetchMmrByPuuid(puuid, region).catch(() => null),
    tauriApi.fetchMatches(region, name, tag, 20).catch(() => null),
    tauriApi.getAllMatchHighlights(puuid).catch(() => []),
    tauriApi.listDuoStats(puuid, 1).catch(() => []),
    tauriApi.listSquadStats(puuid, 1).catch(() => []),
    tauriApi.listRivalryStats(puuid, 1).catch(() => []),
  ]);

  const current = mmr?.data.current_data;
  const matchList = matches?.data ?? [];
  const overview = computeOverview(matchList, puuid);

  let trackerScore: TrackerScoreResult | null = null;
  try {
    trackerScore = await tauriApi.getTrackerScore(puuid, region, name, tag, current?.currenttier ?? null);
  } catch {
    trackerScore = null;
  }

  let matchNotes: MatchNote[] = [];
  if (includeMatchNotes) {
    const matchIds = matchList.map((m) => m.metadata.match_id).filter((id): id is string => Boolean(id));
    const notesLists = await Promise.all(matchIds.map((id) => tauriApi.listMatchNotes(id, puuid).catch(() => [])));
    matchNotes = notesLists.flat();
  }

  return {
    kind: "player_card",
    version: SHARE_EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    puuid,
    name,
    tag,
    region,
    current_tier: current?.currenttier ?? null,
    current_tier_patched: current?.currenttierpatched ?? null,
    rr: current?.ranking_in_tier ?? null,
    overview,
    tracker_score: trackerScore,
    highlights,
    duo_stats: duoStats,
    squad_stats: squadStats,
    rivalry_stats: rivalryStats,
    match_notes: matchNotes,
  };
}

export async function buildGroupSessionExport(
  accounts: { puuid: string; name: string; tag: string; region: string }[],
): Promise<GroupSessionExport> {
  const summaries = await Promise.all(
    accounts.map(async (acc): Promise<GroupSessionAccountSummary> => {
      const [mmr, matches] = await Promise.all([
        tauriApi.fetchMmrByPuuid(acc.puuid, acc.region).catch(() => null),
        tauriApi.fetchMatches(acc.region, acc.name, acc.tag, 20).catch(() => null),
      ]);
      const current = mmr?.data.current_data;
      const today = computeTodayStats(matches?.data ?? [], acc.puuid);
      return {
        puuid: acc.puuid,
        name: acc.name,
        tag: acc.tag,
        region: acc.region,
        current_tier: current?.currenttier ?? null,
        current_tier_patched: current?.currenttierpatched ?? null,
        rr: current?.ranking_in_tier ?? null,
        today,
      };
    }),
  );

  return {
    kind: "group_session",
    version: SHARE_EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    accounts: summaries,
  };
}

/** Validation défensive à l'import : un fichier partagé vient d'un tiers (voire d'une future
 * version de l'app) — on ne fait confiance qu'à la forme minimale nécessaire pour distinguer
 * les deux types, jamais un simple cast. Retourne `null` plutôt que de lever, pour un message
 * d'erreur générique côté UI ("fichier invalide") sans détail d'implémentation. */
export function parseShareExport(raw: unknown): ShareExport | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.kind === "player_card" && typeof obj.puuid === "string" && typeof obj.name === "string") {
    return obj as unknown as PlayerCardExport;
  }
  if (obj.kind === "group_session" && Array.isArray(obj.accounts)) {
    return obj as unknown as GroupSessionExport;
  }
  return null;
}
