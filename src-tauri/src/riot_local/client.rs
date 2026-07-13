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

/// Masque les segments UUID (PUUID, match ID) d'une URL/chemin avant de l'inclure dans un
/// message de log — ces messages remontent jusqu'à `val-tracker.log` via `poller.rs`
/// (`applog!`), qui n'est pas un canal chiffré (voir Backlog #101, audit du contenu du log).
fn redact_ids(url_or_path: &str) -> String {
    url_or_path
        .split('/')
        .map(|segment| if is_uuid_like(segment) { "<id>" } else { segment })
        .collect::<Vec<_>>()
        .join("/")
}

fn is_uuid_like(segment: &str) -> bool {
    let bytes = segment.as_bytes();
    bytes.len() == 36
        && bytes.iter().enumerate().all(|(i, b)| match i {
            8 | 13 | 18 | 23 => *b == b'-',
            _ => b.is_ascii_hexdigit(),
        })
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
        .with_context(|| format!("GET local {}", redact_ids(path)))?
        .error_for_status()
        .with_context(|| format!("statut local {}", redact_ids(path)))?;
    response
        .json::<T>()
        .await
        .with_context(|| format!("parse local {}", redact_ids(path)))
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
    /// `sessionLoopState` vit sous `matchPresenceData`, pas à la racine de `private` —
    /// le chercher à la racine le laisse toujours à `None` (silencieusement, `Option`
    /// oblige) et fait retomber `fetch_game_state` sur `Menu` en permanence, quel que soit
    /// l'état réel de la partie. C'est le bug d'origine derrière l'overlay qui ne
    /// s'affichait jamais.
    #[serde(rename = "matchPresenceData")]
    match_presence_data: Option<MatchPresenceData>,
    #[serde(rename = "partyPresenceData")]
    party_presence_data: Option<PartyPresenceData>,
}

#[derive(Deserialize)]
struct MatchPresenceData {
    #[serde(rename = "sessionLoopState")]
    session_loop_state: Option<String>,
}

#[derive(Deserialize)]
struct PartyPresenceData {
    /// Version du client Valorant (ex: `release-13.00-shipping-32-4990475`) — requise en
    /// en-tête `X-Riot-ClientVersion` des appels GLZ (voir `get_glz_json`), sans quoi Riot
    /// répond `400 INVALID_HEADERS`. Extraite d'ici plutôt que codée en dur pour rester
    /// valide d'un patch à l'autre sans mise à jour de l'app.
    #[serde(rename = "partyClientVersion")]
    party_client_version: Option<String>,
}

