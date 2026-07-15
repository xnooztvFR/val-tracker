//! Journalisation fichier best-effort, doublée en console via la macro `applog!`
//! (voir `main.rs`). Le fichier vit dans le dossier de données de l'app pour rester
//! consultable depuis Paramètres → Logs sans devoir fouiller `%APPDATA%` à la main
//! (voir idée backlog #49).
//!
//! Pas de vraie rotation : un seul fichier, tronqué (recréé vide) au démarrage suivant
//! s'il dépasse `MAX_LOG_BYTES`, ET vérifié périodiquement en cours de session (toutes les
//! `SIZE_CHECK_EVERY` lignes écrites, voir `write_line`) pour qu'une session unique très
//! verbeuse ne puisse pas dépasser la limite indéfiniment sans redémarrage — suffisant pour
//! du support/debug ponctuel sur un projet solo, pas pensé pour de la télémétrie long terme.

use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::OnceLock;

use tauri::{AppHandle, Manager};

static LOG_PATH: OnceLock<PathBuf> = OnceLock::new();
const MAX_LOG_BYTES: u64 = 2 * 1024 * 1024;

/// Fréquence de la vérification de taille en cours de session — un `stat()` par ligne de
/// log serait inutilement bavard, mais toutes les 200 lignes borne la dérive possible sans
/// mesurer la taille à chaque écriture.
const SIZE_CHECK_EVERY: u32 = 200;
static WRITE_COUNT: AtomicU32 = AtomicU32::new(0);

/// Tronque (recrée vide) le fichier de log s'il dépasse `MAX_LOG_BYTES`. Best-effort :
/// toute erreur est ignorée, un logger ne doit jamais faire planter l'app.
fn truncate_if_oversized(path: &PathBuf) {
    if let Ok(meta) = std::fs::metadata(path) {
        if meta.len() > MAX_LOG_BYTES {
            let _ = std::fs::File::create(path);
        }
    }
}

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
    truncate_if_oversized(&path);
    let _ = LOG_PATH.set(path);
}

/// Installe un hook de panic qui journalise via `applog!` avant que le process ne meure.
/// Le profil release a `panic = "abort"` (voir `Cargo.toml`) : un panic dans une tâche de
/// fond (poller riot_local, thread Discord RPC, status watcher...) tuait le process sans
/// laisser de trace consultable ailleurs que l'Observateur d'événements Windows. Ce hook
/// s'exécute quand même avant l'abort — il ne l'empêche pas, il le rend juste visible dans
/// le fichier de log déjà consultable depuis Paramètres → Logs. À appeler une seule fois,
/// après `init` (pour que le fichier de log soit déjà prêt à recevoir l'écriture).
pub fn install_panic_hook() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "emplacement inconnu".to_string());
        let thread = std::thread::current();
        let thread_name = thread.name().unwrap_or("<sans nom>");
        crate::applog!("[panic] thread '{thread_name}' à {location}: {info}");
        default_hook(info);
    }));
}

/// Écrit une ligne horodatée dans le fichier de log. No-op silencieux si `init` n'a pas
/// été appelé ou si l'écriture échoue (verrou disque, dossier supprimé...) — un logger ne
/// doit jamais faire planter l'app qu'il journalise.
pub fn write_line(line: &str) {
    let Some(path) = LOG_PATH.get() else { return };

    if WRITE_COUNT.fetch_add(1, Ordering::Relaxed) % SIZE_CHECK_EVERY == 0 {
        truncate_if_oversized(path);
    }

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
