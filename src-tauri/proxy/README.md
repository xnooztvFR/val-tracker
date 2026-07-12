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
3. Configure les secrets (jamais dans un fichier, saisis interactivement) :
   ```bash
   npx wrangler secret put HENRIK_API_KEY
   # colle ta vraie clé Henrik Dev quand demandé
   ```

   Puis, pour le jeton d'accès au relais (distinct de la clé Henrik — c'est lui qui finit
   compilé dans le binaire de l'app via `HENRIK_PROXY_TOKEN` dans `.env`), deux options :

   - **Recommandé** — un jeton par canal de distribution, via `PROXY_TOKENS` (JSON) :
     ```bash
     npx wrangler secret put PROXY_TOKENS
     # colle un JSON du type {"alice": "<jeton généré>", "bob": "<autre jeton>"}
     # (générer chaque jeton avec `openssl rand -hex 32`)
     ```
     Permet de révoquer le jeton d'une seule personne/canal sans casser les autres (voir
     § Rotation), et sert de clé de rate limiting individuelle (voir § Rate limiting).
   - **Simple** — un seul jeton global, comme avant le #98 :
     ```bash
     npx wrangler secret put PROXY_TOKEN
     # colle une chaîne aléatoire longue (ex. générée avec `openssl rand -hex 32`)
     ```
     Si `PROXY_TOKENS` est défini, `PROXY_TOKEN` est ignoré.

## Brancher l'app dessus

Dans `src-tauri/.env` (jamais committé, voir `.env.example`) :

```
HENRIK_PROXY_URL=https://val-tracker-henrik-proxy.<ton-sous-domaine>.workers.dev
HENRIK_PROXY_TOKEN=<le même PROXY_TOKEN que ci-dessus>
```

Puis un `npm run tauri build` (ou `npm run release`) compile ces deux valeurs dans le
binaire. Un utilisateur qui saisit sa propre clé Henrik dans Paramètres continue de parler
directement à `api.henrikdev.xyz`, sans passer par ce relais.

## Rate limiting par jeton (backlog #98)

Avec `PROXY_TOKENS`, chaque jeton a son propre compteur de requêtes/minute — un jeton
compromis ne peut plus épuiser le quota Henrik pour tout le monde, seulement le sien. Sans
`PROXY_TOKEN` unique, tous les binaires distribués partagent le même compteur ("default").

Nécessite un namespace KV Cloudflare (gratuit à ce volume) :

```bash
npx wrangler kv namespace create RATE_LIMIT
```

Colle l'`id` renvoyé dans le bloc `[[kv_namespaces]]` (déjà présent, commenté) de
`wrangler.toml`, puis redéploie (`npx wrangler deploy`). Le seuil par défaut est 20
requêtes/minute par jeton (`RATE_LIMIT_PER_MINUTE` dans `wrangler.toml`, ajustable). Sans ce
binding configuré, le Worker fonctionne normalement, juste sans rate limiting (comportement
antérieur au #98).

## Rotation / révocation

- Avec `PROXY_TOKENS` : retire l'entrée du jeton compromis du JSON et
  `npx wrangler secret put PROXY_TOKENS` avec le JSON mis à jour — seul ce canal perd l'accès,
  les autres jetons continuent de fonctionner.
- Avec `PROXY_TOKEN` (jeton unique) : régénère-en un nouveau avec
  `npx wrangler secret put PROXY_TOKEN`, remets-le dans `.env`, et republie une release — tous
  les anciens binaires perdent l'accès immédiatement, sans toucher à la clé Henrik elle-même.

## Limite connue

Le quota Henrik (30 req/min avec la clé configurée) reste un quota global côté Henrik,
partagé entre tous les jetons de ce relais même avec le rate limiting par jeton ci-dessus
(qui borne l'impact d'un jeton individuel, sans créer de quota supplémentaire au global) — le
proxy protège la clé de l'extraction, il n'augmente pas la capacité totale. Diffusion à
réserver à un nombre limité de personnes.
