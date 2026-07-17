import { lazy, Suspense, useEffect, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import i18n from "./i18n";

import Titlebar from "./components/Titlebar";
import { SkeletonScreen } from "./components/Skeleton";
import Overlay from "./screens/Overlay";
import TopNav from "./components/TopNav";
import StatusBanner from "./components/StatusBanner";
import MiniOverlay from "./components/MiniOverlay";
import UpdateBanner from "./components/UpdateBanner";
import ChangelogModal from "./components/ChangelogModal";
import CommandPalette from "./components/CommandPalette";
import FloatingSessionTabs from "./components/FloatingSessionTabs";
import Search from "./screens/Search";
import { useUiStore } from "./store/uiStore";
import { useSettingsStore } from "./store/settingsStore";
import { useDynamicAccentStore } from "./store/dynamicAccentStore";
import { useNavHistoryStore } from "./store/navHistoryStore";
import { useSelfAccountCycling } from "./hooks/useSelfAccountCycling";

// Écrans chargés à la demande (React.lazy) : seul l'écran de recherche (route "/",
// premier rendu de l'app) est dans le bundle initial. Le reste — profil joueur, recharts
// (Trends/MapStats/RankHistoryChart), classement, Premier, esport VLR — n'est téléchargé
// que quand l'utilisateur y navigue, pour garder le chunk JS de démarrage petit.
const Settings = lazy(() => import("./screens/Settings"));
const PlayerShell = lazy(() => import("./screens/PlayerShell"));
const Home = lazy(() => import("./screens/Home"));
const Today = lazy(() => import("./screens/Today"));
const Trends = lazy(() => import("./screens/Trends"));
const Agents = lazy(() => import("./screens/Agents"));
const MatchHistory = lazy(() => import("./screens/MatchHistory"));
const MatchDetail = lazy(() => import("./screens/MatchDetail"));
const MatchReport = lazy(() => import("./screens/MatchReport"));
const MapStats = lazy(() => import("./screens/MapStats"));
const Duo = lazy(() => import("./screens/Duo"));
const Leaderboard = lazy(() => import("./screens/Leaderboard"));
const Esports = lazy(() => import("./screens/Esports"));
const Premier = lazy(() => import("./screens/Premier"));
const PremierTeamDetail = lazy(() => import("./screens/PremierTeamDetail"));
const VlrEvents = lazy(() => import("./screens/VlrEvents"));
const VlrEventDetail = lazy(() => import("./screens/VlrEventDetail"));
const VlrMatchDetail = lazy(() => import("./screens/VlrMatchDetail"));
const VlrTeamDetail = lazy(() => import("./screens/VlrTeamDetail"));
const VlrPlayerDetail = lazy(() => import("./screens/VlrPlayerDetail"));
const Compare = lazy(() => import("./screens/Compare"));

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const recordNavHistory = useNavHistoryStore((s) => s.record);
  const compact = useUiStore((s) => s.compact);
  const focus = useUiStore((s) => s.focus);
  const toggleFocus = useUiStore((s) => s.toggleFocus);
  const refreshSettings = useSettingsStore((s) => s.refresh);
  const uiTheme = useSettingsStore((s) => s.settings?.ui_theme);
  const uiAccent = useSettingsStore((s) => s.settings?.ui_accent);
  const dynamicAccent = useDynamicAccentStore((s) => s.accent);
  const uiLanguage = useSettingsStore((s) => s.settings?.ui_language);
  const uiDensity = useSettingsStore((s) => s.settings?.ui_density);
  const uiFont = useSettingsStore((s) => s.settings?.ui_font);
  const presentationModeEnabled = useSettingsStore((s) => s.settings?.presentation_mode_enabled);
  const cursorEnabled = useSettingsStore((s) => s.settings?.cursor_enabled);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  // TODO Social/multi-comptes : Ctrl+Tab cycle entre comptes "à soi" — n'a de sens que pour
  // la fenêtre principale (routeur applicatif), pas l'overlay (voir early-return plus bas).
  useSelfAccountCycling();

  // Backlog #25 : Ctrl+K ouvre la palette de commande — écouteur frontend simple, cette
  // fenêtre doit juste avoir le focus (contrairement à Ctrl+Shift+V qui est un raccourci
  // global côté Rust pour marcher jeu au premier plan, voir overlay/window.rs).
  // Backlog #63 : Ctrl+Shift+F bascule le mode focus (même portée que Ctrl+K, fenêtre
  // principale focus — pas un raccourci global côté Rust, contrairement à Ctrl+Shift+V/H).
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        toggleFocus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleFocus]);

  // Backlog #33/#38 : reflète le thème/accent choisis en Paramètres sur `<html>` — les
  // variables CSS `--color-*` de `index.css` en dépendent (`[data-theme]`/`[data-accent]`).
  // Chaque fenêtre Tauri (dont l'overlay V2) a son propre document, donc cet effet doit
  // rester avant le early-return overlay ci-dessous pour s'appliquer là aussi.
  useEffect(() => {
    const root = document.documentElement;
    if (uiTheme && uiTheme !== "dark") {
      root.setAttribute("data-theme", uiTheme);
    } else {
      root.removeAttribute("data-theme");
    }
    // TODO Design#2 : "auto" n'est pas une valeur CSS valide de `[data-accent]` — résolue ici
    // vers la teinte dérivée de l'agent le plus joué (dynamicAccentStore, alimenté par
    // useHomeData.ts), avec repli sur le rouge par défaut tant qu'aucun profil n'a encore été
    // visité cette session.
    const effectiveAccent = uiAccent === "auto" ? dynamicAccent ?? "red" : uiAccent;
    if (effectiveAccent && effectiveAccent !== "red") {
      root.setAttribute("data-accent", effectiveAccent);
    } else {
      root.removeAttribute("data-accent");
    }
  }, [uiTheme, uiAccent, dynamicAccent]);

  // Backlog #66 : densité globale — `[data-density="compact"]` réduit `font-size` sur
  // `<html>` (voir index.css), ce qui rétrécit proportionnellement tout le reste de l'app
  // basé sur les unités `rem` de Tailwind (spacing/text par défaut), sans refactor
  // composant par composant. Chaque fenêtre Tauri a son propre document (voir l'effet
  // thème/accent ci-dessus), donc cet effet doit rester avant l'early-return overlay.
  useEffect(() => {
    const root = document.documentElement;
    // TODO Design#2 : le mode présentation (police agrandie) prime sur `ui_density` — les
    // deux visent l'opposé (compact vs agrandi), une combinaison des deux n'aurait pas de
    // sens visuel cohérent.
    if (presentationModeEnabled) {
      root.setAttribute("data-density", "presentation");
    } else if (uiDensity === "compact") {
      root.setAttribute("data-density", "compact");
    } else {
      root.removeAttribute("data-density");
    }
    if (presentationModeEnabled) {
      root.setAttribute("data-motion", "slow");
    } else {
      root.removeAttribute("data-motion");
    }
  }, [uiDensity, presentationModeEnabled]);

  // TODO Design#2 : police d'accent commutable (Chakra Petch / JetBrains Mono) et curseur
  // viseur simplifié global — même schéma `data-*` que thème/accent/densité ci-dessus, un
  // effet par fenêtre Tauri (chacune a son propre document).
  useEffect(() => {
    const root = document.documentElement;
    if (uiFont === "mono") {
      root.setAttribute("data-font", "mono");
    } else {
      root.removeAttribute("data-font");
    }
  }, [uiFont]);

  useEffect(() => {
    const root = document.documentElement;
    if (cursorEnabled) {
      root.setAttribute("data-cursor", "crosshair");
    } else {
      root.removeAttribute("data-cursor");
    }
  }, [cursorEnabled]);

  // Système multilangue : reflète la préférence enregistrée (défaut "fr") sur l'instance
  // i18next partagée par toutes les fenêtres Tauri (dont l'overlay V2, qui a son propre
  // document mais importe le même singleton `i18n`).
  useEffect(() => {
    if (uiLanguage && uiLanguage !== i18n.language) {
      i18n.changeLanguage(uiLanguage);
    }
  }, [uiLanguage]);

  // Backlog #81 : lien "voir le récap" déposé côté Rust par le poller à la fin d'une
  // partie (voir `riot_local::PostgameLinkState`) et poussé au focus de la fenêtre
  // principale (le clic sur la notification Windows active l'app sans callback direct
  // exploitable côté plugin, donc c'est le focus qui sert de déclencheur). N'a de sens que
  // pour la fenêtre principale — l'overlay n'a pas de router applicatif.
  useEffect(() => {
    if (getCurrentWindow().label.startsWith("overlay")) return;
    const unlisten = listen<{ region: string; name: string; tag: string }>(
      "postgame://navigate",
      (event) => {
        const { region, name, tag } = event.payload;
        navigate(`/joueur/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}/matchs`);
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [navigate]);

  // Backlog Fonctionnalités#2 : alimente navHistoryStore à chaque changement de route pour
  // les boutons précédent/suivant de TopNav — indépendant de l'historique de recherche
  // (recentSearchesStore), qui ne trace que les Riot ID consultés, pas la navigation
  // d'écran (Home ↔ Matchs ↔ Tendances...).
  useEffect(() => {
    recordNavHistory(location.pathname + location.search);
  }, [location.pathname, location.search, recordNavHistory]);

  // La fenêtre overlay V2 (créée par overlay::window côté Rust) rend uniquement
  // l'écran Overlay, sans titlebar ni navigation.
  if (getCurrentWindow().label.startsWith("overlay")) {
    return <Overlay />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {!compact && !focus && <FloatingSessionTabs />}
      {!focus && <Titlebar />}
      {focus && <FocusModeExitButton onExit={toggleFocus} />}
      {compact ? (
        <MiniOverlay />
      ) : (
        <>
          {!focus && (
            <>
              <TopNav />
              <UpdateBanner />
              <ChangelogModal />
              <StatusBanner />
            </>
          )}
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Suspense fallback={<RouteFallback />}>
              <RouteTransition>
                <Routes>
                  <Route path="/" element={<Search />} />
                  <Route path="/parametres" element={<Settings />} />
                  <Route path="/classement" element={<PageScroll><Leaderboard /></PageScroll>} />
                  <Route path="/esport" element={<PageScroll><Esports /></PageScroll>} />
                  <Route path="/esport/evenements" element={<PageScroll><VlrEvents /></PageScroll>} />
                  <Route path="/esport/evenements/:eventId" element={<PageScroll><VlrEventDetail /></PageScroll>} />
                  <Route path="/esport/match/:matchId" element={<PageScroll><VlrMatchDetail /></PageScroll>} />
                  <Route path="/esport/equipe/:teamId" element={<PageScroll><VlrTeamDetail /></PageScroll>} />
                  <Route path="/esport/joueur/:playerId" element={<PageScroll><VlrPlayerDetail /></PageScroll>} />
                  <Route path="/premier" element={<PageScroll><Premier /></PageScroll>} />
                  <Route path="/vs" element={<PageScroll><Compare /></PageScroll>} />
                  <Route path="/premier/equipe/:teamId" element={<PageScroll><PremierTeamDetail /></PageScroll>} />
                  <Route path="/joueur/:region/:name/:tag" element={<PlayerShell />}>
                    <Route index element={<Home />} />
                    <Route path="aujourdhui" element={<Today />} />
                    <Route path="tendances" element={<Trends />} />
                    <Route path="agents" element={<Agents />} />
                    <Route path="matchs" element={<MatchHistory />} />
                    <Route path="matchs/:matchId" element={<MatchDetail />} />
                    <Route path="matchs/:matchId/rapport" element={<MatchReport />} />
                    <Route path="cartes" element={<MapStats />} />
                    <Route path="duo" element={<Duo />} />
                  </Route>
                </Routes>
              </RouteTransition>
            </Suspense>
          </main>
        </>
      )}
    </div>
  );
}

/** Backlog #34 : rejoue `.route-enter` (index.css) à chaque changement de route en
 * remontant le wrapper via `key={pathname}` — un vrai remount plutôt qu'une transition
 * CSS sur le même noeud, plus simple qu'une lib d'animation pour un effet ponctuel. */
function RouteTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return (
    <div key={location.pathname} className="route-enter flex min-h-0 flex-1 flex-col overflow-hidden">
      {children}
    </div>
  );
}

function PageScroll({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl overflow-y-auto p-6">{children}</div>;
}

function RouteFallback() {
  return <SkeletonScreen className="p-6" />;
}

/** Backlog #63 : en mode focus, `Titlebar` (donc le drag/minimize/close de la fenêtre) est
 * masqué avec le reste du chrome — ce bouton discret (opacité au survol) reste l'unique
 * façon de sortir sans mémoriser Ctrl+Shift+F. */
function FocusModeExitButton({ onExit }: { onExit: () => void }) {
  const { t } = useTranslation("componentsCore");
  return (
    <button
      type="button"
      onClick={onExit}
      title="Ctrl+Shift+F"
      className="fixed right-3 top-3 z-50 border border-line bg-base/60 px-2 py-1 font-display text-[10px] font-semibold uppercase tracking-hud text-lo opacity-20 transition-opacity hover:opacity-100 hover:text-accent"
    >
      {t("focusMode.exit")}
    </button>
  );
}
