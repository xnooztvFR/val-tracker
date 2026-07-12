import { useTranslation } from "react-i18next";

import { useActivePlayerStore } from "../store/activePlayerStore";
import { useAccount, useMmr } from "../hooks/usePlayer";
import { useMatches } from "../hooks/useMatches";
import { playerCardIconUrl, rankGlowColor, rankInfo } from "../lib/format";

/** Contenu affiché en mode "mini" (fenêtre réduite, always-on-top) : un résumé condensé
 * du profil suivi, pensé pour rester visible en jeu sans masquer l'écran. Remplace tout
 * le shell routé tant que le mode mini est actif (voir App.tsx). */
export default function MiniOverlay() {
  const { t } = useTranslation("componentsExtra");
  const { player } = useActivePlayerStore();

  const account = useAccount(player?.name, player?.tag);
  const puuid = account.data?.data.puuid;
  const mmr = useMmr({ puuid, region: player?.region, name: player?.name, tag: player?.tag });
  const matches = useMatches({ region: player?.region, name: player?.name, tag: player?.tag, size: 20 });

  if (!player) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-lo">
        {t("miniOverlay.choosePlayer")}
      </div>
    );
  }

  const current = mmr.data?.data.current_data;
  const accountData = account.data?.data;
  const info = rankInfo(current?.currenttier);
  const glow = rankGlowColor(current?.currenttier);

  let wins = 0;
  let played = 0;
  if (matches.data && puuid) {
    for (const match of matches.data.data) {
      const p = match.players.find((pl) => pl.puuid === puuid);
      if (!p?.stats) continue;
      played += 1;
      const team = match.teams.find((t) => t.team_id === p.team_id);
      if (team?.won) wins += 1;
    }
  }
  const winPercent = played > 0 ? Math.round((wins / played) * 100) : null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      {accountData?.card ? (
        <img
          src={playerCardIconUrl(accountData.card)}
          alt=""
          className="h-20 w-20 border-2 object-cover"
          style={{ borderColor: glow }}
        />
      ) : (
        <div className="h-20 w-20 border-2 bg-surface" style={{ borderColor: glow }} />
      )}

      <div>
        <p className="text-base font-semibold text-hi">
          {player.name}
          <span className="text-lo">#{player.tag}</span>
        </p>
        <p className="mt-1 flex items-center justify-center gap-2">
          <img src={info.iconUrl} alt="" className="h-8 w-8 object-contain" />
          <span className={`font-display text-sm font-semibold uppercase tracking-hud ${info.colorClass}`}>
            {info.name}
            {current?.ranking_in_tier !== undefined && current?.ranking_in_tier !== null
              ? ` · ${t("miniOverlay.rrSuffix", { rr: current.ranking_in_tier })}`
              : ""}
          </span>
        </p>
      </div>

      {winPercent !== null && (
        <div className="panel-clip-sm flex items-center gap-2 px-4 py-1.5 text-xs text-hi">
          <span className={`stat-value ${winPercent >= 50 ? "text-accent" : "text-crit"}`}>
            {winPercent}% WR
          </span>
          <span className="text-lo">·</span>
          <span className="tnum">{t("miniOverlay.recentMatches", { count: played })}</span>
        </div>
      )}
    </div>
  );
}
