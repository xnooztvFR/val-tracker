import { lazy, Suspense, useEffect, useState } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import i18n from "./i18n";

import Titlebar from "./components/Titlebar";
import { SkeletonScreen } from "./components/Skeleton";
import Overlay from "./screens/Overlay";
import TopNav from "./components/TopNav";
import StatusBanner from "./components/StatusBanner";
import MiniOverlay from "./components/MiniOverlay";
import UpdateBanner from "./components/UpdateBanner";
import CommandPalette from "./components/CommandPalette";
import Search from "./screens/Search";
import { useUiStore } from "./store/uiStore";
import { useSettingsStore } from "./store/settingsStore";

// Écrans chargés à la demande (React.lazy) : seul l'écran de recherche (route "/",
// premier rendu de l'app) est dans le bundle initial. Le reste — profil joueur, recharts
// (Trends/MapStats/RankHistoryChart), classement, Premier, esport VLR — n'est téléchargé
// que quand l'utilisateur y navigue, pour garder le chunk JS de démarrage petit.
const Settings = lazy(() => import("./screens/Settings"));
const PlayerShell = lazy(() => import("./screens/PlayerShell"));
const Home = lazy(() => import("./screens/Home"));
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
  const compact = useUiStore((s) => s.compact);
  const refreshSettings = useSettingsStore((s) => s.refresh);
  const uiTheme = useSettingsStore((s) => s.settings?.ui_theme);
  const uiAccent = useSettingsStore((s) => s.settings?.ui_accent);
  const uiLanguage = useSettingsStore((s) => s.settings?.ui_language);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  // Backlog #25 : Ctrl+K ouvre la palette de commande — écouteur frontend simple, cette
  // fenêtre doit juste avoir le focus (contrairement à Ctrl+Shift+V qui est un raccourci
  // global côté Rust pour marcher jeu au premier plan, voir overlay/window.rs).
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
    if (uiAccent && uiAccent !== "red") {
      root.setAttribute("data-accent", uiAccent);
    } else {
      root.removeAttribute("data-accent");
    }
  }, [uiTheme, uiAccent]);

  // Système multilangue : reflète la préférence enregistrée (défaut "fr") sur l'instance
  // i18next partagée par toutes les fenêtres Tauri (dont l'overlay V2, qui a son propre
  // document mais importe le même singleton `i18n`).
  useEffect(() => {
    if (uiLanguage && uiLanguage !== i18n.language) {
      i18n.changeLanguage(uiLanguage);
    }
  }, [uiLanguage]);

  // La fenêtre overlay V2 (créée par overlay::window côté Rust) rend uniquement
  // l'écran Overlay, sans titlebar ni navigation.
  if (getCurrentWindow().label === "overlay") {
    return <Overlay />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Titlebar />
      {compact ? (
        <MiniOverlay />
      ) : (
        <>
          <TopNav />
          <UpdateBanner />
          <StatusBanner />
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
