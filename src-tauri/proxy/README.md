# Relais Henrik (Cloudflare Worker)

Garde la vraie clé API Henrik côté serveur, jamais dans le binaire de l'app distribuée. Voir
le commentaire en tête de `worker.js` pour le pourquoi.

## Déploiement (une fois)

1. Compte Cloudflare gratuit sur https://dash.cloudflare.com/sign-up si tu n'en as pas.
2. Depuis ce dossier (`src-tauri/proxy/`) :
   ```bash
   npx wrangler login
   npx wrangler deploy
   ```
   Note l'URL affichée à la fin (ex. `https://val-tracker-henrik-proxy.<ton-sous-domaine>.workers.dev`).
3. Configure les deux secrets (jamais dans un fichier, saisis interactivement) :
   ```bash
   npx wrangler secret put HENRIK_API_KEY
   # colle ta vraie clé Henrik Dev quand demandé

   npx wrangler secret put PROXY_TOKEN
   # colle une chaîne aléatoire longue (ex. générée avec `openssl rand -hex 32`) —
   # ce n'est PAS la clé Henrik, juste un ticket d'accès à ce relais
   ```

## Brancher l'app dessus

Dans `src-tauri/.env` (jamais committé, voir `.env.example`) :

```
HENRIK_PROXY_URL=https://val-tracker-henrik-proxy.<ton-sous-domaine>.workers.dev
HENRIK_PROXY_TOKEN=<le même PROXY_TOKEN que ci-dessus>
```

Puis un `npm run tauri build` (ou `npm run release`) compile ces deux valeurs dans le
binaire. Un utilisateur qui saisit sa propre clé Henrik dans Paramètres continue de parler
directement à `api.henrikdev.xyz`, sans passer par ce relais.

## Rotation / révocation

Si `PROXY_TOKEN` fuite (ex. le binaire circule plus large que prévu) : régénère-en un nouveau
avec `npx wrangler secret put PROXY_TOKEN`, remets-le dans `.env`, et republie une release —
les anciens binaires perdent l'accès immédiatement, sans toucher à la clé Henrik elle-même.

## Limite connue

Le quota Henrik (~24 req/min avec la clé configurée) reste partagé entre tous les
utilisateurs de l'app qui passent par ce relais — le proxy protège la clé de l'extraction, il
ne crée pas de quota supplémentaire. Diffusion à réserver à un nombre limité de personnes.
