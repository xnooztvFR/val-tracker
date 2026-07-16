//! TODO Fonctionnalités#12 : alertes Discord via webhook optionnel, au-delà du Rich
//! Presence (`discord_rpc.rs`, IPC local, jamais d'appel réseau). Ici un vrai POST HTTP
//! sortant vers l'URL de webhook fournie par l'utilisateur (`discord.com/api/webhooks/...`),
//! best-effort et silencieux : une erreur réseau ne doit jamais faire échouer
//! `fetch_mmr`/`commands::henrik_fetch`, qui reste la voie principale de récupération du
//! rang. Pas de retry/backoff ici — contrairement au client Henrik, un message Discord raté
//! n'a pas besoin d'être garanti, un simple log en debug suffit.

use serde_json::json;

/// Envoie un message texte simple au webhook Discord configuré. Ne bloque jamais l'appelant
/// plus de quelques secondes (timeout court, ce n'est qu'une notification best-effort).
pub async fn send_message(webhook_url: &str, content: &str) {
    let client = reqwest::Client::new();
    let result = client
        .post(webhook_url)
        .timeout(std::time::Duration::from_secs(10))
        .json(&json!({ "content": content }))
        .send()
        .await;

    if let Err(e) = result {
        // Best-effort : on ne loggue jamais l'URL du webhook (secret d'accès au salon), juste
        // l'erreur réseau, et seulement en debug (même réflexe que les corps de réponse Henrik
        // non parsés — voir CLAUDE.md § Conventions de code).
        if cfg!(debug_assertions) {
            crate::applog!("[discord_webhook] échec d'envoi : {e}");
        }
    }
}

/// Notifie un changement de rang (promotion/dérank) — même contenu que la notification
/// Windows native (`notify_rank_change` dans `commands/henrik_fetch.rs`), formaté pour
/// Discord.
pub async fn send_rank_change(webhook_url: &str, from: &str, to: &str, promoted: bool) {
    let title = if promoted { "Promotion" } else { "Dérank" };
    send_message(webhook_url, &format!("**{title}** : {from} → {to}")).await;
}
