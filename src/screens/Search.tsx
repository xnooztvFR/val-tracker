import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useRecentSearchesStore } from "../store/recentSearchesStore";
import { useSettingsStore } from "../store/settingsStore";
import { tauriApi, type TrackedPlayer } from "../lib/tauriApi";
import { getRegions, rankInfo, splitRiotId } from "../lib/format";
import OnboardingWizard from "../components/OnboardingWizard";
import FollowedFriendsPanel from "../components/FollowedFriendsPanel";
import logo from "../assets/logo.png";

export default function Search() {
  const { t } = useTranslation("search");
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const { players, refresh, toggleFavorite } = useRecentSearchesStore();
  const queryClient = useQueryClient();

  const [riotId, setRiotId] = useState("");
  const [region, setRegion] = useState(settings?.default_region ?? "eu");
  const [formError, setFormError] = useState<string | null>(null);
  const [hoveredPuuid, setHoveredPuuid] = useState<string | null>(null);
  const [draggedPuuid, setDraggedPuuid] = useState<string | null>(null);

  const favorites = useQuery({
    queryKey: ["favorite_players"],
    queryFn: () => tauriApi.listFavoritePlayers(),
  });
  const [orderedFavorites, setOrderedFavorites] = useState<TrackedPlayer[]>([]);

  useEffect(() => {
    if (favorites.data) setOrderedFavorites(favorites.data);
  }, [favorites.data]);

  function handleDrop(targetPuuid: string) {
    if (!draggedPuuid || draggedPuuid === targetPuuid) return;
    const next = [...orderedFavorites];
    const fromIndex = next.findIndex((p) => p.puuid === draggedPuuid);
    const toIndex = next.findIndex((p) => p.puuid === targetPuuid);
    if (fromIndex === -1 || toIndex === -1) return;
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setOrderedFavorites(next);
    tauriApi.reorderFavoritePlayers(next.map((p) => p.puuid)).then(() => {
      queryClient.invalidateQueries({ queryKey: ["favorite_players"] });
    });
  }

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (settings?.default_region) setRegion(settings.default_region);
  }, [settings?.default_region]);

  const apiKeyMissing = settings ? !settings.henrik_api_key_set : false;
  const [showWizard, setShowWizard] = useState(false);

  // Fix (2026-07-13) : déclenché par `onboarding_completed` (vrai flag "premier lancement"
  // persisté côté backend), plus par `apiKeyMissing` — ce dernier reste `false` en
  // permanence sur un build avec relais proxy compilé (voir `settings.rs`), ce qui empêchait
  // le wizard de jamais s'afficher tant qu'un `.env` proxy était configuré au build.
  useEffect(() => {
    if (settings && !settings.onboarding_completed) setShowWizard(true);
  }, [settings]);

  async function finishWizard() {
    setShowWizard(false);
    await tauriApi.markOnboardingCompleted();
    await useSettingsStore.getState().refresh();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = splitRiotId(riotId);
    if (!parsed) {
      setFormError(t("formError"));
      return;
    }
    setFormError(null);
    navigate(`/joueur/${region}/${encodeURIComponent(parsed.name)}/${encodeURIComponent(parsed.tag)}`);
  }

  function goToPlayer(p: { region: string; name: string; tag: string }) {
    navigate(`/joueur/${p.region}/${encodeURIComponent(p.name)}/${encodeURIComponent(p.tag)}`);
  }

  async function handleToggleFavorite(puuid: string) {
    await toggleFavorite(puuid);
    await queryClient.invalidateQueries({ queryKey: ["favorite_players"] });
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center overflow-y-auto px-6 py-10">
      <img src={logo} alt="Valorant Tracker" className="h-14 w-14 object-contain" />

      <h1 className="mt-6 text-center font-display text-3xl font-bold uppercase tracking-hud text-hi">
        {t("title.prefix")} <span className="text-accent">{t("title.highlight")}</span>
      </h1>
      <p className="mt-2 text-center text-sm text-lo">
        {t("subtitle")}
      </p>

      {showWizard ? (
        <OnboardingWizard apiKeyAlreadySet={!apiKeyMissing} onFinish={finishWizard} />
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 w-full">
          <div className="panel-clip flex items-stretch gap-2 p-1.5 transition-shadow focus-within:[box-shadow:inset_0_0_0_1px_rgb(var(--accent-rgb))]">
            <div className="flex flex-1 items-center gap-2 pl-3">
              <SearchIcon />
              <input
                value={riotId}
                onChange={(e) => setRiotId(e.target.value)}
                placeholder={t("form.placeholder")}
                className="w-full bg-transparent py-3 font-mono text-base text-hi placeholder:text-lo/60 focus:outline-none disabled:opacity-50"
              />
            </div>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="shrink-0 border border-line bg-base px-3 text-sm font-medium text-hi focus:outline-none disabled:opacity-50"
            >
              {getRegions().map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="btn-clip shrink-0 bg-accent px-6 font-display text-sm font-bold uppercase tracking-hud text-base transition-colors hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("form.submit")}
            </button>
          </div>
        </form>
      )}

      {formError && <p className="mt-2 text-sm text-crit">{formError}</p>}

      {orderedFavorites.length > 0 && (
        <div className="mt-10 w-full">
          <h2 className="hud-label mb-3">{t("favorites.title")}</h2>
          <p className="mb-2 text-xs text-lo">{t("favorites.hint")}</p>
          <div className="flex flex-wrap gap-2">
            {orderedFavorites.map((p) => (
              <div
                key={p.puuid}
                draggable
                onDragStart={() => setDraggedPuuid(p.puuid)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(p.puuid)}
                onDragEnd={() => setDraggedPuuid(null)}
                className={`panel-clip-sm flex cursor-grab items-center gap-1.5 py-1.5 pl-3 pr-3 text-sm text-hi transition-colors hover:bg-raised active:cursor-grabbing ${
                  draggedPuuid === p.puuid ? "opacity-40" : ""
                }`}
              >
                <button type="button" onClick={() => goToPlayer(p)} className="flex items-center gap-1.5">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-lo">#{p.tag}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {players.length > 0 && (
        <div className="mt-10 w-full">
          <h2 className="hud-label mb-3">{t("recent.title")}</h2>
          <div className="flex flex-wrap gap-2">
            {players.map((p) => (
              <div
                key={p.puuid}
                className="relative"
                onMouseEnter={() => setHoveredPuuid(p.puuid)}
                onMouseLeave={() => setHoveredPuuid((current) => (current === p.puuid ? null : current))}
              >
                <div className="group panel-clip-sm flex items-center gap-2 py-1.5 pl-3 pr-1.5 transition-colors hover:bg-raised">
                  <button
                    type="button"
                    onClick={() => goToPlayer(p)}
                    className="flex items-center gap-1.5 text-sm text-hi"
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-lo">#{p.tag}</span>
                    <span className="hud-label border border-line px-1.5 py-0.5 text-[9px]">
                      {p.region}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleFavorite(p.puuid)}
                    aria-label={t("recent.toggleFavorite")}
                    className={`flex h-6 w-6 items-center justify-center transition-colors ${
                      p.is_favorite ? "text-accent" : "text-lo/60 hover:text-lo"
                    }`}
                  >
                    <StarIcon filled={p.is_favorite} />
                  </button>
                </div>
                {hoveredPuuid === p.puuid && <RankHoverPreview puuid={p.puuid} region={p.region} />}
              </div>
            ))}
          </div>
        </div>
      )}

      <FollowedFriendsPanel onOpenPlayer={goToPlayer} />
    </div>
  );
}

/** Backlog #26 : mini-carte de rang au survol d'une recherche récente, sans navigation
 * complète — passe par le même cache/rate-limiter Henrik que le reste (fetchMmrByPuuid,
 * déjà utilisé par l'overlay), `enabled` seulement pendant le survol. */
function RankHoverPreview({ puuid, region }: { puuid: string; region: string }) {
  const { t } = useTranslation("search");
  const mmr = useQuery({
    queryKey: ["search-hover-mmr", puuid, region],
    queryFn: () => tauriApi.fetchMmrByPuuid(puuid, region),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const info = rankInfo(mmr.data?.data.current_data?.currenttier);
  const rr = mmr.data?.data.current_data?.ranking_in_tier;

  return (
    <div className="panel-clip-sm absolute left-0 top-full z-10 mt-1 flex items-center gap-2 bg-surface px-3 py-2 shadow-lg">
      {mmr.isLoading ? (
        <span className="text-xs text-lo">{t("hoverPreview.loading")}</span>
      ) : (
        <>
          <img src={info.iconUrl} alt="" className="h-6 w-6 object-contain" />
          <span className={`font-display text-xs font-semibold uppercase tracking-hud ${info.colorClass}`}>
            {info.name}
          </span>
          {rr != null && <span className="stat-value text-xs text-lo">{rr} RR</span>}
        </>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 shrink-0 text-lo">
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
      <path d="M17 17l-3.8-3.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill={filled ? "currentColor" : "none"} className="h-3.5 w-3.5">
      <path
        d="M10 1.5l2.47 5.51 6.03.58-4.55 4.03 1.34 5.9L10 14.7l-5.29 2.82 1.34-5.9L1.5 7.59l6.03-.58L10 1.5z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
