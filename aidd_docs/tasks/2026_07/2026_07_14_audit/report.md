# Codebase Audit: val-tracker (7 piliers)

Codebase saine dans l'ensemble pour un projet solo à ce stade : sécurité et tests tiennent
leurs promesses documentées sans faille exploitable, mais `commands.rs` (84 commandes, 1656
lignes) a commencé à accumuler de la logique métier et des accès cache directs qui violent le
contrat "commandes minces" documenté dans `aidd_docs/memory/architecture.md` — c'est le point
le plus prioritaire à traiter.

- **Date**: 2026-07-14
- **Scope**: repo entier (`src-tauri/src/` Rust + `src/` frontend React/TS)
- **Health**: fair
- **Findings**: 2 critical, 8 warning, 20 minor

Health: `good` = no critical findings; `fair` = critical findings exist but are isolated and addressable; `poor` = systemic or widespread critical findings.

## Findings

Toutes les lignes des 7 fichiers de pilier, triées par sévérité (critique d'abord).

| Sev | Category | Location | Issue | Suggested fix | Effort |
| --- | --- | --- | --- | --- | --- |
| 🔴 | architecture | `src-tauri/src/commands.rs:1140-1202` (`record_party_from_match`) | La commande lit directement `crate::api::henrik::cache::get_stale` et décode manuellement l'enveloppe `HenrikEnvelope`, contournant `endpoints.rs`, seul orchestrateur documenté de la chaîne cache → rate-limiter → client. | Déplacer la lecture cache + décodage + reconstruction party/relation dans `api/henrik/endpoints.rs` (ou un nouveau helper `endpoints::get_cached_match_detail`). | M |
| 🔴 | architecture | `src-tauri/src/commands.rs:566-642` (`maybe_notify_loss_streak`) | ~75 lignes de logique métier de détection de streak (résolution puuid, boucle win/loss, dédup, notification) vivent inline dans `commands.rs`, appelées depuis `fetch_matches` — anti-pattern "logique métier inline dans une commande" proscrit par le doc d'architecture. | Extraire vers `db.rs` (lookups) + un module dédié (`alerts.rs`). | M |
| 🟡 | code-quality | `src-tauri/src/riot_local/poller.rs:176-387` | `tick()` fait ~210 lignes, complexité cyclomatique élevée (détection lockfile, HTTP, polling, roster imbriqué 4 niveaux, événements) — difficile à tester isolément. | Extraire la résolution du roster et les branches offline/désactivé en fonctions nommées. | M |
| 🟡 | code-quality | `src/screens/Home.tsx:44-435` | `Home()` fait ~390 lignes, mélange fetch de données, auto-refresh, état de modales et rendu — viole la responsabilité unique. | Extraire un hook `useHomeData`, sortir recap/timeline/goals en sous-composants. | M |
| 🟡 | code-quality | `src-tauri/src/commands.rs:566-642` (`maybe_notify_loss_streak`) | Logique métier inline dans `commands.rs`, contredit la convention "commandes minces" (déjà appliquée pour `side_stats.rs`). | Déplacer vers un nouveau module `loss_streak.rs`. | S |
| 🟡 | code-quality | `src-tauri/src/commands.rs:1140-1202` (`record_party_from_match`) | Classification des relations partie/adversaire embarquée directement dans le handler plutôt que déléguée. | Extraire dans `db.rs` ou un petit `party.rs`. | S |
| 🟡 | architecture | `src-tauri/src/commands.rs:1213` (`get_side_winrate`) | Appelle directement `api::henrik::cache::list_by_prefix` au lieu de passer par `endpoints.rs`, désérialisation JSON inline. | Envelopper en helper `endpoints.rs` (ou `db.rs`). | S |
| 🟡 | architecture | `src/hooks/useUpdater.ts:4,102-132` | Appelle `invoke()` directement, contournant `src/lib/tauriApi.ts`, point d'entrée typé unique documenté. | Ajouter des wrappers `logUpdaterTrace()`/`setPendingChangelog()` à `tauriApi.ts`. | S |
| 🟡 | architecture | `src-tauri/src/main.rs:4-17` vs `aidd_docs/memory/codebase-map.md` | 8 modules backend (`applog`, `discord_rpc`, `dpapi`, `image_proxy`, `inactivity_reminder`, `side_stats`, `status_watcher`, `updater`) non documentés dans la carte du codebase. | Mettre à jour `codebase-map.md` avec les 14 modules réels. | S |
| 🟡 | performance | `src-tauri/src/api/henrik/cache.rs:41-46` + `commands.rs:1211-1225` (`get_side_winrate`) | Scan intégral + désérialisation de tout le cache de détail de match (non borné par puuid) à chaque appel depuis l'écran Trends — falaise de performance latente qui grandit avec l'usage. | Index dédié (puuid/liste de matchs) au lieu d'un scan par préfixe sur le cache générique. | M |
| 🟡 | ui | 10 occurrences (`MatchDetail.tsx:92`, `Compare.tsx:69`, `MatchReport.tsx:64`, `Search.tsx:133`, `Settings.tsx:269,708,925,1030`...) | `hover:bg-[#FF5969]` codé en dur sur les CTA principaux au lieu du token `accent`/`accent-dim` — casse le thème d'accent personnalisable de l'utilisateur. | Remplacer par `hover:bg-accent-dim` ou une variable `--color-accent-hover`. | S |
| 🟡 | ui | `PeriodRecapModal.tsx:15-21`, `RecapCardModal.tsx:16-22`, `ProfileCardModal.tsx:14-18` | Les cartes de partage (canvas) codent en dur toute la palette HUD par défaut, ignorant le thème/accent choisi par l'utilisateur. | Lire les variables CSS `--color-*` live via `getComputedStyle` au lieu d'une palette séparée. | M |
| 🟡 | tests | `src-tauri/src/api/henrik/endpoints.rs:26-40` (`redact_ids`/`is_uuid_like`) | Fonction pure critique pour la confidentialité (masque puuid/match_id avant log) sans aucune couverture de test, alors que le masquage `Debug` équivalent d'`AppSettings` l'est. | Ajouter un module `#[cfg(test)]` couvrant les cas UUID/non-UUID/multiple/aucun. | S |
| 🟡 | dependencies | `package.json:22` (react-router-dom) + react/react-dom | `react-router-dom` v6→v7 majeure disponible, `react`/`react-dom` v18→v19 majeure disponible — dette de migration croissante (pas de CVE). | Planifier une migration groupée React 19 + React Router v7. | L |
| 🟢 | code-quality | `commands.rs:633` | `let _ = set_last_loss_streak_notified_match_id(...)` jette silencieusement un échec d'écriture — pourrait refaire déclencher la notification à chaque poll. | Logger via `applog!` en cas d'échec. | S |
| 🟢 | code-quality | `settings.rs` (951L) / `db.rs` (1558L) / `commands.rs` (1656L) | 3 fichiers Rust dépassent ~500 lignes, bien factorisés en interne mais pénalisent la navigation. | Scinder `db.rs` par groupe de tables lors du prochain ajout de fonctionnalité. | L |
| 🟢 | code-quality | `src/screens/Settings.tsx` (1277L) | Bien découpé en ~18 `*Section()` mais reste un fichier unique mélangeant des domaines non liés. | Déplacer chaque `*Section` dans son propre fichier sous `src/screens/settings/`. | M |
| 🟢 | code-quality | `src/components/ProgressionGoalPanel.tsx:25` | `getFullTierLabels()[15].tier` — index de tableau magique pour le tier par défaut. | Utiliser un lookup nommé (`.find(t => t.label === "Diamant 1")`). | S |
| 🟢 | code-quality | `src-tauri/src/main.rs:32-244` | Closure `.setup()` de ~110 lignes câblant 7+ sous-systèmes inline. | Optionnel : extraire l'enregistrement des raccourcis en helper. | S |
| 🟢 | architecture | `src-tauri/src/commands.rs` (fichier entier) | God-module : 84 commandes, 7+ domaines non liés dans un seul fichier plat. | Scinder en modules par domaine (`commands/settings.rs`, `commands/stats.rs`...). | L |
| 🟢 | architecture | `src-tauri/src/api/henrik/` (`endpoints_premier.rs`, `endpoints_esports.rs`...) | Docs décrivent `endpoints.rs`/`types.rs` comme singuliers, mais déjà scindés en fichiers `_premier`/`_esports`. | Mettre à jour le libellé des docs mémoire. | S |
| 🟢 | security | `src-tauri/src/riot_local/client.rs:47` | `danger_accept_invalid_certs(true)` sur le client API locale Riot (localhost uniquement, pas de pinning). | Envisager le pinning du certificat auto-signé. | M |
| 🟢 | security | `src-tauri/proxy/worker.js:93-99` | Comparaison de token non à temps constant dans `resolveTokenId`, incohérent avec `settings.rs::constant_time_eq`. | Comparaison à temps constant côté Worker. | S |
| 🟢 | security | `src-tauri/src/api/henrik/client.rs:117,139` | Corps brut de réponse d'erreur Henrik inclus sans garde `cfg!(debug_assertions)`, incohérent avec la règle debug-only. | Vérifier/aligner le garde debug-only. | S |
| 🟢 | performance | `commands.rs:1176-1200` (`record_party_from_match`) | Boucle par joueur sans transaction englobante (jusqu'à 9 `conn.execute` séparés). | Envelopper dans `conn.unchecked_transaction()`. | S |
| 🟢 | performance | `db.rs:257-275` (`maybe_vacuum`) | `VACUUM` synchrone bloquant le `Mutex<Connection>` partagé au-delà de 100 Mo de cache. | Envisager de sortir le vacuum du chemin critique. | S |
| 🟢 | performance | `package.json` | `recharts`/`react-window` potentiellement lourds pour le nombre de graphiques utilisés (pas d'analyseur de bundle disponible). | Évaluer une primitive plus légère si la taille devient un souci. | M |
| 🟢 | tests | `src-tauri/src/dpapi.rs:71-87` | Seulement 2 tests, pas de cas "base64 valide mais pas un vrai blob DPAPI". | Ajouter un cas d'entrée corrompue supplémentaire. | S |
| 🟢 | tests | `src-tauri/src/commands.rs` (0 test) | Cohérent avec la convention "commandes minces" mais à revérifier périodiquement vu la taille. | Grep occasionnel pour confirmer l'absence de logique métier non testée. | S |
| 🟢 | tests | repo entier | Pas de test e2e/intégration, pas d'outil de couverture — compromis assumé pour un projet solo. | Aucune action requise maintenant. | — |
| 🟢 | ui | `Home.tsx:402`, `Trends.tsx:34-37,209`, `Premier.tsx:136`, `PremierTeamDetail.tsx:37`, `Settings.tsx:303-306,936,1181`, `ApiStatusBadge.tsx:7` | Valeurs hex brutes éparses (couleurs de séries/statut) dupliquant ce qui pourrait être des tokens nommés. | Promouvoir en extensions de thème Tailwind là où structurel. | S |
| 🟢 | ui | `src/screens/Compare.tsx` | Pas d'`EmptyState`/`StaleDataBanner`, contrairement aux écrans voisins. | Ajouter la couverture manquante pour matcher le pattern des autres écrans. | S |
| 🟢 | ui | tous les écrans (`Agents.tsx:120`, `Trends.tsx:129`, `Search.tsx:99`...) | Hiérarchie de titres visuellement plate (h1 ≈ h2 en style). | Esthétique HUD intentionnelle, priorité basse. | S |
| 🟢 | ui | pass a11y statique | Pas d'URL fournie, pas de pass runtime axe/clavier ; pas d'`alt` manquant détecté statiquement. | Pass runtime de suivi si l'a11y devient une priorité. | M |
| 🟢 | dependencies | `package.json:14` (`@tauri-apps/plugin-autostart`) | Paquet npm déclaré mais jamais importé dans `src/` — le contrôle passe par des commandes Rust custom. | Retirer la dépendance npm inutilisée. | S |
| 🟢 | dependencies | `src-tauri/Cargo.toml` | `cargo audit` non installé — aucune CVE Rust vérifiée. | Installer `cargo-audit`/`cargo-deny`, l'exécuter avant chaque release. | S |
| 🟢 | dependencies | `package.json` (recharts, tailwindcss, zustand, react-window, typescript) | Plusieurs majeures de retard sans CVE associée, dette de version. | Regrouper avec la migration React 19 plutôt que des upgrades isolés. | M |
| 🟢 | dependencies | `src-tauri/Cargo.toml:5` (licence GPL-3.0-or-later) | Aucun conflit de licence détecté par sondage manuel du `Cargo.lock`, mais pas d'outil de vérification exécuté. | Exécuter `cargo license`/`cargo deny check licenses` pour une vérification exhaustive. | S |

## Top actions

Par impact décroissant, tous piliers confondus :

1. **Sortir la logique métier de `commands.rs`** — `record_party_from_match` (contourne le cache), `maybe_notify_loss_streak` (75 lignes de streak inline), et `get_side_winrate` (même contournement). Ce sont les 2 seuls findings 🔴 critiques et la racine de plusieurs findings 🟡 code-quality/architecture. Handoff : `aidd-dev:07-refactor`.
2. **Scinder `commands.rs`** (84 commandes, 1656 lignes) en modules par domaine avant que la dette d'architecture ne s'aggrave — le god-module le plus risqué du backend. Handoff : `aidd-dev:07-refactor`.
3. **Router `useUpdater.ts` via `tauriApi.ts`** et rafraîchir `codebase-map.md` (8 modules manquants, scission premier/esports) pour que la documentation mémoire reste fiable. Handoff : `aidd-dev:02-implement` (petit) + `aidd-context:02-project-memory`.
4. **Corriger le hover `#FF5969` codé en dur** et les modales canvas (recap/profil) qui ignorent le thème d'accent personnalisable — régression visuelle visible pour tout utilisateur ayant changé de thème. Handoff : `aidd-dev:02-implement`.
5. **Borner le scan de cache de `get_side_winrate`** avant qu'il ne devienne un vrai goulot d'étranglement à mesure que le cache grossit. Handoff : `aidd-dev:07-refactor` (facette performance).
6. **Installer `cargo-audit`** et l'intégrer à `scripts/release.ps1` — seul angle mort réel côté dépendances, aucune CVE Rust n'est actuellement vérifiée avant publication.

## Coverage

- **Scanned**: code-quality, architecture, security, dependencies, performance, tests, ui — les 7 piliers ont été exécutés.
- **Skipped**: aucun pilier entier skippé. Sous-scans partiels notés dans chaque fichier de pilier :
  - `dependencies` — CVEs Rust non vérifiées (`cargo audit` non installé sur la machine) ; vérification de licence par sondage manuel uniquement (pas d'outil dédié exécuté).
  - `performance` — pas de profiler ni d'analyseur de bundle disponible, heuristiques statiques uniquement.
  - `tests` — pas d'outil de couverture configuré (`vitest --coverage`, `cargo-tarpaulin`), inspection statique uniquement.
  - `ui` — pas d'URL de frontend en cours d'exécution fournie, pass runtime a11y/axe non effectué.
