//! Lecture/parsing du lockfile Riot Client.
//!
//! Chemin attendu : `%LOCALAPPDATA%\Riot Games\Riot Client\Config\lockfile`.
//! Format (une ligne, séparée par `:`) : `name:pid:port:password:protocol`.
//!
//! Absence du fichier = jeu non lancé (ou lancé sous une autre session Windows) : ce
//! n'est pas une erreur, `read_lockfile` renvoie `Ok(None)` dans ce cas pour que
//! l'appelant bascule proprement en mode lookup manuel.

use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LockfileInfo {
    #[allow(dead_code)]
    pub name: String,
    #[allow(dead_code)]
    pub pid: u32,
    pub port: u16,
    pub password: String,
    #[allow(dead_code)]
    pub protocol: String,
}

/// Résout le chemin du lockfile à partir de `%LOCALAPPDATA%`.
fn lockfile_path() -> Option<PathBuf> {
    let local_app_data = std::env::var_os("LOCALAPPDATA")?;
    Some(
        PathBuf::from(local_app_data)
            .join("Riot Games")
            .join("Riot Client")
            .join("Config")
            .join("lockfile"),
    )
}

/// Lit et parse le lockfile. Renvoie `Ok(None)` si le fichier n'existe pas (jeu fermé)
/// ou si son format est inattendu — jamais de panique, repli gracieux (voir module doc).
pub fn read_lockfile() -> anyhow::Result<Option<LockfileInfo>> {
    let Some(path) = lockfile_path() else {
        return Ok(None);
    };

    let raw = match std::fs::read_to_string(&path) {
        Ok(content) => content,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        // Le Riot Client peut tenir le fichier avec un verrou exclusif pendant une
        // fraction de seconde au démarrage : on traite ça comme "pas encore prêt".
        Err(_) => return Ok(None),
    };

    Ok(parse_lockfile_content(&raw))
}

/// Parsing pur, séparé de la lecture disque pour être testable sans toucher au système
/// de fichiers. `None` pour toute ligne qui ne respecte pas le format `name:pid:port:
/// password:protocol` — jamais d'erreur/panique, voir doc du module.
fn parse_lockfile_content(raw: &str) -> Option<LockfileInfo> {
    let parts: Vec<&str> = raw.trim().split(':').collect();
    if parts.len() != 5 {
        return None;
    }

    let pid = parts[1].parse::<u32>().ok()?;
    let port = parts[2].parse::<u16>().ok()?;

    Some(LockfileInfo {
        name: parts[0].to_string(),
        pid,
        port,
        password: parts[3].to_string(),
        protocol: parts[4].to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_well_formed_lockfile_line() {
        let info = parse_lockfile_content("Riot Client:12345:54321:abc-secret:https").unwrap();
        assert_eq!(info.name, "Riot Client");
        assert_eq!(info.pid, 12345);
        assert_eq!(info.port, 54321);
        assert_eq!(info.password, "abc-secret");
        assert_eq!(info.protocol, "https");
    }

    #[test]
    fn trims_trailing_newline() {
        let info = parse_lockfile_content("Riot Client:1:2:pw:https\n").unwrap();
        assert_eq!(info.port, 2);
    }

    #[test]
    fn rejects_wrong_field_count() {
        assert!(parse_lockfile_content("Riot Client:1:2:pw").is_none());
        assert!(parse_lockfile_content("Riot Client:1:2:pw:https:extra").is_none());
    }

    #[test]
    fn rejects_non_numeric_pid_or_port() {
        assert!(parse_lockfile_content("Riot Client:notanumber:2:pw:https").is_none());
        assert!(parse_lockfile_content("Riot Client:1:notanumber:pw:https").is_none());
    }

    #[test]
    fn rejects_empty_content() {
        assert!(parse_lockfile_content("").is_none());
    }
}
