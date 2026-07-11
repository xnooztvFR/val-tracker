use std::fs;
use std::path::Path;

/// Clés de `.env` autorisées à devenir des valeurs par défaut compilées dans le binaire —
/// whitelist explicite pour ne jamais faire fuiter une variable d'environnement de build non
/// prévue pour ça. HENRIK_PROXY_URL/TOKEN pointent vers un relais serveur (voir
/// `src-tauri/proxy/`) qui détient la vraie clé Henrik côté serveur — le jeton compilé ici
/// n'est PAS cette clé, juste un ticket d'accès au relais (voir settings.rs::HenrikAuth pour
/// le détail). DISCORD_DEFAULT_CLIENT_ID n'est pas un secret (identifiant public d'app Rich
/// Presence). Ces valeurs finissent en clair dans le binaire compilé — ce n'est PAS un
/// mécanisme de secret, seulement une commodité de distribution.
const ALLOWED_KEYS: &[&str] = &["HENRIK_PROXY_URL", "HENRIK_PROXY_TOKEN", "DISCORD_DEFAULT_CLIENT_ID"];

fn main() {
    load_dotenv_defaults();
    tauri_build::build()
}

fn load_dotenv_defaults() {
    let env_path = Path::new(".env");
    println!("cargo:rerun-if-changed={}", env_path.display());

    let Ok(contents) = fs::read_to_string(env_path) else {
        return;
    };

    for line in contents.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        if !ALLOWED_KEYS.contains(&key) {
            continue;
        }
        let value = value.trim().trim_matches('"');
        if !value.is_empty() {
            println!("cargo:rustc-env={key}={value}");
        }
    }
}
