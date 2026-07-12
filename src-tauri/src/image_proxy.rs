//! Récupère une image hébergée sur un domaine tiers (logos/avatars VLR-esports renvoyés par
//! l'API Henrik — `types_esports.rs`, `types.rs::EsportsMatchTeam`) et la renvoie encodée en
//! `data:` URI, pour l'afficher sans avoir à whitelister un domaine de CDN tiers changeant
//! dans `app.security.csp` (backlog #100 : ces champs viennent de sources externes non
//! documentées/stables — vlr.gg, CDN esport — dont le domaine exact n'est pas garanti dans
//! le temps ; passer par le backend Rust plutôt que par `img-src` évite d'avoir à le
//! maintenir à chaque changement de CDN côté Henrik).
//!
//! Best-effort : toute erreur (réseau, contenu non-image, taille excessive) fait échouer la
//! commande, l'appelant (`ExternalImage.tsx`) affiche alors un espace vide plutôt qu'un
//! crash — cohérent avec le `onError` déjà en place sur ces images avant #100.

use anyhow::{bail, Context};
use base64::Engine;

/// Taille max acceptée — un logo/avatar ne dépasse jamais quelques centaines de Ko ; une
/// limite généreuse évite de laisser une réponse inattendue saturer la mémoire de l'app.
const MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024;

pub async fn fetch_as_data_uri(url: &str) -> anyhow::Result<String> {
    if !url.starts_with("https://") {
        bail!("URL refusée (https requis)");
    }

    let response = reqwest::get(url)
        .await
        .context("téléchargement de l'image externe")?
        .error_for_status()
        .context("statut HTTP de l'image externe")?;

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .split(';')
        .next()
        .unwrap_or("application/octet-stream")
        .to_string();

    if !content_type.starts_with("image/") {
        bail!("contenu refusé (pas une image): {content_type}");
    }

    let bytes = response
        .bytes()
        .await
        .context("lecture du corps de l'image externe")?;
    if bytes.len() > MAX_IMAGE_BYTES {
        bail!("image trop volumineuse ({} octets)", bytes.len());
    }

    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{content_type};base64,{encoded}"))
}
