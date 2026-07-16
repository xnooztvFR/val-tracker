import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { MatchRecapData } from "../lib/recapCard";
import { downloadDataUri } from "../lib/downloadFile";
import i18n from "../i18n";

const WIDTH = 900;
const HEIGHT = 506;
const CUT = 28;

// Palette lue depuis les variables CSS live (voir `:root`/`[data-theme]`/`[data-accent]`
// dans index.css, `fillStyle` ne résout pas les custom properties CSS directement donc on
// les résout nous-mêmes via getComputedStyle) pour que la carte exportée reflète le
// thème/accent réellement choisi par l'utilisateur, avec les valeurs par défaut du thème HUD
// d'origine en repli si une variable est absente (le rendu canvas ne doit jamais planter).
const FALLBACK_COLORS = {
  base: "#0B0E11",
  surface: "#12161B",
  line: "#22282F",
  accent: "#FF3B4E",
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

/** Trace le contour "coin coupé" du design system (voir `.panel-clip` dans index.css)
 * agrandi pour le canvas, et le remplit avec `fillStyle`. */
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

export type RecapCardTemplate = "hud" | "minimal" | "poster";

function drawHudTemplate(ctx: CanvasRenderingContext2D, data: MatchRecapData, COLORS: ReturnType<typeof resolvePalette>) {
  const resultColor = data.won ? COLORS.accent : COLORS.crit;

  // Liseré latéral signalant le résultat, comme les bandeaux ErrorState/StatusBanner.
  ctx.fillStyle = resultColor;
  ctx.fillRect(0, 0, 6, HEIGHT);

  const pad = 56;

  ctx.font = '600 15px "JetBrains Mono", monospace';
  ctx.fillStyle = COLORS.accent;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("VAL // TRACKER", pad, 64);

  ctx.font = '700 20px "Chakra Petch", sans-serif';
  ctx.fillStyle = resultColor;
  const resultLabel = data.won
    ? i18n.t("componentsExtra:recapCardModal.victory")
    : i18n.t("componentsExtra:recapCardModal.defeat");
  const resultWidth = ctx.measureText(resultLabel).width;
  ctx.fillText(resultLabel, WIDTH - pad - resultWidth, 64);

  ctx.font = '700 48px "Chakra Petch", sans-serif';
  ctx.fillStyle = COLORS.hi;
  ctx.fillText(data.map, pad, 130);

  ctx.font = '500 18px Inter, sans-serif';
  ctx.fillStyle = COLORS.lo;
  ctx.fillText(data.mode, pad, 160);

  // Score, gros et centré verticalement dans le bandeau du milieu.
  ctx.font = '700 96px "Chakra Petch", sans-serif';
  ctx.fillStyle = COLORS.hi;
  const scoreText = `${data.scoreFor} – ${data.scoreAgainst}`;
  ctx.fillText(scoreText, pad, 280);

  drawClippedPanel(ctx, pad, 320, WIDTH - pad * 2, 1, COLORS.line);

  // Ligne joueur : nom#tag + rang à droite.
  ctx.font = '600 26px "Chakra Petch", sans-serif';
  ctx.fillStyle = COLORS.hi;
  ctx.fillText(data.playerName, pad, 372);
  const nameWidth = ctx.measureText(data.playerName).width;
  ctx.font = '500 26px "Chakra Petch", sans-serif';
  ctx.fillStyle = COLORS.lo;
  ctx.fillText(`#${data.playerTag}`, pad + nameWidth + 4, 372);

  if (data.rankLabel) {
    ctx.font = '700 20px "Chakra Petch", sans-serif';
    const label = data.rankLabel.toUpperCase();
    const labelWidth = ctx.measureText(label).width;
    ctx.fillStyle = data.rankColorHex ?? COLORS.lo;
    ctx.fillText(label, WIDTH - pad - labelWidth, 372);
  }

  // Bloc KDA.
  const kdaY = 440;
  const stats: [string, string][] = [
    ["KILLS", String(data.kills)],
    ["DEATHS", String(data.deaths)],
    ["ASSISTS", String(data.assists)],
  ];
  const blockWidth = (WIDTH - pad * 2) / stats.length;
  stats.forEach(([label, value], i) => {
    const x = pad + blockWidth * i;
    ctx.font = '700 40px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.hi;
    ctx.fillText(value, x, kdaY);
    ctx.font = '600 13px "Chakra Petch", sans-serif';
    ctx.fillStyle = COLORS.lo;
    ctx.fillText(label, x, kdaY + 22);
  });
}

/** Variante épurée : tout centré, pas de liseré ni d'en-tête, focus sur le score. */
function drawMinimalTemplate(ctx: CanvasRenderingContext2D, data: MatchRecapData, COLORS: ReturnType<typeof resolvePalette>) {
  const resultColor = data.won ? COLORS.accent : COLORS.crit;
  const centerX = WIDTH / 2;

  ctx.textAlign = "center";

  ctx.font = '700 22px "Chakra Petch", sans-serif';
  ctx.fillStyle = resultColor;
  const resultLabel = data.won
    ? i18n.t("componentsExtra:recapCardModal.victory")
    : i18n.t("componentsExtra:recapCardModal.defeat");
  ctx.fillText(resultLabel.toUpperCase(), centerX, 90);

  ctx.font = '700 110px "Chakra Petch", sans-serif';
  ctx.fillStyle = COLORS.hi;
  ctx.fillText(`${data.scoreFor} – ${data.scoreAgainst}`, centerX, 230);

  ctx.font = '500 20px Inter, sans-serif';
  ctx.fillStyle = COLORS.lo;
  ctx.fillText(`${data.map} · ${data.mode}`, centerX, 270);

  ctx.font = '600 22px "Chakra Petch", sans-serif';
  ctx.fillStyle = COLORS.hi;
  const playerLine = data.rankLabel
    ? `${data.playerName}#${data.playerTag} · ${data.rankLabel.toUpperCase()}`
    : `${data.playerName}#${data.playerTag}`;
  ctx.fillText(playerLine, centerX, 340);

  const kdaLine = `${data.kills} K · ${data.deaths} D · ${data.assists} A`;
  ctx.font = '700 34px "JetBrains Mono", monospace';
  ctx.fillStyle = COLORS.accent;
  ctx.fillText(kdaLine, centerX, 420);

  ctx.textAlign = "left";
}

/** Variante "affiche" : grand badge de rang centré, informations empilées verticalement. */
function drawPosterTemplate(ctx: CanvasRenderingContext2D, data: MatchRecapData, COLORS: ReturnType<typeof resolvePalette>) {
  const resultColor = data.won ? COLORS.accent : COLORS.crit;
  const centerX = WIDTH / 2;

  drawClippedPanel(ctx, 40, 40, WIDTH - 80, HEIGHT - 80, COLORS.surface);

  ctx.textAlign = "center";

  ctx.font = '600 16px "JetBrains Mono", monospace';
  ctx.fillStyle = COLORS.accent;
  ctx.fillText("VAL // TRACKER", centerX, 90);

  if (data.rankLabel) {
    ctx.font = '700 46px "Chakra Petch", sans-serif';
    ctx.fillStyle = data.rankColorHex ?? COLORS.hi;
    ctx.fillText(data.rankLabel.toUpperCase(), centerX, 150);
  }

  ctx.font = '700 20px "Chakra Petch", sans-serif';
  ctx.fillStyle = resultColor;
  const resultLabel = data.won
    ? i18n.t("componentsExtra:recapCardModal.victory")
    : i18n.t("componentsExtra:recapCardModal.defeat");
  ctx.fillText(`${resultLabel.toUpperCase()} · ${data.scoreFor}–${data.scoreAgainst}`, centerX, 210);

  ctx.font = '500 18px Inter, sans-serif';
  ctx.fillStyle = COLORS.lo;
  ctx.fillText(`${data.map} · ${data.mode}`, centerX, 240);

  ctx.font = '600 24px "Chakra Petch", sans-serif';
  ctx.fillStyle = COLORS.hi;
  ctx.fillText(`${data.playerName}#${data.playerTag}`, centerX, 320);

  const stats: [string, string][] = [
    ["KILLS", String(data.kills)],
    ["DEATHS", String(data.deaths)],
    ["ASSISTS", String(data.assists)],
  ];
  const blockWidth = (WIDTH - 160) / stats.length;
  stats.forEach(([label, value], i) => {
    const x = 80 + blockWidth * i + blockWidth / 2;
    ctx.font = '700 44px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.hi;
    ctx.fillText(value, x, 410);
    ctx.font = '600 13px "Chakra Petch", sans-serif';
    ctx.fillStyle = COLORS.lo;
    ctx.fillText(label, x, 432);
  });

  ctx.textAlign = "left";
}

async function draw(canvas: HTMLCanvasElement, data: MatchRecapData, template: RecapCardTemplate) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Les fonts self-hébergées (@fontsource) sont quasi certainement déjà chargées (le
  // reste de l'UI les utilise déjà), mais on attend explicitement pour éviter un rendu
  // canvas avec la police système par défaut si la modale s'ouvre très tôt.
  await document.fonts.ready.catch(() => {});

  const COLORS = resolvePalette();

  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawClippedPanel(ctx, 0, 0, WIDTH, HEIGHT, COLORS.base);
  ctx.textBaseline = "alphabetic";

  if (template === "minimal") drawMinimalTemplate(ctx, data, COLORS);
  else if (template === "poster") drawPosterTemplate(ctx, data, COLORS);
  else drawHudTemplate(ctx, data, COLORS);
}

interface RecapCardModalProps {
  data: MatchRecapData;
  onClose: () => void;
}

/** Modale de génération de carte de recap (V3) : rend le match sur un `<canvas>` (aucune
 * image externe chargée, donc aucun risque de canvas "taint" par CORS) et propose de la
 * copier dans le presse-papiers (pour coller directement dans Discord) ou de la
 * télécharger en PNG. */
const TEMPLATES: RecapCardTemplate[] = ["hud", "minimal", "poster"];

export default function RecapCardModal({ data, onClose }: RecapCardModalProps) {
  const { t } = useTranslation("componentsExtra");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "unsupported" | "error">("idle");
  const [template, setTemplate] = useState<RecapCardTemplate>("hud");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(canvas, data, template);
  }, [data, template]);

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
    downloadDataUri(`valorant-tracker-${data.map.toLowerCase()}.png`, canvas.toDataURL("image/png"));
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
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl}
              type="button"
              onClick={() => setTemplate(tpl)}
              className={`hud-label border px-2.5 py-1 text-[11px] transition-colors ${
                template === tpl
                  ? "border-accent text-accent"
                  : "border-line text-lo hover:border-accent hover:text-hi"
              }`}
            >
              {t(`recapCardModal.template.${tpl}`)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="btn-clip bg-accent px-4 py-2 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-accent-dim"
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
