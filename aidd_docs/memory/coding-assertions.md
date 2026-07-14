# Coding Assertions

## Before commit

| Order | Command | Checks |
| ----- | ------- | ------ |
| 1 | `cargo check` (dans `src-tauri/`) | Le backend Rust compile |
| 2 | `npm run build` | `tsc --noEmit` (typage frontend) puis build Vite |

## Before push

| Order | Command | Checks |
| ----- | ------- | ------ |
| 1 | `cargo test` (dans `src-tauri/`) | Lockfile, cache SQLite, rate limiter/circuit breaker, settings (masquage clé API), opérations `db.rs` |
| 2 | `npm test` | Vitest : `lib/format.ts`, `isCommandError` (config dédiée `vitest.config.ts`) |

Pas de linter configuré (ESLint/Clippy) — choix délibéré pour un projet solo, ne pas en introduire sans en discuter avec l'utilisateur au préalable.
