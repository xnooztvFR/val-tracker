# Deployment

## Pipeline

- `.github/workflows/build.yml` : build CI sur GitHub Actions.
- Release manuelle déclenchée via `scripts/release.ps1` (voir `vcs.md` et `CLAUDE.md` section **Publier une nouvelle version**), pas de déploiement continu automatique.

## Environments

- Pas d'environnements serveur (app desktop) — une seule cible : le poste Windows de l'utilisateur final. Le seul service serveur associé est le relais Henrik optionnel, voir `integration.md`.

## Release

- `scripts/release.ps1` : bump de version, build `.msi`/`.exe` (NSIS) signés, génération de `latest.json`, publication GitHub en brouillon.
- Toujours vérifier le brouillon puis demander confirmation utilisateur avant `gh release edit --draft=false` (action publique visible).
- Rollback : republier une release antérieure n'est pas automatisé — pas de procédure documentée au-delà de la réinstallation manuelle par l'utilisateur.

## Monitoring

- Pas d'outil de monitoring/alerting externe — panne réseau/API gérée en local via `StaleDataBanner` (bandeau "données en cache") côté frontend.
