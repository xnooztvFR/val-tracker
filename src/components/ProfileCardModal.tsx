import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import type { ProfileCardData } from "../lib/profileCard";
import { downloadDataUri } from "../lib/downloadFile";

const WIDTH = 900;
const HEIGHT = 506;
const CUT = 28;

// Palette lue depuis les variables CSS live, même approche que RecapCardModal.tsx (voir sa
// note) : image exportée/partagée mais qui doit désormais suivre le thème/accent choisi par
// l'utilisateur, avec les valeurs du thème HUD d'origine en repli si une variable est
// absente (le rendu canvas ne doit jamais planter pour ça).
const FALLBACK_COLORS = {
  base: "#0B0E11",
  line: "#22282F",
  accent: "#7CE8D3",
  hi: "#E8ECEF",
  lo: "#7A8590",
};

function cssVarColor(varName: string, fallbackHex: string): string {
  if (typeof window === "undefined") return fallbackHex;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!raw) return fallbackHex;
  const parts = raw.split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return fallbackHex;
  return `rgb(${parts[0]} ${parts[1]} ${parts[2]})`;
}

function resolvePalette() {
  return {
    base: cssVarColor("--base-rgb", FALLBACK_COLORS.base),
    line: cssVarColor("--line-rgb", FALLBACK_COLORS.line),
    accent: cssVarColor("--accent-rgb", FALLBACK_COLORS.accent),
    hi: cssVarColor("--hi-rgb", FALLBACK_COLORS.hi),
    lo: cssVarColor("--lo-rgb", FALLBACK_COLORS.lo),
  };
}

function drawClippedPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - CUT);
  ctx.lineTo(x + w - CUT, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

async function draw(canvas: HTMLCanvasElement, data: ProfileCardData, t: TFunction<"componentsExtra">) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  await document.fonts.ready.catch(() => {});

  const COLORS = resolvePalette();

  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawClippedPanel(ctx, 0, 0, WIDTH, HEIGHT, COLORS.base);

  ctx.fillStyle = data.rankColorHex;
  ctx.fillRect(0, 0, 6, HEIGHT);

  const pad = 56;

  ctx.font = '600 15px "JetBrains Mono", monospace';
  ctx.fillStyle = COLORS.accent;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("VAL // TRACKER", pad, 64);

  ctx.font = '600 15px "JetBrains Mono", monospace';
  ctx.fillStyle = COLORS.lo;
  const regionLabel = data.region.toUpperCase();
  const regionWidth = ctx.measureText(regionLabel).width;
  ctx.fillText(regionLabel, WIDTH - pad - regionWidth, 64);

  ctx.font = '700 48px "Chakra Petch", sans-serif';
  ctx.fillStyle = COLORS.hi;
  ctx.fillText(data.playerName, pad, 130);
  const nameWidth = ctx.measureText(data.playerName).width;
  ctx.font = '500 30px "Chakra Petch", sans-serif';
  ctx.fillStyle = COLORS.lo;
  ctx.fillText(`#${data.playerTag}`, pad + nameWidth + 6, 130);

  ctx.font = '700 26px "Chakra Petch", sans-serif';
  ctx.fillStyle = data.rankColorHex;
  const rankLine = data.rr != null ? `${data.rankLabel.toUpperCase()} · ${data.rr} RR` : data.rankLabel.toUpperCase();
  ctx.fillText(rankLine, pad, 172);

  drawClippedPanel(ctx, pad, 200, WIDTH - pad * 2, 1, COLORS.line);

  // Bloc de stats principales.
  const statsY = 280;
  const stats: [string, string][] = [
    [t("profileCardModal.stats.winrate"), `${Math.round(data.winPercent)}%`],
    [t("profileCardModal.stats.kd"), data.kd],
    [t("profileCardModal.stats.headshotPercent"), `${Math.round(data.hsPercent)}%`],
    [t("profileCardModal.stats.acs"), String(data.acs)],
  ];
  const blockWidth = (WIDTH - pad * 2) / stats.length;
  stats.forEach(([label, value], i) => {
    const x = pad + blockWidth * i;
    ctx.font = '700 44px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.hi;
    ctx.fillText(value, x, statsY);
    ctx.font = '600 13px "Chakra Petch", sans-serif';
    ctx.fillStyle = COLORS.lo;
    ctx.fillText(label.toUpperCase(), x, statsY + 24);
  });

  drawClippedPanel(ctx, pad, 320, WIDTH - pad * 2, 1, COLORS.line);

  // Ligne récap : bilan V/D + agent principal.
  ctx.font = '600 20px "Chakra Petch", sans-serif';
  ctx.fillStyle = COLORS.hi;
  const recordLine = t("profileCardModal.record", { wins: data.wins, losses: data.losses, played: data.played });
  ctx.fillText(recordLine, pad, 372);

  if (data.topAgentName) {
    ctx.font = '600 20px "Chakra Petch", sans-serif';
    ctx.fillStyle = COLORS.lo;
    const agentLine = t("profileCardModal.topAgent", { agent: data.topAgentName });
    const agentWidth = ctx.measureText(agentLine).width;
    ctx.fillText(agentLine, WIDTH - pad - agentWidth, 372);
  }

  ctx.font = '500 14px Inter, sans-serif';
  ctx.fillStyle = COLORS.lo;
  ctx.fillText(t("profileCardModal.footer"), pad, HEIGHT - 32);
}

interface ProfileCardModalProps {
  data: ProfileCardData;
  onClose: () => void;
}

/** Backlog #74 : export "carte de visite" du profil (au-delà du récap par match existant),
 * même pipeline canvas que RecapCardModal.tsx — rendu local, aucune image externe chargée,
 * copiable dans le presse-papiers ou téléchargeable en PNG. */
export default function ProfileCardModal({ data, onClose }: ProfileCardModalProps) {
  const { t } = useTranslation("componentsExtra");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "unsupported" | "error">("idle");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(canvas, data, t);
  }, [data, t]);

  async function handleCopy() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      setCopyState("unsupported");
      return;
    }
    canvas.toBlob(async (blob) => {
      if (!blob) {
        setCopyState("error");
        return;
      }
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setCopyState("copied");
        setTimeout(() => setCopyState("idle"), 2000);
      } catch {
        setCopyState("error");
      }
    }, "image/png");
  }

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    downloadDataUri(
      `valorant-tracker-${data.playerName.toLowerCase()}-${data.playerTag.toLowerCase()}.png`,
      canvas.toDataURL("image/png"),
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={onClose}
    >
      <div
        className="max-w-full space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          className="max-w-full border border-line"
          style={{ width: `min(${WIDTH}px, 90vw)`, height: "auto" }}
        />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="btn-clip bg-accent px-4 py-2 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-[#8FF0DE]"
          >
            {t("recapCardModal.copyImage")}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="border border-line px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent"
          >
            {t("recapCardModal.download")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-lo transition-colors hover:text-hi"
          >
            {t("recapCardModal.close")}
          </button>
        </div>
        {copyState === "copied" && (
          <p className="text-center text-sm text-accent">
            {t("recapCardModal.copied")}
          </p>
        )}
        {copyState === "unsupported" && (
          <p className="text-center text-sm text-lo">
            {t("recapCardModal.copyUnsupported")}
          </p>
        )}
        {copyState === "error" && (
          <p className="text-center text-sm text-crit">{t("recapCardModal.copyError")}</p>
        )}
      </div>
    </div>
  );
}
