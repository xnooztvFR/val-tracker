import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton, SkeletonScreen } from "../components/Skeleton";
import { useParams } from "react-router-dom";

import { useHomeData } from "../hooks/useHomeData";
import SampleSizeSwitch from "../components/SampleSizeSwitch";
import ProfileCardModal from "../components/ProfileCardModal";
import PeriodRecapModal from "../components/PeriodRecapModal";
import QueueStatusStrip from "../components/QueueStatusStrip";
import ErrorState from "../components/ErrorState";
import StaleDataBanner from "../components/StaleDataBanner";
import HomeStatusBar from "../components/HomeStatusBar";
import HomeOverviewSection from "../components/HomeOverviewSection";
import HomeGoalsSection from "../components/HomeGoalsSection";
import HomeTimelineSection from "../components/HomeTimelineSection";
import { rankGlowColor } from "../lib/format";
import { type PeriodRecap } from "../lib/stats";
import { buildProfileCardData } from "../lib/profileCard";

export default function Home() {
  const { t } = useTranslation("home");
  const { region, name, tag } = useParams<{ region: string; name: string; tag: string }>();
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [periodRecap, setPeriodRecap] = useState<PeriodRecap | null>(null);

  const {
    sampleSize,
    setSampleSize,
    refreshing,
    account,
    puuid,
    mmr,
    snapshots,
    mmrHistory,
    accountTimeline,
    matches,
    trackedPlayer,
    remaining,
    overview,
    rankPulse,
    handleRefresh,
    buildPeriodRecap,
  } = useHomeData(region, name, tag);

  function openPeriodRecap(period: "week" | "month") {
    setPeriodRecap(buildPeriodRecap(period));
  }

  if (account.isLoading) {
    return <SkeletonScreen className="p-6" />;
  }
  if (account.isError) {
    return <ErrorState error={account.error} />;
  }

  const accountData = account.data?.data;
  const current = mmr.data?.data.current_data;
  const glow = rankGlowColor(current?.currenttier);

  // Backlog #74 : export "carte de visite" du profil, réutilise le pipeline canvas de
  // RecapCardModal.tsx — ne dépend que de données déjà chargées ici (aucun appel réseau).
  const profileCardData =
    region && name && tag
      ? buildProfileCardData({
          name,
          tag,
          region,
          currentTier: current?.currenttier,
          rr: current?.ranking_in_tier,
          overview,
        })
      : null;

  return (
    <div className="scanline-once space-y-6">
      {account.data?.stale && <StaleDataBanner cachedAt={account.data.cached_at} />}

      <HomeStatusBar
        region={region}
        name={name}
        tag={tag}
        puuid={puuid}
        cardId={accountData?.card}
        glowColor={glow}
        currentTier={current?.currenttier}
        currentTierPatched={current?.currenttierpatched}
        currentRr={current?.ranking_in_tier}
        rankPulse={rankPulse}
        overview={overview}
        sampleSize={sampleSize}
        remaining={remaining}
        refreshing={refreshing}
        canRefresh={Boolean(puuid)}
        onRefresh={handleRefresh}
        profileCardData={profileCardData}
        onShowProfileCard={() => setShowProfileCard(true)}
        canRecap={Boolean(puuid && matches.data)}
        onOpenPeriodRecap={openPeriodRecap}
      />

      {showProfileCard && profileCardData && (
        <ProfileCardModal data={profileCardData} onClose={() => setShowProfileCard(false)} />
      )}

      {periodRecap && name && tag && (
        <PeriodRecapModal recap={periodRecap} playerLabel={`${name}#${tag}`} onClose={() => setPeriodRecap(null)} />
      )}

      {puuid && (
        <HomeGoalsSection
          puuid={puuid}
          region={region}
          name={name}
          tag={tag}
          currentTier={current?.currenttier}
          currentRr={current?.ranking_in_tier}
          trackedPlayer={trackedPlayer.data}
          trackedPlayerLoaded={Boolean(trackedPlayer.data)}
          matches={matches.data?.data ?? []}
        />
      )}

      <div className="flex items-center justify-between">
        <h1 className="hud-label text-sm">{t("overview.title")}</h1>
        <SampleSizeSwitch value={sampleSize} onChange={setSampleSize} />
      </div>

      {matches.isError && <ErrorState error={matches.error} />}
      {matches.data?.stale && <StaleDataBanner cachedAt={matches.data.cached_at} />}
      {matches.isLoading && <Skeleton className="h-32 w-full" />}

      {overview && (
        <HomeOverviewSection
          overview={overview}
          region={region}
          name={name}
          tag={tag}
          lastMatch={matches.data?.data[0]}
        />
      )}

      <QueueStatusStrip region={region} />

      <HomeTimelineSection
        snapshots={snapshots.data ?? []}
        serverHistory={mmrHistory.data?.data.history ?? []}
        puuid={puuid}
        timelineEvents={accountTimeline.data ?? []}
      />
    </div>
  );
}
