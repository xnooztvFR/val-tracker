# API

## Style

- Pas de surface HTTP exposée : la « RPC » est l'IPC Tauri interne entre le frontend webview et le process Rust, via `invoke()` (voir `src/lib/tauriApi.ts`).
- Commandes déclarées avec `#[tauri::command]` dans `src-tauri/src/commands.rs`, enregistrées dans `main.rs`. Chaque commande reste fine : parsing des arguments, appel à `db.rs`/`api/henrik/`, mapping vers `CommandError`.
- Pas de versionnage ni de base path — surface interne à l'app, jamais exposée sur le réseau.

## Resources

- Recherche/profil joueur, historique de matchs, détail de match, stats par carte (orchestrent `api/henrik/endpoints.rs`).
- Réglages (clé API, préférences) — `settings.rs`.
- Données locales (favoris, historique, snapshots de rank) — `db.rs`.
- État de partie et overlay (`riot_local/`, `overlay/`).

## Contracts

- Chaque commande renvoie une `CommandError` typée (`{ kind, ... }`) plutôt qu'une erreur générique — distinguée côté frontend par `lib/tauriApi.ts` (`isCommandError`) et affichée via `components/ErrorState.tsx` (clé API manquante, 404, rate limit, circuit breaker, panne réseau).
- Les DTO TypeScript dans `lib/tauriApi.ts` sont un miroir manuel des structs Rust (`api/henrik/types.rs`) — pas de génération automatique, à garder synchronisé à la main.
