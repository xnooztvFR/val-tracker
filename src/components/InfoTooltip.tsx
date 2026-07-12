import { useRef, useState } from "react";
import { createPortal } from "react-dom";

interface InfoTooltipProps {
  text: string;
}

const GAP = 6;
const WIDTH = 192;

/** Badge "?" discret révélant une explication au survol/focus, pour le jargon tracker
 * (ADR, HS%, first blood...). Rendu en portail (`document.body`, `position: fixed`) plutôt
 * qu'en `absolute` classique : les panneaux du design system (`.panel-clip`) appliquent un
 * `clip-path`, qui rogne tout contenu débordant de leur boîte — y compris une bulle
 * positionnée juste au-dessus de son déclencheur. Le portail échappe à ce rognage. */
export default function InfoTooltip({ text }: InfoTooltipProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2, WIDTH / 2 + 8),
      window.innerWidth - WIDTH / 2 - 8,
    );
    setPosition({ top: rect.top - GAP, left });
  };
  const hide = () => setPosition(null);

  return (
    <span className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        tabIndex={0}
        aria-label={text}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="hud-label flex h-3.5 w-3.5 items-center justify-center rounded-full border border-line text-[9px] leading-none text-lo transition-colors hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent focus-visible:outline-none"
      >
        ?
      </button>
      {position &&
        createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed z-50 border border-line bg-base p-2 text-left text-[11px] font-normal normal-case tracking-normal text-hi shadow-lg"
            style={{
              top: position.top,
              left: position.left,
              width: WIDTH,
              transform: "translate(-50%, -100%)",
            }}
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}
