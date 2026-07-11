import { useEffect } from "react";
import { Outlet, useParams } from "react-router-dom";

import { useActivePlayerStore } from "../store/activePlayerStore";

/** Layout des écrans /joueur/:region/:name/:tag/* — synchronise le joueur actif (lu par
 * TopNav pour construire ses onglets/chip de profil) depuis les paramètres de route, puis
 * affiche l'écran courant. La nav elle-même vit dans TopNav (globale à l'app). */
export default function PlayerShell() {
  const { region, name, tag } = useParams<{ region: string; name: string; tag: string }>();
  const setPlayer = useActivePlayerStore((s) => s.setPlayer);

  useEffect(() => {
    if (region && name && tag) setPlayer({ region, name, tag });
  }, [region, name, tag, setPlayer]);

  if (!region || !name || !tag) return null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl p-6">
        <Outlet />
      </div>
    </div>
  );
}
