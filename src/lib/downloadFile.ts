// Déclenche un téléchargement navigateur classique (`<a download>`) puis ouvre le dossier
// Téléchargements dans l'explorateur Windows — sans ça, un export CSV/JSON/PNG atterrit
// silencieusement dans %USERPROFILE%\Downloads sans qu'un utilisateur non technique sache où
// le chercher. Best-effort : `openDownloadsFolder` ne doit jamais faire échouer le
// téléchargement lui-même (déjà déclenché au moment de l'appel), donc catch silencieux.

import { tauriApi } from "./tauriApi";

function revealDownloadsFolder(): void {
  tauriApi.openDownloadsFolder().catch(() => {});
}

/** Télécharge un `Blob` (ou une chaîne, encapsulée en `Blob`) sous `filename`, puis ouvre le
 * dossier Téléchargements. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  revealDownloadsFolder();
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  downloadBlob(new Blob([content], { type: mimeType }), filename);
}

/** Télécharge une image déjà encodée en `data:` URI (typiquement `canvas.toDataURL(...)`),
 * puis ouvre le dossier Téléchargements. */
export function downloadDataUri(filename: string, dataUri: string): void {
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUri;
  link.click();
  revealDownloadsFolder();
}
