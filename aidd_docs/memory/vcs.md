# VCS

## Setup

- Main branch : `main`
- Platform : GitHub (`xnooztvFR/val-tracker`, dépôt public — héberge à la fois le code source et sert de point de distribution des releases via `latest.json`)
- Ticketing : aucun outil dédié, suivi via des références `#N` dans le code et les commentaires (voir `TODO.md`, commentaires `TODO #N`)

## Branches

- Travail principalement direct sur `main` (projet solo).

## Commits

- Convention proche de conventional commits (`feat:`, `fix:`, `chore:`), messages en anglais.
- L'utilisateur ne doit jamais être ajouté en co-auteur des commits.

## Commit Strategy

AI should auto commit: never — uniquement sur demande explicite de l'utilisateur. Après toute modification substantielle de l'app, proposer à l'utilisateur de couper une nouvelle release (voir `deployment.md`).
