import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useRecentSearchesStore } from "../store/recentSearchesStore";

interface PaletteItem {
  id: string;
  label: string;
  hint: string;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

/** Backlog #25 : palette de commande globale (Ctrl+K) — navigue vers les écrans
 * principaux et les joueurs récents/favoris sans repasser par la recherche. Ne fonctionne
 * que fenêtre focus (contrairement à Ctrl+Shift+V qui doit marcher jeu au premier plan,
 * voir CLAUDE.md § Overlay) : un simple listener frontend suffit, pas de raccourci global
 * Rust nécessaire. */
export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const navigate = useNavigate();
  const { players, refresh } = useRecentSearchesStore();

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      refresh();
    }
  }, [open, refresh]);

  const items = useMemo<PaletteItem[]>(() => {
    const staticItems: PaletteItem[] = [
      { id: "settings", label: "Paramètres", hint: "Écran", action: () => navigate("/parametres") },
      { id: "leaderboard", label: "Classement", hint: "Écran", action: () => navigate("/classement") },
      { id: "esport", label: "Esport", hint: "Écran", action: () => navigate("/esport") },
      { id: "premier", label: "Premier", hint: "Écran", action: () => navigate("/premier") },
      { id: "vs", label: "Comparaison VS", hint: "Écran", action: () => navigate("/vs") },
      { id: "search", label: "Rechercher un joueur", hint: "Écran", action: () => navigate("/") },
    ];
    const playerItems: PaletteItem[] = players.map((p) => ({
      id: p.puuid,
      label: `${p.name}#${p.tag}`,
      hint: p.is_favorite ? "Favori" : "Récent",
      action: () => navigate(`/joueur/${p.region}/${p.name}/${p.tag}`),
    }));

    const all = [...staticItems, ...playerItems];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((item) => item.label.toLowerCase().includes(q));
  }, [players, query, navigate]);

  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(items.length - 1, 0)));
  }, [items.length]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[selected];
      if (item) {
        item.action();
        onClose();
      }
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-24"
      onClick={onClose}
    >
      <div
        className="panel-clip w-full max-w-lg bg-surface"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Aller à... (écran, joueur récent/favori)"
          className="w-full border-b border-line bg-transparent px-4 py-3 text-sm text-hi placeholder:text-lo/60 focus:outline-none"
        />
        <ul className="max-h-80 overflow-y-auto py-1">
          {items.length === 0 && <li className="px-4 py-3 text-sm text-lo">Aucun résultat.</li>}
          {items.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  item.action();
                  onClose();
                }}
                onMouseEnter={() => setSelected(index)}
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors ${
                  index === selected ? "bg-raised text-hi" : "text-lo hover:bg-raised/60"
                }`}
              >
                <span>{item.label}</span>
                <span className="hud-label text-[10px] text-lo">{item.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
