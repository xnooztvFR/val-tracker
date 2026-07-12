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

use std::time::Duration;

use anyhow::{bail, Context};
use sha2::{Digest, Sha256};

/// Plafond de taille du téléchargement — l'installeur NSIS fait quelques dizaines de Mo,
/// tout est bufferisé en RAM le temps du hash ; une réponse aberrante ne doit pas pouvoir
/// saturer la mémoire de l'app.
const MAX_INSTALLER_BYTES: usize = 300 * 1024 * 1024;

const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(300);

/// Télécharge `url` et compare son SHA256 (hex, insensible à la casse) à `expected_sha256`
/// tel que publié dans `latest.json` (champ custom `sha256`, généré par `scripts/release.ps1`).
pub async fn verify_download_sha256(url: &str, expected_sha256: &str) -> anyhow::Result<bool> {
    let client = reqwest::Client::builder()
        .timeout(DOWNLOAD_TIMEOUT)
        .build()
        .context("construction du client HTTP de vérification d'update")?;

    let bytes = client
        .get(url)
        .send()
        .await
        .context("téléchargement de l'installeur pour vérification du hash")?
        .error_for_status()
        .context("statut HTTP de l'installeur")?
        .bytes()
        .await
        .context("lecture du corps de l'installeur")?;

    if bytes.len() > MAX_INSTALLER_BYTES {
        bail!("installeur anormalement volumineux ({} octets)", bytes.len());
    }

    let digest = Sha256::digest(&bytes);
    let actual = format!("{digest:x}");
    Ok(actual.eq_ignore_ascii_case(expected_sha256.trim()))
}
