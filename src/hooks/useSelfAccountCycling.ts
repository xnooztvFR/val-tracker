import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useSelfAccountsStore } from "../store/selfAccountsStore";

/** TODO Social/multi-comptes : Ctrl+Tab / Ctrl+Shift+Tab cycle entre les comptes "à soi"
 * (smurfs/alts), sans repasser par la souris via AccountSwitcher.tsx. Monté une fois dans
 * App.tsx (pas dans AccountSwitcher) pour fonctionner même dropdown fermé. Ne capture le
 * raccourci (`preventDefault`) que s'il y a au moins 2 comptes "à soi" — sinon laisse
 * Ctrl+Tab à son comportement par défaut (rien à cycler). */
export function useSelfAccountCycling() {
  const { accounts, refresh } = useSelfAccountsStore();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey || e.key !== "Tab" || accounts.length < 2) return;
      e.preventDefault();

      const match = location.pathname.match(
        /^\/joueur\/[^/]+\/([^/]+)\/([^/]+)/,
      );
      const currentName = match ? decodeURIComponent(match[1]) : null;
      const currentTag = match ? decodeURIComponent(match[2]) : null;
      const currentIndex = accounts.findIndex(
        (a) =>
          a.name.toLowerCase() === currentName?.toLowerCase() &&
          a.tag.toLowerCase() === currentTag?.toLowerCase(),
      );

      const direction = e.shiftKey ? -1 : 1;
      const nextIndex =
        currentIndex === -1
          ? 0
          : (currentIndex + direction + accounts.length) % accounts.length;
      const next = accounts[nextIndex];
      navigate(
        `/joueur/${next.region}/${encodeURIComponent(next.name)}/${encodeURIComponent(next.tag)}`,
      );
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [accounts, location.pathname, navigate]);
}
