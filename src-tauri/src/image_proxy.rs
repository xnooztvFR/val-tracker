//! Récupère une image hébergée sur un domaine tiers (logos/avatars VLR-esports renvoyés par
//! l'API Henrik — `types_esports.rs`, `types.rs::EsportsMatchTeam`) et la renvoie encodée en
//! `data:` URI, pour l'afficher sans avoir à whitelister un domaine de CDN tiers changeant
//! dans `app.security.csp` (backlog #100 : ces champs viennent de sources externes non
//! documentées/stables — vlr.gg, CDN esport — dont le domaine exact n'est pas garanti dans
//! le temps ; passer par le backend Rust plutôt que par `img-src` évite d'avoir à le
//! maintenir à chaque changement de CDN côté Henrik).
//!
//! La commande étant exposée au frontend via IPC, l'URL est validée côté Rust (https +
//! allowlist de domaines + refus des IP littérales), y compris après chaque redirection —
//! le frontend n'est pas une frontière de confiance suffisante pour laisser le backend
//! aller chercher une URL arbitraire (SSRF).
//!
//! Best-effort : toute erreur (réseau, contenu non-image, taille excessive, domaine hors
//! allowlist) fait échouer la commande, l'appelant (`ExternalImage.tsx`) affiche alors un
//! espace vide plutôt qu'un crash — cohérent avec le `onError` déjà en place sur ces images
//! avant #100.

use std::time::Duration;

use anyhow::{bail, Context};
use base64::Engine;

/// Taille max acceptée — un logo/avatar ne dépasse jamais quelques centaines de Ko ; une
/// limite généreuse évite de laisser une réponse inattendue saturer la mémoire de l'app.
const MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024;

/// Réduit à 10s (au lieu de 30s) : un logo/avatar VLR/owcdn pèse quelques centaines de Ko au
/// plus, un flux volontairement très lent (sous `MAX_IMAGE_BYTES` mais très étalé dans le
/// temps) n'a pas besoin de garder une tâche tokio occupée aussi longtemps.
const FETCH_TIMEOUT: Duration = Duration::from_secs(10);

/// Domaines (suffixes) autorisés — les CDN d'où viennent réellement les logos/avatars
/// esports servis par Henrik (vlr.gg et son CDN owcdn.net). Si Henrik change de CDN un
/// jour, l'image disparaîtra silencieusement (fallback `ExternalImage.tsx`) et il suffira
/// d'ajouter le nouveau domaine ici — c'est le prix de ne pas laisser le backend fetcher
/// n'importe quelle URL au nom du frontend.
const ALLOWED_HOST_SUFFIXES: &[&str] = &["vlr.gg", "owcdn.net"];

/// Valide qu'une URL est en https, sur un hôte nommé (pas d'IP littérale) appartenant à
/// l'allowlist — appliqué à l'URL initiale ET à chaque redirection (voir la policy du
/// client), pour qu'un hop ne puisse pas rediriger vers un hôte interne.
fn is_allowed_url(url: &reqwest::Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }
    // `domain()` renvoie None pour les hôtes en IP littérale (v4/v6) : refusés d'office
    // (SSRF vers le réseau local).
    let Some(domain) = url.domain() else { return false };
    let domain = domain.to_ascii_lowercase();
    ALLOWED_HOST_SUFFIXES
        .iter()
        .any(|suffix| domain == *suffix || domain.ends_with(&format!(".{suffix}")))
}

pub async fn fetch_as_data_uri(url: &str) -> anyhow::Result<String> {
    let parsed = reqwest::Url::parse(url).context("URL d'image invalide")?;
    if !is_allowed_url(&parsed) {
        bail!("URL refusée (https + domaine autorisé requis)");
    }

    let client = reqwest::Client::builder()
        .timeout(FETCH_TIMEOUT)
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            // Re-valide chaque hop de redirection avec les mêmes règles que l'URL
            // initiale — sans ça, un CDN autorisé pourrait rediriger vers un hôte
            // arbitraire et contourner l'allowlist.
            if attempt.previous().len() > 5 || !is_allowed_url(attempt.url()) {
                attempt.stop()
            } else {
                attempt.follow()
            }
        }))
        .build()
        .context("construction du client HTTP images externes")?;

    let response = client
        .get(parsed)
        .send()
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

#[cfg(test)]
mod tests {
    use super::*;

    fn allowed(url: &str) -> bool {
        is_allowed_url(&reqwest::Url::parse(url).unwrap())
    }

    #[test]
    fn accepts_allowlisted_domains_and_subdomains() {
        assert!(allowed("https://owcdn.net/img/logo.png"));
        assert!(allowed("https://img.owcdn.net/logo.png"));
        assert!(allowed("https://www.vlr.gg/img/avatar.png"));
    }

    #[test]
    fn rejects_http_other_domains_and_ip_literals() {
        assert!(!allowed("http://owcdn.net/img/logo.png"));
        assert!(!allowed("https://example.com/logo.png"));
        // Suffixe piégé : evil-owcdn.net n'est PAS un sous-domaine de owcdn.net.
        assert!(!allowed("https://evil-owcdn.net/logo.png"));
        assert!(!allowed("https://192.168.1.1/logo.png"));
        assert!(!allowed("https://[::1]/logo.png"));
    }
}
