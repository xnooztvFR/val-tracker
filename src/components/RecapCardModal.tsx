import { useEffect, useRef, useState } from "react";

import type { MatchRecapData } from "../lib/recapCard";

const WIDTH = 900;
const HEIGHT = 506;
const CUT = 28;

const COLORS = {
  base: "#0B0E11",
  surface: "#12161B",
  line: "#22282F",
  accent: "#7CE8D3",
  crit: "#FF5F5F",
  hi: "#E8ECEF",
  lo: "#7A8590",
};

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

async function draw(canvas: HTMLCanvasElement, data: MatchRecapData) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Les fonts self-hébergées (@fontsource) sont quasi certainement déjà chargées (le
  // reste de l'UI les utilise déjà), mais on attend explicitement pour éviter un rendu
  // canvas avec la police système par défaut si la modale s'ouvre très tôt.
  await document.fonts.ready.catch(() => {});

  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawClippedPanel(ctx, 0, 0, WIDTH, HEIGHT, COLORS.base);

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
  const resultLabel = data.won ? "VICTOIRE" : "DÉFAITE";
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

interface RecapCardModalProps {
  data: MatchRecapData;
  onClose: () => void;
}

/** Modale de génération de carte de recap (V3) : rend le match sur un `<canvas>` (aucune
 * image externe chargée, donc aucun risque de canvas "taint" par CORS) et propose de la
 * copier dans le presse-papiers (pour coller directement dans Discord) ou de la
 * télécharger en PNG. */
export default function RecapCardModal({ data, onClose }: RecapCardModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "unsupported" | "error">("idle");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(canvas, data);
  }, [data]);

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
    const link = document.createElement("a");
    link.download = `valorant-tracker-${data.map.toLowerCase()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
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
            className="btn-clip bg-accent px-4 py-2 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-[#96F0DF]"
          >
            Copier l'image
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="border border-line px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent"
          >
            Télécharger
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-lo transition-colors hover:text-hi"
          >
            Fermer
          </button>
        </div>
        {copyState === "copied" && (
          <p className="text-center text-sm text-accent">
            Copié — colle-la directement dans Discord (Ctrl+V).
          </p>
        )}
        {copyState === "unsupported" && (
          <p className="text-center text-sm text-lo">
            Copie non supportée ici — utilise « Télécharger » à la place.
          </p>
        )}
        {copyState === "error" && (
          <p className="text-center text-sm text-crit">Échec de la copie, réessaie.</p>
        )}
      </div>
    </div>
  );
}
