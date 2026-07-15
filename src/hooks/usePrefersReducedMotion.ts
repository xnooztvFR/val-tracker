import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** Le CSS (`index.css`, bloc `@media (prefers-reduced-motion: reduce)`) désactive déjà les
 * animations/transitions basées sur des propriétés CSS, mais les animations pilotées en JS
 * (ex. `recharts` avec `isAnimationActive`) ne passent pas par ce mécanisme — ce hook permet
 * de les couper explicitement côté composant. */
export default function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
