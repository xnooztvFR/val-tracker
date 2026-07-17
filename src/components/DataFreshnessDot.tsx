import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useApiHealthStore } from "../store/apiHealthStore";

const FRESH_MS = 2 * 60_000;
const AGING_MS = 10 * 60_000;
const TICK_MS = 30_000;

/** TODO Design#2 : indicateur de fraîcheur des données **permanent** dans le TopNav (petit
 * point signal, toujours affiché) — distinct d'`ApiStatusBadge` qui ne s'affiche qu'en cas
 * de panne/rate limit. Ici la couleur reflète juste l'âge du dernier succès React Query
 * (`apiHealthStore.lastSuccessAt`), indépendamment de tout état d'erreur ponctuel. */
export default function DataFreshnessDot() {
  const { t } = useTranslation("componentsCore");
  const lastSuccessAt = useApiHealthStore((s) => s.lastSuccessAt);
  // Force un re-render périodique : la couleur dépend de `Date.now() - lastSuccessAt`, qui
  // change sans qu'aucun store ne soit mis à jour entre deux requêtes.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const ageMs = lastSuccessAt != null ? Date.now() - lastSuccessAt : null;
  const dotClass =
    ageMs == null ? "bg-lo/50" : ageMs < FRESH_MS ? "bg-accent" : ageMs < AGING_MS ? "bg-warn" : "bg-crit";
  const label =
    ageMs == null
      ? t("dataFreshnessDot.none")
      : ageMs < FRESH_MS
        ? t("dataFreshnessDot.fresh")
        : ageMs < AGING_MS
          ? t("dataFreshnessDot.aging")
          : t("dataFreshnessDot.stale");

  return (
    <span title={label} className="flex shrink-0 items-center self-center px-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
    </span>
  );
}
