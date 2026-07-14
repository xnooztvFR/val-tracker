# Testing

## Strategy

- Pas de couverture exhaustive : la suite cible la logique pure/isolée la plus à risque, pas 100% de couverture (choix assumé, pas une priorité annoncée).
- Rust : parsing du lockfile Riot, cache SQLite (frais/périmé/écrasement), rate limiter + circuit breaker, réglages (round-trip, masquage clé API en `Debug`), opérations `db.rs` (favoris, historique, snapshots de rank, `reset_local_stats`).
- Frontend : fonctions pures de `lib/format.ts` (mapping de rank, formatage KDA/durées/dates, `splitRiotId`) et `isCommandError`.

## Tools

- Rust : `cargo test`, pas de framework additionnel.
- Frontend : Vitest, config séparée (`vitest.config.ts`, distincte de `vite.config.ts` pour éviter un conflit de types entre `vite` et `vitest/config` sur `build.rollupOptions`).

## Conventions

- Tests Rust colocalisés dans les modules (`#[cfg(test)]`).
- `npm run build` (`tsc --noEmit`) et `cargo check`/`cargo build` servent de garde-fou de typage, en complément des tests ciblés.

## Run

- `cd src-tauri && cargo test`
- `npm test` (lance `vitest run`)