/// Interroge l'état courant du client Riot via la presence chat du joueur local :
/// `sessionLoopState` vaut MENUS / PREGAME / INGAME quand Valorant tourne. Pas de
/// presence Valorant = jeu fermé (HorsJeu). Renvoie aussi la version du client courante
/// (voir `PartyPresenceData`), nécessaire pour les appels GLZ du roster.
pub async fn fetch_game_state(
    client: &reqwest::Client,
    lockfile: &LockfileInfo,
    local_puuid: &str,
) -> anyhow::Result<(GameState, Option<String>)> {
    let response: PresencesResponse =
        get_local_json(client, lockfile, "/chat/v4/presences").await?;

    let Some(own) = response.presences.iter().find(|p| {
        p.puuid.as_deref() == Some(local_puuid)
            && p.product.as_deref() == Some("valorant")
    }) else {
        return Ok((GameState::HorsJeu, None));
    };

    let Some(private_b64) = own.private.as_deref() else {
        return Ok((GameState::Menu, None));
    };
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(private_b64)
        .context("decode base64 presence")?;
    let private: PresencePrivate =
        serde_json::from_slice(&decoded).context("parse presence privée")?;

    let client_version = private
        .party_presence_data
        .and_then(|p| p.party_client_version);
    let session_loop_state = private
        .match_presence_data
        .and_then(|m| m.session_loop_state);

    let state = match session_loop_state.as_deref() {
        Some("PREGAME") => GameState::Pregame,
        Some("INGAME") => GameState::InGame,
        _ => GameState::Menu,
    };
    Ok((state, client_version))
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

/// En-tête `X-Riot-ClientPlatform` attendu par les endpoints GLZ : un JSON générique
/// encodé en base64 décrivant la plateforme (identique pour tout client Windows, pas
/// spécifique à la machine — valeur utilisée telle quelle par la plupart des clients tiers
/// non officiels de l'API Valorant).
fn client_platform_header() -> String {
    base64::engine::general_purpose::STANDARD.encode(
        r#"{"platformType":"PC","platformOS":"Windows","platformOSVersion":"10.0.19042.1.256.64bit","platformChipset":"Unknown"}"#,
    )
}

async fn get_glz_json(
    client: &reqwest::Client,
    entitlements: &Entitlements,
    client_version: &str,
    url: &str,
) -> anyhow::Result<serde_json::Value> {
    let response = client
        .get(url)
        .bearer_auth(&entitlements.access_token)
        .header("X-Riot-Entitlements-JWT", &entitlements.token)
        .header("X-Riot-ClientPlatform", client_platform_header())
        .header("X-Riot-ClientVersion", client_version)
        .send()
        .await
        .with_context(|| format!("GET glz {}", redact_ids(url)))?
        .error_for_status()
        .with_context(|| format!("statut glz {}", redact_ids(url)))?;
    response.json().await.context("parse glz")
}

/// Un joueur allié visible en pregame, avec son `CharacterID` (UUID d'agent Riot, vide tant
/// que l'agent n'est pas locké) — voir `super::agents` pour la résolution en nom d'agent.
pub struct PregamePlayer {
    pub puuid: String,
    pub character_id: String,
}

/// Joueurs visibles en pregame (sélection d'agent — équipe alliée uniquement, c'est tout ce
/// que le pregame expose).
pub async fn fetch_pregame_player_puuids(
    client: &reqwest::Client,
    lockfile: &LockfileInfo,
    local_puuid: &str,
    region: &str,
    client_version: &str,
) -> anyhow::Result<Vec<PregamePlayer>> {
    let entitlements = fetch_entitlements(client, lockfile).await?;
    let base = glz_base(region);

    let player = get_glz_json(
        client,
        &entitlements,
        client_version,
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
        client_version,
        &format!("{base}/pregame/v1/matches/{match_id}"),
    )
    .await?;

    let mut players = Vec::new();
    if let Some(raw_players) = game.pointer("/AllyTeam/Players").and_then(|p| p.as_array()) {
        for p in raw_players {
            if let Some(subject) = p.get("Subject").and_then(|s| s.as_str()) {
                let character_id = p
                    .get("CharacterID")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                players.push(PregamePlayer {
                    puuid: subject.to_string(),
                    character_id,
                });
            }
        }
    }
    Ok(players)
}

/// Un joueur de la partie core-game, avec son `TeamID` Riot ("Blue"/"Red") — nécessaire
/// pour distinguer alliés et ennemis (contrairement au pregame, le core-game expose les
/// deux équipes, voir `fetch_coregame_player_puuids`).
pub struct CoreGamePlayer {
    pub puuid: String,
    pub team_id: String,
}

/// Les 10 joueurs (deux équipes) de la partie en cours (core-game). Contrairement au
/// pregame, cet endpoint expose l'équipe adverse — chaque joueur porte son `TeamID`,
/// l'appelant (poller) le compare au `TeamID` du joueur local pour déduire allié/ennemi.
pub async fn fetch_coregame_player_puuids(
    client: &reqwest::Client,
    lockfile: &LockfileInfo,
    local_puuid: &str,
    region: &str,
    client_version: &str,
) -> anyhow::Result<Vec<CoreGamePlayer>> {
    let entitlements = fetch_entitlements(client, lockfile).await?;
    let base = glz_base(region);

    let player = get_glz_json(
        client,
        &entitlements,
        client_version,
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
        client_version,
        &format!("{base}/core-game/v1/matches/{match_id}"),
    )
    .await?;

    let mut players = Vec::new();
    if let Some(raw_players) = game.get("Players").and_then(|p| p.as_array()) {
        for p in raw_players {
            let subject = p.get("Subject").and_then(|s| s.as_str());
            let team_id = p.get("TeamID").and_then(|t| t.as_str());
            if let (Some(subject), Some(team_id)) = (subject, team_id) {
                players.push(CoreGamePlayer {
                    puuid: subject.to_string(),
                    team_id: team_id.to_string(),
                });
            }
        }
    }
    Ok(players)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn game_state_as_str_matches_expected_wire_values() {
        assert_eq!(GameState::HorsJeu.as_str(), "hors_jeu");
        assert_eq!(GameState::Menu.as_str(), "menu");
        assert_eq!(GameState::Pregame.as_str(), "pregame");
        assert_eq!(GameState::InGame.as_str(), "in_game");
        assert_eq!(GameState::PostGame.as_str(), "post_game");
    }

    #[test]
    fn glz_base_routes_latam_and_br_to_na_shard() {
        assert_eq!(glz_base("latam"), "https://glz-latam-1.na.a.pvp.net");
        assert_eq!(glz_base("br"), "https://glz-br-1.na.a.pvp.net");
    }

    #[test]
    fn glz_base_routes_other_regions_to_their_own_shard() {
        assert_eq!(glz_base("eu"), "https://glz-eu-1.eu.a.pvp.net");
        assert_eq!(glz_base("na"), "https://glz-na-1.na.a.pvp.net");
        assert_eq!(glz_base("ap"), "https://glz-ap-1.ap.a.pvp.net");
    }

    #[test]
    fn local_url_builds_https_localhost_with_port() {
        let lockfile = LockfileInfo {
            name: "Riot Client".to_string(),
            pid: 1,
            port: 54321,
            password: "pw".to_string(),
            protocol: "https".to_string(),
        };
        assert_eq!(
            local_url(&lockfile, "/chat/v1/session"),
            "https://127.0.0.1:54321/chat/v1/session"
        );
    }
}
