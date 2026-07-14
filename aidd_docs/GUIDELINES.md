# AI Operating Guidelines

How this team drives AI coding assistants on this project.

## House rules

- Commandes Tauri fines : `commands.rs` ne fait qu'orchestrer, la logique métier vit dans les modules dédiés (`db.rs`, `api/henrik/`).
- Une fonction par endpoint Henrik dans `api/henrik/endpoints.rs`, toujours cache → rate limiter/circuit breaker → client ; jamais d'appel `reqwest` direct ailleurs.
- Le frontend ne parle jamais directement à l'API Henrik : tout passe par `invoke()` via `lib/tauriApi.ts`.
- Jamais de clé API ni d'identifiant (puuid/match_id) en clair dans les logs — voir `settings.rs` (masquage `Debug`) et `api/henrik/endpoints.rs::redact_ids`.
- `app.security.csp` dans `tauri.conf.json` doit rester renseigné ; étendre la CSP plutôt que la désactiver pour un nouveau domaine d'assets. Préférer `components/ExternalImage.tsx` (proxy Rust) pour un domaine tiers non stable.
- Après toute modification substantielle, proposer à l'utilisateur de couper une nouvelle release (seul vecteur de mise à jour pour les utilisateurs déjà installés).
- `git push origin main` et la publication d'une release sont des actions publiques visibles — demander confirmation avant.

## Validation depth

- Rust : `cargo check` / `cargo build`, et `cargo test` (parsing lockfile, cache SQLite, rate limiter/circuit breaker, settings, opérations `db.rs`).
- Frontend : `npm run build` (`tsc --noEmit`) comme garde-fou de typage, `npm test` (vitest) pour `lib/format.ts` et `isCommandError`.
- Pas de linter configuré (choix délibéré, projet solo) — ne pas introduire ESLint/Clippy strict sans en discuter avec l'utilisateur au préalable.

## When the AI drifts

- Revenir au périmètre exact de la demande : changements chirurgicaux, ne pas refactorer au-delà de ce qui est nécessaire.
- Vérifier la CSP et l'absence de logs sensibles avant de considérer un écran/endpoint terminé.

For the general AIDD playbook (planning, review loops, prompting and context hygiene, anti-patterns), see the framework docs: <https://github.com/ai-driven-dev/framework>.
