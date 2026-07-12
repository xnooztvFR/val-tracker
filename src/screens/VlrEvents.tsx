import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "../components/Skeleton";
import { Link, useNavigate } from "react-router-dom";

import { useVlrEvents } from "../hooks/useVlr";
import ErrorState from "../components/ErrorState";
import Panel from "../components/Panel";
import EmptyState from "../components/EmptyState";
import ExternalImage from "../components/ExternalImage";

const REGION_VALUES = [
  "",
  "north_america",
  "europe",
  "brazil",
  "asia_pacific",
  "korea",
  "japan",
  "latin_america",
  "oceania",
  "mena",
  "gc",
  "collegiate",
] as const;

export default function VlrEvents() {
  const { t } = useTranslation("esports");
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
            {t("vlrEvents.backLink")}
          </Link>
          <h1 className="hud-label mt-1 text-sm">{t("vlrEvents.title")}</h1>
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
            <option value="">{t("vlrEvents.typeAll")}</option>
            <option value="upcoming">{t("vlrEvents.typeUpcoming")}</option>
            <option value="completed">{t("vlrEvents.typeCompleted")}</option>
          </select>
          <select
            value={region}
            onChange={(e) => {
              setRegion(e.target.value);
              setPage(1);
            }}
            className="border border-line bg-surface px-3 py-1.5 text-sm text-hi focus:border-accent focus:outline-none"
          >
            {REGION_VALUES.map((v) => (
              <option key={v} value={v}>
                {t(`vlrEvents.regions.${v || "all"}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {events.isError && <ErrorState error={events.error} />}
      {events.isLoading && <Skeleton className="h-32 w-full" />}
      {events.data && list.length === 0 && <EmptyState icon="team" title={t("vlrEvents.empty.title")} />}

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
              {t(`vlrEvents.status.${event.status ?? "unknown"}`, { defaultValue: event.status ?? "?" })}
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
            {t("vlrEvents.pagination.previous")}
          </button>
          <span className="stat-value text-xs text-lo">{t("vlrEvents.pagination.page", { page })}</span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            className="border border-line px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent"
          >
            {t("vlrEvents.pagination.next")}
          </button>
        </div>
      )}
    </div>
  );
}
