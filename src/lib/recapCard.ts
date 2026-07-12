import { rankGlowColor, rankInfo } from "./format";
import i18n from "../i18n";
import type { MatchDetailData } from "./tauriApi";

// Données d'une carte de recap partageable (V3) — dérivées de MatchDetailData déjà
// chargé (aucun appel réseau). Le rendu canvas lui-même vit dans
// components/RecapCardModal.tsx ; ce module ne fait que la partie testable (extraction
// des données), pas le dessin.

export interface MatchRecapData {
  map: string;
  mode: string;
  playerName: string;
  playerTag: string;
  won: boolean;
  scoreFor: number;
  scoreAgainst: number;
  kills: number;
  deaths: number;
  assists: number;
  rankLabel: string | null;
  rankColorHex: string | null;
}

/** `null` si le joueur n'est pas trouvé dans ce match. */
export function buildMatchRecapData(data: MatchDetailData, puuid: string): MatchRecapData | null {
  const me = data.players.all_players.find((p) => p.puuid === puuid);
  if (!me) return null;

  const isBlue = me.team.toLowerCase() === "blue";
  const myTeam = isBlue ? data.teams.blue : data.teams.red;
  const oppTeam = isBlue ? data.teams.red : data.teams.blue;

  return {
    map: data.metadata.map ?? i18n.t("matches:recap.unknownMap"),
    mode: data.metadata.mode ?? i18n.t("matches:recap.defaultMode"),
    playerName: me.name,
    playerTag: me.tag,
    won: myTeam?.has_won ?? false,
    scoreFor: myTeam?.rounds_won ?? 0,
    scoreAgainst: oppTeam?.rounds_won ?? 0,
    kills: me.stats?.kills ?? 0,
    deaths: me.stats?.deaths ?? 0,
    assists: me.stats?.assists ?? 0,
    rankLabel: me.currenttier != null ? rankInfo(me.currenttier).name : null,
    rankColorHex: me.currenttier != null ? rankGlowColor(me.currenttier) : null,
  };
}
