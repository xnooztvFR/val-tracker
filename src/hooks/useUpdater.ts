import { useCallback, useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdaterStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "up-to-date"
  | "error";

interface UpdaterState {
  status: UpdaterStatus;
  version: string | null;
  progress: number | null;
  error: string | null;
  checkNow: () => Promise<void>;
  installNow: () => Promise<void>;
  dismiss: () => void;
}

/** Vérifie les mises à jour via tauri-plugin-updater (endpoint GitHub Releases configuré
 * dans tauri.conf.json). Ne lance rien tout seul : `checkForUpdatesOnStartup` (appelé
 * depuis App.tsx si `auto_update_enabled`) et le bouton "Vérifier maintenant" des
 * Paramètres appellent tous les deux `checkNow`. */
export function useUpdater(): UpdaterState {
  const [status, setStatus] = useState<UpdaterStatus>("idle");
  const [version, setVersion] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const updateRef = useRef<Update | null>(null);

  const checkNow = useCallback(async () => {
    setStatus("checking");
    setError(null);
    try {
      const update = await check();
      if (update?.available) {
        updateRef.current = update;
        setVersion(update.version);
        setStatus("available");
      } else {
        updateRef.current = null;
        setStatus("up-to-date");
      }
    } catch (err) {
      setStatus("error");
      setError(String(err));
    }
  }, []);

  const installNow = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;

    setStatus("downloading");
    setProgress(0);
    let downloaded = 0;
    let total = 0;

    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            total = event.data.contentLength ?? 0;
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            setProgress(total > 0 ? Math.min(1, downloaded / total) : null);
            break;
          case "Finished":
            setProgress(1);
            break;
        }
      });
      setStatus("ready");
      await relaunch();
    } catch (err) {
      setStatus("error");
      setError(String(err));
    }
  }, []);

  const dismiss = useCallback(() => {
    updateRef.current = null;
    setStatus("idle");
  }, []);

  return { status, version, progress, error, checkNow, installNow, dismiss };
}

/** Vérification silencieuse au démarrage : ne fait rien en cas d'erreur réseau/endpoint
 * (best-effort, comme le reste de l'app hors ligne). */
export function useStartupUpdateCheck(enabled: boolean, checkNow: () => Promise<void>) {
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      checkNow().catch(() => {});
    }, 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
