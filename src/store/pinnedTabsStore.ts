import { create } from "zustand";

// TODO Fonctionnalités#1 : onglets flottants de session — épingler 2-3 profils consultés
// pour y revenir en un clic pendant qu'on navigue ailleurs, sans passer par l'écran
// Compare (/vs) qui reste un formulaire figé pensé pour une comparaison ponctuelle plutôt
// qu'un accès rapide multi-profils. Pure préférence d'affichage locale (même esprit que
// tabOrderStore.ts) — persistée en localStorage, pas côté backend SQLite.

const STORAGE_KEY = "val-tracker:pinned-tabs";
const MAX_PINNED = 3;

export interface PinnedPlayer {
  region: string;
  name: string;
  tag: string;
}

interface PinnedTabsState {
  pinned: PinnedPlayer[];
  isPinned: (p: PinnedPlayer) => boolean;
  toggle: (p: PinnedPlayer) => void;
  remove: (p: PinnedPlayer) => void;
}

function samePlayer(a: PinnedPlayer, b: PinnedPlayer): boolean {
  return (
    a.region === b.region &&
    a.name.toLowerCase() === b.name.toLowerCase() &&
    a.tag.toLowerCase() === b.tag.toLowerCase()
  );
}

function readStored(): PinnedPlayer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is PinnedPlayer =>
        p && typeof p.region === "string" && typeof p.name === "string" && typeof p.tag === "string",
    );
  } catch {
    return [];
  }
}

function persist(list: PinnedPlayer[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* best-effort */
  }
}

export const usePinnedTabsStore = create<PinnedTabsState>((set, get) => ({
  pinned: readStored(),

  isPinned: (p) => get().pinned.some((x) => samePlayer(x, p)),

  toggle: (p) => {
    set((s) => {
      const exists = s.pinned.some((x) => samePlayer(x, p));
      // Au-delà de MAX_PINNED, on retire le plus ancien épinglé plutôt que de refuser
      // l'ajout — cohérent avec l'esprit "2-3 profils légers", pas une liste à gérer.
      const next = exists ? s.pinned.filter((x) => !samePlayer(x, p)) : [...s.pinned, p].slice(-MAX_PINNED);
      persist(next);
      return { pinned: next };
    });
  },

  remove: (p) => {
    set((s) => {
      const next = s.pinned.filter((x) => !samePlayer(x, p));
      persist(next);
      return { pinned: next };
    });
  },
}));
