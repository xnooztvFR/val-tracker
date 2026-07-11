import { useEffect, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";

import { tauriApi } from "../lib/tauriApi";
import { useLiveDetectionState } from "../hooks/useLiveState";
import { rankInfo } from "../lib/format";

/** Fenêtre overlay V2 (always-on-top, transparente, click-through par défaut) : état de
 * la partie détectée via l'API locale Riot + rank Henrik des joueurs du lobby. Les mises
 * à jour arrivent via l'event `riot-local://state` poussé par le poller Rust ;
 * Ctrl+Shift+V bascule le mode interactif (déplacement de la fenêtre). */
export default function Overlay() {
  const snapshot = useLiveDetectionState();
  const [interactive, setInteractive] = useState(false);

  // Le body garde le fond opaque du design system pour la fenêtre principale ; ici la
  // fenêtre est transparente, seuls les panneaux dessinent un fond.
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, []);

  useEffect(() => {
    const unlistenMode = listen<boolean>("overlay://interactive", (event) => {
      setInteractive(event.payload);
    });
    return () => {
      unlistenMode.then((fn) => fn());
    };
  }, []);

  const region = snapshot?.region ?? "eu";
  const players = snapshot?.players ?? [];

  const mmrQueries = useQueries({
    queries: players.map((puuid) => ({
      queryKey: ["overlay-mmr", puuid, region],
      queryFn: () => tauriApi.fetchMmrByPuuid(puuid, region),
      staleTime: 10 * 60_000,
      retry: false,
    })),
  });

  const stateLabel =
    snapshot?.state === "pregame"
      ? "Sélection des agents"
      : snapshot?.state === "in_game"
        ? "Partie en cours"
        : snapshot?.state === "menu"
          ? "Dans le menu"
          : snapshot?.state === "desactive"
            ? "Détection désactivée"
            : "En attente de partie";

  return (
    <div className="flex h-screen flex-col p-2 font-sans text-hi">
      <div
        data-tauri-drag-region={interactive || undefined}
        className={`panel-clip flex flex-col overflow-hidden bg-surface/90 ${
          interactive ? "cursor-move [box-shadow:inset_0_0_0_1px_#7CE8D3]" : ""
        }`}
      >
        <div data-tauri-drag-region={interactive || undefined} className="flex items-center justify-between border-b border-line px-3 py-2">
          <span className="hud-label pointer-events-none text-[10px]">VAL // OVERLAY</span>
          <span className="pointer-events-none flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 ${
                snapshot?.state === "in_game" || snapshot?.state === "pregame"
                  ? "bg-accent"
                  : "bg-lo/50"
              }`}
            />
            <span className="hud-label text-[10px]">{stateLabel}</span>
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
          {players.length === 0 ? (
            <p className="px-1 py-2 text-xs text-lo">
              {snapshot?.state === "in_game" || snapshot?.state === "pregame"
                ? "Partie détectée — identification des joueurs…"
                : "Lance une partie pour voir le rank du lobby ici."}
            </p>
          ) : (
            <ul className="space-y-1">
              {players.map((puuid, index) => {
                const query = mmrQueries[index];
                const data = query?.data?.data;
                const info = rankInfo(data?.current_data?.currenttier);
                return (
                  <li key={puuid} className="flex items-center gap-2 border border-line/60 bg-base/60 px-2 py-1.5">
                    <img src={info.iconUrl} alt="" className="h-5 w-5 object-contain" />
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {query?.isLoading ? (
                        <span className="text-lo">Identification…</span>
                      ) : data?.name ? (
                        <>
                          {data.name}
                          <span className="text-lo">#{data.tag}</span>
                        </>
                      ) : (
                        <span className="text-lo">Joueur inconnu</span>
                      )}
                    </span>
                    <span className={`font-display text-[10px] font-semibold uppercase tracking-hud ${info.colorClass}`}>
                      {info.name}
                    </span>
                    <span className="stat-value w-12 text-right text-[10px] text-lo">
                      {data?.current_data?.ranking_in_tier != null
                        ? `${data.current_data.ranking_in_tier} RR`
                        : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-line px-3 py-1.5">
          <p className="pointer-events-none text-[10px] text-lo">
            <span className="font-mono text-hi/80">Ctrl+Shift+V</span>
            {interactive ? " — mode interactif : déplace la fenêtre puis rebascule." : " — déplacer l'overlay"}
          </p>
        </div>
      </div>
    </div>
  );
}
