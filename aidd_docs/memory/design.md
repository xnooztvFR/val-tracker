# Design

## System

- Identité « HUD tactique » : fond graphite `#0B0E11`, accent cyan `#7CE8D3`, rouge réservé aux signaux négatifs.
- Styling : Tailwind CSS (classes utilitaires), config dans `tailwind.config.js`.
- Polices self-hostées via `@fontsource` (pas de CDN, cohérent avec la CSP) : Chakra Petch, Inter, JetBrains Mono.

## Tokens

- Couleurs et tokens HUD définis dans `tailwind.config.js` et `src/index.css`.
- Panneaux à coin coupé (`clip-path`), pas de `border-radius` : classes utilitaires `.panel-clip`, `.hud-label`, `.target-lock` dans `src/index.css`.

## Components

- Composants partagés dans `src/components/` : `RankBadge`, `StatCard`, `RankHistoryChart`, `MatchRow`, `ErrorState`, `StaleDataBanner`, `ExternalImage` (images tierces via proxy Rust, voir `image_proxy.rs`).

## Accessibility

- Pas de bar d'accessibilité formalisée pour l'instant (non documenté dans `CLAUDE.md`).
