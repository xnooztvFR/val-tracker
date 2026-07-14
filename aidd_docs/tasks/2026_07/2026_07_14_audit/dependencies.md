# Codebase Audit: dependencies

Aucune CVE connue détectée côté npm (scanner Rust absent) ; plusieurs majeures en retard et un
paquet npm déclaré mais jamais importé.

- **Date**: 2026-07-14
- **Scope**: `package.json` (frontend) + `src-tauri/Cargo.toml` (backend)
- **Health**: fair
- **Findings**: 0 critical, 1 warning, 4 minor

Health: `good` = no critical findings; `fair` = critical findings exist but are isolated and addressable; `poor` = systemic or widespread critical findings.

## Findings

| Sev | Category | Location | Issue | Suggested fix | Effort |
| --- | --- | --- | --- | --- | --- |
| 🟡 | dependencies | `package.json:22` (`react-router-dom": "^6.27.0"`) | `react-router-dom` est en v6.30.4, la v7 (majeure) est sortie ; `react`/`react-dom` (18.3.1) ont aussi une v19 majeure disponible. Ces majeures ne sont pas des CVEs mais accumulent une dette de migration croissante (breaking changes React 19 concurrent features, data APIs React Router v7). | Planifier une migration React 19 + React Router v7 groupée (elles ont des breaking changes qui s'entraident), pas urgent tant que `npm audit` reste vide. | L |
| 🟢 | dependencies | `package.json:14` (`@tauri-apps/plugin-autostart": "^2.3.0"`) | Paquet npm déclaré mais jamais importé dans `src/` — le contrôle d'autostart passe uniquement par les commandes Rust custom `get_autostart_enabled`/`save_autostart_enabled` (`src/lib/tauriApi.ts:927-929`), pas par le wrapper JS du plugin. Le plugin Rust `tauri-plugin-autostart` (Cargo.toml) reste lui bien utilisé côté backend — seul le paquet npm miroir est mort. | Retirer `@tauri-apps/plugin-autostart` de `package.json` si aucun usage direct n'est prévu, ou l'utiliser directement si une API JS spécifique est needed. | S |
| 🟢 | dependencies | `src-tauri/Cargo.toml` (pas de `cargo-audit` installé sur la machine) | Impossible de vérifier les CVEs côté crates.io — `cargo audit` n'est pas installé (`error: no such command: 'audit'`). Aucune CVE n'est donc affirmée ni exclue pour les dépendances Rust. | Installer `cargo install cargo-audit` (ou `cargo-deny`) et l'exécuter avant chaque release, potentiellement en CI. | S |
| 🟢 | dependencies | `package.json` (`recharts": "^2.13.0"`, `tailwindcss": "^3.4.14"`, `zustand": "^4.5.5"`, `react-window": "^1.8.11"`, `typescript": "^5.6.3"`) | Plusieurs autres dépendances ont une majeure de retard (recharts 2→3, tailwindcss 3→4, zustand 4→5, react-window 1→2, typescript 5.9→7.0). Aucune CVE associée d'après `npm audit`, juste de la dette de version. | Pas urgent ; regrouper avec la migration React 19 ci-dessus plutôt que des mises à jour majeures isolées et fréquentes. | M |
| 🟢 | dependencies | `src-tauri/Cargo.toml:5` vs `discord-rich-presence = "1"` | Licence déclarée du projet `GPL-3.0-or-later` ; `discord-rich-presence` (IPC local, pas de code copié) et les autres crates (MIT/Apache-2.0 standard côté écosystème Rust) n'ont montré aucun conflit de licence lors de l'inspection du `Cargo.lock`, mais aucun outil de vérification de licence n'a été exécuté (pas de `cargo-license`/`cargo-deny` installé) — à confirmer avec un outil dédié plutôt que par lecture manuelle. | Exécuter `cargo license` (ou `cargo deny check licenses`) pour une vérification exhaustive plutôt qu'un sondage manuel. | S |

## Top actions

1. Installer `cargo-audit` et l'exécuter au moins avant chaque release (`scripts/release.ps1`) — c'est le seul angle mort réel de ce pilier, aucun scanner Rust n'existe actuellement.
2. Retirer `@tauri-apps/plugin-autostart` de `package.json` (dépendance npm inutilisée, le contrôle passe par des commandes Rust custom).
3. Planifier une migration groupée React 19 + React Router v7 (+ Tailwind v4, Zustand v5) une fois le temps disponible — aucune urgence sécurité, juste de la dette croissante.

## Coverage

- **Scanned**: dependencies (`npm audit` — 0 vulnérabilité sur 235 dépendances ; `npm outdated` ; `npx depcheck` avec vérification manuelle des faux positifs — `@fontsource/*`, `autoprefixer`, `postcss`, `tailwindcss` sont bien utilisés via `src/index.css`/`postcss.config.js`/`tailwind.config.js`, pas de vrai export JS ; `cargo tree --depth 1` + grep d'usage de chaque crate Rust)
- **Skipped**: aucune CVE Rust vérifiée — `cargo audit`/`cargo-deny` non installés sur la machine (voir finding ci-dessus) ; pas de vérification de licence outillée (sondage manuel du `Cargo.lock` uniquement)
