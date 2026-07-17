import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton, SkeletonScreen } from "../components/Skeleton";
import { useParams } from "react-router-dom";

import { useHomeData } from "../hooks/useHomeData";
import SampleSizeSwitch from "../components/SampleSizeSwitch";
import ProfileCardModal from "../components/ProfileCardModal";
import PeriodRecapModal from "../components/PeriodRecapModal";
import QueueStatusStrip from "../components/QueueStatusStrip";
import RecommendationsPanel from "../components/RecommendationsPanel";
import ErrorState from "../components/ErrorState";
import StaleDataBanner from "../components/StaleDataBanner";
import HomeStatusBar from "../components/HomeStatusBar";
import HomeOverviewSection from "../components/HomeOverviewSection";
import HomeGoalsSection from "../components/HomeGoalsSection";
import HomeTimelineSection from "../components/HomeTimelineSection";
import { rankGlowColor } from "../lib/format";
import { type PeriodRecap } from "../lib/stats";
import { buildProfileCardData } from "../lib/profileCard";
import { useHomeOrderStore, resolveHomeOrder } from "../store/homeOrderStore";

// Backlog Fonctionnalités#10 : blocs réordonnables par glisser-déposer (poignée dédiée,
// voir DraggableBlock plus bas) — `HomeStatusBar` en est volontairement exclue (contrôles
// globaux, reste fixe en haut).
const HOME_SECTION_KEYS = ["goals", "overview", "queue", "recommendations", "timeline"] as const;
type HomeSectionKey = (typeof HOME_SECTION_KEYS)[number];

export default function Home() {
  const { t } = useTranslation("home");
  const { region, name, tag } = useParams<{ region: string; name: string; tag: string }>();
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [periodRecap, setPeriodRecap] = useState<PeriodRecap | null>(null);
  const homeOrder = useHomeOrderStore((s) => s.order);
  const reorderHome = useHomeOrderStore((s) => s.reorder);
  const [draggedSectionKey, setDraggedSectionKey] = useState<HomeSectionKey | null>(null);

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
    autoSessionRecap,
    dismissAutoSessionRecap,
  } = useHomeData(region, name, tag);

  function openPeriodRecap(period: "week" | "month") {
    setPeriodRecap(buildPeriodRecap(period));
  }

  // TODO Fonctionnalités#9 : affiche automatiquement le récap de session dès qu'une session
  // vient de se terminer (voir useHomeData::autoSessionRecap) — seulement si aucune autre
  // modale de récap n'est déjà ouverte, pour ne pas se substituer à un récap semaine/mois
  // ouvert manuellement par l'utilisateur.
  useEffect(() => {
    if (autoSessionRecap && !periodRecap) {
      setPeriodRecap(autoSessionRecap);
      dismissAutoSessionRecap();
    }
  }, [autoSessionRecap, periodRecap, dismissAutoSessionRecap]);

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

  const sections: Record<HomeSectionKey, React.ReactNode> = {
    goals: puuid ? (
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
    ) : null,
    overview: (
      <div className="space-y-4">
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
      </div>
    ),
    queue: <QueueStatusStrip region={region} />,
    recommendations: <RecommendationsPanel puuid={puuid} />,
    timeline: (
      <HomeTimelineSection
        snapshots={snapshots.data ?? []}
        serverHistory={mmrHistory.data?.data.history ?? []}
        puuid={puuid}
        timelineEvents={accountTimeline.data ?? []}
      />
    ),
  };

  const orderedSectionKeys = (
    homeOrder.length > 0 ? homeOrder : resolveHomeOrder(HOME_SECTION_KEYS)
  ).filter((k): k is HomeSectionKey => (HOME_SECTION_KEYS as readonly string[]).includes(k));

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

      {orderedSectionKeys.map((key) => {
        const content = sections[key];
        if (!content) return null;
        return (
          <DraggableBlock
            key={key}
            sectionKey={key}
            draggedKey={draggedSectionKey}
            onDragStart={setDraggedSectionKey}
            onDrop={(targetKey) => {
              if (draggedSectionKey) reorderHome(HOME_SECTION_KEYS, draggedSectionKey, targetKey);
            }}
            onDragEnd={() => setDraggedSectionKey(null)}
          >
            {content}
          </DraggableBlock>
        );
      })}
    </div>
  );
}

/** Backlog Fonctionnalités#10 : wrapper drag & drop d'un bloc Home — poignée dédiée (pas
 * tout le bloc draggable) pour ne pas gêner les clics sur les boutons à l'intérieur
 * (ex. HomeGoalsSection), même mécanique HTML5 native que tabOrderStore/TopNav. */
function DraggableBlock({
  sectionKey,
  draggedKey,
  onDragStart,
  onDrop,
  onDragEnd,
  children,
}: {
  sectionKey: HomeSectionKey;
  draggedKey: HomeSectionKey | null;
  onDragStart: (key: HomeSectionKey) => void;
  onDrop: (key: HomeSectionKey) => void;
  onDragEnd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => onDrop(sectionKey)}
      className={`group relative ${draggedKey === sectionKey ? "opacity-40" : ""}`}
    >
      <div
        draggable
        onDragStart={() => onDragStart(sectionKey)}
        onDragEnd={onDragEnd}
        className="mb-1 flex h-3 w-8 cursor-grab items-center gap-[3px] opacity-0 transition-opacity group-hover:opacity-40 hover:opacity-80 active:cursor-grabbing"
      >
        <GripIcon />
      </div>
      {children}
    </div>
  );
}

function GripIcon() {
  return (
    <svg viewBox="0 0 20 8" fill="currentColor" className="h-2 w-5 text-lo">
      <circle cx="2" cy="2" r="1.4" />
      <circle cx="2" cy="6" r="1.4" />
      <circle cx="8" cy="2" r="1.4" />
      <circle cx="8" cy="6" r="1.4" />
      <circle cx="14" cy="2" r="1.4" />
      <circle cx="14" cy="6" r="1.4" />
    </svg>
  );
}
