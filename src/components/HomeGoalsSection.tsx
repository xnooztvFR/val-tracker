import LeaderboardPercentileCard from "./LeaderboardPercentileCard";
import PlayerNotesPanel from "./PlayerNotesPanel";
import ProgressionGoalPanel from "./ProgressionGoalPanel";
import WeeklyGoalsPanel from "./WeeklyGoalsPanel";
import type { MatchEntry, TrackedPlayer } from "../lib/tauriApi";

interface HomeGoalsSectionProps {
  puuid: string;
  region: string | undefined;
  name: string | undefined;
  tag: string | undefined;
  currentTier: number | null | undefined;
  currentRr: number | null | undefined;
  trackedPlayer: TrackedPlayer | null | undefined;
  trackedPlayerLoaded: boolean;
  matches: MatchEntry[];
}

/** Grille des panneaux "objectifs" de l'Accueil : objectif de progression, note perso et
 * objectifs hebdomadaires, plus la carte de percentile leaderboard juste en dessous. */
export default function HomeGoalsSection({
  puuid,
  region,
  name,
  tag,
  currentTier,
  currentRr,
  trackedPlayer,
  trackedPlayerLoaded,
  matches,
}: HomeGoalsSectionProps) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <ProgressionGoalPanel key={puuid} puuid={puuid} currentTier={currentTier} currentRr={currentRr} />
        <PlayerNotesPanel
          // Remonte une fois les notes chargées, pour ne pas figer le textarea sur une
          // valeur initiale vide capturée avant la résolution de la requête.
          key={`${puuid}-${trackedPlayerLoaded ? "loaded" : "pending"}`}
          puuid={puuid}
          initialNotes={trackedPlayer?.notes ?? null}
        />
        <WeeklyGoalsPanel key={`weekly-${puuid}`} puuid={puuid} matches={matches} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <LeaderboardPercentileCard region={region} name={name} tag={tag} currentTier={currentTier} />
      </div>
    </>
  );
}
