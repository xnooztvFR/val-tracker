import { useNavigate, useParams } from "react-router-dom";

import { useAccount } from "../hooks/usePlayer";
import { useMatches } from "../hooks/useMatches";
import MatchRow from "../components/MatchRow";
import ErrorState from "../components/ErrorState";
import StaleDataBanner from "../components/StaleDataBanner";

const MATCH_HISTORY_SIZE = 20;

export default function MatchHistory() {
  const { region, name, tag } = useParams<{ region: string; name: string; tag: string }>();
  const navigate = useNavigate();

  const account = useAccount(name, tag);
  const matches = useMatches({ region, name, tag, size: MATCH_HISTORY_SIZE });

  const puuid = account.data?.data.puuid;

  return (
    <div className="space-y-4">
      <h1 className="hud-label text-sm">
        Historique · {MATCH_HISTORY_SIZE} derniers engagements
      </h1>

      {matches.isError && <ErrorState error={matches.error} />}
      {matches.data?.stale && <StaleDataBanner cachedAt={matches.data.cached_at} />}
      {matches.isLoading && <p className="text-sm text-lo">Chargement des matchs…</p>}

      {matches.data && puuid && (
        <div className="space-y-2">
          {matches.data.data.length === 0 && (
            <p className="text-sm text-lo">Aucun match compétitif trouvé.</p>
          )}
          {matches.data.data.map((match) => (
            <MatchRow
              key={match.metadata.match_id ?? Math.random()}
              match={match}
              puuid={puuid}
              onClick={() =>
                match.metadata.match_id &&
                navigate(`/joueur/${region}/${name}/${tag}/matchs/${match.metadata.match_id}`)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
