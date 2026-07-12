import { useState } from "react";
import { Skeleton } from "../components/Skeleton";
import { Link, useNavigate } from "react-router-dom";

import { useVlrEvents } from "../hooks/useVlr";
import ErrorState from "../components/ErrorState";
import Panel from "../components/Panel";
import EmptyState from "../components/EmptyState";
import ExternalImage from "../components/ExternalImage";

const REGION_OPTIONS = [
  { value: "", label: "Toutes régions" },
  { value: "north_america", label: "Amérique du Nord" },
  { value: "europe", label: "Europe" },
  { value: "brazil", label: "Brésil" },
  { value: "asia_pacific", label: "Asie-Pacifique" },
  { value: "korea", label: "Corée" },
  { value: "japan", label: "Japon" },
  { value: "latin_america", label: "Amérique Latine" },
  { value: "oceania", label: "Océanie" },
  { value: "mena", label: "MENA" },
  { value: "gc", label: "Game Changers" },
  { value: "collegiate", label: "Universitaire" },
] as const;

const STATUS_LABELS: Record<string, string> = {
  completed: "Terminé",
  ongoing: "En cours",
  upcoming: "À venir",
  unknown: "?",
};

export default function VlrEvents() {
  const [region, setRegion] = useState("");
  const [type, setType] = useState<"" | "upcoming" | "completed">("");
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  const events = useVlrEvents(region || undefined, type || undefined, page);
  const list = events.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/esport" className="text-sm text-accent hover:underline">
            ← Calendrier
          </Link>
          <h1 className="hud-label mt-1 text-sm">Événements esport</h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value as typeof type);
              setPage(1);
            }}
            className="border border-line bg-surface px-3 py-1.5 text-sm text-hi focus:border-accent focus:outline-none"
          >
            <option value="">Tous</option>
            <option value="upcoming">À venir</option>
            <option value="completed">Terminés</option>
          </select>
          <select
            value={region}
            onChange={(e) => {
              setRegion(e.target.value);
              setPage(1);
            }}
            className="border border-line bg-surface px-3 py-1.5 text-sm text-hi focus:border-accent focus:outline-none"
          >
            {REGION_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {events.isError && <ErrorState error={events.error} />}
      {events.isLoading && <Skeleton className="h-32 w-full" />}
      {events.data && list.length === 0 && <EmptyState icon="team" title="Aucun événement" />}

      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((event) => (
          <Panel
            key={event.id}
            className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-raised/50"
            onClick={() => navigate(`/esport/evenements/${event.id}`)}
          >
            {event.icon && (
              <ExternalImage src={event.icon} alt="" className="h-10 w-10 object-contain" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-hi">{event.title}</p>
              <p className="text-xs text-lo">
                {event.dates?.start ? new Date(event.dates.start).toLocaleDateString("fr-FR") : "?"}
                {event.dates?.end ? ` – ${new Date(event.dates.end).toLocaleDateString("fr-FR")}` : ""}
                {event.price ? ` · ${event.price}` : ""}
              </p>
            </div>
            <span
              className={`hud-label shrink-0 text-[9px] ${
                event.status === "ongoing" ? "text-accent" : "text-lo"
              }`}
            >
              {STATUS_LABELS[event.status ?? "unknown"]}
            </span>
          </Panel>
        ))}
      </div>

      {list.length > 0 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="border border-line px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
          >
            Précédent
          </button>
          <span className="stat-value text-xs text-lo">Page {page}</span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            className="border border-line px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent"
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}
