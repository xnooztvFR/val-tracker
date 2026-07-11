import { useParams } from "react-router-dom";

import { useAccount, useDuoStats } from "../hooks/usePlayer";
import Panel from "../components/Panel";
import ErrorState from "../components/ErrorState";
import { formatPercent } from "../lib/format";

/** Winrate en duo/squad (V3), calculé à partir des `party_id` accumulés localement à
 * chaque consultation de match (voir hooks/usePlayer::useDuoStats) — grandit au fil de la
 * navigation dans l'historique, aucun appel réseau en masse. */
export default function Duo() {
  const { name, tag } = useParams<{ region: string; name: string; tag: string }>();

  const account = useAccount(name, tag);
  const puuid = account.data?.data.puuid;
  const duo = useDuoStats(puuid);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="hud-label text-sm">Duo &amp; Squad</h1>
        <p className="mt-1 text-xs text-lo">
          Winrate avec tes coéquipiers de party, calculé au fil des matchs que tu consultes
          dans Historique — consulte plus de matchs pour affiner ces stats.
        </p>
      </div>

      {duo.isError && <ErrorState error={duo.error} />}
      {duo.isLoading && <p className="text-sm text-lo">Chargement…</p>}

      {duo.data && duo.data.length === 0 && (
        <p className="text-sm text-lo">
          Pas encore assez de données — ouvre quelques matchs dans l'onglet Historique où tu
          étais en party pour voir apparaître tes coéquipiers ici.
        </p>
      )}

      {duo.data && duo.data.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {duo.data.map((teammate) => {
            const winPercent = Math.round((teammate.matches_won / teammate.matches_played) * 100);
            return (
              <Panel key={teammate.teammate_puuid} className="p-4">
                <p className="text-sm font-semibold text-hi">
                  {teammate.teammate_name}
                  <span className="text-lo">#{teammate.teammate_tag}</span>
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <span
                    className={`font-display text-lg font-bold tracking-hud ${
                      winPercent >= 50 ? "text-accent" : "text-crit"
                    }`}
                  >
                    {formatPercent(winPercent)}
                  </span>
                  <span className="text-xs text-lo">
                    {teammate.matches_won} victoires / {teammate.matches_played} matchs ensemble
                  </span>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
