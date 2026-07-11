//! Client HTTPS pour l'API locale du Riot Client (V2).
//!
//! L'API locale sert un certificat auto-signé : on accepte ce certificat uniquement pour
//! ce client dédié à `127.0.0.1:<port>` (`danger_accept_invalid_certs` sur CE client,
//! jamais sur le client Henrik de `api::henrik`, qui reste vérifié normalement).
//! Auth : Basic `riot:<password>` du lockfile.
//!
//! Tout est best-effort : cette API n'est pas officiellement supportée par Riot, chaque
//! fonction renvoie une erreur anyhow que l'appelant (poller) absorbe silencieusement.

use std::time::Duration;

use anyhow::Context;
use base64::Engine;
use serde::Deserialize;

use super::lockfile::LockfileInfo;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GameState {
    HorsJeu,
    Menu,
    Pregame,
    InGame,
    /// Jamais renvoyé par `fetch_game_state` (la presence ne l'expose pas) — synthétisé
    /// par le poller sur la transition InGame → Menu pour la notification de fin.
    #[allow(dead_code)]
    PostGame,
}

impl GameState {
    pub fn as_str(self) -> &'static str {
        match self {
            GameState::HorsJeu => "hors_jeu",
            GameState::Menu => "menu",
            GameState::Pregame => "pregame",
            GameState::InGame => "in_game",
            GameState::PostGame => "post_game",
        }
    }
}

/// Construit un client reqwest dédié à l'API locale, avec acceptation du certificat
/// auto-signé scopée à ce client uniquement.
pub fn build_local_client() -> anyhow::Result<reqwest::Client> {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(Duration::from_secs(5))
        .build()
        .context("construction du client HTTP local Riot")
}

fn local_url(lockfile: &LockfileInfo, path: &str) -> String {
    format!("https://127.0.0.1:{}{}", lockfile.port, path)
}

async fn get_local_json<T: serde::de::DeserializeOwned>(
    client: &reqwest::Client,
    lockfile: &LockfileInfo,
    path: &str,
) -> anyhow::Result<T> {
    let response = client
        .get(local_url(lockfile, path))
        .basic_auth("riot", Some(&lockfile.password))
        .send()
        .await
        .with_context(|| format!("GET local {path}"))?
        .error_for_status()
        .with_context(|| format!("statut local {path}"))?;
    response
        .json::<T>()
        .await
        .with_context(|| format!("parse local {path}"))
}

// ---- Session / presence ----

#[derive(Deserialize)]
struct ChatSession {
    puuid: String,
}

/// PUUID du joueur connecté localement.
pub async fn fetch_local_puuid(
    client: &reqwest::Client,
    lockfile: &LockfileInfo,
) -> anyhow::Result<String> {
    let session: ChatSession = get_local_json(client, lockfile, "/chat/v1/session").await?;
    Ok(session.puuid)
}

#[derive(Deserialize)]
struct PresencesResponse {
    #[serde(default)]
    presences: Vec<Presence>,
}

#[derive(Deserialize)]
struct Presence {
    puuid: Option<String>,
    product: Option<String>,
    /// JSON encodé en base64 contenant notamment `sessionLoopState`.
    private: Option<String>,
}

#[derive(Deserialize)]
struct PresencePrivate {
    #[serde(rename = "sessionLoopState")]
    session_loop_state: Option<String>,
}

/// Interroge l'état courant du client Riot via la presence chat du joueur local :
/// `sessionLoopState` vaut MENUS / PREGAME / INGAME quand Valorant tourne. Pas de
/// presence Valorant = jeu fermé (HorsJeu).
pub async fn fetch_game_state(
    client: &reqwest::Client,
    lockfile: &LockfileInfo,
    local_puuid: &str,
) -> anyhow::Result<GameState> {
    let response: PresencesResponse =
        get_local_json(client, lockfile, "/chat/v4/presences").await?;

    let Some(own) = response.presences.iter().find(|p| {
        p.puuid.as_deref() == Some(local_puuid)
            && p.product.as_deref() == Some("valorant")
    }) else {
        return Ok(GameState::HorsJeu);
    };

    let Some(private_b64) = own.private.as_deref() else {
        return Ok(GameState::Menu);
    };
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(private_b64)
        .context("decode base64 presence")?;
    let private: PresencePrivate =
        serde_json::from_slice(&decoded).context("parse presence privée")?;

    Ok(match private.session_loop_state.as_deref() {
        Some("PREGAME") => GameState::Pregame,
        Some("INGAME") => GameState::InGame,
        _ => GameState::Menu,
    })
}

// ---- Entitlements + roster de la partie (endpoints GLZ) ----

