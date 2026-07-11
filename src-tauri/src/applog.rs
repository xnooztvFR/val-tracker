//! Journalisation fichier best-effort, doublée en console via la macro `applog!`
//! (voir `main.rs`). Le fichier vit dans le dossier de données de l'app pour rester
//! consultable depuis Paramètres → Logs sans devoir fouiller `%APPDATA%` à la main
//! (voir idée backlog #49).
//!
//! Pas de vraie rotation : un seul fichier, tronqué (recréé vide) au démarrage suivant
//! s'il dépasse `MAX_LOG_BYTES` — suffisant pour du support/debug ponctuel sur un projet
//! solo, pas pensé pour de la télémétrie long terme.

use std::io::Write;
use std::path::PathBuf;
use std::sync::OnceLock;

use tauri::{AppHandle, Manager};

static LOG_PATH: OnceLock<PathBuf> = OnceLock::new();
const MAX_LOG_BYTES: u64 = 2 * 1024 * 1024;

/// À appeler une fois au démarrage (`main.rs::setup`), une fois le dossier de données de
/// l'app connu. Best-effort : si le dossier est inaccessible, les logs restent
/// console-only pour cette session (voir `write_line`, no-op si jamais initialisé).
pub fn init(app: &AppHandle) {
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let path = dir.join("val-tracker.log");
    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.len() > MAX_LOG_BYTES {
            let _ = std::fs::remove_file(&path);
        }
    }
    let _ = LOG_PATH.set(path);
}

/// Écrit une ligne horodatée dans le fichier de log. No-op silencieux si `init` n'a pas
/// été appelé ou si l'écriture échoue (verrou disque, dossier supprimé...) — un logger ne
/// doit jamais faire planter l'app qu'il journalise.
pub fn write_line(line: &str) {
    let Some(path) = LOG_PATH.get() else { return };
    let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) else {
        return;
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S%.3f");
    let _ = writeln!(file, "[{now}] {line}");
}

/// Chemin du fichier de log courant, affiché dans Paramètres → Logs pour que
/// l'utilisateur puisse le retrouver lui-même si besoin (support).
pub fn path() -> Option<String> {
    LOG_PATH.get().map(|p| p.display().to_string())
}

/// Lit jusqu'aux `max_bytes` derniers octets du fichier (les plus récents en premier lieu
/// d'intérêt pour du debug) — jamais tout le fichier en mémoire s'il a grossi longtemps
/// sans redémarrage.
pub fn tail(max_bytes: usize) -> String {
    let Some(path) = LOG_PATH.get() else {
        return String::new();
    };
    let Ok(content) = std::fs::read(path) else {
        return String::new();
    };
    let start = content.len().saturating_sub(max_bytes);
    String::from_utf8_lossy(&content[start..]).into_owned()
}

/// Écrit une ligne formatée à la fois sur stderr (dev) et dans le fichier de log
/// (consultable depuis Paramètres → Logs) — remplace `eprintln!` partout où un message
/// mérite d'être consultable après coup, pas juste dans une console de dev.
#[macro_export]
macro_rules! applog {
    ($($arg:tt)*) => {{
        let msg = format!($($arg)*);
        eprintln!("{msg}");
        $crate::applog::write_line(&msg);
    }};
}
