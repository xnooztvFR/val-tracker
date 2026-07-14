//! Chiffrement au repos via DPAPI Windows (`CryptProtectData`/`CryptUnprotectData`) — lié
//! au compte Windows de la session courante, sans clé/secret supplémentaire à gérer côté
//! app. Utilisé par `settings.rs` pour la clé API Henrik : elle vivait auparavant en clair
//! dans la table SQLite `settings` (juste masquée dans les logs/`Debug`), ce qui laissait
//! un secret en clair sur disque pour qui a accès au fichier `%APPDATA%` sans avoir la
//! session Windows de l'utilisateur.

use base64::Engine;
use windows::Win32::Foundation::LocalFree;
use windows::Win32::Security::Cryptography::{CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB};

#[derive(Debug, thiserror::Error)]
pub enum DpapiError {
    #[error("CryptProtectData a échoué")]
    ProtectFailed,
    #[error("CryptUnprotectData a échoué")]
    UnprotectFailed,
    #[error("base64 invalide: {0}")]
    Base64(#[from] base64::DecodeError),
}

/// Chiffre `plaintext` pour le compte Windows courant et renvoie le résultat encodé en
/// base64 (format de stockage texte de la table `settings`).
pub fn protect(plaintext: &str) -> Result<String, DpapiError> {
    let mut input = plaintext.as_bytes().to_vec();
    let blob_in = CRYPT_INTEGER_BLOB {
        cbData: input.len() as u32,
        pbData: input.as_mut_ptr(),
    };
    let mut blob_out = CRYPT_INTEGER_BLOB::default();

    unsafe {
        CryptProtectData(&blob_in, None, None, None, None, 0, &mut blob_out)
            .map_err(|_| DpapiError::ProtectFailed)?;
    }

    let encrypted = unsafe {
        std::slice::from_raw_parts(blob_out.pbData, blob_out.cbData as usize).to_vec()
    };
    unsafe {
        let _ = LocalFree(Some(windows::Win32::Foundation::HLOCAL(blob_out.pbData as _)));
    }

    Ok(base64::engine::general_purpose::STANDARD.encode(encrypted))
}

/// Déchiffre une valeur produite par [`protect`].
pub fn unprotect(encoded: &str) -> Result<String, DpapiError> {
    let mut input = base64::engine::general_purpose::STANDARD.decode(encoded)?;
    let blob_in = CRYPT_INTEGER_BLOB {
        cbData: input.len() as u32,
        pbData: input.as_mut_ptr(),
    };
    let mut blob_out = CRYPT_INTEGER_BLOB::default();

    unsafe {
        CryptUnprotectData(&blob_in, None, None, None, None, 0, &mut blob_out)
            .map_err(|_| DpapiError::UnprotectFailed)?;
    }

    let decrypted = unsafe {
        std::slice::from_raw_parts(blob_out.pbData, blob_out.cbData as usize).to_vec()
    };
    unsafe {
        let _ = LocalFree(Some(windows::Win32::Foundation::HLOCAL(blob_out.pbData as _)));
    }

    String::from_utf8(decrypted).map_err(|_| DpapiError::UnprotectFailed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip() {
        let secret = "my-secret-key-12345";
        let protected = protect(secret).unwrap();
        assert_ne!(protected, secret);
        assert_eq!(unprotect(&protected).unwrap(), secret);
    }

    #[test]
    fn garbage_input_fails_cleanly() {
        assert!(unprotect("not-valid-base64-or-blob!!!").is_err());
    }

    /// Contrairement à `garbage_input_fails_cleanly` (base64 invalide), ici l'entrée est du
    /// base64 parfaitement valide, mais les octets décodés ne forment pas un vrai blob
    /// protégé par DPAPI (ex: un secret d'une autre app, ou une valeur corrompue qui reste
    /// un base64 valide par coïncidence) — `CryptUnprotectData` doit échouer proprement
    /// plutôt que paniquer.
    #[test]
    fn valid_base64_but_not_a_dpapi_blob_fails_cleanly() {
        let not_a_real_blob =
            base64::engine::general_purpose::STANDARD.encode(b"just some random bytes, not DPAPI");
        assert!(unprotect(&not_a_real_blob).is_err());
    }
}
