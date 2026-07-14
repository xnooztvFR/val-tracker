# Codebase Audit: ui

Couverture des états de chargement/erreur/vide forte et cohérente sur presque tous les écrans
de données, système de design-tokens solide dans l'ensemble ; le principal défaut est des
couleurs hex en dur qui cassent le thème sur des états hover et des modales rendues en canvas.

- **Date**: 2026-07-14
- **Scope**: `src/screens/`, `src/components/`, `tailwind.config.js`, `src/index.css`
- **Health**: good
- **Findings**: 0 critical, 2 warning, 4 minor

Health: `good` = no critical findings; `fair` = critical findings exist but are isolated and addressable; `poor` = systemic or widespread critical findings.

Aucune URL de frontend en cours d'exécution fournie — pass runtime a11y/axe non effectué,
inspection statique uniquement.

## Findings

| Sev | Category | Location | Issue | Suggested fix | Effort |
| --- | --- | --- | --- | --- | --- |
| 🟡 | ui | `src/screens/MatchDetail.tsx:92`, `Compare.tsx:69`, `MatchReport.tsx:64`, `Search.tsx:133`, `Settings.tsx:269,708,925,1030` (10 occurrences) | Les boutons d'action principale codent en dur `hover:bg-[#FF5969]` au lieu d'utiliser le token de thème (`accent`/`accent-dim`). La couleur d'accent étant personnalisable par l'utilisateur (backlog #38, `accent.DEFAULT`/`accent.dim` piloté par variables CSS dans `tailwind.config.js`), tout thème d'accent non-défaut affichera un flash de hover rouge discordant sur les CTA principaux. | Remplacer `hover:bg-[#FF5969]` par `hover:bg-accent-dim` (ou une nouvelle variable `--color-accent-hover`) pour que l'état hover suive le thème d'accent actif. | S |
| 🟡 | ui | `src/components/PeriodRecapModal.tsx:15-21`, `src/components/RecapCardModal.tsx:16-22`, `src/components/ProfileCardModal.tsx:14-18` | Les modales de génération de carte de partage (canvas) codent en dur toute la palette HUD (`base`, `surface`, `line`, `accent`, `crit`, `hi`, `lo`) en hex brut au lieu de lire les variables CSS live depuis `index.css`/`tailwind.config.js`. Ces cartes de partage se rendront toujours dans le thème graphite/cyan (ou accent rouge) par défaut, quel que soit le thème/accent choisi par l'utilisateur, en divergence avec le reste de l'UI thématisée. | Lire `getComputedStyle(document.documentElement)` pour les variables `--color-*` (ou passer les couleurs résolues du thème actif) lors du dessin sur canvas, au lieu d'une palette séparée codée en dur. | M |
| 🟢 | ui | `src/screens/Home.tsx:402`, `Trends.tsx:34-37,209`, `Premier.tsx:136`, `PremierTeamDetail.tsx:37`, `Settings.tsx:303-306,936,1181`, `components/ApiStatusBadge.tsx:7` | Autres valeurs hex brutes éparses (couleurs de séries de graphique, badges de statut, couleurs de repli d'équipe Premier). Certaines sont légitimement pilotées par les données (couleurs de marque VLR), mais les couleurs de séries de graphique (`Trends.tsx`) et de statut (`ApiStatusBadge.tsx`) dupliquent ce qui pourrait être de petits tokens nommés. | Là où les couleurs sont structurelles (pas pilotées par les données), les promouvoir en extensions de thème Tailwind ou variables CSS pour la cohérence/maintenabilité. | S |
| 🟢 | ui | `src/screens/Compare.tsx` (fichier entier) | Utilise `ErrorState`/`isLoading`/`Skeleton` mais jamais `EmptyState` ni `StaleDataBanner`, contrairement aux écrans voisins (MapStats, Leaderboard, MatchHistory). Une comparaison à zéro match (ex. compte tout neuf) retombe sur ce que renvoie `computeOverview` pour un tableau vide sans message explicite "pas de données", et les données en cache périmées d'un côté ou l'autre ne sont pas signalées. | Ajouter `EmptyState` pour les comparaisons à échantillon nul et `StaleDataBanner` quand `matches.data?.stale` est vrai pour l'un des deux côtés, pour matcher le pattern utilisé ailleurs. | S |
| 🟢 | ui | `src/screens/*.tsx` (tous les écrans, ex. `Agents.tsx:120`, `Trends.tsx:129`, `Search.tsx:99`) | Les `<h1>` de page utilisent partout le style `hud-label text-sm` en petites majuscules (indiscernable en poids des `<h2>` de section et autre petit texte d'UI), donc la hiérarchie de titres est visuellement plate même si sémantiquement correcte (h1 → h2). `Search.tsx` fait exception avec un vrai style d'échelle de titre (`text-3xl`). | Esthétique "HUD" intentionnelle — priorité basse, mais envisager un traitement légèrement plus grand/gras pour les `<h1>` de niveau page afin de mieux ancrer le contenu principal vs les `<h2>` de section. | S |
| 🟢 | ui | pass a11y statique — pas de pass runtime | Aucune URL/instance frontend fournie, donc inspection statique uniquement (pas de pass runtime a11y/axe, pas de parcours clavier). Toutes les balises `<img>` trouvées portent un attribut `alt` (souvent correctement `alt=""` pour les icônes décoratives via `ExternalImage`/`MatchRow`/`RankBadge`), donc aucun `alt` manquant détecté par grep. La couverture ARIA-role/navigation clavier plus large (modales, `CommandPalette`, glisser-déposer des favoris) n'a pas été tracée de façon exhaustive vu l'analyse statique uniquement. | Si l'accessibilité devient une priorité, faire un pass runtime de suivi (lecteur d'écran + navigation clavier seule) une fois une instance en cours d'exécution disponible, en particulier pour `CommandPalette.tsx` et le drag-and-drop des favoris dans `Search.tsx`. | M |

## Top actions

1. Corriger la couleur de hover codée en dur `#FF5969` sur les CTA principaux pour respecter le thème d'accent personnalisable.
2. Faire lire aux cartes de partage recap/profil (canvas) la palette de thème live au lieu d'une palette par défaut codée en dur.
3. Ajouter la couverture `EmptyState`/`StaleDataBanner` à `Compare.tsx` pour matcher les autres écrans de données.

## Coverage

- **Scanned**: ui (`src/screens/`, `src/components/`, `tailwind.config.js`, `src/index.css` —
  états manquants, hiérarchie visuelle, dérive de design-tokens, breakpoints responsive,
  a11y statique)
- **Skipped**: pass a11y runtime (axe/lecteur d'écran/navigation clavier) — aucune URL de
  frontend en cours d'exécution fournie, inspection statique uniquement
