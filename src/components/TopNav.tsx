import { useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";

import { useActivePlayerStore } from "../store/activePlayerStore";
import { useTabOrderStore, resolveTabOrder } from "../store/tabOrderStore";
import { useNavHistoryStore } from "../store/navHistoryStore";
import { usePinnedTabsStore } from "../store/pinnedTabsStore";
import { useCompareDropStore } from "../store/compareDropStore";
import { readMatchDragPayload } from "../lib/matchDrag";
import { useAccount, useMmr } from "../hooks/usePlayer";
import { playerCardIconUrl, rankGlowColor, rankInfo } from "../lib/format";
import { tauriApi } from "../lib/tauriApi";
import DetectionStatusBadge from "./DetectionStatusBadge";
import ApiStatusBadge from "./ApiStatusBadge";
import DataFreshnessDot from "./DataFreshnessDot";
import AccountSwitcher from "./AccountSwitcher";
import logo from "../assets/logo.png";

// Backlog #85 : même taille d'échantillon que MatchHistory.tsx (MATCH_HISTORY_SIZE) — le
// prefetch doit produire la même queryKey que useMatches() pour que React Query serve le
// cache au lieu de refetch à l'arrivée sur l'écran.
const MATCH_HISTORY_PREFETCH_SIZE = 20;

const GLOBAL_TABS = [
  { to: "/classement", key: "leaderboard" },
  { to: "/premier", key: "premier" },
  { to: "/esport", key: "esports" },
  { to: "/vs", key: "vs" },
] as const;

const TABS = [
  { to: "", key: "home", end: true },
  { to: "/aujourdhui", key: "today", end: true },
  { to: "/matchs", key: "history", end: false },
  { to: "/tendances", key: "trends", end: true },
  { to: "/agents", key: "agents", end: true },
  { to: "/cartes", key: "maps", end: true },
  { to: "/duo", key: "duo", end: true },
] as const;

const DEFAULT_TAB_KEYS = TABS.map((tab) => tab.key);

/** Barre de navigation globale unique : logo, onglets du joueur actif (masqués tant
 * qu'aucun joueur n'est suivi), un menu "Plus" pour les sections hors-profil (backlog UI :
 * la fenêtre a une largeur fixe — 10 onglets + les badges de droite débordaient et
 * compressaient le chip de profil, d'où le regroupement des onglets globaux ici) et, à
 * droite, un chip de profil connecté. */
export default function TopNav() {
  const { t } = useTranslation("componentsCore");
  const { player, clear } = useActivePlayerStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tabOrder = useTabOrderStore((s) => s.order);
  const reorderTabs = useTabOrderStore((s) => s.reorder);
  const [draggedTabKey, setDraggedTabKey] = useState<string | null>(null);
  const pinnedIsPinned = usePinnedTabsStore((s) => s.isPinned);
  const togglePinned = usePinnedTabsStore((s) => s.toggle);
  const isCurrentPinned = player ? pinnedIsPinned(player) : false;
  const navBack = useNavHistoryStore((s) => s.back);
  const navForward = useNavHistoryStore((s) => s.forward);
  const canGoBack = useNavHistoryStore((s) => s.index > 0);
  const canGoForward = useNavHistoryStore((s) => s.index < s.stack.length - 1);

  function handleNavBack() {
    const path = navBack();
    if (path) navigate(path);
  }

  function handleNavForward() {
    const path = navForward();
    if (path) navigate(path);
  }

  function prefetchMatchHistory() {
    if (!player) return;
    const { region, name, tag } = player;
    queryClient.prefetchQuery({
      queryKey: ["matches", region, name, tag, MATCH_HISTORY_PREFETCH_SIZE],
      queryFn: () => tauriApi.fetchMatches(region, name, tag, MATCH_HISTORY_PREFETCH_SIZE),
    });
  }

  const account = useAccount(player?.name, player?.tag);
  const puuid = account.data?.data.puuid;
  const mmr = useMmr({ puuid, region: player?.region, name: player?.name, tag: player?.tag });

  // Backlog #64 : ordre des onglets réordonnable par drag & drop, persisté en localStorage
  // (préférence purement locale, voir tabOrderStore.ts). `resolveTabOrder` retombe sur
  // DEFAULT_TAB_KEYS tant que rien n'a encore été glissé cette session.
  const orderedTabs = useMemo(() => {
    const order = tabOrder.length > 0 ? tabOrder : resolveTabOrder(DEFAULT_TAB_KEYS);
    return order
      .map((key) => TABS.find((tab) => tab.key === key))
      .filter((tab): tab is (typeof TABS)[number] => Boolean(tab));
  }, [tabOrder]);

  return (
    <nav className="flex h-11 shrink-0 items-stretch border-b border-line bg-base px-3">
      <button
        type="button"
        onClick={() => navigate(player ? `/joueur/${player.region}/${player.name}/${player.tag}` : "/")}
        aria-label={t("topNav.home")}
        className="mr-3 flex shrink-0 items-center gap-2 self-center pr-2"
      >
        <img src={logo} alt="" className="h-6 w-6 object-contain" />
      </button>

      <button
        type="button"
        onClick={handleNavBack}
        disabled={!canGoBack}
        aria-label={t("topNav.navBack")}
        title={t("topNav.navBack")}
        className="flex h-8 w-6 shrink-0 items-center justify-center self-center text-lo transition-colors hover:bg-raised hover:text-hi disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronIcon direction="left" />
      </button>
      <button
        type="button"
        onClick={handleNavForward}
        disabled={!canGoForward}
        aria-label={t("topNav.navForward")}
        title={t("topNav.navForward")}
        className="mr-3 flex h-8 w-6 shrink-0 items-center justify-center self-center text-lo transition-colors hover:bg-raised hover:text-hi disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronIcon direction="right" />
      </button>

      <span
        title={t("topNav.commandPaletteHint")}
        aria-hidden="true"
        className="hud-label mr-3 hidden shrink-0 self-center border border-line px-1.5 py-0.5 text-[9px] text-lo/70 sm:inline-block"
      >
        Ctrl+K
      </span>

      {player && (
        <div className="flex items-stretch">
          {orderedTabs.map((tab) => (
            <NavLink
              key={tab.key}
              to={`/joueur/${player.region}/${player.name}/${player.tag}${tab.to}`}
              end={tab.end}
              draggable
              onMouseEnter={tab.key === "history" ? prefetchMatchHistory : undefined}
              onDragStart={() => setDraggedTabKey(tab.key)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (draggedTabKey) reorderTabs(DEFAULT_TAB_KEYS, draggedTabKey, tab.key);
              }}
              onDragEnd={() => setDraggedTabKey(null)}
              className={({ isActive }) =>
                `flex cursor-grab items-center border-b-2 px-3 font-display text-[13px] font-semibold uppercase tracking-hud transition-colors active:cursor-grabbing ${
                  isActive
                    ? "border-accent text-hi"
                    : "border-transparent text-lo hover:text-hi"
                } ${draggedTabKey === tab.key ? "opacity-40" : ""}`
              }
            >
              {t(`topNav.tabs.${tab.key}`)}
            </NavLink>
          ))}
        </div>
      )}

      <MoreMenu />

      <div className="flex-1" />

      <DataFreshnessDot />
      <ApiStatusBadge />
      <DetectionStatusBadge />

      <AccountSwitcher current={player && puuid ? { puuid, region: player.region, name: player.name, tag: player.tag } : undefined} />

      {player && (
        <button
          type="button"
          onClick={() => {
            clear();
            navigate("/");
          }}
          aria-label={t("topNav.changePlayer")}
          title={t("topNav.changePlayer")}
          className="flex h-8 w-8 shrink-0 items-center justify-center self-center text-lo transition-colors hover:bg-raised hover:text-hi"
        >
          <SearchIcon />
        </button>
      )}

      <button
        type="button"
        onClick={() => navigate("/parametres")}
        aria-label={t("topNav.settings")}
        title={t("topNav.settings")}
        className="flex h-8 w-8 shrink-0 items-center justify-center self-center text-hi/70 transition-colors hover:bg-raised hover:text-accent"
      >
        <GearIcon />
      </button>

      {player && (
        <button
          type="button"
          onClick={() => togglePinned(player)}
          aria-label={t(isCurrentPinned ? "topNav.unpinProfile" : "topNav.pinProfile")}
          title={t(isCurrentPinned ? "topNav.unpinProfile" : "topNav.pinProfile")}
          className={`flex h-8 w-8 shrink-0 items-center justify-center self-center transition-colors hover:bg-raised ${
            isCurrentPinned ? "text-accent" : "text-lo/60 hover:text-lo"
          }`}
        >
          <PinIcon filled={isCurrentPinned} />
        </button>
      )}

      {player && (
        <div className="self-center">
          <ProfileChip player={player} account={account.data?.data} mmr={mmr.data?.data} />
        </div>
      )}
    </nav>
  );
}

