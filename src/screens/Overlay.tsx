import { useEffect, useState } from "react";
import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";

import { tauriApi, type Fetched, type LivePlayer, type MmrData } from "../lib/tauriApi";
import { useLiveDetectionState } from "../hooks/useLiveState";
import { useSettingsStore } from "../store/settingsStore";
import { rankInfo } from "../lib/format";
import { computeAgentWinrates } from "../lib/stats";

const OWN_MATCHES_SAMPLE_SIZE = 20;

/** Fenêtre overlay V2 (always-on-top, transparente, click-through par défaut) : état de
 * la partie détectée via l'API locale Riot + rank Henrik des joueurs du lobby. Les mises
 * à jour arrivent via l'event `riot-local://state` poussé par le poller Rust ;
 * Ctrl+Shift+V bascule le mode interactif (déplacement de la fenêtre). */
export default function Overlay() {
  const snapshot = useLiveDetectionState();
  const [interactive, setInteractive] = useState(false);
  // Backlog #31 : l'overlay est une fenêtre Tauri séparée (même bundle React, autre
  // label) — App.tsx ne rafraîchit jamais le settingsStore ici puisqu'il retourne avant cet
  // effet pour la fenêtre "overlay" (voir App.tsx), donc on le fait nous-mêmes.
  const { settings, refresh: refreshSettings } = useSettingsStore();
  const density = settings?.overlay_density ?? "detailed";

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

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
    queries: players.map(({ puuid }) => ({
      queryKey: ["overlay-mmr", puuid, region],
      queryFn: () => tauriApi.fetchMmrByPuuid(puuid, region),
      staleTime: 10 * 60_000,
      retry: false,
    })),
  });

  const allies = players
    .map((player, index) => ({ player, query: mmrQueries[index] }))
    .filter(({ player }) => player.team === "ally");
  const enemies = players
    .map((player, index) => ({ player, query: mmrQueries[index] }))
    .filter(({ player }) => player.team !== "ally");

  // Backlog #22 : recommandation d'agent perso pendant la sélection — juste "quels sont mes
  // agents les plus performants", pas une analyse de la comp adverse/alliée (non fiable
  // avec les données actuellement disponibles, voir TODO.md #22). `fetchMatches` passe par
  // le même cache/rate-limiter que le reste : entrer plusieurs fois en pregame dans la
  // fenêtre de TTL ne redéclenche pas d'appel réseau.
  const selfAccounts = useQuery({
    queryKey: ["overlay-self-accounts"],
    queryFn: () => tauriApi.listSelfAccounts(),
    staleTime: 5 * 60_000,
  });
  const self = selfAccounts.data?.[0];
  const isPregame = snapshot?.state === "pregame";
  const ownMatches = useQuery({
    queryKey: ["overlay-own-matches", self?.puuid],
    queryFn: () => tauriApi.fetchMatches(self!.region, self!.name, self!.tag, OWN_MATCHES_SAMPLE_SIZE),
    enabled: Boolean(self) && isPregame,
    staleTime: 10 * 60_000,
  });
  const recommendedAgents =
    self && ownMatches.data ? computeAgentWinrates(ownMatches.data.data, self.puuid, 2).slice(0, 3) : [];

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
          interactive ? "cursor-move [box-shadow:inset_0_0_0_1px_rgb(var(--color-accent))]" : ""
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
            <div className="space-y-2">
              <PlayerGroup label="Équipe" entries={allies} density={density} />
              {enemies.length > 0 && (
                <PlayerGroup label="Adversaires" entries={enemies} density={density} accentClass="text-crit" />
              )}
            </div>
          )}
        </div>

        {isPregame && recommendedAgents.length > 0 && (
          <div className="border-t border-line px-2 py-1.5">
            <p className="hud-label pointer-events-none mb-1 text-[9px] text-lo">
              Tes agents les plus performants
            </p>
            <ul className="flex gap-2">
              {recommendedAgents.map((agent) => (
                <li key={agent.name} className="pointer-events-none text-[10px] text-hi">
                  {agent.name} <span className="text-accent">{Math.round(agent.winPercent)}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}

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

interface PlayerGroupEntry {
  player: LivePlayer;
  query: UseQueryResult<Fetched<MmrData>> | undefined;
}

/** Une section (alliés ou adversaires) de la liste de joueurs de l'overlay — factorisé pour
 * éviter de dupliquer le rendu de chaque ligne entre les deux équipes. */
function PlayerGroup({
  label,
  entries,
  density,
  accentClass = "",
}: {
  label: string;
  entries: PlayerGroupEntry[];
  density: string;
  accentClass?: string;
}) {
  return (
    <div>
      <p className={`hud-label pointer-events-none mb-1 px-1 text-[9px] ${accentClass || "text-lo"}`}>{label}</p>
      <ul className="space-y-1">
        {entries.map(({ player, query }) => {
          const data = query?.data?.data;
          const info = rankInfo(data?.current_data?.currenttier);
          return (
            <li key={player.puuid} className="flex items-center gap-2 border border-line/60 bg-base/60 px-2 py-1.5">
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
              {density === "detailed" && (
                <span className={`font-display text-[10px] font-semibold uppercase tracking-hud ${info.colorClass}`}>
                  {info.name}
                </span>
              )}
              {density === "detailed" && (
                <span className="stat-value w-12 text-right text-[10px] text-lo">
                  {data?.current_data?.ranking_in_tier != null ? `${data.current_data.ranking_in_tier} RR` : "—"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
