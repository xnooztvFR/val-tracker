// TODO stats & analyse joueur : export CSV/JSON des stats locales depuis Paramètres →
// Données locales. Assemblé côté frontend à partir de commandes déjà exposées (aucune
// nouvelle commande Tauri nécessaire) : joueurs suivis (favoris/notes/tags), rank_snapshots
// et duo/squad/rivalité pour les comptes "à soi" uniquement (éviter une explosion
// combinatoire si l'utilisateur a suivi des centaines de profils tiers).

import { tauriApi, type DuoStat, type RankSnapshot, type RivalryStat, type SquadStat, type TrackedPlayer } from "./tauriApi";

export interface LocalStatsExport {
  exported_at: string;
  tracked_players: TrackedPlayer[];
  self_accounts: {
    puuid: string;
    name: string;
    tag: string;
    rank_snapshots: RankSnapshot[];
    duo_stats: DuoStat[];
    squad_stats: SquadStat[];
    rivalry_stats: RivalryStat[];
  }[];
}

export async function buildLocalStatsExport(): Promise<LocalStatsExport> {
  const trackedPlayers = await tauriApi.listTrackedPlayers(1000);
  const selfAccounts = await tauriApi.listSelfAccounts();

  const selfAccountDetails = await Promise.all(
    selfAccounts.map(async (account) => ({
      puuid: account.puuid,
      name: account.name,
      tag: account.tag,
      rank_snapshots: await tauriApi.listRankSnapshots(account.puuid),
      duo_stats: await tauriApi.listDuoStats(account.puuid, 1),
      squad_stats: await tauriApi.listSquadStats(account.puuid, 1),
      rivalry_stats: await tauriApi.listRivalryStats(account.puuid, 1),
    })),
  );

  return {
    exported_at: new Date().toISOString(),
    tracked_players: trackedPlayers,
    self_accounts: selfAccountDetails,
  };
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function csvRow(values: (string | number | boolean | null)[]): string {
  return values.map((v) => csvEscape(v === null ? "" : String(v))).join(",");
}

/** Volontairement limité aux joueurs suivis (une ligne par joueur) : les autres données
 * (rank_snapshots, duo/squad/rivalité) sont des séries temporelles ou des paires imbriquées
 * qui ne se prêtent pas à un tableau plat unique — disponibles dans l'export JSON complet. */
export function toCsv(data: LocalStatsExport): string {
  const header = csvRow([
    "puuid",
    "name",
    "tag",
    "region",
    "is_favorite",
    "is_self",
    "notes",
    "tags",
    "last_viewed_at",
  ]);
  const rows = data.tracked_players.map((p) =>
    csvRow([p.puuid, p.name, p.tag, p.region, p.is_favorite, p.is_self, p.notes, p.tags.join("|"), p.last_viewed_at]),
  );
  return [header, ...rows].join("\n");
}

export function toJson(data: LocalStatsExport): string {
  return JSON.stringify(data, null, 2);
}
