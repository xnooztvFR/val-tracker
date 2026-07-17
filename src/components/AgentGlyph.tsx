import { agentRole, type AgentRole } from "../lib/agentRoles";

// TODO Design#2 : mêmes teintes que ACCENT_BY_ROLE (dynamicAccentStore.ts) — un seul système
// de couleur par rôle dans toute l'app, pas deux palettes à maintenir séparément.
const ROLE_COLOR: Record<AgentRole, string> = {
  Duelist: "#FF3B4E",
  Sentinel: "#7CE8D3",
  Controller: "#A672E0",
  Initiator: "#D4AF37",
};
const UNKNOWN_ROLE_COLOR = "#7A8590";

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (trimmed.length <= 2) return trimmed.toUpperCase();
  // "Kay/O" -> "KO", la plupart des autres noms sont un seul mot -> 2 premières lettres.
  const parts = trimmed.split(/[\s/]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

interface AgentGlyphProps {
  agentName: string | null | undefined;
  className?: string;
}

/** Backlog Design#2 : icône vectorielle maison d'agent — pas une reproduction des portraits
 * Riot (irréaliste à produire à la main avec une fidélité correcte, et hors de propos vis-à-
 * vis de leurs assets), un avatar géométrique abstrait (initiales + couleur de rôle, coin
 * coupé cohérent avec l'identité HUD) qui ne dépend d'aucun CDN externe. Alternative
 * opt-in à `agentIconUrl`/`agentPortraitUrl` via le réglage `icon_style` (Paramètres). */
export default function AgentGlyph({ agentName, className }: AgentGlyphProps) {
  const role = agentRole(agentName);
  const color = role ? ROLE_COLOR[role] : UNKNOWN_ROLE_COLOR;
  return (
    <div
      className={`flex shrink-0 items-center justify-center bg-surface font-display text-[11px] font-bold uppercase ${className ?? ""}`}
      style={{
        color,
        boxShadow: `inset 0 0 0 1px ${color}`,
        clipPath: "polygon(0 0, 100% 0, 100% 78%, 78% 100%, 0 100%)",
      }}
      title={agentName ?? undefined}
    >
      {initials(agentName)}
    </div>
  );
}
