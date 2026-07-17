//! TODO.md § Sécurité #7 : garde-fou de build vérifiant que `app.security.csp` de
//! `tauri.conf.json` reste renseigné — la CSP est le filet anti-XSS de la webview (voir
//! CLAUDE.md § Conventions de code), un `null` accidentel (ex. lors d'un merge ou d'un
//! nettoyage de config) désactiverait cette protection silencieusement, sans qu'aucune autre
//! garde ne le détecte avant une release.

#[cfg(test)]
mod tests {
    const RAW_CONFIG: &str = include_str!("../tauri.conf.json");

    #[test]
    fn csp_is_present_and_non_empty() {
        let config: serde_json::Value =
            serde_json::from_str(RAW_CONFIG).expect("tauri.conf.json doit être un JSON valide");

        let csp = config
            .get("app")
            .and_then(|app| app.get("security"))
            .and_then(|security| security.get("csp"))
            .expect("app.security.csp doit être présent dans tauri.conf.json");

        assert!(
            !csp.is_null(),
            "app.security.csp ne doit jamais être null (désactive le filet anti-XSS de la webview)"
        );
        assert!(
            csp.as_str().is_some_and(|s| !s.trim().is_empty()),
            "app.security.csp doit être une chaîne non vide"
        );
    }
}
