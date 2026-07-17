import { useEffect } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";

import { useAccount, useMmr } from "../hooks/usePlayer";
import { useActivePlayerStore } from "../store/activePlayerStore";
import { useSettingsStore } from "../store/settingsStore";
import { rankGlowColor } from "../lib/format";

/** Layout des écrans /joueur/:region/:name/:tag/* — synchronise le joueur actif (lu par
 * TopNav pour construire ses onglets/chip de profil) depuis les paramètres de route, puis
 * affiche l'écran courant. La nav elle-même vit dans TopNav (globale à l'app). */
export default function PlayerShell() {
  const { region, name, tag } = useParams<{ region: string; name: string; tag: string }>();
  const setPlayer = useActivePlayerStore((s) => s.setPlayer);
  const account = useAccount(name, tag);
  const navigate = useNavigate();
  const location = useLocation();
  const puuid = account.data?.data.puuid;
  const wallpaperEnabled = useSettingsStore((s) => s.settings?.wallpaper_enabled ?? false);
  // TODO Design#2 : fond d'écran généré depuis la couleur du rang actuel — cosmétique,
  // désactivable dans Paramètres (défaut off). Même queryKey que TopNav.tsx (`["mmr", ...]`),
  // donc React Query sert le même cache/requête en vol plutôt que de dupliquer l'appel réseau.
  const mmr = useMmr({ puuid, region, name, tag });
  const wallpaperColor = wallpaperEnabled
    ? rankGlowColor(mmr.data?.data.current_data?.currenttier)
    : null;

  useEffect(() => {
    if (region && name && tag) setPlayer({ region, name, tag });
  }, [region, name, tag, setPlayer]);

  // TODO #73 : si le joueur a changé de région Riot, la région détectée par Henrik peut
  // différer de celle figée dans l'URL (choix initial de recherche ou cache local
  // recent_searches/favorites) — on se resynchronise plutôt que de laisser les requêtes
  // suivantes échouer en 404 sur la mauvaise région.
  const detectedRegion = account.data?.data?.region;
  useEffect(() => {
    if (!region || !detectedRegion || detectedRegion === region) return;
    navigate(location.pathname.replace(`/joueur/${region}/`, `/joueur/${detectedRegion}/`) + location.search, {
      replace: true,
    });
  }, [region, detectedRegion, location.pathname, location.search, navigate]);

  if (!region || !name || !tag) return null;

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={
        wallpaperColor
          ? { background: `radial-gradient(ellipse at top, ${hexToRgba(wallpaperColor, 0.09)}, transparent 60%)` }
          : undefined
      }
    >
      <div className="mx-auto w-full max-w-6xl p-6">
        <Outlet />
      </div>
    </div>
  );
}

/** Convertit `#RRGGBB` en `rgba(...)` — évite `rgb(from ...)` (syntaxe de couleur relative
 * CSS trop récente pour être garantie sur toutes les versions de WebView2 ciblées). */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
