import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useAccount } from "../hooks/usePlayer";
import { useMatchDetail } from "../hooks/useMatches";
import ErrorState from "../components/ErrorState";
import Panel from "../components/Panel";
import RecapCardModal from "../components/RecapCardModal";
import { buildMatchReport, type EconomyTier } from "../lib/matchReport";
import { buildMatchRecapData } from "../lib/recapCard";

const TIER_LABELS: Record<EconomyTier, string> = {
  eco: "Éco",
  force: "Force-buy",
  full: "Full-buy",
};

/** Rapport de match (V3) : décompose l'économie round par round et met en évidence les
 * meilleurs/pires rounds du joueur suivi — entièrement calculé côté client à partir du
 * détail de match déjà chargé par l'écran MatchDetail (aucun appel réseau ici). */
export default function MatchReport() {
  const { region, name, tag, matchId } = useParams<{
    region: string;
    name: string;
    tag: string;
    matchId: string;
  }>();

  const account = useAccount(name, tag);
  const puuid = account.data?.data.puuid;
  const detail = useMatchDetail(matchId);
  const [showRecap, setShowRecap] = useState(false);

  if (detail.isError) return <ErrorState error={detail.error} />;
  if (detail.isLoading || account.isLoading) {
    return <p className="text-sm text-lo">Chargement…</p>;
  }

  const data = detail.data?.data;
  const report = data && puuid ? buildMatchReport(data, puuid) : null;
  const recapData = data && puuid ? buildMatchRecapData(data, puuid) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to={`/joueur/${region}/${name}/${tag}/matchs/${matchId}`}
            className="text-xs text-lo transition-colors hover:text-accent"
          >
            ← Retour au détail du match
          </Link>
          <h1 className="mt-2 font-display text-lg font-bold uppercase tracking-hud text-hi">
            Rapport de match
          </h1>
        </div>
        {recapData && (
          <button
            type="button"
            onClick={() => setShowRecap(true)}
            className="btn-clip mt-1 shrink-0 bg-accent px-4 py-2 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-[#96F0DF]"
          >
            Carte de recap
          </button>
        )}
      </div>

      {showRecap && recapData && (
        <RecapCardModal data={recapData} onClose={() => setShowRecap(false)} />
      )}

      {!report && (
        <p className="text-sm text-lo">
          Pas assez de données pour générer un rapport sur ce match.
        </p>
      )}

      {report && (
        <>
          <Panel className="p-4">
            <p className="hud-label mb-3">Déroulé économique ({report.rounds.length} rounds)</p>
            <div className="flex flex-wrap gap-1">
              {report.rounds.map((round) => (
                <div
                  key={round.index}
                  title={`Round ${round.index} — ${round.won ? "gagné" : "perdu"} — ${TIER_LABELS[round.economyTier]} (${Math.round(round.teamAvgLoadout)} cr. moy.)`}
                  className={`flex h-9 w-9 flex-col items-center justify-center border text-[10px] font-semibold ${
                    round.won ? "border-accent/60 bg-accent/10 text-accent" : "border-crit/60 bg-crit/10 text-crit"
                  }`}
                >
                  <span className="stat-value">{round.index}</span>
                  <span className="text-[8px] uppercase tracking-hud text-lo">
                    {TIER_LABELS[round.economyTier].slice(0, 4)}
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="p-4">
            <p className="hud-label mb-3">Winrate par type d'achat</p>
            <div className="space-y-2">
              {report.economyBreakdown.map((bucket) => {
                const winPercent =
                  bucket.roundsPlayed > 0
                    ? Math.round((bucket.roundsWon / bucket.roundsPlayed) * 100)
                    : null;
                return (
                  <div key={bucket.tier} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-sm text-hi">{TIER_LABELS[bucket.tier]}</span>
                    <div className="h-2 flex-1 bg-surface">
                      <div
                        className="h-2 bg-accent"
                        style={{ width: `${winPercent ?? 0}%` }}
                      />
                    </div>
                    <span className="stat-value w-24 shrink-0 text-right text-xs text-lo">
                      {bucket.roundsPlayed === 0
                        ? "—"
                        : `${bucket.roundsWon}/${bucket.roundsPlayed} (${winPercent}%)`}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-lo">
              Estimé à partir de la valeur de loadout moyenne de ton équipe sur chaque round
              — pas un calcul officiel Riot, juste un repère.
            </p>
          </Panel>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {report.bestRound && (
              <Panel className="p-4">
                <p className="hud-label mb-1 !text-accent">Meilleur round</p>
                <p className="stat-value text-2xl text-hi">Round {report.bestRound.index}</p>
                <p className="text-xs text-lo">
                  {report.bestRound.kills} kill(s) · {report.bestRound.damage} dégâts
                </p>
              </Panel>
            )}
            {report.worstRound && (
              <Panel className="p-4">
                <p className="hud-label mb-1 !text-crit">Round le plus discret</p>
                <p className="stat-value text-2xl text-hi">Round {report.worstRound.index}</p>
                <p className="text-xs text-lo">
                  {report.worstRound.kills} kill(s) · {report.worstRound.damage} dégâts
                </p>
              </Panel>
            )}
          </div>

          {report.afkRounds.length > 0 && (
            <Panel className="border-crit/30 bg-crit/5 p-4">
              <p className="hud-label !text-crit">AFK détecté</p>
              <p className="mt-1 text-sm text-lo">
                Round{report.afkRounds.length > 1 ? "s" : ""} {report.afkRounds.join(", ")}
              </p>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
