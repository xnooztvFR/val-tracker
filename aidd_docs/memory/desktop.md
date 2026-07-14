# Desktop

## Framework

- Tauri 2.x. Process principal Rust dans `src-tauri/src/main.rs` (setup, `AppState` partagé, enregistrement des commands).
- Frontend React/TypeScript servi dans la webview, communication via `invoke()` (voir `architecture.md`).

## Native access

- `tauri-plugin-global-shortcut` : raccourci `Ctrl+Shift+V` pour basculer le click-through de l'overlay.
- `tauri-plugin-notification` : notification de fin de partie.
- `tauri-plugin-clipboard-manager` : copie du Riot ID sans sélection manuelle.
- `tauri-plugin-autostart` : démarrage automatique avec Windows (utile car la détection de partie suppose l'app déjà lancée).
- `discord-rich-presence` : IPC local vers le client Discord desktop (pas d'API réseau).
- DPAPI Windows (`windows` crate, `Win32_Security_Cryptography`) — mécanisme natif utilisé pour le chiffrement au repos, voir `database.md` pour ce qu'il protège.
- Lecture du lockfile Riot + appels HTTP locaux vers le client Riot (`riot_local/`) pour la détection de partie — API non officielle, repli silencieux si absente/en échec.

## Build and release

- `npm run tauri build` génère `.msi` (WiX) et `.exe` (NSIS) dans `src-tauri/target/release/bundle/`.
- Signature Authenticode : certificat auto-signé (thumbprint dans `tauri.conf.json`), SmartScreen avertira toujours tant qu'un vrai certificat payant n'est pas acheté.
- Signature updater : paire Ed25519 (`plugins.updater.pubkey` dans `tauri.conf.json`), clé privée jamais commitée.
- Auto-update : `tauri-plugin-updater` + `tauri-plugin-process`, compare la version locale à `https://github.com/xnooztvFR/val-tracker/releases/latest/download/latest.json`, installation silencieuse NSIS + relance auto. Vérification SHA256 additionnelle côté app (`updater.rs`, backlog #97).
