import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { tauriApi, type LiveSnapshot } from "../lib/tauriApi";

/** État live de la détection de partie V2 (lockfile Riot + API locale), pour n'importe
 * quel écran de la fenêtre principale — pas seulement l'overlay. Même source que
 * `screens/Overlay.tsx` : lecture initiale via `get_live_state`, puis mises à jour
 * poussées par le poller Rust via l'event `riot-local://state`. */
export function useLiveDetectionState(): LiveSnapshot | null {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    tauriApi.getLiveState().then((s) => {
      if (!cancelled) setSnapshot(s);
    }).catch(() => {});
    const unlisten = listen<LiveSnapshot>("riot-local://state", (event) => {
      setSnapshot(event.payload);
    });
    return () => {
      cancelled = true;
      unlisten.then((fn) => fn());
    };
  }, []);

  return snapshot;
}
