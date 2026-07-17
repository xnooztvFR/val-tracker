import { useSettingsStore } from "../store/settingsStore";
import { agentIconUrl, agentPortraitUrl } from "../lib/format";
import AgentGlyph from "./AgentGlyph";

interface AgentIconProps {
  agentId: string | null | undefined;
  agentName: string | null | undefined;
  className?: string;
  /** `"portrait"` utilise le buste CDN (agentPortraitUrl) plutôt que l'icône carrée
   * (agentIconUrl) en mode "official" — sans effet en mode "vector" (même glyph). */
  variant?: "icon" | "portrait";
}

/** Bascule entre l'icône CDN officielle (`media.valorant-api.com`, défaut) et l'icône
 * vectorielle maison (`AgentGlyph`, réglage `icon_style: "vector"`) — un seul point de
 * décision réutilisé partout où l'app affichait jusqu'ici `agentIconUrl`/`agentPortraitUrl`
 * en dur (Agents.tsx, MatchRow.tsx, HomeOverviewSection.tsx). */
export default function AgentIcon({ agentId, agentName, className, variant = "icon" }: AgentIconProps) {
  const iconStyle = useSettingsStore((s) => s.settings?.icon_style ?? "official");

  if (iconStyle === "vector" || !agentId) {
    return <AgentGlyph agentName={agentName} className={className} />;
  }

  const src = variant === "portrait" ? agentPortraitUrl(agentId) : agentIconUrl(agentId);
  return (
    <img
      src={src}
      alt={agentName ?? ""}
      className={className}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
      }}
    />
  );
}
