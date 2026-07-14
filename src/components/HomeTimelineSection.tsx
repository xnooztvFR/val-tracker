import { useTranslation } from "react-i18next";

import AccountTimeline from "./AccountTimeline";
import RankHistoryChart from "./RankHistoryChart";
import type { AccountTimelineEvent, MmrHistoryEntry, RankSnapshot } from "../lib/tauriApi";

interface HomeTimelineSectionProps {
  snapshots: RankSnapshot[];
  serverHistory: MmrHistoryEntry[];
  puuid: string | undefined;
  timelineEvents: AccountTimelineEvent[];
}

/** Section "progression" de l'Accueil : historique de rang (snapshots locaux + historique
 * serveur) et frise "vie du compte". */
export default function HomeTimelineSection({ snapshots, serverHistory, puuid, timelineEvents }: HomeTimelineSectionProps) {
  const { t } = useTranslation("home");

  return (
    <>
      <div>
        <h2 className="hud-label mb-2">{t("rankProgression")}</h2>
        <RankHistoryChart snapshots={snapshots} serverHistory={serverHistory} />
      </div>

      {puuid && (
        <div>
          <h2 className="hud-label mb-2">{t("accountTimeline.title")}</h2>
          <AccountTimeline events={timelineEvents} />
        </div>
      )}
    </>
  );
}
