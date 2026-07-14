# Codebase Audit: performance

Pas de vrai pattern N+1 réseau/DB par itération, mais un scan cache non borné derrière
`get_side_winrate` est une vraie falaise de performance latente à mesure que l'usage grandit.

- **Date**: 2026-07-14
- **Scope**: `src-tauri/src/` (db.rs, api/henrik, riot_local/poller.rs) + `src/` (screens/composants React)
- **Health**: fair
- **Findings**: 0 critical, 1 warning, 3 minor

Health: `good` = no critical findings; `fair` = critical findings exist but are isolated and addressable; `poor` = systemic or widespread critical findings.

Analyse par heuristiques statiques uniquement — aucun profiler, analyseur de bundle, ni
instance frontend en cours d'exécution n'était disponible.

## Findings

| Sev | Category | Location | Issue | Suggested fix | Effort |
| --- | --- | --- | --- | --- | --- |
| 🟡 | performance | `src-tauri/src/api/henrik/cache.rs:41-46` + `src-tauri/src/commands.rs:1211-1225` (`get_side_winrate`) | `list_by_prefix(conn, "/valorant/v2/match/")` récupère et désérialise en JSON **tous** les payloads de détail de match en cache dans toute la table `api_cache` (non filtré par puuid, les URLs de match ne portant pas d'id joueur) à chaque appel — l'ensemble ne fait que croître sur la durée de vie de l'app jusqu'au seuil de VACUUM à 100 Mo. Appelé depuis l'écran Trends, ce scan intégral + désérialisation peut donc tourner à chaque navigation vers Trends. | Stocker une table d'index (puuid ou liste d'id de match) pour les matchs suivis/vus au lieu d'un scan par préfixe sur le cache générique, ou borner la requête via une jointure avec `tracked_players`/une liste de matchs récents bornée. | M |
| 🟢 | performance | `src-tauri/src/commands.rs:1176-1200` (`record_party_from_match`) | La boucle par coéquipier/adversaire par match émet un `conn.execute` (`record_party_match`) par joueur (jusqu'à ~9) sans transaction englobante (contrairement à `reorder_favorites`, qui utilise `unchecked_transaction`). Chaque appel est sa propre transaction SQLite implicite en WAL. | Envelopper le corps de boucle dans `conn.unchecked_transaction()` comme le fait `reorder_favorites`, pour regrouper les ~9 écritures en un seul commit. | S |
| 🟢 | performance | `src-tauri/src/db.rs:257-275` (`maybe_vacuum`) | `VACUUM` réécrit le fichier entier, déclenché de façon synchrone sur la même connexion que les commandes de l'app une fois `api_cache` au-delà de 100 Mo ; sur un gros cache, ça bloque le `Mutex<Connection>` partagé unique pendant toute la durée. | Envisager d'exécuter le check/l'exécution du vacuum hors du chemin critique (tâche en arrière-plan), ou documenter que c'est volontairement rare/best-effort (déjà le cas, juste signaler le risque de blocage du verrou partagé). | S |
| 🟢 | performance | `package.json` | `recharts` (bibliothèque de graphiques, assez lourde) et `react-window` sont toutes deux embarquées ; pas d'analyseur de bundle disponible pour confirmer le poids réel, mais recharts est une dépendance connue pour être lourde pour une app desktop avec seulement quelques types de graphiques (historique de rank, tendances). | Si la taille du bundle devient un jour un souci, évaluer une primitive de graphique plus légère (ex. SVG à la main pour les 2-3 formes de graphique utilisées) — priorité basse, les bundles Tauri étant moins sensibles à la taille que le web. | M |

## Top actions

1. Borner/limiter le scan de cache derrière `get_side_winrate` pour qu'il ne désérialise pas tout le cache de match de l'app à chaque chargement de Trends.
2. Envelopper la boucle par joueur de `record_party_from_match` dans une transaction.
3. Reconfirmer que le comportement de verrouillage de `maybe_vacuum` reste invisible pour l'utilisateur maintenant que `api_cache` peut grossir avec un usage multi-comptes.

## Coverage

- **Scanned**: performance (boucles/`.await` en Rust, requêtes rusqlite, code de rendu React
  — heuristiques statiques uniquement, notées ci-dessous)
- **Skipped**: pas de profiler ni d'analyseur de bundle disponible — heuristiques statiques
  uniquement, aucune régression runtime mesurée
