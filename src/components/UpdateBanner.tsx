import { useUpdater, useStartupUpdateCheck } from "../hooks/useUpdater";
import { useSettingsStore } from "../store/settingsStore";

/** Bandeau global de mise à jour disponible, même emplacement/style que StatusBanner.
 * Vérifie au démarrage si `auto_update_enabled` (Paramètres → Mises à jour) ; sinon reste
 * silencieux tant que l'utilisateur ne clique pas "Vérifier maintenant" dans Paramètres. */
export default function UpdateBanner() {
  const autoUpdateEnabled = useSettingsStore((s) => s.settings?.auto_update_enabled ?? false);
  const { status, version, progress, error, checkNow, installNow, dismiss } = useUpdater();

  useStartupUpdateCheck(autoUpdateEnabled, checkNow);

  if (status === "idle" || status === "checking" || status === "up-to-date") return null;

  return (
    <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-1.5 text-xs text-hi">
      <span className="hud-label text-[10px] text-accent">Mise à jour</span>
      {status === "available" && (
        <>
          <span className="flex-1 truncate">
            Version {version} disponible.
          </span>
          <button
            type="button"
            onClick={() => installNow()}
            className="shrink-0 border border-accent/50 px-2 py-0.5 text-[11px] text-accent hover:bg-accent/10"
          >
            Télécharger et installer
          </button>
        </>
      )}
      {status === "downloading" && (
        <span className="flex-1 truncate">
          Téléchargement{progress != null ? ` — ${Math.round(progress * 100)}%` : "…"}
        </span>
      )}
      {status === "ready" && <span className="flex-1 truncate">Installation, redémarrage…</span>}
      {status === "error" && (
        <span className="flex-1 truncate text-crit">Échec de la mise à jour : {error}</span>
      )}
      {status !== "downloading" && status !== "ready" && (
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 opacity-70 hover:opacity-100"
          aria-label="Masquer"
        >
          ✕
        </button>
      )}
    </div>
  );
}
