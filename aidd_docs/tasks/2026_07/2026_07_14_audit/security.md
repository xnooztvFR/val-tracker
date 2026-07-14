# Codebase Audit: security

Le chiffrement DPAPI, le masquage de la clé API en `Debug`, la redaction des identifiants
dans les logs, la paramétrisation SQL, la garde SSRF de `image_proxy.rs` et la CSP sont tous
implémentés correctement. Aucune vulnérabilité exploitable identifiée, seulement des nits de
défense en profondeur.

- **Date**: 2026-07-14
- **Scope**: `src-tauri/src/` (settings/DPAPI, client/endpoints Henrik, riot_local, db.rs,
  image_proxy, applog) + `src-tauri/proxy/worker.js` + `tauri.conf.json` (CSP)
- **Health**: good
- **Findings**: 0 critical, 0 warning, 3 minor

Health: `good` = no critical findings; `fair` = critical findings exist but are isolated and addressable; `poor` = systemic or widespread critical findings.

## Findings

| Sev | Category | Location | Issue | Suggested fix | Effort |
| --- | --- | --- | --- | --- | --- |
| 🟢 | security | `src-tauri/src/riot_local/client.rs:47` | `danger_accept_invalid_certs(true)` est posé sur le client de l'API locale Riot pour accepter son certificat auto-signé. Correctement isolé à un client dédié (pas le client Henrik) et ciblant uniquement `127.0.0.1`, mais tout autre processus local écoutant sur ce port pendant la fenêtre de lecture du lockfile pourrait MITM ces appels (tokens d'entitlement, puuids) sans pinning de certificat. | Envisager de pinner l'empreinte du certificat auto-signé plutôt qu'une désactivation totale de la validation, même si le cantonnement localhost-only borde déjà le risque réel. | M |
| 🟢 | security | `src-tauri/proxy/worker.js:93-99` | La comparaison de token dans `resolveTokenId` utilise une égalité `===`/boucle classique plutôt qu'une comparaison à temps constant — léger canal auxiliaire de timing sur la vérification du token proxy (le check PIN de l'app dans `settings.rs` utilise déjà une comparaison à temps constant, pas ce Worker). | Utiliser une comparaison de chaîne à temps constant pour le matching de token dans le Worker, cohérent avec `settings.rs::constant_time_eq`. | S |
| 🟢 | security | `src-tauri/src/api/henrik/client.rs:117,139` (et contextes d'erreur de `riot_local/client.rs`) | Sur une réponse Henrik non-2xx, le corps brut `response.text()` est inclus sans condition dans `HenrikError::Api.message` (pas de garde `cfg!(debug_assertions)` comme sur le chemin d'échec de parsing dans `endpoints.rs`), et ce message finit par atteindre le frontend/UI, potentiellement les logs via `applog!`. Les corps d'erreur Henrik ne sont pas censés porter de puuid, donc risque faible, mais incohérence avec la règle "corps de réponse brut en échec loggé uniquement en debug". | Vérifier qu'aucun appelant ne logge `HenrikError::Api.message` tel quel en release, ou appliquer le même garde `cfg!(debug_assertions)` que `endpoints.rs::fetch_with_cache`. | S |

## Top actions

1. Ajouter une comparaison de token à temps constant dans le Worker Cloudflare (`resolveTokenId`), pour la cohérence en défense en profondeur avec le pattern de vérification PIN déjà en place côté app.
2. Auditer les points d'appel qui exposent `HenrikError::Api.message` (réponses Henrik non-2xx) pour confirmer qu'aucun ne le logge tel quel en release, alignement avec la règle debug-only déjà appliquée aux échecs de parsing JSON.
3. Aucune action requise sur le chiffrement DPAPI, le masquage `Debug` de la clé API, la redaction d'identifiants, la paramétrisation SQL, l'allowlist SSRF d'`image_proxy`, ou la CSP — tous vérifiés intacts et conformes au design documenté.

## Coverage

- **Scanned**: security (settings/DPAPI, client/endpoints Henrik, riot_local client + lockfile,
  requêtes SQL de `db.rs`, garde SSRF `image_proxy.rs`, `applog`, Worker Cloudflare proxy,
  config CSP, gestion des `.env`)
- **Skipped**: aucun
