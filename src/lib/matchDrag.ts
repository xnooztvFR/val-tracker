// TODO Fonctionnalités#6 : glisser-déposer un match depuis l'historique vers Compare (/vs)
// ou vers un profil épinglé (ajout d'une référence dans ses notes) — type MIME dédié + payload
// partagés entre la source (MatchRow.tsx) et les cibles (TopNav.tsx, FloatingSessionTabs.tsx).

export const MATCH_DRAG_MIME = "application/x-vt-match";

export interface MatchDragPayload {
  matchId: string;
  mapName: string;
  region: string;
  name: string;
  tag: string;
}

export function setMatchDragPayload(dataTransfer: DataTransfer, payload: MatchDragPayload) {
  dataTransfer.setData(MATCH_DRAG_MIME, JSON.stringify(payload));
  dataTransfer.effectAllowed = "copy";
}

/** `dataTransfer.getData` n'est lisible que dans `onDrop` (pas `onDragOver`, restriction du
 * navigateur pour des raisons de sécurité) — les cibles ne peuvent donc pas afficher un état
 * "survol valide" différencié avant le drop effectif. */
export function readMatchDragPayload(dataTransfer: DataTransfer): MatchDragPayload | null {
  try {
    const raw = dataTransfer.getData(MATCH_DRAG_MIME);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.matchId === "string" &&
      typeof parsed.region === "string" &&
      typeof parsed.name === "string" &&
      typeof parsed.tag === "string"
    ) {
      return parsed as MatchDragPayload;
    }
    return null;
  } catch {
    return null;
  }
}
