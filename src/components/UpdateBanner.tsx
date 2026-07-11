import { useUpdater, useStartupUpdateCheck } from "../hooks/useUpdater";
import { useSettingsStore } from "../store/settingsStore";
import Panel from "./Panel";

/** Fenêtre modale de mise à jour disponible — s'affiche par-dessus tout le reste dès
 * qu'une mise à jour est détectée (vérif au démarrage si `auto_update_enabled`, actif
 * par défaut ; sinon reste silencieux tant que l'utilisateur ne clique pas "Vérifier
 * maintenant" dans Paramètres). Volontairement une modale bloquante et non un bandeau
 * discret : un simple fin bandeau en haut passait inaperçu pour la plupart des
 * utilisateurs, qui ne mettaient jamais l'app à jour. */
export default function UpdateBanner() {
  const autoUpdateEnabled = useSettingsStore((s) => s.settings?.auto_update_enabled ?? true);
  const { status, version, progress, error, checkNow, installNow, dismiss } = useUpdater();

  useStartupUpdateCheck(autoUpdateEnabled, checkNow);

  if (status === "idle" || status === "checking" || status === "up-to-date") return null;

  const canDismiss = status === "available" || status === "error";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={canDismiss ? dismiss : undefined}
    >
      <Panel className="w-full max-w-sm p-5">
        <div onClick={(e) => e.stopPropagation()}>
          <p className="hud-label text-accent">Mise à jour</p>

          {status === "available" && (
            <>
              <p className="mt-2 text-base font-semibold text-hi">
                Version {version} disponible
              </p>
              <p className="mt-1 text-sm text-lo">
                Une nouvelle version de Val Tracker est prête à être installée.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={dismiss}
                  className="px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-hud text-lo transition-colors hover:text-hi"
                >
                  Plus tard
                </button>
                <button
                  type="button"
                  onClick={() => installNow()}
                  className="btn-clip bg-accent px-4 py-1.5 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-[#FF5969]"
                >
                  Installer maintenant
                </button>
              </div>
            </>
          )}

          {status === "downloading" && (
            <>
              <p className="mt-2 text-base font-semibold text-hi">Téléchargement en cours…</p>
              <div className="mt-3 h-[3px] w-full bg-line">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
                />
              </div>
              <p className="stat-value mt-1.5 text-right text-xs text-lo">
                {progress != null ? `${Math.round(progress * 100)}%` : "…"}
              </p>
            </>
          )}

          {status === "ready" && (
            <p className="mt-2 text-base font-semibold text-hi">Installation, redémarrage…</p>
          )}

          {status === "error" && (
            <>
              <p className="mt-2 text-base font-semibold text-crit">Échec de la mise à jour</p>
              <p className="mt-1 font-mono text-xs text-lo">{error}</p>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={dismiss}
                  className="px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-hud text-lo transition-colors hover:text-hi"
                >
                  Fermer
                </button>
              </div>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}
