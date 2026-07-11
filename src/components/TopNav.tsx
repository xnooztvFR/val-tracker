import { NavLink, useNavigate } from "react-router-dom";

const GLOBAL_TABS = [
  { to: "/classement", label: "Classement" },
  { to: "/premier", label: "Premier" },
  { to: "/esport", label: "Esport" },
] as const;

import { useActivePlayerStore } from "../store/activePlayerStore";
import { useAccount, useMmr } from "../hooks/usePlayer";
import { playerCardIconUrl, rankGlowColor, rankInfo } from "../lib/format";
import DetectionStatusBadge from "./DetectionStatusBadge";

const TABS = [
  { to: "", label: "Accueil", end: true },
  { to: "/matchs", label: "Historique", end: false },
  { to: "/tendances", label: "Tendances", end: true },
  { to: "/agents", label: "Agents", end: true },
  { to: "/cartes", label: "Cartes", end: true },
  { to: "/duo", label: "Duo", end: true },
] as const;

/** Barre de navigation globale unique : logo, onglets du joueur actif (masqués tant
 * qu'aucun joueur n'est suivi) et, à droite, un chip de profil connecté. */
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

      <div className="flex items-stretch">
        {GLOBAL_TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex items-center border-b-2 px-3 font-display text-[13px] font-semibold uppercase tracking-hud transition-colors ${
                isActive ? "border-accent text-hi" : "border-transparent text-lo hover:text-hi"
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      <div className="flex-1" />

      <DetectionStatusBadge />

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

function GearIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <path
        fillRule="evenodd"
        d="M10 1a1 1 0 01.993.883L11 2v.09a7.95 7.95 0 012.03.84l.06-.06a1 1 0 011.497 1.32l-.083.094-.064.063c.37.55.653 1.16.833 1.816h.09a1 1 0 01.117 1.994L15.36 8h-.09a7.95 7.95 0 01-.84 2.03l.06.06a1 1 0 01-1.32 1.497l-.094-.083-.063-.064a7.96 7.96 0 01-1.816.833v.09a1 1 0 01-1.994.117L9 12.36v-.09a7.95 7.95 0 01-2.03-.84l-.06.06a1 1 0 01-1.497-1.32l.083-.094.064-.063A7.96 7.96 0 014.667 8.2h-.09a1 1 0 01-.117-1.994L4.64 6.2h.09a7.95 7.95 0 01.84-2.03l-.06-.06A1 1 0 016.83 2.613l.094.083.063.064A7.96 7.96 0 018.803 1.93V1.84A1 1 0 0110 1zm0 5a3 3 0 100 6 3 3 0 000-6z"
        clipRule="evenodd"
      />
    </svg>
  );
}
