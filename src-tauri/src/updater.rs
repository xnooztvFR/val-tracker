//! Vérification d'intégrité de l'installeur téléchargé par l'auto-update, en plus de la
//! signature Ed25519 (minisign) déjà vérifiée en interne par `tauri-plugin-updater` avant
//! d'installer. Défense en profondeur best-effort (voir TODO #97) : protège contre une
//! corruption silencieuse du binaire téléchargé indépendamment du canal minisign — pas
//! contre une compromission de la clé de signature elle-même.

use anyhow::Context;
use sha2::{Digest, Sha256};

/// Télécharge `url` et compare son SHA256 (hex, insensible à la casse) à `expected_sha256`
/// tel que publié dans `latest.json` (champ custom `sha256`, généré par `scripts/release.ps1`).
pub async fn verify_download_sha256(url: &str, expected_sha256: &str) -> anyhow::Result<bool> {
    let bytes = reqwest::get(url)
        .await
        .context("téléchargement de l'installeur pour vérification du hash")?
        .error_for_status()
        .context("statut HTTP de l'installeur")?
        .bytes()
        .await
        .context("lecture du corps de l'installeur")?;

    let digest = Sha256::digest(&bytes);
    let actual = format!("{digest:x}");
    Ok(actual.eq_ignore_ascii_case(expected_sha256.trim()))
}
