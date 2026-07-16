# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/). Dupliqué depuis les notes
de release GitHub (voir `scripts/release.ps1` § `latest.json` et `CLAUDE.md` § Publier une
nouvelle version) pour rester consultable sans dépendre de l'API GitHub ni avoir déjà installé
l'app. **À mettre à jour manuellement à chaque release** (relecture humaine obligatoire, voir
`scripts/generate-changelog-draft.ps1`) — pas de synchronisation automatique avec GitHub.

> Historique antérieur à v0.3.25 non récupérable : ces releases GitHub n'existent plus
> (nettoyage antérieur à l'ouverture publique du repo le 2026-07-11, voir `CLAUDE.md` § Le
> dépôt GitHub héberge...). Les tags Git (`v0.3.5` à `v0.3.24`) existent toujours mais leurs
> notes de release, elles, sont perdues.

## [0.3.29] - 2026-07-16

### Optimisations internes

- L'overlay en jeu (récupération du rang des joueurs détectés) ne ralentit plus la navigation
  au premier plan : ses requêtes réseau cèdent désormais systématiquement le pas à celles
  déclenchées par l'app quand vous naviguez activement.
- Les logos/avatars esport (VLR) sont mis en cache en mémoire : ils ne sont plus re-téléchargés
  à chaque changement d'écran.
- Compression réseau activée sur les échanges avec l'API Henrik, pour réduire la bande passante
  utilisée par l'historique de matchs.

## [0.3.28] - 2026-07-15

### Améliorations UX/UI

- Nouveau dialogue de confirmation dans le thème HUD pour les actions sensibles (effacement
  des données locales, désactivation du verrou PIN), à la place de la boîte de dialogue
  générique de Windows.
- Ajout d'infobulles explicatives sur le détail d'économie d'un match et sur les statistiques
  Attaque/Défense et par type d'achat (Trends).
- Respect du réglage système "réduire les animations" sur les graphiques de progression de
  rang et de tendances.
- La position de la fenêtre overlay est désormais systématiquement vérifiée par rapport aux
  écrans connectés, pour éviter qu'elle réapparaisse hors de l'écran après un changement de
  configuration de moniteurs.

## [0.3.27] - 2026-07-15

### Fix

- La v0.3.26 avait été signée avec une clé de mise à jour périmée, rendant l'installation
  automatique impossible (erreur de signature). Même contenu que la v0.3.26 (comptes
  multiples, comparaison entre comptes, etc.), correctement signée cette fois.

## [0.3.25] - 2026-07-15

### Nouveautés stats & analyse joueur

- **Winrate par type d'achat** (eco / half-buy / full-buy) sur l'écran Tendances.
- **Filtre par carte** sur l'écran Stats par agent — winrate d'un agent sur une carte précise.
- **ETA de progression de rang** : estimation du nombre de jours avant le prochain palier,
  basée sur la progression récente.
- **Sessions de jeu** : les matchs sont regroupés par session (écart de plus de 2h = nouvelle
  session), avec un indicateur de tilt.
- **Comparaison à la moyenne perso** directement sur le détail d'un match (ADR, K/D, score par
  rapport à la moyenne sur cette carte).
- **Tags sur les notes perso** (smurf / toxique / carry / duo régulier), filtrables sur l'écran
  Duo & Squad.
- **Solo vs Party** : winrate solo-queue affiché en tête de profil, à côté du winrate en party.
- **Export CSV/JSON** des stats locales depuis Paramètres → Données locales.
- **Comparaison étendue à 5 joueurs** (au lieu de 2) avec un radar chart sur l'écran
  Comparaison.

### Confort

- Les exports/téléchargements (CSV, JSON, images) ouvrent désormais automatiquement le dossier
  Téléchargements.
