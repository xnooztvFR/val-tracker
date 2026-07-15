import { useTranslation } from "react-i18next";

import CopyButton from "./CopyButton";
import Panel from "./Panel";
import RankBadge from "./RankBadge";
import { formatCountdown } from "../hooks/useCountdown";
import { useQueueStats } from "../hooks/useMatches";
import { formatPercent, playerCardIconUrl } from "../lib/format";
import type { Overview } from "../lib/stats";
import type { ProfileCardData } from "../lib/profileCard";

interface HomeStatusBarProps {
  region: string | undefined;
  name: string | undefined;
  tag: string | undefined;
  puuid: string | undefined;
  cardId: string | null | undefined;
  glowColor: string;
  currentTier: number | null | undefined;
  currentTierPatched: string | null | undefined;
  currentRr: number | null | undefined;
  rankPulse: "up" | "down" | null;
  overview: Overview | null;
  sampleSize: number;
  remaining: number | null;
  refreshing: boolean;
  canRefresh: boolean;
  onRefresh: () => void;
  profileCardData: ProfileCardData | null;
  onShowProfileCard: () => void;
  canRecap: boolean;
  onOpenPeriodRecap: (period: "week" | "month") => void;
}

/** Barre de statut "briefing" en tête d'écran Accueil : identité du joueur, rang/RR
 * courant, bilan de la session, timer de rafraîchissement et actions rapides (export carte,
 * récap de période, refresh manuel). */
export default function HomeStatusBar({
  region,
  name,
  tag,
  puuid,
  cardId,
  glowColor,
  currentTier,
  currentTierPatched,
  currentRr,
  rankPulse,
  overview,
  sampleSize,
  remaining,
  refreshing,
  canRefresh,
  onRefresh,
  profileCardData,
  onShowProfileCard,
  canRecap,
  onOpenPeriodRecap,
}: HomeStatusBarProps) {
  const { t } = useTranslation("home");
  // TODO stats & analyse joueur : distinction solo-queue vs party en tête de profil.
  const queueStats = useQueueStats(puuid);
  const solo = queueStats.data?.solo;
  const party = queueStats.data?.party;

  return (
    <Panel className="flex flex-wrap items-stretch gap-x-6 gap-y-4 px-5 py-4">
      <div className="flex min-w-0 items-center gap-4">
        {cardId ? (
          <img
            src={playerCardIconUrl(cardId)}
            alt=""
            className="h-14 w-14 border object-cover"
            style={{ borderColor: glowColor }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
            }}
          />
        ) : (
          <div className="h-14 w-14 border bg-raised" style={{ borderColor: glowColor }} />
        )}
        <div className="min-w-0">
          <p className="hud-label text-[10px]">{t("statusBar.operator", { region })}</p>
          <p className="flex items-center gap-1.5 truncate font-display text-lg font-bold text-hi">
            {name}
            <span className="text-lo">#{tag}</span>
            {name && tag && <CopyButton text={`${name}#${tag}`} label={t("statusBar.copyRiotId")} />}
          </p>
        </div>
      </div>

      <div className="hidden w-px self-stretch bg-line sm:block" />

      <div className="flex items-center">
        <RankBadge
          tier={currentTier}
          tierPatched={currentTierPatched}
          rr={currentRr}
          size="md"
          pulse={rankPulse}
        />
      </div>

      {overview && (
        <>
          <div className="hidden w-px self-stretch bg-line sm:block" />
          <div className="flex items-center">
            <div>
              <p className="hud-label text-[10px]">{t("statusBar.summary", { n: sampleSize })}</p>
              <p className="stat-value mt-1 text-sm">
                <span className="text-accent">{t("statusBar.wins", { n: overview.wins })}</span>
                <span className="text-lo"> / </span>
                <span className="text-crit">{t("statusBar.losses", { n: overview.losses })}</span>
                <span className="text-lo">
                  {" "}
                  · {formatPercent(overview.winPercent)} {t("statusBar.winrateShort")}
                </span>
              </p>
            </div>
          </div>
        </>
      )}

      {solo && party && solo.matches_played + party.matches_played > 0 && (
        <>
          <div className="hidden w-px self-stretch bg-line sm:block" />
          <div className="flex items-center">
            <div>
              <p className="hud-label text-[10px]">{t("statusBar.queueSplit.title")}</p>
              <p className="stat-value mt-1 text-sm">
                {solo.matches_played > 0 && (
                  <span className="text-hi">
                    {t("statusBar.queueSplit.solo", {
                      percent: formatPercent((solo.matches_won / solo.matches_played) * 100),
                      n: solo.matches_played,
                    })}
                  </span>
                )}
                {solo.matches_played > 0 && party.matches_played > 0 && <span className="text-lo"> · </span>}
                {party.matches_played > 0 && (
                  <span className="text-hi">
                    {t("statusBar.queueSplit.party", {
                      percent: formatPercent((party.matches_won / party.matches_played) * 100),
                      n: party.matches_played,
                    })}
                  </span>
                )}
              </p>
            </div>
          </div>
        </>
      )}

      <div className="ml-auto flex flex-col items-end justify-center gap-1.5">
        <span className="stat-value text-[11px] text-lo">
          {remaining !== null && remaining > 0
            ? t("statusBar.updateIn", { time: formatCountdown(remaining) })
            : t("statusBar.refreshAvailable")}
        </span>
        <div className="flex items-center gap-1.5">
          {profileCardData && (
            <button
              type="button"
              onClick={onShowProfileCard}
              className="flex items-center gap-1.5 border border-line px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent"
            >
              {t("statusBar.exportCard")}
            </button>
          )}
          {canRecap && (
            <>
              <button
                type="button"
                onClick={() => onOpenPeriodRecap("week")}
                className="flex items-center gap-1.5 border border-line px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent"
              >
                {t("statusBar.recapWeek")}
              </button>
              <button
                type="button"
                onClick={() => onOpenPeriodRecap("month")}
                className="flex items-center gap-1.5 border border-line px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent"
              >
                {t("statusBar.recapMonth")}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing || !canRefresh}
            className="flex items-center gap-1.5 border border-line px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
          >
            <RefreshIcon spinning={refreshing} />
            {t("statusBar.refresh")}
          </button>
        </div>
      </div>
    </Panel>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={`h-3 w-3 ${spinning ? "animate-spin" : ""}`}>
      <path d="M15.312 5.312a5.5 5.5 0 10 1.414 1.414L18 5.5V2a1 1 0 00-1-1h-3.5l1.812 1.812z" />
      <path
        fillRule="evenodd"
        d="M4.5 10a5.5 5.5 0 019.192-4.096l1.415-1.415A7.5 7.5 0 102.5 10a1 1 0 002 0 5.5 5.5 0 01-.001-.001z"
        clipRule="evenodd"
      />
    </svg>
  );
}
