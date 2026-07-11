# Valorant Tracker

App desktop Windows type tracker.gg (rank + stats Valorant), en Tauri 2.x — backend Rust,
frontend React/TypeScript/Tailwind. Réutilise (en Rust) le même niveau de robustesse que le
bot Discord côté API Henrik Dev : cache SQLite avec TTL différenciés, rate limiting avec
espacement, circuit breaker, retry respectant `Retry-After`.

## Statut

- **V1** : recherche de joueur, profil (rank + historique de progression), historique de
  matchs, détail de match, stats par carte, réglages. Fonctionnelle et robuste aux pannes
  réseau/API.
- **V2 (cette livraison)** : détection automatique de partie via l'API locale du Riot Client
  (`src-tauri/src/riot_local/` : lockfile → presence → endpoints GLZ pour le roster) +
  fenêtre overlay always-on-top (`src-tauri/src/overlay/`, écran `src/screens/Overlay.tsx`)
  affichant l'état de partie et le rank Henrik des joueurs détectés. Best-effort : API locale
  non officielle, repli silencieux en mode lookup manuel si elle ne répond pas ; overlay
  click-through par défaut, `Ctrl+Shift+V` pour le déplacer ; notification de fin de partie ;
  désactivable dans Paramètres → Overlay en jeu. Limite connue : le plein écran exclusif peut
  masquer l'overlay (utiliser « plein écran sans bordure »).
- **Refonte design** : identité « HUD tactique » (fond graphite `#0B0E11`, accent cyan
  `#7CE8D3`, rouge réservé aux signaux négatifs, Chakra Petch / Inter / JetBrains Mono
  self-hostées via @fontsource, panneaux à coin coupé `clip-path` sans border-radius) — voir
  `tailwind.config.js` et `src/index.css` (`.panel-clip`, `.hud-label`, `.target-lock`).

## Setup

### Prérequis

