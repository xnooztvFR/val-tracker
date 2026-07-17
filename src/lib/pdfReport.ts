import jsPDF from "jspdf";

import type { MatchEntry } from "./tauriApi";
import type { Overview } from "./stats";
import { formatPercent } from "./format";

// TODO Fonctionnalités#12 : export PDF multi-page d'une vue complète, pensé pour un coach
// (au-delà des cartes image existantes en canvas, voir profileCard.ts/recapCard.ts) — mise
// en page manuelle avec l'API texte/ligne de jsPDF plutôt que jspdf-autotable (dépendance
// supplémentaire pour un simple tableau à 6 colonnes, pagination faite à la main).

export interface PdfReportParams {
  playerLabel: string;
  region: string;
  rankName: string;
  rr: number | null;
  overview: Overview;
  matches: MatchEntry[];
  puuid: string;
}

const MARGIN = 15;
const PAGE_HEIGHT = 297; // A4 en mm
const ROW_HEIGHT = 6;
const TABLE_COLUMNS = [
  { label: "Date", x: MARGIN, width: 30 },
  { label: "Carte", x: MARGIN + 30, width: 35 },
  { label: "Agent", x: MARGIN + 65, width: 30 },
  { label: "Résultat", x: MARGIN + 95, width: 25 },
  { label: "KDA", x: MARGIN + 120, width: 30 },
  { label: "Score", x: MARGIN + 150, width: 20 },
];

export function buildPdfReport(params: PdfReportParams): jsPDF {
  const { playerLabel, region, rankName, rr, overview, matches, puuid } = params;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Valorant Tracker — Rapport de profil", MARGIN, 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(`${playerLabel} (${region.toUpperCase()})`, MARGIN, 30);
  doc.setFontSize(10);
  doc.text(`Rang actuel : ${rankName}${rr != null ? ` — ${rr} RR` : ""}`, MARGIN, 38);
  doc.setTextColor(120);
  doc.text(`Généré le ${new Date().toLocaleString()}`, MARGIN, 44);
  doc.setTextColor(0);

  let y = 58;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`Statistiques (${overview.played} derniers matchs chargés)`, MARGIN, y);
  y += 9;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const summaryRows: [string, string][] = [
    ["Parties jouées", String(overview.played)],
    ["Victoires / Défaites", `${overview.wins}V - ${overview.losses}D`],
    ["Winrate", formatPercent(overview.winPercent)],
    ["K/D", overview.kd],
    ["Kills / Morts / Assists", `${overview.kills} / ${overview.deaths} / ${overview.assists}`],
    ["Headshot %", formatPercent(overview.hsPercent)],
    ["ACS moyen", String(overview.acs)],
    ["Agent le plus joué", overview.topAgent?.name ?? "—"],
  ];
  for (const [label, value] of summaryRows) {
    doc.text(label, MARGIN, y);
    doc.text(value, MARGIN + 90, y);
    y += 7;
  }

  doc.addPage();
  y = 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`Historique des ${matches.length} derniers matchs`, MARGIN, y);
  y += 10;

  drawTableHeader(doc, y);
  y += ROW_HEIGHT;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  for (const match of matches) {
    if (y > PAGE_HEIGHT - MARGIN) {
      doc.addPage();
      y = 20;
      drawTableHeader(doc, y);
      y += ROW_HEIGHT;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
    }

    const player = match.players.find((p) => p.puuid === puuid);
    const team = match.teams.find((t) => t.team_id === player?.team_id);
    const won = team?.won;
    const stats = player?.stats;
    const dateStr = match.metadata.started_at ? new Date(match.metadata.started_at).toLocaleDateString() : "—";
    const resultStr = won === true ? "Victoire" : won === false ? "Défaite" : "—";
    const kdaStr = `${stats?.kills ?? 0}/${stats?.deaths ?? 0}/${stats?.assists ?? 0}`;

    const values = [
      dateStr,
      truncate(match.metadata.map?.name ?? "—", 20),
      truncate(player?.agent?.name ?? "—", 14),
      resultStr,
      kdaStr,
      String(stats?.score ?? "—"),
    ];
    values.forEach((value, i) => doc.text(value, TABLE_COLUMNS[i].x, y));
    y += ROW_HEIGHT;
  }

  return doc;
}

function drawTableHeader(doc: jsPDF, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  TABLE_COLUMNS.forEach((col) => doc.text(col.label, col.x, y));
  doc.setDrawColor(180);
  doc.line(MARGIN, y + 2, MARGIN + 170, y + 2);
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
