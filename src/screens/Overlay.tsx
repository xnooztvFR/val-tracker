import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";

import { tauriApi, type Fetched, type LivePlayer, type MmrData } from "../lib/tauriApi";
import { useLiveDetectionState } from "../hooks/useLiveState";
import { useSettingsStore } from "../store/settingsStore";
import { rankInfo } from "../lib/format";
import { computeAgentWinrates } from "../lib/stats";
import { agentRole, AGENT_ROLE_ORDER, agentRoleLabel } from "../lib/agentRoles";

const OWN_MATCHES_SAMPLE_SIZE = 20;

/** Fenêtre overlay V2 (always-on-top, transparente, click-through par défaut) : état de
 * la partie détectée via l'API locale Riot + rank Henrik des joueurs du lobby. Les mises
 * à jour arrivent via l'event `riot-local://state` poussé par le poller Rust ;
 * Ctrl+Shift+V bascule le mode interactif (déplacement de la fenêtre). */
export default function Overlay() {
  const { t } = useTranslation("overlay");
  const snapshot = useLiveDetectionState();
  const [interactive, setInteractive] = useState(false);
  // Backlog #31 : l'overlay est une fenêtre Tauri séparée (même bundle React, autre
  // label) — App.tsx ne rafraîchit jamais le settingsStore ici puisqu'il retourne avant cet
  // effet pour la fenêtre "overlay" (voir App.tsx), donc on le fait nous-mêmes.
  const { settings, refresh: refreshSettings } = useSettingsStore();
  const density = settings?.overlay_density ?? "detailed";
  // Backlog #75 : "full" (défaut, liste complète) ou "mini" (résumé coin d'écran, juste
  // les badges de rang) — voir `MiniSummary` plus bas. Backlog #82 : le mode "mini" saute
  // entièrement la recommandation d'agent (requête `ownMatches` + calcul de winrate) plutôt
  // que de la calculer pour ne pas l'afficher, l'overlay tournant en continu toute la
  // session de jeu.
  const layout = settings?.overlay_layout ?? "full";

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

  // Backlog #82 : la fenêtre overlay reste ouverte (masquée) pour toute la session de jeu,
  // son `QueryClient` accumule donc le MMR de chaque lobby croisé au fil des heures. Plutôt
  // que d'attendre le `gcTime` par défaut (5 min) pour chaque entrée devenue inutile, on
  // purge explicitement dès le retour hors-jeu/menu (rien à afficher, données jamais
  // ré-utiles pour ce lobby) — un vrai repli mémoire "au repos" plutôt qu'un simple délai.
  const queryClient = useQueryClient();
  const isActiveGame = snapshot?.state === "pregame" || snapshot?.state === "in_game";
  useEffect(() => {
    if (!isActiveGame) {
      queryClient.removeQueries({ queryKey: ["overlay-mmr"] });
      queryClient.removeQueries({ queryKey: ["overlay-own-matches"] });
    }
  }, [isActiveGame, queryClient]);

  const mmrQueries = useQueries({
    queries: players.map(({ puuid }) => ({
      queryKey: ["overlay-mmr", puuid, region],
      queryFn: () => tauriApi.fetchMmrByPuuid(puuid, region),
      staleTime: 10 * 60_000,
      retry: false,
    })),
  });

  // Backlog #77 : `useMemo` seul ne suffit pas à éviter le re-render de `PlayerGroup` (le
  // tableau `entries` change quand même de référence à chaque render), mais il évite de
  // refaire le split allies/enemies à chaque frappe/re-render non lié aux données (ex.
  // bascule du mode interactif) — le vrai gain vient du comparateur de `React.memo`
  // ci-dessous, qui compare le contenu plutôt que la référence.
  const allies = useMemo(
    () =>
      players
        .map((player, index) => ({ player, query: mmrQueries[index] }))
        .filter(({ player }) => player.team === "ally"),
    [players, mmrQueries],
  );
  const enemies = useMemo(
    () =>
      players
        .map((player, index) => ({ player, query: mmrQueries[index] }))
        .filter(({ player }) => player.team !== "ally"),
    [players, mmrQueries],
  );

  // TODO Fonctionnalités#4 : détection heuristique de smurf sur les adversaires — signal
  // "peu de games" tiré gratuitement du MMR déjà chargé (currenttier `null` = compte non
  // classé, moins de 5 games de placement jouées cet acte, sans appel réseau de plus) croisé
  // avec un winrate élevé sur un tout petit échantillon de matchs récents (size=5, cache
  // long) — seul signal réellement disponible sans scraper un historique complet par
  // adversaire, qui exploserait le quota Henrik partagé (~24 req/min) pour un lobby à 5v5.
  // Best-effort et absolument pas une preuve : juste un repère pour contextualiser une game
  // difficile, jamais montré comme une certitude (voir libellé "?" côté UI).
  const SMURF_SAMPLE_SIZE = 5;
  const SMURF_MIN_MATCHES = 3;
  const SMURF_WINRATE_THRESHOLD = 80;
  const smurfMatchQueries = useQueries({
    queries: enemies.map(({ player, query }) => {
      const name = query?.data?.data?.name;
      const tag = query?.data?.data?.tag;
      const unrated = query?.data?.data?.current_data?.currenttier == null;
      return {
        queryKey: ["overlay-smurf-matches", player.puuid, region],
        queryFn: () => tauriApi.fetchMatches(region, name!, tag!, SMURF_SAMPLE_SIZE),
        enabled: isFullLayout && unrated && Boolean(name) && Boolean(tag),
        staleTime: 15 * 60_000,
        retry: false,
      };
    }),
  });
  // TODO Fonctionnalités#10 : croisement des joueurs détectés en partie avec les profils
  // pro VLR liés manuellement par l'utilisateur (voir PlayerNotesPanel.tsx) — pas de
  // recherche automatique par nom, l'API Henrik n'expose aucun endpoint VLR par nom (voir
  // db::players::set_vlr_player_link).
  const trackedPlayers = useQuery({
    queryKey: ["overlay-tracked-players"],
    queryFn: () => tauriApi.listTrackedPlayers(1000),
    staleTime: 5 * 60_000,
  });
  const proLinks = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of trackedPlayers.data ?? []) {
      if (p.vlr_player_id != null) map.set(p.puuid, p.vlr_player_name || t("proLabel"));
    }
    return map;
  }, [trackedPlayers.data, t]);

  const smurfFlags = useMemo(() => {
    const flags = new Map<string, boolean>();
    enemies.forEach(({ player }, index) => {
      const data = smurfMatchQueries[index]?.data?.data;
      if (!data || data.length < SMURF_MIN_MATCHES) return;
      const wins = data.filter((m) => {
        const p = m.players.find((pl) => pl.puuid === player.puuid);
        const team = m.teams.find((t) => t.team_id === p?.team_id);
        return team?.won === true;
      }).length;
      const winPercent = (wins / data.length) * 100;
      flags.set(player.puuid, winPercent >= SMURF_WINRATE_THRESHOLD);
    });
    return flags;
  }, [enemies, smurfMatchQueries]);

  // Backlog #22 : recommandation d'agent perso pendant la sélection — "quels sont mes
  // agents les plus performants". `fetchMatches` passe par le même cache/rate-limiter que
  // le reste : entrer plusieurs fois en pregame dans la fenêtre de TTL ne redéclenche pas
  // d'appel réseau.
  const isPregame = snapshot?.state === "pregame";
  const isFullLayout = layout === "full";
  // Lecture locale bon marché (pas d'appel Henrik) : utilisée pour la reco d'agent (layout
  // "full" uniquement, voir plus bas) et pour identifier le joueur local dans le lobby afin
  // de calculer l'écart de rang adverse (tous layouts, voir `rankGapAlertEnabled` ci-dessous).
  const selfAccounts = useQuery({
    queryKey: ["overlay-self-accounts"],
    queryFn: () => tauriApi.listSelfAccounts(),
    staleTime: 5 * 60_000,
  });
  const self = selfAccounts.data?.[0];
  const ownMatches = useQuery({
    queryKey: ["overlay-own-matches", self?.puuid],
    queryFn: () => tauriApi.fetchMatches(self!.region, self!.name, self!.tag, OWN_MATCHES_SAMPLE_SIZE),
    enabled: isFullLayout && Boolean(self) && isPregame,
    staleTime: 10 * 60_000,
  });
  const ownAgentWinrates =
    isFullLayout && self && ownMatches.data ? computeAgentWinrates(ownMatches.data.data, self.puuid, 2) : [];
  const recommendedAgents = ownAgentWinrates.slice(0, 3);

  // Contre-pick / rôle manquant : croise les agents déjà lockés par l'équipe alliée
  // (`player.agent`, résolu côté Rust depuis le pregame local — best-effort, voir
  // `riot_local/agents.rs`) avec `agentRoles.ts` pour repérer un rôle absent de la comp, et
  // met en avant le meilleur agent perso (par winrate) qui couvre ce rôle.
  const alliedRoles = useMemo(
    () =>
      new Set(
        allies
          .map(({ player }) => agentRole(player.agent))
          .filter((role): role is NonNullable<typeof role> => role != null),
      ),
    [allies],
  );
  // N'affiche rien tant qu'aucun coéquipier n'a encore locké (sinon "rôle manquant" serait
  // vrai pour les 4 rôles dès l'entrée en pregame, un signal sans intérêt).
  const missingRole =
    isFullLayout && isPregame && alliedRoles.size > 0
      ? AGENT_ROLE_ORDER.find((role) => !alliedRoles.has(role))
      : undefined;
  const rolePick = missingRole
    ? ownAgentWinrates.find((agent) => agentRole(agent.name) === missingRole)
    : undefined;

  // Signal audio discret (opt-in) : alerte si un adversaire a un `currenttier` Henrik au
  // moins `rank_gap_alert_threshold` au-dessus du joueur local — facile à manquer
  // visuellement en chargement de manche (alerte "smurf").
  const rankGapAlertEnabled = settings?.rank_gap_alert_enabled ?? false;
  const rankGapAlertThreshold = settings?.rank_gap_alert_threshold ?? 9;
  const selfEntry = allies.find(({ player }) => player.puuid === self?.puuid);
  const selfTier = selfEntry?.query?.data?.data?.current_data?.currenttier;
  const alertFiredRef = useRef(false);
  useEffect(() => {
    if (!isActiveGame) {
      alertFiredRef.current = false;
    }
  }, [isActiveGame]);
  useEffect(() => {
    if (!rankGapAlertEnabled || alertFiredRef.current || selfTier == null) return;
    const hasBigGap = enemies.some(({ query }) => {
      const tier = query?.data?.data?.current_data?.currenttier;
      return tier != null && tier - selfTier >= rankGapAlertThreshold;
    });
    if (hasBigGap) {
      alertFiredRef.current = true;
      playRankGapAlert();
    }
  }, [rankGapAlertEnabled, rankGapAlertThreshold, selfTier, enemies]);

  const stateLabel =
    snapshot?.state === "pregame"
      ? t("state.pregame")
      : snapshot?.state === "in_game"
        ? t("state.inGame")
        : snapshot?.state === "menu"
          ? t("state.menu")
          : snapshot?.state === "desactive"
            ? t("state.disabled")
            : t("state.waiting");

  return (
    <div className="flex h-screen flex-col p-2 font-sans text-hi">
      <div
        data-tauri-drag-region={interactive || undefined}
        className={`panel-clip flex flex-col overflow-hidden bg-surface/90 ${
          interactive ? "cursor-move [box-shadow:inset_0_0_0_1px_rgb(var(--accent-rgb))]" : ""
        }`}
      >
        {layout === "mini" ? (
          <MiniSummary
            active={snapshot?.state === "in_game" || snapshot?.state === "pregame"}
            allies={allies}
            enemies={enemies}
            interactive={interactive}
          />
        ) : (
          <>
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
                    ? t("detectedHint")
                    : t("waitingHint")}
                </p>
              ) : (
                <div className="space-y-2">
                  <PlayerGroup label={t("team")} entries={allies} density={density} proLinks={proLinks} />
                  {enemies.length > 0 && (
                    <PlayerGroup
                      label={t("opponents")}
                      entries={enemies}
                      density={density}
                      accentClass="text-crit"
                      smurfFlags={smurfFlags}
                      proLinks={proLinks}
                    />
                  )}
                </div>
              )}
            </div>

            {isPregame && missingRole && (
              <div className="border-t border-line px-2 py-1.5">
                <p className="hud-label pointer-events-none mb-1 text-[9px] text-lo">
                  {t("missingRole")}
                </p>
                <p className="pointer-events-none text-[10px] text-hi">
                  {agentRoleLabel(missingRole)}
                  {rolePick && (
                    <>
                      {" — "}
                      {rolePick.name} <span className="text-accent">{Math.round(rolePick.winPercent)}%</span>
                    </>
                  )}
                </p>
              </div>
            )}

            {isPregame && recommendedAgents.length > 0 && (
              <div className="border-t border-line px-2 py-1.5">
                <p className="hud-label pointer-events-none mb-1 text-[9px] text-lo">
                  {t("topAgents")}
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
                {interactive ? t("shortcutInteractive") : t("shortcutStatic")}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Backlog #75 : layout "mini résumé" — une seule ligne compacte (badges de rang alliés
 * puis adversaires, séparateur "VS"), sans nom/RR/recommandation d'agent, pour un
 * encombrement visuel minimal en jeu. Le shortcut Ctrl+Shift+V ne s'affiche qu'en mode
 * interactif (pas de footer permanent, contrairement au layout "full") pour rester aussi
 * réduit que possible au repos. */
function MiniSummary({
  active,
  allies,
  enemies,
  interactive,
}: {
  active: boolean;
  allies: PlayerGroupEntry[];
  enemies: PlayerGroupEntry[];
  interactive: boolean;
}) {
  const { t } = useTranslation("overlay");
  const hasPlayers = allies.length > 0 || enemies.length > 0;

  return (
    <div data-tauri-drag-region={interactive || undefined} className="flex items-center gap-2 px-2.5 py-2">
      <span className={`h-1.5 w-1.5 shrink-0 ${active ? "bg-accent" : "bg-lo/50"}`} />
      {hasPlayers ? (
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {allies.map(({ player, query }) => (
            <MiniRankIcon key={player.puuid} query={query} />
          ))}
          {enemies.length > 0 && <span className="hud-label shrink-0 px-0.5 text-[9px] text-lo">VS</span>}
          {enemies.map(({ player, query }) => (
            <MiniRankIcon key={player.puuid} query={query} />
          ))}
        </div>
      ) : (
        <span className="hud-label truncate text-[9px] text-lo">{t("waitingHint")}</span>
      )}
      {interactive && <span className="hud-label shrink-0 text-[9px] text-hi/80">Ctrl+Shift+V</span>}
    </div>
  );
}

function MiniRankIcon({ query }: { query: UseQueryResult<Fetched<MmrData>> | undefined }) {
  const data = query?.data?.data;
  const info = rankInfo(data?.current_data?.currenttier);
  return <img src={info.iconUrl} alt="" className="h-4 w-4 shrink-0 object-contain" />;
}

/** Deux bips discrets synthétisés via Web Audio (pas de fichier son à embarquer/whitelister
 * dans la CSP) — signal d'écart de rang adverse important, best-effort : une erreur (API
 * indisponible, contexte audio bloqué) ne doit jamais faire planter l'overlay. */
function playRankGapAlert() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const beepAt = (start: number) => {
      const now = ctx.currentTime + start;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    };
    beepAt(0);
    beepAt(0.25);
    setTimeout(() => ctx.close(), 600);
  } catch {
    // best-effort — pas de son plutôt qu'un crash de l'overlay.
  }
}

