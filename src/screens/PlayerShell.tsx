import { useEffect } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";

import { useAccount } from "../hooks/usePlayer";
import { useActivePlayerStore } from "../store/activePlayerStore";

/** Layout des écrans /joueur/:region/:name/:tag/* — synchronise le joueur actif (lu par
 * TopNav pour construire ses onglets/chip de profil) depuis les paramètres de route, puis
 * affiche l'écran courant. La nav elle-même vit dans TopNav (globale à l'app). */
export default function PlayerShell() {
  const { region, name, tag } = useParams<{ region: string; name: string; tag: string }>();
  const setPlayer = useActivePlayerStore((s) => s.setPlayer);
  const account = useAccount(name, tag);
  const navigate = useNavigate();
  const location = useLocation();

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
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl p-6">
        <Outlet />
      </div>
    </div>
  );
}
