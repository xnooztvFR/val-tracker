//! Une fonction par endpoint Henrik. Orchestre cache SQLite (TTL différenciés) + client
//! HTTP : sert le cache frais si dispo, sinon appelle l'API et remet le cache à jour, et
//! en cas de panne réseau/API retombe sur le dernier cache connu même expiré (avec
//! `stale: true` pour que l'UI affiche le bandeau "Données en cache").
//!
//! Le verrou SQLite n'est tenu que le temps des lectures/écritures locales, jamais
//! pendant l'appel réseau, pour ne pas bloquer les autres commandes en parallèle.

use base64::Engine;
use rusqlite::Connection;
use serde::de::DeserializeOwned;
use serde::Serialize;
use tokio::sync::Mutex;

use super::client::HenrikClient;
use super::types::{
    AccountData, EsportsScheduleEntry, HenrikEnvelope, LeaderboardData, MatchDetailData,
    MatchEntry, MmrData, MmrHistoryData, QueueStatusEntry, StatusData,
};
use super::{
    cache, HenrikError, TtlSeconds, TTL_ACCOUNT, TTL_CROSSHAIR, TTL_ESPORTS, TTL_LEADERBOARD,
    TTL_MATCHES, TTL_MATCH_DETAIL, TTL_MMR, TTL_MMR_HISTORY, TTL_STATUS,
};

/// Résultat d'un appel d'endpoint, avec métadonnées de fraîcheur pour l'UI.
#[derive(Debug, Serialize)]
pub struct Fetched<T> {
    pub data: T,
    /// `true` si la donnée vient du cache périmé (repli suite à une panne réseau/API).
    pub stale: bool,
    /// `true` si cet appel a effectivement touché le réseau (par opposition à un cache
    /// encore frais) — sert à décider si on doit enregistrer un nouveau rank_snapshot.
    pub from_network: bool,
    /// Timestamp unix (secondes) de la dernière récupération réussie, si connu.
    pub cached_at: Option<i64>,
}

pub(crate) async fn fetch_with_cache<T: DeserializeOwned>(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: &str,
    path: &str,
    ttl: TtlSeconds,
    force: bool,
) -> Result<Fetched<T>, HenrikError> {
    if !force {
        let cached = {
            let conn = db.lock().await;
            cache::get_fresh(&conn, path)?
        };

        if let Some((payload, expires_at)) = cached {
            let envelope: HenrikEnvelope<T> = serde_json::from_str(&payload)?;
            return Ok(Fetched {
                data: envelope.data,
                stale: false,
                from_network: false,
                cached_at: Some(expires_at - ttl.0),
            });
        }
    }

    match client.get_raw(path, api_key).await {
        Ok(body) => {
            // On parse AVANT de cacher : un payload qui ne respecte pas le schéma
            // attendu (changement d'API, réponse tronquée) ne doit jamais être écrit
            // dans api_cache, sinon il empoisonne le cache pour toute la durée du TTL
            // (jusqu'à 24h pour un match) et chaque relecture échoue en boucle au lieu
            // de retenter le réseau.
            let envelope: HenrikEnvelope<T> = match serde_json::from_str(&body) {
                Ok(v) => v,
                Err(e) => {
                    let snippet: String = body.chars().take(800).collect();
                    eprintln!("[henrik] parse échoué pour {path}: {e}\n[henrik] corps (800 premiers caractères): {snippet}");
                    return Err(HenrikError::Serde(e));
                }
            };
            let fetched_at = {
                let conn = db.lock().await;
                cache::set(&conn, path, &body, ttl)?;
                chrono::Utc::now().timestamp()
            };
            Ok(Fetched {
                data: envelope.data,
                stale: false,
                from_network: true,
                cached_at: Some(fetched_at),
            })
        }
        // Un 404 est définitif ("joueur introuvable") : pas de repli sur un cache périmé.
        Err(HenrikError::NotFound) => Err(HenrikError::NotFound),
        Err(err) => {
            let stale = {
                let conn = db.lock().await;
                cache::get_stale(&conn, path)?
            };
            match stale {
                Some((payload, expires_at)) => {
                    let envelope: HenrikEnvelope<T> = serde_json::from_str(&payload)?;
                    Ok(Fetched {
                        data: envelope.data,
                        stale: true,
                        from_network: false,
                        cached_at: Some(expires_at - ttl.0),
                    })
                }
                None => Err(err),
            }
        }
    }
}

pub(crate) fn encode(segment: &str) -> String {
    urlencoding::encode(segment).into_owned()
}

pub async fn get_account(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&str>,
    name: &str,
    tag: &str,
    force: bool,
) -> Result<Fetched<AccountData>, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let path = format!("/valorant/v2/account/{}/{}", encode(name), encode(tag));
    fetch_with_cache(db, client, api_key, &path, TTL_ACCOUNT, force).await
}

pub async fn get_mmr(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&str>,
    region: &str,
    name: &str,
    tag: &str,
    force: bool,
) -> Result<Fetched<MmrData>, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let path = format!(
        "/valorant/v2/mmr/{}/{}/{}",
        encode(region),
        encode(name),
        encode(tag)
    );
    fetch_with_cache(db, client, api_key, &path, TTL_MMR, force).await
}

