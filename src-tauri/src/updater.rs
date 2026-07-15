//! Vérification d'intégrité de l'installeur téléchargé par l'auto-update, en plus de la
//! signature Ed25519 (minisign) déjà vérifiée en interne par `tauri-plugin-updater` avant
//! d'installer. Défense en profondeur best-effort (voir TODO #97).
//!
//! Limite connue (TOCTOU) : ce module télécharge sa PROPRE copie de l'installeur pour la
//! hasher — `downloadAndInstall` côté plugin retélécharge ensuite la sienne, et c'est cette
//! seconde copie qui est installée. Le hash ne protège donc que contre une corruption/
//! substitution *cohérente entre les deux téléchargements* (asset GitHub remplacé, mirror
//! corrompu) ; un attaquant capable de servir deux contenus différents le contourne. La
//! garantie forte sur les octets réellement installés reste la signature Ed25519 du plugin.

use std::sync::OnceLock;
use std::time::Duration;

use anyhow::{bail, Context};
use futures_util::StreamExt;
use sha2::{Digest, Sha256};

/// Plafond de taille du téléchargement — l'installeur NSIS fait quelques dizaines de Mo ;
/// le hash est calculé en streaming (voir `verify_download_sha256`) mais une réponse
/// aberrante ne doit pas pouvoir faire tourner le téléchargement indéfiniment.
const MAX_INSTALLER_BYTES: usize = 300 * 1024 * 1024;

const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(300);

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn http_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(DOWNLOAD_TIMEOUT)
            .build()
            .expect("construction du client HTTP de vérification d'update")
    })
}

/// Télécharge `url` et compare son SHA256 (hex, insensible à la casse) à `expected_sha256`
/// tel que publié dans `latest.json` (champ custom `sha256`, généré par `scripts/release.ps1`).
///
/// Le corps est hashé en streaming (`bytes_stream` + `Sha256::update` incrémental) plutôt
/// que bufferisé en une fois via `.bytes()` : le pic mémoire reste proportionnel à la taille
/// d'un chunk réseau, pas à la taille totale de l'installeur (~pertinent pendant que le
/// plugin updater télécharge en parallèle sa propre copie pour l'installation, voir la note
/// TOCTOU en tête de fichier).
pub async fn verify_download_sha256(url: &str, expected_sha256: &str) -> anyhow::Result<bool> {
    let response = http_client()
        .get(url)
        .send()
        .await
        .context("téléchargement de l'installeur pour vérification du hash")?
        .error_for_status()
        .context("statut HTTP de l'installeur")?;

    let mut stream = response.bytes_stream();
    let mut hasher = Sha256::new();
    let mut total = 0usize;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.context("lecture du corps de l'installeur")?;
        total += chunk.len();
        if total > MAX_INSTALLER_BYTES {
            bail!("installeur anormalement volumineux (> {MAX_INSTALLER_BYTES} octets)");
        }
        hasher.update(&chunk);
    }

    let digest = hasher.finalize();
    let actual = format!("{digest:x}");
    Ok(actual.eq_ignore_ascii_case(expected_sha256.trim()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_mismatch_is_detected() {
        let digest = Sha256::digest(b"contenu de l'installeur");
        let actual = format!("{digest:x}");
        let expected = "0".repeat(64);
        assert_ne!(actual, expected);
        assert!(!actual.eq_ignore_ascii_case(&expected));
    }

    #[test]
    fn hash_match_is_case_insensitive() {
        let digest = Sha256::digest(b"contenu de l'installeur");
        let actual = format!("{digest:x}");
        assert!(actual.eq_ignore_ascii_case(&actual.to_uppercase()));
    }
}
