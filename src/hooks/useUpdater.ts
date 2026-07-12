import { useCallback, useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { invoke } from "@tauri-apps/api/core";

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

    // Défense en profondeur (backlog #97) : en plus de la signature Ed25519 déjà vérifiée
    // en interne par tauri-plugin-updater avant l'installation, on compare le SHA256 de
    // l'installeur à celui publié dans latest.json (champ custom, absent des anciennes
    // releases — dans ce cas on bloque, l'utilisateur peut toujours réessayer plus tard
    // une fois la prochaine version publiée avec le hash).
    const platforms = update.rawJson?.platforms as
      | Record<string, { url?: string; sha256?: string }>
      | undefined;
    const platform = platforms?.["windows-x86_64"];
    if (!platform?.url || !platform?.sha256) {
      setStatus("error");
      setError("Vérification d'intégrité indisponible pour cette mise à jour (hash manquant).");
      return;
    }
    try {
      const hashOk = await invoke<boolean>("verify_update_hash", {
        url: platform.url,
        expectedSha256: platform.sha256,
      });
      if (!hashOk) {
        setStatus("error");
        setError("Échec de la vérification d'intégrité de l'installeur téléchargé.");
        return;
      }
    } catch (err) {
      setStatus("error");
      setError(`Vérification d'intégrité impossible: ${String(err)}`);
      return;
    }

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
      // Backlog #72 (fix) : `update.body` porte les notes de version (champ "notes" de
      // latest.json, voir scripts/release.ps1) — persistées côté Rust (SQLite) car l'objet
      // `Update` ne survit pas à `relaunch()`, lues par ChangelogModal au prochain
      // chargement. `invoke()` est awaité : contrairement à un `localStorage.setItem()`
      // suivi immédiatement d'un `relaunch()` (qui tue le process sans garantie que
      // WebView2 ait flush l'écriture sur disque), la commande Tauri ne résout qu'une fois
      // l'écriture SQLite terminée.
      try {
        await invoke("set_pending_changelog", {
          version: update.version,
          notes: update.body ?? "",
        });
      } catch {
        // best-effort : pas de changelog affiché si l'écriture échoue.
      }
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