/// Variante by-puuid du MMR, utilisée par l'overlay V2 pour les joueurs détectés en
/// partie (on n'a que leur PUUID via l'API locale Riot).
pub async fn get_mmr_by_puuid(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&str>,
    region: &str,
    puuid: &str,
    force: bool,
) -> Result<Fetched<MmrData>, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let path = format!(
        "/valorant/v2/by-puuid/mmr/{}/{}",
        encode(region),
        encode(puuid)
    );
    fetch_with_cache(db, client, api_key, &path, TTL_MMR, force).await
}

pub async fn get_matches(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&str>,
    region: &str,
    name: &str,
    tag: &str,
    size: u32,
    force: bool,
) -> Result<Fetched<Vec<MatchEntry>>, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let path = format!(
        "/valorant/v4/matches/{}/pc/{}/{}?size={}&mode=competitive",
        encode(region),
        encode(name),
        encode(tag),
        size.clamp(1, 100)
    );
    fetch_with_cache(db, client, api_key, &path, TTL_MATCHES, force).await
}

/// Historique de RR complet (au-delà des snapshots collectés localement) — utilisé pour
/// tracer la courbe de progression de rank dès la première visite d'un profil, sans
/// attendre plusieurs sessions de l'app.
pub async fn get_mmr_history(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&str>,
    region: &str,
    name: &str,
    tag: &str,
    force: bool,
) -> Result<Fetched<MmrHistoryData>, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let path = format!(
        "/valorant/v2/mmr-history/{}/pc/{}/{}",
        encode(region),
        encode(name),
        encode(tag)
    );
    fetch_with_cache(db, client, api_key, &path, TTL_MMR_HISTORY, force).await
}

/// Détail complet d'un match (round par round, économie) — plus riche que l'entrée
/// correspondante dans `get_matches`, utilisé par l'écran de détail de match.
pub async fn get_match_detail(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&str>,
    match_id: &str,
    force: bool,
) -> Result<Fetched<MatchDetailData>, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let path = format!("/valorant/v2/match/{}", encode(match_id));
    fetch_with_cache(db, client, api_key, &path, TTL_MATCH_DETAIL, force).await
}

/// Classement compétitif d'une région/plateforme. La pagination Henrik v3 se fait par
/// `start_index` (1-based, pas un numéro de page) ; `name`/`tag` optionnels renvoient
/// alors la page contenant ce joueur plutôt qu'un `start_index` donné.
#[allow(clippy::too_many_arguments)]
pub async fn get_leaderboard(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&str>,
    region: &str,
    size: u32,
    start_index: u32,
    name: Option<&str>,
    tag: Option<&str>,
    force: bool,
) -> Result<Fetched<LeaderboardData>, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let mut path = format!(
        "/valorant/v3/leaderboard/{}/pc?size={}&start_index={}",
        encode(region),
        size.clamp(1, 200),
        start_index.max(1)
    );
    if let (Some(name), Some(tag)) = (name, tag) {
        path.push_str(&format!("&name={}&tag={}", encode(name), encode(tag)));
    }
    fetch_with_cache(db, client, api_key, &path, TTL_LEADERBOARD, force).await
}

/// Statut serveur (incidents / maintenances) pour une région.
pub async fn get_status(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&str>,
    region: &str,
    force: bool,
) -> Result<Fetched<StatusData>, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let path = format!("/valorant/v1/status/{}", encode(region));
    fetch_with_cache(db, client, api_key, &path, TTL_STATUS, force).await
}

/// État des files d'attente (activées/désactivées) pour une région.
pub async fn get_queue_status(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&str>,
    region: &str,
    force: bool,
) -> Result<Fetched<Vec<QueueStatusEntry>>, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let path = format!("/valorant/v1/queue-status/{}", encode(region));
    fetch_with_cache(db, client, api_key, &path, TTL_STATUS, force).await
}

/// Calendrier esport VCT (matchs passés/en cours/à venir), filtrable par région/ligue.
pub async fn get_esports_schedule(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&str>,
    region: Option<&str>,
    league: Option<&str>,
    force: bool,
) -> Result<Fetched<Vec<EsportsScheduleEntry>>, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let mut query = Vec::new();
    if let Some(region) = region {
        query.push(format!("region={}", encode(region)));
    }
    if let Some(league) = league {
        query.push(format!("league={}", encode(league)));
    }
    let mut path = "/valorant/v1/esports/schedule".to_string();
    if !query.is_empty() {
        path.push('?');
        path.push_str(&query.join("&"));
    }
    fetch_with_cache(db, client, api_key, &path, TTL_ESPORTS, force).await
}

/// Génère l'image PNG d'un crosshair à partir de son code, encodée en base64 pour
/// traverser `invoke()` et être affichée directement via une data URL côté frontend.
/// Cache dédié (pas de désérialisation JSON, contenu binaire) : réutilise la même table
/// `api_cache`, avec le payload stocké en base64 plutôt qu'en JSON brut.
pub async fn get_crosshair_preview(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&str>,
    code: &str,
    force: bool,
) -> Result<String, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let path = format!("/valorant/v1/crosshair/generate?id={}", encode(code));

    if !force {
        let cached = {
            let conn = db.lock().await;
            cache::get_fresh(&conn, &path)?
        };
        if let Some((payload, _)) = cached {
            return Ok(payload);
        }
    }

    let bytes = client.get_raw_bytes(&path, api_key).await?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    {
        let conn = db.lock().await;
        cache::set(&conn, &path, &encoded, TTL_CROSSHAIR)?;
    }
    Ok(encoded)
}
