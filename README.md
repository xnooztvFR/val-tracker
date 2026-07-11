🇫🇷 Français&nbsp;|&nbsp;[🇺🇸 English](README.en.md)

# Valorant Tracker

Une app desktop Windows pour suivre ton rank et tes stats Valorant, dans le genre de
tracker.gg mais installée chez toi : recherche de joueur, historique de progression,
détail de match, stats par carte/agent, comparaison entre joueurs, et une détection
automatique de partie avec un petit overlay affichant le rank de ton lobby.

> Ce projet n'est ni développé ni affilié à Riot Games. Les données de rank et de matchs
> viennent de l'API tierce non officielle [Henrik Dev](https://docs.henrikdev.xyz/).

## Fonctionnalités

**Profil & progression**
- Recherche d'un joueur par Riot ID, profil complet (rank actuel, historique de RR, plus
  haut rank atteint)
- Historique de matchs, détail de match (économie, kills, précision par round)
- Stats par carte, par agent et par rôle d'agent (Duelliste/Initiateur/Contrôleur/Sentinelle)
- Objectifs de progression ("atteindre Diamant 2") avec barre de progression
- Regroupement automatique des matchs par session de jeu
- Heatmap de performance par jour de la semaine / heure
- Comparaison de progression entre saisons
- Comparaison côte à côte de deux joueurs (VS)
- Winrate en duo et en squad (3 joueurs) basé sur les parties jouées ensemble
- Notes personnelles sur un joueur suivi
- Export CSV/JSON de l'historique de matchs

**En jeu**
- Détection automatique de partie via le client Riot local, sans rien lancer manuellement
- Overlay always-on-top affichant le rank des joueurs détectés (mode compact ou détaillé)
- Suggestion de tes agents perso les plus performants pendant la sélection d'agents
- Rich Presence Discord (montre ce que tu fais dans l'app comme statut Discord)

**Confort**
- Favoris et historique de recherche, réorganisables par glisser-déposer
- Palette de commande (Ctrl+K) pour naviguer rapidement
- Alertes configurables (série de défaites, rappel d'inactivité, changement de rank)
- Thème clair/sombre et couleur d'accent personnalisable
- Mise à jour automatique signée, classement compétitif, mode Premier, actualités esport (VLR)

## Installation

1. Va sur la page [Releases](../../releases) et télécharge le dernier
   `Valorant.Tracker_x.y.z_x64-setup.exe` (installeur silencieux, recommandé) ou le `.msi`
   (installation manuelle classique).
2. Lance l'installeur. **Windows SmartScreen va probablement afficher un avertissement** —
   c'est normal : l'app est signée avec un certificat auto-signé, pas un certificat payé
   par une autorité reconnue. Clique sur *Informations complémentaires* puis
   *Exécuter quand même*. Le binaire est bien signé (intégrité vérifiable), ce n'est qu'un
   avertissement de réputation, pas un antivirus qui bloque un malware.
3. Au premier lancement, l'app te guide en 3 étapes : renseigner une clé API
   [Henrik Dev](https://api.henrikdev.xyz/dashboard/api-keys) (gratuite), choisir ta région, et vérifier la détection automatique du client Riot.
4. Les mises à jour suivantes s'installent automatiquement (ou via *Paramètres → Mises à
   jour → Vérifier maintenant*).

### Confidentialité

Tout reste en local sur ta machine : la clé API est stockée chiffrée
(`%APPDATA%\com.xnooztv.val-tracker\`), aucune donnée n'est envoyée ailleurs qu'à l'API
Henrik Dev pour les requêtes que tu déclenches toi-même. Aucune télémétrie, le dashboard
"Santé" dans Paramètres est optionnel (désactivé par défaut) et reste 100&nbsp;% local.

## Développer / compiler depuis les sources

### Prérequis

- [Rust](https://www.rust-lang.org/tools/install) (stable, toolchain MSVC)
- [Node.js](https://nodejs.org/) 18+
- Les [prérequis Tauri pour Windows](https://v2.tauri.app/start/prerequisites/) (WebView2,
  Visual Studio Build Tools avec la charge "Développement Desktop en C++")
- Une clé API [Henrik Dev](https://api.henrikdev.xyz/dashboard/api-keys)

### Setup

```bash
npm install
npm run tauri dev
```

Configure ensuite ta clé API directement dans l'app (Paramètres → Clé API Henrik), jamais
dans le repo.

### Build local

```bash
npm run tauri build
```

Génère les installeurs `.msi` et `.exe` (NSIS) dans `src-tauri/target/release/bundle/`.
Sans certificat de signature configuré localement, le binaire ne sera pas signé (voir
`src-tauri/tauri.conf.json` pour la config de signature Authenticode).

### Tests

```bash
npm test              # frontend (vitest)
cd src-tauri && cargo test   # backend (Rust)
```

### Stack technique

- **Backend** : Rust, Tauri 2.x, `reqwest`, `rusqlite` (SQLite local), cache API avec TTL
  différenciés, rate limiting, circuit breaker, retry respectant `Retry-After`.
- **Frontend** : React + TypeScript, Vite, Tailwind CSS, Zustand, React Query.

```
src-tauri/src/
  main.rs            # setup Tauri, état partagé
  commands.rs        # commandes exposées au frontend
  db.rs              # SQLite local (historique, favoris, snapshots de rank...)
  settings.rs        # préférences locales (clé API chiffrée, réglages)
  api/henrik/        # client HTTP + cache + rate limiter + endpoints Henrik
  riot_local/        # détection de partie via l'API locale du client Riot
  overlay/           # fenêtre overlay in-game
  proxy/             # relais Cloudflare Worker optionnel (voir son propre README)

src/
  screens/           # écrans (Home, MatchHistory, Trends, Agents, Compare, Settings...)
  components/        # composants réutilisables
  hooks/             # React Query (compte, MMR, matchs...)
  lib/               # wrapper d'invoke(), formatage, agrégations de stats
  store/             # état global (Zustand)
```

### CI

Un workflow GitHub Actions (`.github/workflows/build.yml`) compile l'app sur chaque push/PR
pour vérifier que le build Windows ne casse pas (`cargo check`, `cargo test`, `npm test`,
`npm run build`, `cargo build --release`). Il ne signe rien et ne produit aucun installeur
(la signature demande des secrets locaux qui ne vivent que sur la machine de build, voir
plus haut) : c'est un garde-fou de compilation continu, pas un remplacement du flux de
release. `scripts/release.ps1` reste le seul moyen de publier une vraie release signée.

## Limitations connues

- **SmartScreen** : le certificat de signature est auto-signé, pas payé auprès d'une
  autorité reconnue, l'avertissement Windows persistera tant que ça reste le cas.
- **Overlay en plein écran exclusif** : peut être masqué par le plein écran exclusif de
  Valorant (pas le mode "sans bordure"), limitation de l'API Windows, utilise le mode
  "plein écran sans bordure" dans les réglages vidéo du jeu.
- **API locale Riot non officielle** : le lockfile et les endpoints utilisés pour la
  détection de partie ne sont pas documentés par Riot et peuvent changer d'une mise à jour
  du client à l'autre ; l'app repasse alors silencieusement en mode recherche manuelle.

## Remerciements

- [Henrik Dev API](https://docs.henrikdev.xyz/) pour les données de rank/matchs Valorant.
- [Tauri](https://tauri.app/) pour le framework desktop.

## Licence

Distribué sous licence [GPLv3](LICENSE) — © xnooztvFR. Tu peux redistribuer et modifier ce
projet, mais tout ce qui en dérive et que tu distribues doit rester open source sous la
même licence.
