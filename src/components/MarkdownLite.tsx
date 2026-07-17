import { Fragment } from "react";

interface MarkdownLiteProps {
  text: string;
  className?: string;
}

/** Rendu markdown minimal, sans dépendance externe, pour les notes de changelog
 * (`scripts/release.ps1` les rédige au format Keep a Changelog : `## Titre`, listes `-`,
 * `**gras**` — voir `scripts/generate-changelog-draft.ps1`). Volontairement limité aux
 * quelques constructions réellement utilisées dans ces notes plutôt qu'un parseur markdown
 * complet ; à étendre seulement si un nouveau format de note l'exige. */
function renderInline(line: string, keyPrefix: string) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g).filter((part) => part.length > 0);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold text-hi">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>;
  });
}

export default function MarkdownLite({ text, className = "" }: MarkdownLiteProps) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = (key: string) => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={key} className="ml-4 list-disc space-y-0.5">
        {listItems.map((item, i) => (
          <li key={i}>{renderInline(item, `${key}-li-${i}`)}</li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trimEnd();
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const bullet = line.match(/^[-*]\s+(.*)$/);

    if (heading) {
      flushList(`list-${idx}`);
      const level = heading[1].length;
      blocks.push(
        <p
          key={idx}
          className={level <= 2 ? "mt-3 font-display text-xs font-bold uppercase tracking-hud text-accent first:mt-0" : "mt-2 text-sm font-semibold text-hi first:mt-0"}
        >
          {renderInline(heading[2], `h-${idx}`)}
        </p>,
      );
      return;
    }

    if (bullet) {
      listItems.push(bullet[1]);
      return;
    }

    flushList(`list-${idx}`);

    if (line.trim().length === 0) return;

    blocks.push(
      <p key={idx} className="mt-1 first:mt-0">
        {renderInline(line, `p-${idx}`)}
      </p>,
    );
  });

  flushList("list-end");

  return <div className={className}>{blocks}</div>;
}
