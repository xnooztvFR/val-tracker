import { lazy, Suspense, useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";

import Titlebar from "./components/Titlebar";
import Overlay from "./screens/Overlay";
import TopNav from "./components/TopNav";
import StatusBanner from "./components/StatusBanner";
import MiniOverlay from "./components/MiniOverlay";
import UpdateBanner from "./components/UpdateBanner";
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

export default function App() {
  const compact = useUiStore((s) => s.compact);
  const refreshSettings = useSettingsStore((s) => s.refresh);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  // La fenêtre overlay V2 (créée par overlay::window côté Rust) rend uniquement
  // l'écran Overlay, sans titlebar ni navigation.
  if (getCurrentWindow().label === "overlay") {
    return <Overlay />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
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
            </Suspense>
          </main>
        </>
      )}
    </div>
  );
}

function PageScroll({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl overflow-y-auto p-6">{children}</div>;
}

function RouteFallback() {
  return <p className="p-6 text-sm text-lo">Chargement…</p>;
}