- [Rust](https://www.rust-lang.org/tools/install) (stable, toolchain MSVC sous Windows)
- [Node.js](https://nodejs.org/) 18+
- Les [prérequis Tauri pour Windows](https://v2.tauri.app/start/prerequisites/) (WebView2 —
  déjà présent sur la plupart des installs Windows 10/11 à jour ; Visual Studio Build Tools
  avec la charge "Développement Desktop en C++")
- Une clé API [Henrik Dev](https://discord.com/invite/X3GaVkX2YN) (rejoindre le Discord Henrik
  Dev et suivre les instructions du salon dédié pour en obtenir une)

### Installation

```bash
npm install
```

### Où mettre la clé API

**Pas dans le repo.** La clé se configure directement dans l'app, dans l'écran **Paramètres**
(champ "Clé API Henrik", bouton "Vérifier" pour tester sa validité avant de l'enregistrer).
Elle est stockée dans le dossier de données de l'app (`%APPDATA%\com.mri-bot.val-tracker\`),
jamais committée, jamais affichée en clair dans les logs.

Au premier lancement, sans clé configurée, l'app redirige automatiquement vers Paramètres.

### Lancer en dev

```bash
npm run tauri dev
```

Ça compile le backend Rust, lance le serveur Vite sur `http://localhost:1420`, et ouvre la
fenêtre Tauri. Les changements côté React sont pris en compte à chaud ; les changements côté
Rust déclenchent une recompilation + redémarrage de l'app.

### Build

```bash
npm run tauri build
```

Génère les installeurs `.msi` (WiX) et `.exe` (NSIS) dans `src-tauri/target/release/bundle/`.

Notes avant un vrai build de distribution :
- Les icônes dans `src-tauri/icons/` sont des placeholders générés (couleur unie violette) —
  à remplacer par de vraies icônes avant publication.
- La signature de code n'est pas configurée (pas bloquant pour le dev, à prévoir en dernière
  étape avant distribution publique).
- `tauri-plugin-updater` est présent en dépendance Rust mais **pas encore câblé** (pas
  d'endpoint de manifest hébergé) — voir `src-tauri/Cargo.toml` et la section
  `plugins` (vide) de `src-tauri/tauri.conf.json`. À activer quand l'infra de mise à jour
  existera : enregistrer le plugin dans `main.rs`, remplir `plugins.updater.endpoints` et
  `pubkey` (généré via `tauri signer generate`).

## Architecture

```
src-tauri/src/
  main.rs                  # setup Tauri, état partagé (AppState), enregistrement des commands
  commands.rs               # #[tauri::command] exposées au frontend — reste fin
  db.rs                     # connexion SQLite + migrations + requêtes locales (historique,
                             # favoris, snapshots de rank)
  settings.rs                # lecture/écriture config locale (clé API, préférences)
  api/henrik/
    client.rs                # reqwest + retry/backoff + respect de Retry-After
    cache.rs                 # cache SQLite (table api_cache) avec TTL différenciés
    rate_limiter.rs           # espacement (~24 req/min) + circuit breaker simple
    endpoints.rs              # une fonction par endpoint Henrik, orchestre cache + client
    types.rs                  # structs serde pour les réponses Henrik
  riot_local/                 # V2 — lockfile, client API locale Riot (presence/GLZ), poller
  overlay/                    # V2 — fenêtre overlay (always-on-top, click-through, Ctrl+Shift+V)

src/                          # frontend React
  screens/                    # Search, Home, Trends, Agents, MatchHistory, MatchDetail,
                               # MapStats, Settings, Overlay (rendue seule dans la fenêtre "overlay")
  components/                 # RankBadge, StatCard, RankHistoryChart, MatchRow,
                               # ErrorState, StaleDataBanner (bandeaux d'erreur/cache partagés)
  hooks/                       # usePlayer (compte/mmr/snapshots), useMatches — React Query
  lib/
    tauriApi.ts                # wrapper typé autour de invoke(), miroir des DTO Rust
    format.ts                  # formatage KDA/%/durées/dates, mapping tier → nom de rank
  store/
    settingsStore.ts            # état réactif des préférences (zustand)
    recentSearchesStore.ts      # historique de recherche + favoris (zustand)
```

### Gestion des erreurs (V1)

Chaque commande Rust renvoie une `CommandError` typée (`{ kind, ... }`) que le frontend
distingue via `lib/tauriApi.ts` (`CommandError`) et affiche via `components/ErrorState.tsx` :
clé API manquante (redirige vers Paramètres), joueur introuvable (404), rate limit dépassé
(avec délai si connu), circuit breaker ouvert, panne réseau. En cas de panne après un cache
existant, l'API Henrik renvoie la dernière donnée connue (même expirée) avec un bandeau
"Données en cache, dernière mise à jour le JJ/MM à HH:MM" (`components/StaleDataBanner.tsx`).

## Tests

Pas de config lint pour l'instant. Suite de tests basique (pas de couverture exhaustive,
juste la logique pure/isolée la plus à risque) :

- **Rust** (`cd src-tauri && cargo test`) : parsing du lockfile, cache SQLite (frais/périmé/
  écrasement), rate limiter + circuit breaker (seuil, reset), réglages (round-trip,
  masquage de la clé API dans `Debug`), et les opérations locales de `db.rs` (favoris,
  historique, snapshots de rank, `reset_local_stats`).
- **Frontend** (`npm test`, vitest) : fonctions pures de `lib/format.ts` (mapping de rank,
  formatage KDA/durées/dates, `splitRiotId`) et `isCommandError`. Config dédiée dans
  `vitest.config.ts` (séparée de `vite.config.ts` pour éviter un conflit de types entre
  `vite` et `vitest/config` sur `build.rollupOptions`).

`npm run build` (via `tsc --noEmit`) sert de garde-fou de typage côté frontend ;
`cargo check` / `cargo build` côté Rust.
