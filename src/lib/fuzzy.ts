// TODO Fonctionnalités#5 : recherche tolérante aux fautes de frappe (fuzzy local) sur les
// Riot ID récents/favoris — matcher "maison" en sous-séquence pondérée façon fzf plutôt
// qu'une dépendance externe (aucune lib fuzzy déjà en dépendance, voir package.json).
// Purement local, aucune donnée envoyée nulle part.

/** Score de correspondance sous-séquence entre `query` et `target` (insensible à la
 * casse) : chaque caractère de `query` doit apparaître dans `target` dans le même ordre,
 * pas forcément consécutif. Renvoie `null` si `query` n'est pas une sous-séquence de
 * `target`. Plus le score est élevé, meilleure est la correspondance (bonus pour les
 * lettres consécutives et un match qui démarre tôt dans la chaîne). */
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.trim().toLowerCase();
  const t = target.toLowerCase();
  if (q.length === 0) return 0;

  let score = 0;
  let qi = 0;
  let consecutiveBonus = 0;
  let firstMatchIndex = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (firstMatchIndex === -1) firstMatchIndex = ti;
      score += 1 + consecutiveBonus;
      consecutiveBonus += 1;
      qi++;
    } else {
      consecutiveBonus = 0;
    }
  }

  if (qi < q.length) return null;
  if (firstMatchIndex === 0) score += 3;
  return score;
}

/** Filtre + trie `items` par score de correspondance fuzzy décroissant. `query` vide
 * renvoie `items` tel quel (pas de filtre). */
export function fuzzyMatch<T>(query: string, items: T[], getLabel: (item: T) => string): T[] {
  const q = query.trim();
  if (!q) return items;

  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const score = fuzzyScore(q, getLabel(item));
    if (score !== null) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.item);
}
