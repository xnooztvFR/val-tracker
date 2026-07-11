import { useEffect, useState } from "react";

/** Compte à rebours dérivé d'un timestamp de cache + une durée de vie — utilisé pour
 * afficher "actualisation disponible dans mm:ss" (rank MMR notamment). */
export function useCountdown(cachedAt: number | null | undefined, ttlSeconds: number) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!cachedAt) {
      setRemaining(null);
      return;
    }
    const tick = () => {
      const elapsed = Date.now() / 1000 - cachedAt;
      setRemaining(Math.max(0, Math.round(ttlSeconds - elapsed)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [cachedAt, ttlSeconds]);

  return remaining;
}

export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
