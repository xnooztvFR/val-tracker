import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { PeriodRecap } from "../lib/stats";
import { formatPercent, rankGlowColor } from "../lib/format";
import { downloadDataUri } from "../lib/downloadFile";
import i18n from "../i18n";

const WIDTH = 900;
const HEIGHT = 560;
const CUT = 28;

// Palette lue depuis les variables CSS live (voir `:root`/`[data-theme]`/`[data-accent]`
// dans index.css) pour que la carte exportée reflète le thème/accent réellement choisi par
// l'utilisateur au moment de l'export, avec les valeurs par défaut du thème HUD d'origine en
// repli si une variable est absente (le rendu canvas ne doit jamais planter pour ça).
const FALLBACK_COLORS = {
  base: "#0B0E11",
  surface: "#12161B",
  line: "#22282F",
  accent: "#7CE8D3",
  crit: "#C4646E",
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
    surface: cssVarColor("--surface-rgb", FALLBACK_COLORS.surface),
    line: cssVarColor("--line-rgb", FALLBACK_COLORS.line),
    accent: cssVarColor("--accent-rgb", FALLBACK_COLORS.accent),
    crit: cssVarColor("--crit-rgb", FALLBACK_COLORS.crit),
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

async function draw(canvas: HTMLCanvasElement, recap: PeriodRecap, playerLabel: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  await document.fonts.ready.catch(() => {});

  const COLORS = resolvePalette();

  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawClippedPanel(ctx, 0, 0, WIDTH, HEIGHT, COLORS.base);

  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(0, 0, 6, HEIGHT);

  const pad = 56;

  ctx.font = '600 15px "JetBrains Mono", monospace';
  ctx.fillStyle = COLORS.accent;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("VAL // TRACKER", pad, 64);

  const periodLabel =
    recap.period === "week"
      ? i18n.t("componentsExtra:periodRecapModal.weekTitle")
      : recap.period === "month"
        ? i18n.t("componentsExtra:periodRecapModal.monthTitle")
        : i18n.t("componentsExtra:periodRecapModal.sessionTitle");
  ctx.font = '700 20px "Chakra Petch", sans-serif';
  ctx.fillStyle = COLORS.hi;
  const labelWidth = ctx.measureText(periodLabel).width;
  ctx.fillText(periodLabel, WIDTH - pad - labelWidth, 64);

  ctx.font = '700 40px "Chakra Petch", sans-serif';
  ctx.fillStyle = COLORS.hi;
  ctx.fillText(playerLabel, pad, 128);

  const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" });
  ctx.font = '500 16px Inter, sans-serif';
  ctx.fillStyle = COLORS.lo;
  ctx.fillText(`${dateFmt.format(recap.start)} → ${dateFmt.format(recap.end)}`, pad, 154);

  drawClippedPanel(ctx, pad, 178, WIDTH - pad * 2, 1, COLORS.line);

  const { overview } = recap;
  const resultColor = overview.winPercent >= 50 ? COLORS.accent : COLORS.crit;
  ctx.font = '700 80px "Chakra Petch", sans-serif';
  ctx.fillStyle = resultColor;
  ctx.fillText(`${overview.wins}V – ${overview.losses}D`, pad, 290);

  ctx.font = '600 20px "Chakra Petch", sans-serif';
  ctx.fillStyle = COLORS.lo;
  ctx.fillText(
    i18n.t("componentsExtra:periodRecapModal.winrate", { percent: formatPercent(overview.winPercent) }),
    pad,
    322,
  );

  drawClippedPanel(ctx, pad, 350, WIDTH - pad * 2, 1, COLORS.line);

  const statsY = 420;
  const stats: [string, string][] = [
    [i18n.t("componentsExtra:periodRecapModal.kd"), overview.kd],
    [i18n.t("componentsExtra:periodRecapModal.headshotPercent"), formatPercent(overview.hsPercent)],
    [i18n.t("componentsExtra:periodRecapModal.acs"), String(overview.acs)],
    [
      i18n.t("componentsExtra:periodRecapModal.topAgent"),
      overview.topAgent?.name ?? i18n.t("componentsExtra:periodRecapModal.noAgent"),
    ],
  ];
  const blockWidth = (WIDTH - pad * 2) / stats.length;
  stats.forEach(([label, value], i) => {
    const x = pad + blockWidth * i;
    ctx.font = '700 30px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.hi;
    ctx.fillText(value, x, statsY);
    ctx.font = '600 13px "Chakra Petch", sans-serif';
    ctx.fillStyle = COLORS.lo;
    ctx.fillText(label, x, statsY + 22);
  });

  if (recap.rankChange) {
    drawClippedPanel(ctx, pad, 448, WIDTH - pad * 2, 1, COLORS.line);

    const { tierStart, tierPatchedStart, rrStart, tierEnd, tierPatchedEnd, rrEnd } = recap.rankChange;
    const startColor = rankGlowColor(tierStart);
    const endColor = rankGlowColor(tierEnd);
    const startLabel = `${tierPatchedStart}${rrStart != null ? ` (${rrStart} RR)` : ""}`;
    const endLabel = `${tierPatchedEnd}${rrEnd != null ? ` (${rrEnd} RR)` : ""}`;

    ctx.font = '600 22px "Chakra Petch", sans-serif';
    ctx.fillStyle = startColor;
    ctx.fillText(startLabel, pad, 500);

    const arrowWidth = ctx.measureText(" → ").width;
    const startWidth = ctx.measureText(startLabel).width;
    ctx.fillStyle = COLORS.lo;
    ctx.fillText(" → ", pad + startWidth, 500);

    ctx.fillStyle = endColor;
    ctx.fillText(endLabel, pad + startWidth + arrowWidth, 500);
  }
}

interface PeriodRecapModalProps {
  recap: PeriodRecap;
  playerLabel: string;
  onClose: () => void;
}

/** Backlog #56 : récap hebdo/mensuel exportable, même pipeline canvas que RecapCardModal
 * (pas d'image externe chargée, pas de risque de taint CORS). */
export default function PeriodRecapModal({ recap, playerLabel, onClose }: PeriodRecapModalProps) {
  const { t } = useTranslation("componentsExtra");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "unsupported" | "error">("idle");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(canvas, recap, playerLabel);
  }, [recap, playerLabel]);

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
    downloadDataUri(`valorant-tracker-recap-${recap.period}.png`, canvas.toDataURL("image/png"));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <div className="max-w-full space-y-4" onClick={(e) => e.stopPropagation()}>
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
            className="btn-clip bg-accent px-4 py-2 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:opacity-90"
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
        {copyState === "copied" && <p className="text-center text-sm text-accent">{t("recapCardModal.copied")}</p>}
        {copyState === "unsupported" && (
          <p className="text-center text-sm text-lo">{t("recapCardModal.copyUnsupported")}</p>
        )}
        {copyState === "error" && <p className="text-center text-sm text-crit">{t("recapCardModal.copyError")}</p>}
      </div>
    </div>
  );
}
