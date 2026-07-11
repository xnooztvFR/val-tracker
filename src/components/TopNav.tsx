import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import { useActivePlayerStore } from "../store/activePlayerStore";
import { useAccount, useMmr } from "../hooks/usePlayer";
import { playerCardIconUrl, rankGlowColor, rankInfo } from "../lib/format";
import DetectionStatusBadge from "./DetectionStatusBadge";
import ApiStatusBadge from "./ApiStatusBadge";
import AccountSwitcher from "./AccountSwitcher";

const GLOBAL_TABS = [
  { to: "/classement", label: "Classement" },
  { to: "/premier", label: "Premier" },
  { to: "/esport", label: "Esport" },
  { to: "/vs", label: "VS" },
] as const;

const TABS = [
  { to: "", label: "Accueil", end: true },
  { to: "/matchs", label: "Historique", end: false },
  { to: "/tendances", label: "Tendances", end: true },
  { to: "/agents", label: "Agents", end: true },
  { to: "/cartes", label: "Cartes", end: true },
  { to: "/duo", label: "Duo", end: true },
] as const;

/** Barre de navigation globale unique : logo, onglets du joueur actif (masqués tant
 * qu'aucun joueur n'est suivi), un menu "Plus" pour les sections hors-profil (backlog UI :
 * la fenêtre a une largeur fixe — 10 onglets + les badges de droite débordaient et
 * compressaient le chip de profil, d'où le regroupement des onglets globaux ici) et, à
 * droite, un chip de profil connecté. */
export default function TopNav() {
  const { player, clear } = useActivePlayerStore();
  const navigate = useNavigate();

  const account = useAccount(player?.name, player?.tag);
  const puuid = account.data?.data.puuid;
  const mmr = useMmr({ puuid, region: player?.region, name: player?.name, tag: player?.tag });

  return (
    <nav className="flex h-11 shrink-0 items-stretch border-b border-line bg-base px-3">
      <button
        type="button"
        onClick={() => navigate(player ? `/joueur/${player.region}/${player.name}/${player.tag}` : "/")}
        aria-label="Accueil"
        className="mr-3 flex shrink-0 items-center gap-2 self-center pr-2"
      >
        <div className="btn-clip flex h-6 w-6 items-center justify-center bg-accent font-display text-xs font-bold text-base">
          V
        </div>
      </button>

      {player && (
        <div className="flex items-stretch">
          {TABS.map((tab) => (
            <NavLink
              key={tab.label}
              to={`/joueur/${player.region}/${player.name}/${player.tag}${tab.to}`}
              end={tab.end}
              className={({ isActive }) =>
                `flex items-center border-b-2 px-3 font-display text-[13px] font-semibold uppercase tracking-hud transition-colors ${
                  isActive
                    ? "border-accent text-hi"
                    : "border-transparent text-lo hover:text-hi"
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      )}

      <MoreMenu />

      <div className="flex-1" />

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
          aria-label="Changer de joueur"
          title="Changer de joueur"
          className="flex h-8 w-8 shrink-0 items-center justify-center self-center text-lo transition-colors hover:bg-raised hover:text-hi"
        >
          <SearchIcon />
        </button>
      )}

      <button
        type="button"
        onClick={() => navigate("/parametres")}
        aria-label="Paramètres"
        title="Paramètres"
        className="flex h-8 w-8 shrink-0 items-center justify-center self-center text-hi/70 transition-colors hover:bg-raised hover:text-accent"
      >
        <GearIcon />
      </button>

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
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const isActive = GLOBAL_TABS.some((tab) => location.pathname.startsWith(tab.to));

  return (
    <div className="relative flex items-stretch">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 border-b-2 px-3 font-display text-[13px] font-semibold uppercase tracking-hud transition-colors ${
          isActive ? "border-accent text-hi" : "border-transparent text-lo hover:text-hi"
        }`}
      >
        <GridIcon />
        Plus
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Fermer"
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
                {tab.label}
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
