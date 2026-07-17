import ReactMarkdown from "react-markdown";

interface MarkdownLiteProps {
  text: string;
  className?: string;
}

/** Rendu markdown des notes de changelog (`scripts/release.ps1` les rédige au format
 * Keep a Changelog : `## Titre`, listes `-`, `**gras**`, texte enveloppé sur plusieurs
 * lignes — voir `scripts/generate-changelog-draft.ps1`). Délègue à `react-markdown` (pas
 * de `dangerouslySetInnerHTML`, rendu en éléments React) plutôt qu'un parseur ligne à
 * ligne maison : un parseur ligne à ligne casse dès qu'un item de liste s'étale sur
 * plusieurs lignes source (cas courant ici, les .md de notes sont enveloppés à ~78
 * caractères), le texte de continuation ressortant comme un paragraphe orphelin hors de
 * la liste. */
export default function MarkdownLite({ text, className = "" }: MarkdownLiteProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <p className="mt-3 font-display text-xs font-bold uppercase tracking-hud text-accent first:mt-0">
              {children}
            </p>
          ),
          h2: ({ children }) => (
            <p className="mt-3 font-display text-xs font-bold uppercase tracking-hud text-accent first:mt-0">
              {children}
            </p>
          ),
          h3: ({ children }) => <p className="mt-2 text-sm font-semibold text-hi first:mt-0">{children}</p>,
          p: ({ children }) => <p className="mt-1 first:mt-0">{children}</p>,
          ul: ({ children }) => <ul className="ml-4 mt-1 list-disc space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="ml-4 mt-1 list-decimal space-y-0.5">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-hi">{children}</strong>,
          a: ({ children, href }) => (
            <a href={href} className="text-accent underline" target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
