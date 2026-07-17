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

## [0.3.35] - 2026-07-17

### Nouvelles fonctionnalités

- Onglets flottants de session : épingle jusqu'à 3 profils consultés (icône épingle dans la
  barre de navigation) pour y revenir en un clic depuis n'importe quel écran.
- Navigation précédent/suivant façon navigateur (flèches dans la barre de navigation).
- Récap proactif de fin de session désormais aussi affiché sur l'écran Aujourd'hui, pas
  seulement Accueil.
- Vues sauvegardées dans l'historique de matchs : enregistre une combinaison de filtres
  (résultat, agent, carte, mode, dates) et réapplique-la en un clic.
- Recherche tolérante aux fautes de frappe (fuzzy) dans la palette de commandes (Ctrl+K).
- Glisser-déposer un match depuis l'historique vers le menu « Plus » (pré-remplit l'écran
  Comparer) ou vers un profil épinglé (ajoute une référence dans ses notes).
- Aperçu au survol prolongé d'une ligne de match (score final + compositions d'équipe),
  sans quitter la liste.
- Navigation clavier façon vim (j/k) dans la palette de commandes.
- Widget « Reprendre où tu en étais » sur l'écran de recherche.
- Réorganisation par glisser-déposer des blocs de l'écran Accueil.
- Mode incognito ponctuel : une recherche faite avec ce mode actif ne s'enregistre pas dans
  l'historique récent.
- Export PDF multi-page de l'historique de matchs (profil + statistiques + tableau de
  matchs), pensé pour être partagé avec un coach.

## [0.3.34] - 2026-07-17

### Corrections

- Fenêtre « Quoi de neuf » (après une mise à jour) : le contenu débordait et rendait le
  bouton « Fermer » inaccessible quand le changelog était long — la zone de notes défile
  maintenant indépendamment, avec le titre et le bouton toujours visibles. Ajout d'un
  raccourci Échap pour fermer.
- Les notes de version s'affichent désormais correctement formatées (titres, listes,
  gras) au lieu du texte markdown brut, dans cette fenêtre comme dans l'historique des
  nouveautés (Paramètres).

## [0.3.33] - 2026-07-17

### Nouvelles fonctionnalités

- Couleur d'accent « Auto » : dérivée de l'agent que tu joues le plus, plutôt qu'une teinte
  fixe (Duelist → rouge, Sentinel → cyan, Controller → violet, Initiator → ambre).
- Style d'icônes vectoriel maison (agents en initiales colorées, armes par catégorie) en
  alternative aux icônes officielles, sans dépendre d'un CDN externe (Paramètres → Apparence).
- Variante de contraste élevé bleu/orange, choisie selon les référentiels connus de
  daltonisme (protanopie/deutéranopie) — basée sur les normes, pas testée avec de vrais
  utilisateurs daltoniens.
- Disposition d'overlay « Épuré » : n'affiche plus que ton propre rang en petit texte, pour
  un encombrement minimal en jeu.
- Fond d'écran dynamique optionnel, teinté selon la couleur de ton rang actuel.
- Indicateur de fraîcheur des données permanent dans la barre de navigation (petit point
  signal), au-delà du seul bandeau d'erreur ponctuel.
- Mode présentation/stream : police agrandie et animations ralenties pour un partage d'écran
  public.
- Police d'accent commutable entre Chakra Petch (défaut) et JetBrains Mono.
- Volume réglable pour les micro-sons d'alerte HUD (écart de rang adverse en overlay).
- Curseur viseur simplifié optionnel, applicable à toute l'app et à l'overlay en jeu.

### Autres

- Finalisation de la scission de la section Discord des Paramètres en deux sous-sections
  (Rich Presence / alertes webhook).

## [0.3.32] - 2026-07-17

### Sécurité

- Plafond défensif de 16 Mo sur la taille des réponses de l'API Henrik (rejet précoce si le
  serveur annonce une taille excessive, vérification systématique après lecture) — protège
  contre une réponse anormalement volumineuse d'un endpoint compromis ou malformé.
- Nouveau garde-fou automatisé qui empêche toute régression accidentelle désactivant la
  politique de sécurité du contenu (CSP) de l'application.

## [0.3.31] - 2026-07-16

### Nouvelles fonctionnalités

- Écran « Aujourd'hui » : bilan condensé de la journée (winrate, K/D, HS%, dernières games)
  accessible depuis un nouvel onglet du profil.
- Recommandation carte/agent basée sur ton historique perso, affichée sur l'accueil.
- Notes horodatées liées à un match précis (au-delà de la note libre par joueur déjà
  existante).
- Comparaison de progression entre ce mois-ci et le mois dernier sur le graphique de rang.
- Historique de composition d'équipe : détection et bilan des rosters complets à 5 joueurs
  rencontrés plusieurs fois (écran Duo).
- Notification « série de victoires », pendant positif de l'alerte de défaites déjà
  existante.
- Objectifs hebdomadaires étendus au K/D et au HS% cible (en plus du nombre de matchs et du
  winrate).
- Toggle séparé pour désactiver la notification de changement de rang (Paramètres →
  Notifications).
- Filtrage de l'historique de matchs par mode de jeu et plage de dates, en plus des filtres
  existants ; export CSV enrichi avec le mode de queue.
- Cartes de partage : 3 mises en page au choix (HUD, Minimal, Affiche).
- Alertes Discord via webhook optionnel (rank up), en complément du Rich Presence existant.
- Lien manuel vers un profil pro VLR connu, croisé automatiquement dans l'overlay pour
  repérer un joueur pro détecté en partie.
- Overlay : indice « smurf potentiel » sur les adversaires (compte non classé + winrate
  élevé sur un petit échantillon récent) — un repère, pas une certitude.
- Récap automatique de session : une popup de bilan s'affiche à l'accueil dès qu'une session
  de jeu vient de se terminer.
- Mode « spectateur ami » (opt-in) : suis passivement un joueur tiers et reçois une
  notification quand il termine une partie compétitive — l'API Henrik n'exposant aucune
  présence en direct par joueur, ce signal reste "a posteriori" (partie terminée), pas un
  vrai statut en direct.

## [0.3.30] - 2026-07-16

### Fiabilité & outillage interne

- Rapport de diagnostics exportable en un clic (Paramètres → Diagnostics) : version de
  l'app, état de la détection auto de partie / overlay, taille de la base locale et
  dernière erreur Henrik rencontrée, avec un bouton pour copier le tout.
- Schéma de la base SQLite locale désormais versionné explicitement, pour sécuriser les
  futures mises à jour de la base.
- Renforcement des tests automatisés couvrant le relais Cloudflare (protection de la clé
  API Henrik).

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