/** Regroupe les sections hors-profil (Classement/Premier/Esport/VS) dans un menu déroulant
 * plutôt que 4 onglets fixes en permanence — voir la doc de TopNav pour le contexte
 * (débordement de la barre à largeur fixe). */
function MoreMenu() {
  const { t } = useTranslation("componentsCore");
  const [open, setOpen] = useState(false);
  const [dropHover, setDropHover] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const setCompareDropPending = useCompareDropStore((s) => s.setPending);
  const isActive = GLOBAL_TABS.some((tab) => location.pathname.startsWith(tab.to));

  return (
    <div className="relative flex items-stretch">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onDragOver={(e) => {
          e.preventDefault();
          setDropHover(true);
        }}
        onDragLeave={() => setDropHover(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDropHover(false);
          const payload = readMatchDragPayload(e.dataTransfer);
          if (!payload) return;
          // Backlog Fonctionnalités#6 : dépose d'un match sur "Plus" (qui héberge l'onglet
          // VS/Compare, voir GLOBAL_TABS) — pré-remplit le premier emplacement de Compare
          // avec le profil consulté, via compareDropStore (voir Compare.tsx).
          setCompareDropPending({ region: payload.region, name: payload.name, tag: payload.tag });
          setOpen(false);
          navigate("/vs");
        }}
        title={dropHover ? t("topNav.dropOnVs") : undefined}
        className={`flex items-center gap-1.5 border-b-2 px-3 font-display text-[13px] font-semibold uppercase tracking-hud transition-colors ${
          isActive ? "border-accent text-hi" : "border-transparent text-lo hover:text-hi"
        } ${dropHover ? "border-accent bg-raised text-accent" : ""}`}
      >
        <GridIcon />
        {t("topNav.more")}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label={t("topNav.close")}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="panel-clip-sm absolute left-0 top-full z-20 mt-1 w-44 border border-line bg-raised p-1 shadow-lg">
            {GLOBAL_TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                onClick={() => setOpen(false)}
                className={({ isActive: linkActive }) =>
                  `block px-3 py-2 font-display text-[12px] font-semibold uppercase tracking-hud transition-colors ${
                    linkActive ? "bg-base text-hi" : "text-lo hover:bg-base hover:text-hi"
                  }`
                }
              >
                {t(`topNav.tabs.${tab.key}`)}
              </NavLink>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ProfileChip({
  player,
  account,
  mmr,
}: {
  player: { region: string; name: string; tag: string };
  account?: { card: string | null };
  mmr?: { current_data: { currenttier: number | null } | null };
}) {
  const navigate = useNavigate();
  const tier = mmr?.current_data?.currenttier;
  const info = rankInfo(tier);
  const glow = rankGlowColor(tier);

  return (
    <button
      type="button"
      onClick={() => navigate(`/joueur/${player.region}/${player.name}/${player.tag}`)}
      className="panel-clip-sm ml-1 flex items-center gap-2 py-1 pl-1.5 pr-3 transition-colors hover:bg-raised"
    >
      {account?.card ? (
        <img
          src={playerCardIconUrl(account.card)}
          alt=""
          className="h-6 w-6 border object-cover"
          style={{ borderColor: glow }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
          }}
        />
      ) : (
        <div className="h-6 w-6 border bg-base" style={{ borderColor: glow }} />
      )}
      <span className="text-left leading-tight">
        <p className="text-xs font-semibold text-hi">
          {player.name}
          <span className="text-lo">#{player.tag}</span>
        </p>
        <p className={`font-display text-[10px] font-semibold uppercase tracking-hud ${info.colorClass}`}>
          {info.name}
        </p>
      </span>
    </button>
  );
}

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill={filled ? "currentColor" : "none"} className="h-4 w-4">
      <path
        d="M10 2.5l1.4 3.9 4.1.5-3.1 2.9.9 4.1-3.3-2.1-3.3 2.1.9-4.1-3.1-2.9 4.1-.5L10 2.5z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path
        d={direction === "left" ? "M12.5 4.5L6.5 10l6 5.5" : "M7.5 4.5l6 5.5-6 5.5"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M17 17l-3.8-3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <rect x="2" y="2" width="6" height="6" rx="1" />
      <rect x="12" y="2" width="6" height="6" rx="1" />
      <rect x="2" y="12" width="6" height="6" rx="1" />
      <rect x="12" y="12" width="6" height="6" rx="1" />
    </svg>
  );
}

/** Icône engrenage (cog) standard — remplace l'ancienne version peu lisible à cette
 * taille (dents trop fines/asymétriques). */
function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path
        d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M19.4 13.5a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V19.5a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1.08-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H2.5a2 2 0 110-4h.09a1.65 1.65 0 001.51-1.08 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H8.5a1.65 1.65 0 001-1.51V2.5a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.09a1.65 1.65 0 001.51 1H21.5a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
