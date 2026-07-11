# Refonte design complète — App tracker Valorant (Tauri 2.x)

## Contexte technique
App desktop Windows type tracker.gg pour stats/rank Valorant.
- Backend : Rust (Tauri 2.x), avec cache SQLite (TTL différenciés), rate limiting espacé, circuit breaker, retry sur `Retry-After` face à l'API Henrik Dev.
- Frontend : React + TypeScript + Tailwind CSS.
- L'app est 100% fonctionnelle. Ne touche à AUCUNE logique métier, appel API, state management ou structure de données. C'est une refonte visuelle pure : layout, couleurs, typographie, composants UI, micro-interactions.

## Mission
Refaire le design de zéro, sur TOUT l'écran-produit, pas de retouches ponctuelles. Écrans concernés :
1. Écran de recherche / accueil (landing avec champ pseudo#tag)
2. Dashboard joueur (Accueil) : header profil + rank, stats vue d'ensemble, agent le plus joué, précision par zone, courbe de progression de rank
3. Historique des matchs (liste)
4. Détail d'un match (scoreboard 10 joueurs, Blue vs Red)
5. Tendances (stats cards + courbe multi-séries K/D, Kills, Deaths, Assists, Headshots)
6. Stats par agent (tableau)
7. Stats par carte (bar chart winrate + tableau)
8. Paramètres (sidebar + formulaire clé API + région)
9. Barre de titre custom (minimize/close/expand) + navigation par onglets + chip profil

Le design actuel est un "dark tracker.gg générique" : fond quasi noir, accent rouge/rose (#E5484D-ish), cards à coins arrondis, typographie sans-serif standard, radial gauges classiques. On jette tout ça et on repart sur une identité propre.

## Direction : HUD tactique, pas néon-gaming
Le signe distinctif vient du vocabulaire visuel propre à Valorant (coins coupés en diagonale, micro-labels en capitales, langage des rangs) plutôt que du gaming générique néon.

### Palette (graphite froid, pas noir pur)
- `#0B0E11` — fond app
- `#12161B` — surface (panels, cards)
- `#171C22` — surface élevée (hover, modals)
- `#22282F` — hairlines / bordures
- `#7CE8D3` — accent primaire (cyan tactique type radar) — remplace le rouge générique pour tout ce qui est interactif/positif/actions
- `#FF5F5F` — accent critique (défaites, alertes, deaths) — gardé, mais réservé aux vrais signaux négatifs, pas décoratif
- `#E8ECEF` — texte haute emphase
- `#7A8590` — texte basse emphase / labels
- Couleurs de rang officielles Valorant (Fer → Radiant) utilisées ponctuellement comme code couleur du badge de rang uniquement, jamais en fond

### Typographie
- Display / headers / labels de section : **Chakra Petch** (600/700) — anguleux, aspect HUD militaire
- Corps de texte : **Inter** (400/500)
- Chiffres, stats, tableaux : **JetBrains Mono** avec `font-variant-numeric: tabular-nums` — alignement parfait des colonnes, effet "lecture de viseur"
- Labels de section toujours en petites capitales, letter-spacing large (type `0.08em`), couleur basse emphase

### Layout & composants
- **Aucun `border-radius`.** Tous les panels/cards utilisent un coin coupé en diagonale via `clip-path` (ex: `clip-path: polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%)`), cohérent sur toute l'app — c'est la signature visuelle.
- Barre de statut "briefing" en haut du dashboard (rang, RR, bilan de session, timer de MAJ) plutôt qu'un simple header de carte.
- Stat cards : remplacer les radial gauges par des jauges linéaires fines ou des mini-sparklines, alignées sur la grille mono.
- Liste de matchs (Historique) : traiter comme une timeline d'engagements — barre d'accent verticale fine (cyan si victoire, rouge si défaite), pas de card pleine colorée.
- Scoreboard de match : garder le tableau dense, mais typo mono pour toutes les colonnes numériques, ligne du joueur courant surlignée par une bordure gauche cyan plutôt qu'un fond rouge.
- Courbes (Tendances, Progression du rank) : fond transparent, grille en hairlines très discrètes, séries en cyan/rouge/gris selon la métrique, pas de remplissage dégradé sous la courbe.
- Sidebar Paramètres : navigation verticale avec indicateur actif en trait cyan (pas un fond plein rouge comme actuellement).
- Champ de recherche (écran d'accueil) : bordure fine, focus ring cyan, bouton "Chercher" en accent cyan avec coin coupé, pas de rouge plein.

### Mouvement (minimal, respecte `prefers-reduced-motion`)
- Scanline discrète au chargement du dashboard.
- Effet "verrouillage de cible" (crochets qui claquent en coin) au hover sur une stat card.
- Aucune animation décorative au-delà de ça.

## Contraintes techniques d'implémentation
- Étendre `tailwind.config` avec les tokens ci-dessus en `theme.extend.colors` et `fontFamily` (Chakra Petch, Inter, JetBrains Mono via `@fontsource` ou Google Fonts self-hosted pour éviter les requêtes réseau en prod Tauri).
- Créer une classe utilitaire réutilisable `.panel-clip` (ou composant `<Panel>`) pour le clip-path, appliquée partout au lieu de dupliquer le CSS.
- Vérifier la spécificité CSS entre classes de section et classes de composant pour éviter les paddings/margins qui s'annulent.
- Si la lib de charts actuelle (recharts/chart.js) ne permet pas facilement le style hairline + tabular nums, adapter la config plutôt que changer de lib.
- Responsive : l'app est desktop-only (Tauri), donc pas de contrainte mobile, mais rester robuste au redimensionnement de fenêtre.
- Accessibilité : focus visible clavier sur tous les éléments interactifs (important, l'app est en dark quasi-noir).

## Ce qui NE change PAS
- Architecture des routes/onglets (Accueil, Historique, Tendances, Agents, Cartes, Paramètres)
- Données affichées et leur formatage (%, K/D, ACS, etc.)
- Logique de cache, rate limiting, appels API Henrik Dev
- Structure des composants React existants au niveau data — uniquement le rendu visuel et les styles

## Livrable attendu
Refonte complète des styles/composants visuels pour les 9 écrans listés, cohérente de bout en bout, avec le design system (tokens Tailwind) posé en premier avant de toucher aux écrans un par un.
