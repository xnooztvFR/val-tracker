# Codebase Audit: architecture

Le pipeline Henrik cache→rate-limiter→client et la règle "frontend toujours via `tauriApi.ts`"
sont globalement respectés, mais `commands.rs` a commencé à accumuler de la logique métier et
des accès cache directs, et devient un god-module (84 commandes, 1656 lignes).

- **Date**: 2026-07-14
- **Scope**: `src-tauri/src/` + `src/` vs `aidd_docs/memory/architecture.md` et `codebase-map.md`
- **Health**: fair
- **Findings**: 2 critical, 3 warning, 2 minor

Health: `good` = no critical findings; `fair` = critical findings exist but are isolated and addressable; `poor` = systemic or widespread critical findings.

## Findings

| Sev | Category | Location | Issue | Suggested fix | Effort |
| --- | --- | --- | --- | --- | --- |
| 🔴 | architecture | `src-tauri/src/commands.rs:1140-1202` (`record_party_from_match`) | La commande va lire directement `crate::api::henrik::cache::get_stale` et décode manuellement l'enveloppe `HenrikEnvelope`, contournant `endpoints.rs`, documenté comme seul orchestrateur de la chaîne cache → rate-limiter → client. | Déplacer la lecture cache + décodage + reconstruction party/relation dans `api/henrik/endpoints.rs` (ou un nouveau helper `endpoints::get_cached_match_detail`), la commande se contente de l'appeler. | M |
| 🔴 | architecture | `src-tauri/src/commands.rs:566-642` (`maybe_notify_loss_streak`) | ~75 lignes de logique métier de détection de streak (résolution puuid, boucle win/loss, dédup, envoi de notification) vivent inline dans `commands.rs`, appelées depuis `fetch_matches`. C'est exactement l'anti-pattern "logique métier inline dans une `#[tauri::command]`" que le doc d'architecture proscrit. | Extraire vers `db.rs` (lookups) + un petit module dédié (`alerts.rs`), la commande n'appelle plus qu'une fonction. | M |
| 🟡 | architecture | `src-tauri/src/commands.rs:1213` (`get_side_winrate`) | Même schéma : la commande appelle directement `api::henrik::cache::list_by_prefix` au lieu de passer par `endpoints.rs`, et désérialise du JSON inline. | Envelopper en helper `endpoints.rs` (ou `db.rs`) pour que `commands.rs` reste un simple passe-plat. | S |
| 🟡 | architecture | `src/hooks/useUpdater.ts:4,102-132` | Appelle `invoke("log_updater_trace", ...)` et `invoke("set_pending_changelog", ...)` directement via `@tauri-apps/api/core`, contournant `src/lib/tauriApi.ts`, documenté comme point d'entrée typé unique pour tous les appels `invoke()` du frontend. | Ajouter des wrappers `logUpdaterTrace()`/`setPendingChangelog()` à `tauriApi.ts` et les appeler à la place de `invoke` brut. | S |
| 🟡 | architecture | `src-tauri/src/main.rs:4-17` vs `aidd_docs/memory/codebase-map.md` | `codebase-map.md` ne liste que `commands.rs`, `db.rs`, `settings.rs`, `api/henrik/`, `riot_local/`, `overlay/`, mais `main.rs` déclare 8 modules non documentés : `applog`, `discord_rpc`, `dpapi`, `image_proxy`, `inactivity_reminder`, `side_stats`, `status_watcher`, `updater`. Les docs ne reflètent plus le graphe de modules réel. | Mettre à jour `codebase-map.md` avec les 14 modules et une ligne de description chacun. | S |
| 🟢 | architecture | `src-tauri/src/commands.rs` (fichier entier, 1656 lignes / 84 commandes `#[tauri::command]`) | Surface de commande unique et plate mélangeant 7+ domaines non liés (settings CRUD, orchestration fetch Henrik, VLR/esports, premier, stats duo/squad, notes+PIN, détection self-account, proxy image, autostart, overlay). Croissance classique en god-module — tout changement touche ce fichier, plus gros risque de couplage du backend. | Scinder en modules par domaine (`commands/settings.rs`, `commands/henrik_fetch.rs`, `commands/stats.rs`, `commands/notes.rs`, `commands/self_account.rs`...) réexportés et enregistrés depuis `main.rs` ; garder `CommandError` partagé dans `commands/mod.rs`. | L |
| 🟢 | architecture | `src-tauri/src/api/henrik/` (`endpoints_premier.rs`, `endpoints_esports.rs`, `types_premier.rs`, `types_esports.rs`) | Les docs décrivent `endpoints.rs`/`types.rs` comme des fichiers singuliers, mais le domaine a déjà été scindé en fichiers `_premier`/`_esports`. Fonctionnellement correct (toujours orchestré cache→client dans `api/henrik/`), mais le doc mémoire sous-représente la structure réelle. | Mettre à jour le libellé de `architecture.md`/`codebase-map.md` pour mentionner la scission premier/esports. | S |

## Top actions

1. Sortir les deux helpers qui contournent le cache (`record_party_from_match`, `get_side_winrate`) et la logique métier de `maybe_notify_loss_streak` hors de `commands.rs` vers `api/henrik/endpoints.rs` / `db.rs` / un nouveau `alerts.rs` — restaure le contrat "commandes minces" documenté et supprime les seules vraies violations de direction de dépendance trouvées.
2. Router les deux `invoke()` bruts de `useUpdater.ts` via `tauriApi.ts` pour combler la dernière fuite frontend de la règle "toujours via tauriApi.ts".
3. Scinder `commands.rs` (84 commandes, 1656 lignes) en sous-modules par domaine avant que ça ne grossisse davantage — plus gros risque de couplage/érosion du codebase.
4. Rafraîchir `aidd_docs/memory/codebase-map.md` pour lister les 8 modules backend non documentés et la scission premier/esports.

## Coverage

- **Scanned**: architecture (`aidd_docs/memory/architecture.md` + `codebase-map.md` comparés au code réel dans `src-tauri/src/` et `src/`)
- **Skipped**: aucun