interface PlayerGroupEntry {
  player: LivePlayer;
  query: UseQueryResult<Fetched<MmrData>> | undefined;
}

/** Une section (alliés ou adversaires) de la liste de joueurs de l'overlay — factorisé pour
 * éviter de dupliquer le rendu de chaque ligne entre les deux équipes.
 *
 * Backlog #77 : mémoïsé avec un comparateur de contenu (pas juste la référence de
 * `entries`, qui change à chaque render du parent) — l'overlay tourne en continu pendant
 * toute la session de jeu et un toggle du mode interactif (Ctrl+Shift+V) ne doit pas
 * re-render les lignes de joueurs si leurs données n'ont pas bougé. */
const PlayerGroup = memo(function PlayerGroup({
  label,
  entries,
  density,
  accentClass = "",
  smurfFlags,
  proLinks,
}: {
  label: string;
  entries: PlayerGroupEntry[];
  density: string;
  accentClass?: string;
  smurfFlags?: Map<string, boolean>;
  proLinks?: Map<string, string>;
}) {
  const { t } = useTranslation("overlay");
  return (
    <div>
      <p className={`hud-label pointer-events-none mb-1 px-1 text-[9px] ${accentClass || "text-lo"}`}>{label}</p>
      <ul className="space-y-1">
        {entries.map(({ player, query }) => {
          const data = query?.data?.data;
          const info = rankInfo(data?.current_data?.currenttier);
          const isSuspectedSmurf = smurfFlags?.get(player.puuid) === true;
          const proName = proLinks?.get(player.puuid);
          return (
            <li key={player.puuid} className="flex items-center gap-2 border border-line/60 bg-base/60 px-2 py-1.5">
              <img src={info.iconUrl} alt="" className="h-5 w-5 object-contain" />
              <span className="min-w-0 flex-1 truncate text-xs">
                {query?.isLoading ? (
                  <span className="text-lo">{t("identifying")}</span>
                ) : data?.name ? (
                  <>
                    {data.name}
                    <span className="text-lo">#{data.tag}</span>
                  </>
                ) : (
                  <span className="text-lo">{t("unknownPlayer")}</span>
                )}
              </span>
              {proName && (
                <span
                  className="hud-label shrink-0 border border-accent/60 px-1 text-[8px] text-accent"
                  title={t("proHint", { name: proName })}
                >
                  {t("proBadge")}
                </span>
              )}
              {isSuspectedSmurf && (
                <span
                  className="hud-label shrink-0 border border-crit/60 px-1 text-[8px] text-crit"
                  title={t("smurfHint")}
                >
                  {t("smurfBadge")}
                </span>
              )}
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
},
arePlayerGroupPropsEqual);

function arePlayerGroupPropsEqual(
  prev: {
    label: string;
    entries: PlayerGroupEntry[];
    density: string;
    accentClass?: string;
    smurfFlags?: Map<string, boolean>;
    proLinks?: Map<string, string>;
  },
  next: {
    label: string;
    entries: PlayerGroupEntry[];
    density: string;
    accentClass?: string;
    smurfFlags?: Map<string, boolean>;
    proLinks?: Map<string, string>;
  },
): boolean {
  if (prev.label !== next.label || prev.density !== next.density || prev.accentClass !== next.accentClass) {
    return false;
  }
  if (prev.entries.length !== next.entries.length) {
    return false;
  }
  return prev.entries.every((entry, index) => {
    const other = next.entries[index];
    return (
      entry.player.puuid === other.player.puuid &&
      entry.player.team === other.player.team &&
      entry.query?.isLoading === other.query?.isLoading &&
      entry.query?.data === other.query?.data &&
      prev.smurfFlags?.get(entry.player.puuid) === next.smurfFlags?.get(other.player.puuid) &&
      prev.proLinks?.get(entry.player.puuid) === next.proLinks?.get(other.player.puuid)
    );
  });
}
