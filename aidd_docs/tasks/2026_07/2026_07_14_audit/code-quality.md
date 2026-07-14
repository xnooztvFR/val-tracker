# Codebase Audit: code-quality

Codebase disciplinée pour un projet solo : zéro `unwrap()`/`any` en dehors des tests, pas de
`catch` vide, mais quelques fonctions/fichiers surdimensionnés et deux fuites de logique
métier dans `commands.rs`.

- **Date**: 2026-07-14
- **Scope**: `src-tauri/src/` (Rust) + `src/` (frontend React/TS)
- **Health**: good
- **Findings**: 0 critical, 4 warning, 5 minor

Health: `good` = no critical findings; `fair` = critical findings exist but are isolated and addressable; `poor` = systemic or widespread critical findings.

## Findings

| Sev | Category | Location | Issue | Suggested fix | Effort |
| --- | --- | --- | --- | --- | --- |
| 🟡 | code-quality | `src-tauri/src/riot_local/poller.rs:176-387` | `tick()` fait ~210 lignes et mélange détection lockfile, reconstruction du client HTTP, polling du game-state, récupération du roster (match imbriqué 4 niveaux pour pregame/in-game) et publication d'événements — complexité cyclomatique élevée, difficile à tester isolément. | Extraire la résolution du roster (lignes 284-362) et les branches de retour anticipé offline/désactivé en fonctions nommées. | M |
| 🟡 | code-quality | `src/screens/Home.tsx:44-435` | `Home()` fait ~390 lignes et porte à la fois le fetch compte/mmr/matchs/timeline, la planification de l'auto-refresh, l'état des modales profil/recap, et le rendu — viole la responsabilité unique, difficile à parcourir. | Extraire le fetch de données/auto-refresh dans un hook `useHomeData`, et sortir recap/timeline/goals en sous-composants. | M |
| 🟡 | code-quality | `src-tauri/src/commands.rs:566-642` (`maybe_notify_loss_streak`) | Le calcul complet de la streak de défaites (résolution du compte, boucle de comptage, dédup par match_id, envoi de notification) vit inline dans `commands.rs`, à l'encontre de la convention du projet (commandes minces, logique dans des modules dédiés comme `side_stats.rs`). | Déplacer cette logique dans un nouveau module `loss_streak.rs`, la commande n'appelle plus que `loss_streak::maybe_notify(...)`. | S |
| 🟡 | code-quality | `src-tauri/src/commands.rs:1140-1202` (`record_party_from_match`) | La classification des relations partie/adversaire (chaîne if/else sur `player.team`/`party_id`) est embarquée directement dans le handler de commande plutôt que déléguée à `db.rs` ou un module dédié. | Extraire le calcul de relation/team-won par joueur dans `db.rs` ou un petit `party.rs`, appelé depuis la commande. | S |
| 🟢 | code-quality | `src-tauri/src/commands.rs:633` | `let _ = crate::db::set_last_loss_streak_notified_match_id(...)` ignore silencieusement un échec d'écriture ; en cas d'échec, la même notification de streak pourrait se redéclencher à chaque poll au lieu d'une seule fois. | Logger l'erreur via `applog!` en cas d'échec au lieu de la jeter silencieusement. | S |
| 🟢 | code-quality | `src-tauri/src/settings.rs` (951 lignes) / `src-tauri/src/db.rs` (1558 lignes) / `src-tauri/src/commands.rs` (1656 lignes) | Trois fichiers Rust dépassent la barre indicative des ~500 lignes ; chacun reste bien factorisé (petites fonctions `pub fn` + gros bloc `#[cfg(test)]`) mais la taille pénalise la navigation à terme. | Envisager de scinder `db.rs` par groupe de tables (`db/players.rs`, `db/goals.rs`, `db/party.rs`...) lors du prochain ajout de fonctionnalité ; peu urgent vu l'organisation actuelle. | L |
| 🟢 | code-quality | `src/screens/Settings.tsx` (1277 lignes) | Bien découpé en ~18 sous-composants `*Section()` mais reste un fichier unique dépassant 500 lignes, mélangeant des domaines non liés (Discord, overlay, confidentialité, logs, viseur, mises à jour). | Déplacer chaque `*Section` dans son propre fichier sous `src/screens/settings/`. | M |
| 🟢 | code-quality | `src/components/ProgressionGoalPanel.tsx:25` | `getFullTierLabels()[15].tier` utilise un index de tableau magique (atténué par un commentaire `// Diamant 1`) pour choisir un tier par défaut — fragile si l'ordre de `getFullTierLabels()` change un jour. | Exposer une constante nommée/lookup (ex. `getFullTierLabels().find(t => t.label === "Diamant 1")`) plutôt qu'un index littéral. | S |
| 🟢 | code-quality | `src-tauri/src/main.rs:32-244` | La closure `.setup()` de `main()` (~110 lignes) câble init DB, warm-up overlay, poller, Discord RPC, status watcher, rappel d'inactivité et trois raccourcis globaux inline ; lisible grâce aux commentaires mais reste un bloc d'orchestration long. | Optionnel : extraire l'enregistrement des raccourcis (lignes 95-121) dans un helper `register_shortcuts(&handle)`. | S |

## Top actions

1. Sortir la détection de streak de défaites et la classification de relation de partie hors de `commands.rs` vers des modules dédiés — c'est la violation la plus claire de la convention "commandes minces" du projet.
2. Découper `poller.rs::tick()` et le composant `Home()` de `Home.tsx` — deux points chauds de complexité/longueur qui deviendront plus risqués à modifier avec le temps.
3. Ne plus jeter silencieusement le résultat de `set_last_loss_streak_notified_match_id` — le faire passer par `applog!` comme le reste de la gestion d'erreur best-effort du projet.
4. Lors d'un prochain passage sur `Settings.tsx`, scinder les composants `*Section` déjà propres en fichiers séparés pour contenir la taille du fichier.

## Coverage

- **Scanned**: code-quality (`src-tauri/src/` et `src/` intégralement passés au crible — naming, SOLID/DRY, dead code, complexité, gestion d'erreur)
- **Skipped**: aucun
