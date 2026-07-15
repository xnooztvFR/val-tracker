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
- Historique de matchs, détail de match (économie, kills, précision par round), winrate
  Attaque/Défense par match, et rapport de match détaillé (éco/force/full buy round par
  round, meilleurs/pires rounds)
- Stats par carte, par agent et par rôle d'agent (Duelliste/Initiateur/Contrôleur/Sentinelle),
  avec comparaison de tes stats du match à ta moyenne perso sur cette carte précise
- Objectifs de progression (exemple: "atteindre Diamant 2") avec barre de progression, plus
  des objectifs hebdomadaires personnalisés (ex. "10 matchs cette semaine", "winrate ≥ 55%")
- Regroupement automatique des matchs par session de jeu
- Heatmap de performance par jour de la semaine / heure
- Comparaison de progression entre saisons
- Comparaison côte à côte de deux joueurs (VS)
- Winrate en solo queue vs en party, en duo et en squad (3 joueurs) basé sur les parties
  jouées ensemble, filtrable par récence (30j/90j/tout) et par tag posé sur tes coéquipiers
  (smurf, toxique, carry, duo régulier...)
- Stats de rivalité contre un adversaire donné (winrate face à lui), avec recherche
  rétroactive par Riot ID qui repeuple l'historique depuis les matchs déjà en cache, sans
  requête réseau supplémentaire
- Frise chronologique des évènements marquants du compte suivi (changements de rank...)
- Position dans le classement compétitif régional en percentile (ex. "Top 12% des
  Immortal 2"), affichée pour les tiers Immortal/Radiant
- Notes personnelles sur un joueur suivi, verrouillables par PIN (chiffré DPAPI) pour un
  partage d'écran ou un stream sans exposer des tags sensibles
- Suivi de plusieurs comptes "à soi" (pas de RSO Riot possible), avec suggestion automatique
  basée sur le Riot ID détecté localement
- Taille d'échantillon d'analyse (20/50/100 derniers matchs) réglable et cohérente sur les
  écrans Accueil, Tendances, Agents et Cartes
- Export CSV/JSON de l'historique de matchs

**En jeu**
- Détection automatique de partie via le client Riot local, sans rien lancer manuellement,
  avec un indicateur d'état permanent (désactivée / active hors-jeu / partie détectée) et un
  bandeau d'état des files d'attente Riot (compétitif, non classé, swiftplay...)
- Overlay always-on-top affichant le rank des joueurs détectés (mode compact, détaillé ou
  mini), choix du moniteur d'affichage, alerte configurable en cas d'écart de rang important
  avec un coéquipier
- Suggestion de tes agents perso les plus performants pendant la sélection d'agents
- Rich Presence Discord (montre ce que tu fais dans l'app comme statut Discord), avec
  possibilité d'utiliser ton propre Client ID Discord

**Compétitif & esport**
- Classement compétitif régional avec recherche directe d'un Riot ID dans tout le classement
  (pas juste la page affichée), badges "banni" et joueurs anonymisés relayés depuis Riot
- Mode Premier : recherche d'équipes par nom, fiche équipe avec couleurs de personnalisation,
  bilan V/D et rounds gagnés/perdus, historique complet de saison (matchs de ligue et de
  tournoi avec évolution des points match par match)
- Explorateur esport VLR : calendrier des matchs pro par jour/ligue, navigateur d'événements
  filtrable par région (12 régions/circuits) et statut, détail d'événement et de match
  (boxscore par map : rating, ACS, K/D/A, ADR, KAST%, HS% par joueur), fiches joueurs pro
  (stats par agent filtrables par période) et fiches équipes pro (roster, palmarès en
  tournois, gains) — tout interconnecté par navigation

**Confort**
- Favoris et historique de recherche, réorganisables par glisser-déposer ; onglets de
  navigation du profil réordonnables de la même façon
- Palette de commande (Ctrl+K) pour naviguer rapidement
- Alertes configurables (série de défaites, rappel d'inactivité, changement de rank)
- Filtres par résultat/agent/carte dans l'historique de matchs ; tooltips "?" sur les stats
  avancées (ADR, HS%, économie...)
- Copier le Riot ID en un clic ; export en image PNG (copiable direct dans le presse-papiers
  pour Discord, ou téléchargeable) d'une "carte de visite" du profil, d'un récap de match, ou
  d'un récap de période (semaine/mois : bilan V/D, winrate, K/D, HS%, ACS, agent le plus
  joué, évolution de rang sur la période) — cartes générées dans le thème/accent actifs
- Thème clair/sombre, couleur d'accent et densité d'affichage (confortable/compacte)
  personnalisables ; app disponible en français, anglais, espagnol et portugais (Brésil)
- Démarrage automatique avec Windows ; raccourcis clavier globaux (afficher/masquer la
  fenêtre principale, mode focus pour un partage d'écran propre) reconfigurables pour éviter
  les conflits avec d'autres applis
- Prévisualisation d'un code de viseur (crosshair) Valorant collé
- Changelog "Quoi de neuf" affiché automatiquement après une mise à jour, avec historique
  complet consultable et wizard d'accueil rejouable à tout moment
- Dashboard "Santé" (cache, latence réseau), diagnostics des tâches de fond et consultation
  des logs récents, tous optionnels et 100% locaux
- Export ou réinitialisation complète des données locales stockées
- Mise à jour automatique signée (vérification double : signature Ed25519 + hash SHA256)

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
