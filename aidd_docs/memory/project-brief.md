# Project Brief

## What it is

- Application desktop Windows de tracking Valorant (type tracker.gg) : rank, historique de matchs, stats par carte, overlay en jeu.

## Why it exists

- Offrir en local, sans dépendre d'un site tiers, le même niveau de robustesse que le bot Discord existant du même auteur côté API Henrik Dev (cache, rate limiting, circuit breaker), avec en plus une détection de partie en direct via l'API locale du client Riot.

## Domain language

| Term | Meaning |
| ---- | ------- |
| Henrik Dev API | API tierce non officielle qui expose les données Valorant (rank, matchs, MMR) consommées par l'app |
| Riot local API | API HTTP locale exposée par le client Riot en cours d'exécution (lockfile + endpoints GLZ), utilisée pour détecter la partie en cours |
| Overlay | Fenêtre always-on-top, click-through par défaut, affichant l'état de partie et le rank des joueurs détectés |
| Proxy Henrik | Relais Cloudflare Worker optionnel qui détient la vraie clé API Henrik côté serveur, pour distribuer l'app à un tiers sans lui faire saisir de clé |
| Riot ID | Identifiant joueur au format `Nom#Tag` utilisé par les endpoints Henrik |

## Key features

- Recherche de joueur, profil (rank + historique de progression), historique de matchs, détail de match, stats par carte.
- Détection automatique de partie en cours via l'API locale Riot + overlay en jeu affichant le rank des joueurs détectés.
- Auto-update via GitHub Releases (`tauri-plugin-updater`), signature Ed25519 + vérification SHA256.
- Distribution à un tiers sans configuration (relais proxy Henrik + Discord client ID par défaut compilés depuis `.env`).
