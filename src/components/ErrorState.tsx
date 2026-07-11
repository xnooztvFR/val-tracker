import { Link } from "react-router-dom";

import { isCommandError, type CommandError } from "../lib/tauriApi";

interface ErrorStateProps {
  error: unknown;
}

function messageFor(error: CommandError): { title: string; detail?: string; showSettingsLink?: boolean } {
  switch (error.kind) {
    case "missing_api_key":
      return {
        title: "Aucune clé API Henrik configurée.",
        showSettingsLink: true,
      };
    case "not_found":
      return { title: "Joueur introuvable, vérifie le pseudo#tag et la région." };
    case "rate_limited":
      return {
        title: error.retry_after_secs
          ? `Trop de requêtes, réessaie dans ${error.retry_after_secs}s.`
          : "Trop de requêtes, réessaie dans quelques instants.",
      };
    case "circuit_open":
      return { title: "Trop d'échecs récents vers l'API Henrik, réessaie dans quelques instants." };
    case "network":
      return { title: "Panne réseau — impossible de contacter l'API Henrik." };
    case "api":
      return { title: `Erreur API Henrik (${error.status}).`, detail: error.message || undefined };
    case "database":
    case "unknown":
      return { title: "Une erreur inattendue est survenue.", detail: error.message };
  }
}

export default function ErrorState({ error }: ErrorStateProps) {
  if (!error) return null;

  const cmdError = isCommandError(error) ? error : null;
  const { title, detail, showSettingsLink } = cmdError
    ? messageFor(cmdError)
    : { title: "Une erreur inattendue est survenue.", detail: undefined, showSettingsLink: false };

  return (
    <div className="relative border border-crit/30 bg-crit/5 py-3 pl-4 pr-3 text-sm text-hi">
      <span className="absolute inset-y-0 left-0 w-[3px] bg-crit" />
      <p className="hud-label !text-crit">Alerte</p>
      <p className="mt-1">{title}</p>
      {detail && <p className="mt-1 font-mono text-xs text-lo">{detail}</p>}
      {showSettingsLink && (
        <Link to="/parametres" className="mt-2 inline-block text-accent underline underline-offset-2">
          Aller aux paramètres
        </Link>
      )}
    </div>
  );
}
