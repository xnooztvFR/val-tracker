//! Fenêtre overlay superposée au jeu (V2), alimentée par `crate::riot_local`. Aucune
//! injection dans le process du jeu : pas de DLL injection, pas de lecture mémoire, pas
//! de hook DirectX — uniquement une fenêtre OS Tauri positionnée par-dessus. Ne
//! fonctionne qu'en fenêtré/plein écran sans bordure ; le plein écran exclusif peut
//! masquer l'overlay selon la config Windows/pilote graphique (limite connue,
//! documentée dans Paramètres → Overlay en jeu).

pub mod window;
