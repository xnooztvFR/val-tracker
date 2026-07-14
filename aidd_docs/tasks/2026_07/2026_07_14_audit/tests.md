# Codebase Audit: tests

Mesuré à l'aune de la propre philosophie affichée par le projet ("logique pure/isolée à
risque uniquement"), la suite de tests tient ses promesses et les dépasse par endroits ; un
seul petit trou cohérent avec cette philosophie (`redact_ids` non testé).

- **Date**: 2026-07-14
- **Scope**: `src-tauri/src/` (`cargo test`) + `src/` (`vitest`)
- **Health**: good
- **Findings**: 0 critical, 1 warning, 3 minor

Health: `good` = no critical findings; `fair` = critical findings exist but are isolated and addressable; `poor` = systemic or widespread critical findings.

Aucun outil de couverture configuré (`vitest run` sans `--coverage` ; pas de
`cargo-tarpaulin`/`cargo-llvm-cov`) — audit basé uniquement sur l'inspection statique
(présence de fichiers de test, blocs `#[cfg(test)]`, lecture du corps des tests) et non sur
un pourcentage de couverture mesuré.

## Findings

| Sev | Category | Location | Issue | Suggested fix | Effort |
| --- | --- | --- | --- | --- | --- |
| 🟡 | tests | `src-tauri/src/api/henrik/endpoints.rs:26-40` (`redact_ids`/`is_uuid_like`) | Logique pure critique pour la confidentialité (masque puuid/match_id avant tout `eprintln!`, selon la convention du projet lui-même "pas d'identifiants en clair dans les logs") mais sans aucune couverture de test — aucun bloc `#[cfg(test)]` dans ce fichier ne couvre cette fonction, seul le module `stored_fallback_tests` sans rapport (mapping DTO) existe. Même catégorie de risque que le masquage `Debug` d'`AppSettings`, qui lui *est* testé. | Ajouter un petit module `#[cfg(test)]` vérifiant que `redact_ids` masque un segment UUID bien formé, laisse intacts les segments non-UUID (noms de carte, littéraux d'endpoint), et gère un chemin avec plusieurs segments UUID / aucun. | S |
| 🟢 | tests | `src-tauri/src/dpapi.rs:71-87` | Seulement 2 tests (`round_trip`, `garbage_input_fails_cleanly`) ; aucun test pour `unprotect` sur un blob bien formé mais faux (ex. base64 valide, pas un vrai blob DPAPI) vs une chaîne en clair passée par erreur — les deux s'effondrent actuellement dans le même seau "échoue proprement" dans `settings.rs::get_encrypted`, qui renvoie silencieusement `None` sur toute erreur de déchiffrement. Pas un trou dans le périmètre affiché (`dpapi.rs` n'est pas listé dans la section Tests de CLAUDE.md), mais appuie directement la seule chose qui *est* revendiquée (masquage/chiffrement de la clé API). | Ajouter un cas décodant un base64 valide qui n'est pas un vrai blob protégé, pour figer explicitement le contrat "ne panique jamais sur des données corrompues". | S |
| 🟢 | tests | `src-tauri/src/commands.rs` (1656 lignes, 0 test) | Aucune couverture de test, mais cohérent avec la convention affichée du projet ("commands.rs ne fait qu'orchestrer... la logique métier vit dans les modules dédiés") — la logique est censée vivre dans des modules testés et `commands.rs` reste de la glue mince. Signalé uniquement car à 1656 lignes, ça vaut la peine de revérifier périodiquement qu'aucune logique métier non testée ne s'y est glissée. | Aucune action requise maintenant ; grep occasionnel de `commands.rs` pour des branches `if`/`match` au-delà d'un simple mapping d'arguments pour confirmer que l'invariant "orchestration mince" tient toujours. | S |
| 🟢 | tests | tout le repo (`src-tauri/`, `src/`) | Aucun test e2e/intégration exerçant un aller-retour complet commande Tauri → DB → frontend, et aucun outil de couverture configuré pour quantifier ce que l'inspection statique ne peut pas voir (ex. branches mortes à l'intérieur de fonctions testées). Compromis connu et explicitement affiché pour un projet solo en phase précoce (CLAUDE.md : "pas une priorité annoncée"), pas un défaut. | Aucune action requise maintenant ; si/quand la surface de commandes Tauri grandit encore, envisager un seul test d'intégration léger (IPC simulé → DB en mémoire) plutôt qu'une pyramide complète. | — |

Aucun finding 🔴 critique : chaque revendication de la section Tests de CLAUDE.md a été
vérifiée présente et correcte (parsing du lockfile, cache fresh/stale/overwrite, seuil du
rate limiter + reset du circuit breaker, round-trip des settings + masquage `Debug` de la clé
API, opérations locales de `db.rs` — favoris/historique/snapshots de rank/`reset_local_stats`,
fonctions pures de `lib/format.ts`, `isCommandError`). Aucun `#[ignore]`, `.skip`, `.todo`, ni
test basé sur `sleep`/timing flaky trouvé nulle part dans `src-tauri/src/**` ou `src/**`.

## Top actions

1. Ajouter des tests unitaires pour `redact_ids`/`is_uuid_like` dans `endpoints.rs` — la seule fonction pure critique pour la confidentialité signalée par CLAUDE.md qui soit passée entre les mailles, triviale à couvrir (effort S).
2. Optionnellement renforcer `dpapi.rs` avec un cas d'entrée corrompue supplémentaire, puisque c'est la couche de chiffrement derrière la seule chose que la suite de tests promet déjà de protéger.
3. Réauditer périodiquement `commands.rs` pour confirmer qu'il reste de la pure orchestration (pas de logique métier non testée qui s'y infiltre).
4. Aucun correctif structurel nécessaire pour la flakiness, les tests skippés, ou les assertions couplées à l'implémentation — aucun n'existe.

## Coverage

- **Scanned**: tests (`src-tauri/src/**` — `cargo test`, `src/**` — `vitest`, inspection
  statique de la présence des fichiers de test et de leur contenu)
- **Skipped**: aucun outil de couverture configuré (`vitest run` sans `--coverage`, pas de
  `cargo-tarpaulin`/`cargo-llvm-cov`) — inspection statique uniquement, pas de pourcentage de
  couverture mesuré
