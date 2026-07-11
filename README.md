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

### Build local (installation manuelle)

```bash
npm run tauri build
```

Génère les installeurs `.msi` (WiX) et `.exe` (NSIS) dans `src-tauri/target/release/bundle/`,
signés avec le certificat Authenticode local (voir plus bas) et avec les artefacts de mise à
jour (`.sig`) si `TAURI_SIGNING_PRIVATE_KEY`/`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` sont définis
dans l'environnement.

### Icône

Générée depuis une image source carrée via `npx tauri icon <fichier>` (regénère
`src-tauri/icons/`). Pour changer l'icône, relancer la commande avec un nouveau fichier
source puis supprimer les variantes iOS/Android/Store générées en trop (l'app ne cible que
Windows — seuls `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png` et `icon.ico` sont
référencés dans `bundle.icon` de `tauri.conf.json`).

### Signature

Deux mécanismes de signature distincts, à ne pas confondre :

1. **Signature de l'updater** (obligatoire pour l'auto-update, indépendante de la signature
   Windows) — une paire de clés Ed25519 générée via `tauri signer generate`. La clé publique
   est dans `plugins.updater.pubkey` de `tauri.conf.json` ; la clé privée + son mot de passe
   ne sont **jamais commités**, uniquement en secrets GitHub Actions
   (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) et en local dans
   `~/.tauri/`.
2. **Signature Authenticode Windows** (SmartScreen) — actuellement un certificat
   **auto-signé** (généré via `New-SelfSignedCertificate`, référencé par son thumbprint dans
   `bundle.windows.certificateThumbprint`). Un certificat auto-signé signe bien le binaire
   mais **ne supprime pas** l'avertissement SmartScreen pour les utilisateurs — seul un vrai
   certificat payé auprès d'une autorité (SSL.com, DigiCert, EV sur token...) le fait. À
   remplacer le jour où un vrai certificat est acheté : régénérer le thumbprint dans
   `tauri.conf.json` et le secret `WINDOWS_CERTIFICATE` (PFX en base64) +
   `WINDOWS_CERTIFICATE_PASSWORD` côté CI.

### Auto-update

`tauri-plugin-updater` est câblé (voir `src-tauri/src/main.rs`, `src/hooks/useUpdater.ts`,
`src/components/UpdateBanner.tsx`, section **Mises à jour** des Paramètres). L'app vérifie
`https://github.com/xnooztvFR/val-tracker/releases/latest/download/latest.json` — le manifest
`latest.json` est généré et publié automatiquement par le workflow de release (voir
ci-dessous), il n'y a rien à héberger manuellement.

Pour publier une nouvelle version :

```bash
# 1. Monter la version dans package.json ET src-tauri/tauri.conf.json (doivent matcher)
# 2. Committer, puis taguer avec le même numéro, préfixé "v"
git tag v0.2.0
git push origin v0.2.0
```

Le tag déclenche `.github/workflows/release.yml` : build Windows, import du certificat de
signature, build+signature via `tauri-apps/tauri-action`, publication d'un **brouillon** de
release GitHub avec les installeurs + `latest.json`. Vérifier le brouillon (notes de version,
artefacts présents) puis le publier manuellement sur GitHub — c'est cette publication qui
rend la mise à jour visible par l'updater des clients déjà installés (les brouillons ne sont
pas lus par `releases/latest/...`).

**Secrets GitHub Actions requis** (Settings → Secrets and variables → Actions du repo) :

| Secret | Contenu |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Contenu du fichier `~/.tauri/val-tracker.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Mot de passe de cette clé |
| `WINDOWS_CERTIFICATE` | PFX du certificat Authenticode encodé en base64 |
| `WINDOWS_CERTIFICATE_PASSWORD` | Mot de passe du PFX |

`GITHUB_TOKEN` est fourni automatiquement par GitHub Actions, pas besoin de le créer.

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