#[derive(Deserialize, Clone)]
pub struct Entitlements {
    #[serde(rename = "accessToken")]
    access_token: String,
    token: String,
}

async fn fetch_entitlements(
    client: &reqwest::Client,
    lockfile: &LockfileInfo,
) -> anyhow::Result<Entitlements> {
    get_local_json(client, lockfile, "/entitlements/v1/token").await
}

/// Région de déploiement Valorant, extraite des arguments de lancement du jeu exposés
/// par le Riot Client (`-ares-deployment=eu`). `None` si introuvable (l'appelant retombe
/// alors sur la région par défaut configurée dans l'app).
pub async fn fetch_deployment_region(
    client: &reqwest::Client,
    lockfile: &LockfileInfo,
) -> anyhow::Result<Option<String>> {
    let sessions: serde_json::Value =
        get_local_json(client, lockfile, "/product-session/v1/external-sessions").await?;

    let Some(map) = sessions.as_object() else {
        return Ok(None);
    };
    for session in map.values() {
        let args = session
            .pointer("/launchConfiguration/arguments")
            .and_then(|a| a.as_array());
        let Some(args) = args else { continue };
        for arg in args {
            if let Some(arg) = arg.as_str() {
                if let Some(region) = arg.strip_prefix("-ares-deployment=") {
                    return Ok(Some(region.to_string()));
                }
            }
        }
    }
    Ok(None)
}

/// Hôte GLZ (serveurs de partie) pour une région : les régions latam/br vivent sur le
/// shard na, les autres sur leur propre shard.
fn glz_base(region: &str) -> String {
    let shard = match region {
        "latam" | "br" => "na",
        other => other,
    };
    format!("https://glz-{region}-1.{shard}.a.pvp.net")
}

async fn get_glz_json(
    client: &reqwest::Client,
    entitlements: &Entitlements,
    url: &str,
) -> anyhow::Result<serde_json::Value> {
    let response = client
        .get(url)
        .bearer_auth(&entitlements.access_token)
        .header("X-Riot-Entitlements-JWT", &entitlements.token)
        .send()
        .await
        .with_context(|| format!("GET glz {url}"))?
        .error_for_status()
        .with_context(|| format!("statut glz {url}"))?;
    response.json().await.context("parse glz")
}

/// PUUID des joueurs visibles en pregame (sélection d'agent — équipe alliée uniquement,
/// c'est tout ce que le pregame expose).
pub async fn fetch_pregame_player_puuids(
    client: &reqwest::Client,
    lockfile: &LockfileInfo,
    local_puuid: &str,
    region: &str,
) -> anyhow::Result<Vec<String>> {
    let entitlements = fetch_entitlements(client, lockfile).await?;
    let base = glz_base(region);

    let player = get_glz_json(
        client,
        &entitlements,
        &format!("{base}/pregame/v1/players/{local_puuid}"),
    )
    .await?;
    let match_id = player
        .get("MatchID")
        .and_then(|v| v.as_str())
        .context("MatchID pregame absent")?
        .to_string();

    let game = get_glz_json(
        client,
        &entitlements,
        &format!("{base}/pregame/v1/matches/{match_id}"),
    )
    .await?;

    let mut puuids = Vec::new();
    if let Some(players) = game.pointer("/AllyTeam/Players").and_then(|p| p.as_array()) {
        for p in players {
            if let Some(subject) = p.get("Subject").and_then(|s| s.as_str()) {
                puuids.push(subject.to_string());
            }
        }
    }
    Ok(puuids)
}

/// PUUID des 10 joueurs de la partie en cours (core-game).
pub async fn fetch_coregame_player_puuids(
    client: &reqwest::Client,
    lockfile: &LockfileInfo,
    local_puuid: &str,
    region: &str,
) -> anyhow::Result<Vec<String>> {
    let entitlements = fetch_entitlements(client, lockfile).await?;
    let base = glz_base(region);

    let player = get_glz_json(
        client,
        &entitlements,
        &format!("{base}/core-game/v1/players/{local_puuid}"),
    )
    .await?;
    let match_id = player
        .get("MatchID")
        .and_then(|v| v.as_str())
        .context("MatchID core-game absent")?
        .to_string();

    let game = get_glz_json(
        client,
        &entitlements,
        &format!("{base}/core-game/v1/matches/{match_id}"),
    )
    .await?;

    let mut puuids = Vec::new();
    if let Some(players) = game.get("Players").and_then(|p| p.as_array()) {
        for p in players {
            if let Some(subject) = p.get("Subject").and_then(|s| s.as_str()) {
                puuids.push(subject.to_string());
            }
        }
    }
    Ok(puuids)
}
