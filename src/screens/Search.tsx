import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useRecentSearchesStore } from "../store/recentSearchesStore";
import { useSettingsStore } from "../store/settingsStore";
import { REGIONS, splitRiotId } from "../lib/format";

export default function Search() {
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const { players, refresh, toggleFavorite } = useRecentSearchesStore();

  const [riotId, setRiotId] = useState("");
  const [region, setRegion] = useState(settings?.default_region ?? "eu");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (settings?.default_region) setRegion(settings.default_region);
  }, [settings?.default_region]);

  const apiKeyMissing = settings ? !settings.henrik_api_key_set : false;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = splitRiotId(riotId);
    if (!parsed) {
      setFormError("Format attendu : pseudo#tag (ex. Sentinelle#EU1)");
      return;
    }
    setFormError(null);
    navigate(`/joueur/${region}/${encodeURIComponent(parsed.name)}/${encodeURIComponent(parsed.tag)}`);
  }

  function goToPlayer(p: { region: string; name: string; tag: string }) {
    navigate(`/joueur/${p.region}/${encodeURIComponent(p.name)}/${encodeURIComponent(p.tag)}`);
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center overflow-y-auto px-6 py-10">
      <div className="btn-clip flex h-14 w-14 items-center justify-center bg-accent font-display text-2xl font-bold text-base">
        V
      </div>

      <h1 className="mt-6 text-center font-display text-3xl font-bold uppercase tracking-hud text-hi">
        Traque ton <span className="text-accent">rank</span>
      </h1>
      <p className="mt-2 text-center text-sm text-lo">
        Entre un Riot ID complet pour consulter son rank et ses parties récentes.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 w-full">
        <div className="panel-clip flex items-stretch gap-2 p-1.5 transition-shadow focus-within:[box-shadow:inset_0_0_0_1px_#7CE8D3]">
          <div className="flex flex-1 items-center gap-2 pl-3">
            <SearchIcon />
            <input
              value={riotId}
              onChange={(e) => setRiotId(e.target.value)}
              placeholder="pseudo#tag"
              disabled={apiKeyMissing}
              className="w-full bg-transparent py-3 font-mono text-base text-hi placeholder:text-lo/60 focus:outline-none disabled:opacity-50"
            />
          </div>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            disabled={apiKeyMissing}
            className="shrink-0 border border-line bg-base px-3 text-sm font-medium text-hi focus:outline-none disabled:opacity-50"
          >
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={apiKeyMissing}
            className="btn-clip shrink-0 bg-accent px-6 font-display text-sm font-bold uppercase tracking-hud text-base transition-colors hover:bg-[#96F0DF] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Chercher
          </button>
        </div>
      </form>

      {formError && <p className="mt-2 text-sm text-crit">{formError}</p>}
      {apiKeyMissing && (
        <p className="mt-2 text-sm text-crit">
          Configure ta clé API Henrik dans Paramètres avant de faire une recherche.
        </p>
      )}

      {players.length > 0 && (
        <div className="mt-10 w-full">
          <h2 className="hud-label mb-3">Recherches récentes</h2>
          <div className="flex flex-wrap gap-2">
            {players.map((p) => (
              <div
                key={p.puuid}
                className="group panel-clip-sm flex items-center gap-2 py-1.5 pl-3 pr-1.5 transition-colors hover:bg-raised"
              >
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
                  onClick={() => toggleFavorite(p.puuid)}
                  aria-label="Basculer favori"
                  className={`flex h-6 w-6 items-center justify-center transition-colors ${
                    p.is_favorite ? "text-accent" : "text-lo/60 hover:text-lo"
                  }`}
                >
                  <StarIcon filled={p.is_favorite} />
                </button>
              </div>
            ))}
          </div>
        </div>
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
