import { useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useTranslation } from "react-i18next";

interface CopyButtonProps {
  text: string;
  /** Libellé accessible (aria-label/title) — décrit ce qui est copié, ex. "Copier le Riot ID". */
  label: string;
  className?: string;
}

const FEEDBACK_MS = 1500;

/** Bouton "copier" générique (presse-papiers OS via tauri-plugin-clipboard-manager),
 * bascule brièvement vers une icône de confirmation après le clic. */
export default function CopyButton({ text, label, className = "" }: CopyButtonProps) {
  const { t } = useTranslation("componentsExtra");
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      await writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), FEEDBACK_MS);
    } catch {
      // Best-effort : le presse-papiers OS peut être indisponible (permission refusée,
      // environnement restreint) — on ignore silencieusement, pas de retour à l'utilisateur
      // au-delà de l'absence du check de confirmation.
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      title={copied ? t("copyButton.copied") : label}
      className={`flex h-5 w-5 shrink-0 items-center justify-center text-lo transition-colors hover:text-accent ${className}`}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
      <rect x="7" y="7" width="10" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M13 7V4.5A1.5 1.5 0 0011.5 3H4.5A1.5 1.5 0 003 4.5v7A1.5 1.5 0 004.5 13H7" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 text-accent">
      <path d="M4 10.5l3.5 3.5L16 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
