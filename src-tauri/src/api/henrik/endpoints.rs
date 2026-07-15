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

use super::client::{HenrikAuth, HenrikClient};
use super::types::{
    AccountData, EsportsScheduleEntry, HenrikEnvelope, LeaderboardData, MatchDetailData,
    MatchEntry, MatchMetadata, MatchPlayer, MatchTeam, MmrData, MmrHistoryAccount,
    MmrHistoryData, MmrHistoryEntry, PlayerStats, QueueStatusEntry, StatusData, StoredMatch,
    StoredMmrEntry, TeamRounds,
};

/// Masque les segments de type UUID (puuid, match_id...) d'un chemin d'API avant de
/// l'écrire dans les logs — un puuid est une donnée personnelle, pas juste un détail de
/// debug.
fn redact_ids(path: &str) -> String {
    path.split('/')
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

/// Backlog #50 : accumule un évènement de métrique d'usage local si l'utilisateur a
/// activé `AppSettings::usage_metrics_enabled` — no-op sinon (défaut), pour ne pas payer
/// une écriture SQLite à chaque appel Henrik quand personne ne regarde le dashboard.
/// `duration_ms` mesure le temps de l'appel réseau (`None` pour un `CacheHit`, qui n'en a
/// pas) — alimente l'histogramme de latence du dashboard santé.
fn record_usage_if_enabled(
    conn: &Connection,
    kind: crate::db::UsageEventKind,
    duration_ms: Option<i64>,
) {
    let enabled = crate::settings::load_settings(conn)
        .map(|s| s.usage_metrics_enabled)
        .unwrap_or(false);
    if enabled {
        let _ = crate::db::record_usage_event(conn, kind, duration_ms);
    }
}

pub(crate) async fn fetch_with_cache<T: DeserializeOwned>(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: &HenrikAuth,
    path: &str,
    ttl: TtlSeconds,
    force: bool,
) -> Result<Fetched<T>, HenrikError> {
    if !force {
        let cached = {
            let conn = db.lock().await;
            let cached = cache::get_fresh(&conn, path)?;
            if cached.is_some() {
                record_usage_if_enabled(&conn, crate::db::UsageEventKind::CacheHit, None);
            }
            cached
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

    let network_started_at = std::time::Instant::now();
    match client.get_raw(path, api_key).await {
        Ok(body) => {
            let duration_ms = network_started_at.elapsed().as_millis() as i64;
            // On parse AVANT de cacher : un payload qui ne respecte pas le schéma
            // attendu (changement d'API, réponse tronquée) ne doit jamais être écrit
            // dans api_cache, sinon il empoisonne le cache pour toute la durée du TTL
            // (jusqu'à 24h pour un match) et chaque relecture échoue en boucle au lieu
            // de retenter le réseau.
            let envelope: HenrikEnvelope<T> = match serde_json::from_str(&body) {
                Ok(v) => v,
                Err(e) => {
                    let safe_path = redact_ids(path);
                    if cfg!(debug_assertions) {
                        let snippet: String = body.chars().take(800).collect();
                        crate::applog!("[henrik] parse échoué pour {safe_path}: {e}\n[henrik] corps (800 premiers caractères): {snippet}");
                    } else {
                        crate::applog!("[henrik] parse échoué pour {safe_path}: {e}");
                    }
                    return Err(HenrikError::Serde(e));
                }
            };
            let fetched_at = {
                let conn = db.lock().await;
                cache::set(&conn, path, &body, ttl)?;
                record_usage_if_enabled(&conn, crate::db::UsageEventKind::NetworkFetch, Some(duration_ms));
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
            let duration_ms = network_started_at.elapsed().as_millis() as i64;
            let stale = {
                let conn = db.lock().await;
                record_usage_if_enabled(&conn, crate::db::UsageEventKind::ApiError, Some(duration_ms));
                cache::get_stale(&conn, path)?
            };
            match stale {
                // Si le payload périmé ne parse plus (schéma Henrik changé depuis sa mise
                // en cache), on renvoie l'erreur réseau/API d'origine plutôt qu'une erreur
                // Serde trompeuse — l'UI doit afficher "panne réseau", pas "réponse
                // inattendue".
                Some((payload, expires_at)) => match serde_json::from_str::<HenrikEnvelope<T>>(&payload) {
                    Ok(envelope) => Ok(Fetched {
                        data: envelope.data,
                        stale: true,
                        from_network: false,
                        cached_at: Some(expires_at - ttl.0),
                    }),
                    Err(_) => Err(err),
                },
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
    api_key: Option<&HenrikAuth>,
    name: &str,
    tag: &str,
    force: bool,
) -> Result<Fetched<AccountData>, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let path = format!("/valorant/v2/account/{}/{}", encode(name), encode(tag));
    fetch_with_cache(db, client, api_key, &path, TTL_ACCOUNT, force).await
}

/// Variante by-puuid du compte, utilisée pour résoudre nom/tag/région à partir du PUUID
/// local détecté via l'API Riot locale (V4, liaison "Mon compte" sans RSO — voir
/// `commands::detect_local_account`).
pub async fn get_account_by_puuid(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&HenrikAuth>,
    puuid: &str,
    force: bool,
) -> Result<Fetched<AccountData>, HenrikError> {
    let api_key = api_key.ok_or(HenrikError::MissingApiKey)?;
    let path = format!("/valorant/v2/by-puuid/account/{}", encode(puuid));
    fetch_with_cache(db, client, api_key, &path, TTL_ACCOUNT, force).await
}

pub async fn get_mmr(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&HenrikAuth>,
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
    api_key: Option<&HenrikAuth>,
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
    api_key: Option<&HenrikAuth>,
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
    match fetch_with_cache(db, client, api_key, &path, TTL_MATCHES, force).await {
        Err(HenrikError::NotFound) => Err(HenrikError::NotFound),
        Err(live_err) => {
            match get_stored_matches(db, client, api_key, region, name, tag, size, force).await {
                Ok(stored) => Ok(Fetched {
                    data: stored.data.into_iter().map(stored_match_to_entry).collect(),
                    stale: true,
                    from_network: stored.from_network,
                    cached_at: stored.cached_at,
                }),
                Err(_) => Err(live_err),
            }
        }
        ok => ok,
    }
}

/// Repli "stored-matches" (v1) : n'expose que la ligne de stats du joueur demandé, pas le
/// roster complet — voir la doc de `types::StoredMatch`. Utilisé uniquement quand le live
/// v4 échoue (circuit breaker ouvert, panne API) ET qu'aucun cache frais/périmé n'existe
/// déjà pour absorber la panne (`fetch_with_cache` gère déjà ce cas normal).
async fn get_stored_matches(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: &HenrikAuth,
    region: &str,
    name: &str,
    tag: &str,
    size: u32,
    force: bool,
) -> Result<Fetched<Vec<StoredMatch>>, HenrikError> {
    let path = format!(
        "/valorant/v1/stored-matches/{}/{}/{}?size={}",
        encode(region),
        encode(name),
        encode(tag),
        size.clamp(1, 100)
    );
    fetch_with_cache(db, client, api_key, &path, TTL_MATCHES, force).await
}

/// Traduit une ligne "stored" (un seul joueur) en `MatchEntry` à un seul joueur — assez
/// pour qu'un écran de liste (map, date, KDA du joueur, victoire/défaite) reste utilisable
/// en repli, pas assez pour un détail de match complet (roster adverse absent).
fn stored_match_to_entry(stored: StoredMatch) -> MatchEntry {
    let own_team_is_red = stored.stats.team.eq_ignore_ascii_case("red");
    let (own_score, other_score) = if own_team_is_red {
        (stored.teams.red, stored.teams.blue)
    } else {
        (stored.teams.blue, stored.teams.red)
    };

    MatchEntry {
        metadata: MatchMetadata {
            match_id: Some(stored.meta.id),
            map: Some(stored.meta.map),
            queue: None,
            started_at: Some(stored.meta.started_at),
            game_length_in_ms: None,
        },
        players: vec![MatchPlayer {
            puuid: Some(stored.stats.puuid),
            name: None,
            tag: None,
            team_id: Some(stored.stats.team.clone()),
            agent: Some(stored.stats.character),
            stats: Some(PlayerStats {
                score: Some(stored.stats.score),
                kills: Some(stored.stats.kills),
                deaths: Some(stored.stats.deaths),
                assists: Some(stored.stats.assists),
                headshots: None,
                bodyshots: None,
                legshots: None,
            }),
        }],
        teams: vec![MatchTeam {
            team_id: Some(stored.stats.team),
            won: Some(own_score > other_score),
            rounds: Some(TeamRounds {
                won: Some(own_score),
                lost: Some(other_score),
            }),
        }],
    }
}

/// Historique de RR complet (au-delà des snapshots collectés localement) — utilisé pour
/// tracer la courbe de progression de rank dès la première visite d'un profil, sans
/// attendre plusieurs sessions de l'app.
pub async fn get_mmr_history(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&HenrikAuth>,
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
    match fetch_with_cache(db, client, api_key, &path, TTL_MMR_HISTORY, force).await {
        Err(HenrikError::NotFound) => Err(HenrikError::NotFound),
        Err(live_err) => {
            match get_stored_mmr_history(db, client, api_key, region, name, tag, force).await {
                Ok(stored) => Ok(Fetched {
                    data: MmrHistoryData {
                        account: MmrHistoryAccount {
                            name: Some(name.to_string()),
                            tag: Some(tag.to_string()),
                            puuid: None,
                        },
                        history: stored.data.into_iter().map(stored_mmr_to_entry).collect(),
                    },
                    stale: true,
                    from_network: stored.from_network,
                    cached_at: stored.cached_at,
                }),
                Err(_) => Err(live_err),
            }
        }
        ok => ok,
    }
}

/// Repli "stored-mmr-history" (v1) : mêmes champs essentiels (date/tier/rr/map) que la v2
/// live utilisée normalement, contrairement à `stored-matches` qui a une forme bien plus
/// pauvre — voir la doc de `types::StoredMmrEntry`.
async fn get_stored_mmr_history(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: &HenrikAuth,
    region: &str,
    name: &str,
    tag: &str,
    force: bool,
) -> Result<Fetched<Vec<StoredMmrEntry>>, HenrikError> {
    let path = format!(
        "/valorant/v1/stored-mmr-history/{}/{}/{}",
        encode(region),
        encode(name),
        encode(tag)
    );
    fetch_with_cache(db, client, api_key, &path, TTL_MMR_HISTORY, force).await
}

fn stored_mmr_to_entry(stored: StoredMmrEntry) -> MmrHistoryEntry {
    MmrHistoryEntry {
        date: Some(stored.date),
        elo: Some(stored.elo),
        last_change: Some(stored.last_mmr_change),
        rr: Some(stored.ranking_in_tier),
        match_id: Some(stored.match_id),
        refunded_rr: None,
        was_derank_protected: None,
        map: Some(stored.map),
        season: None,
        tier: Some(stored.tier),
    }
}

/// Détail complet d'un match (round par round, économie) — plus riche que l'entrée
/// correspondante dans `get_matches`, utilisé par l'écran de détail de match.
pub async fn get_match_detail(
    db: &Mutex<Connection>,
    client: &HenrikClient,
    api_key: Option<&HenrikAuth>,
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
    api_key: Option<&HenrikAuth>,
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
    api_key: Option<&HenrikAuth>,
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
    api_key: Option<&HenrikAuth>,
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
    api_key: Option<&HenrikAuth>,
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
    api_key: Option<&HenrikAuth>,
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

/// Relit un détail de match déjà en cache (aucun appel réseau) et le décode, pour un usage
/// hors du chemin `fetch_with_cache` habituel (ex: `commands::record_party_from_match`, qui
/// relit un détail déjà mis en cache par `fetch_match_detail` juste avant). `None` en cas de
/// cache-miss ou de payload qui ne parse plus (schéma Henrik changé) — no-op silencieux dans
/// les deux cas, comme le comportement d'origine.
pub fn get_cached_match_detail(
    conn: &Connection,
    match_id: &str,
) -> rusqlite::Result<Option<MatchDetailData>> {
    let path = format!("/valorant/v2/match/{}", encode(match_id));
    let Some((payload, _)) = cache::get_stale(conn, &path)? else {
        return Ok(None);
    };
    let decoded = serde_json::from_str::<HenrikEnvelope<MatchDetailData>>(&payload)
        .ok()
        .map(|envelope| envelope.data);
    Ok(decoded)
}

/// Détails de match déjà en cache pour tous les `match_id` que `puuid` a côtoyés (via
/// `db::party_matches`, alimentée par `record_party_from_match`) — borne le scan au sous-
/// ensemble pertinent plutôt qu'à tout le cache `api_cache` de l'app (backlog perf, voir
/// `commands::get_side_winrate`). Aucun appel réseau : matchs absents du cache ou dont le
/// payload ne parse plus sont simplement omis du résultat.
pub fn get_cached_match_details_for_puuid(
    conn: &Connection,
    puuid: &str,
) -> rusqlite::Result<Vec<MatchDetailData>> {
    let match_ids = crate::db::list_match_ids_for_puuid(conn, puuid)?;
    let mut details = Vec::with_capacity(match_ids.len());
    for match_id in match_ids {
        if let Some(detail) = get_cached_match_detail(conn, &match_id)? {
            details.push(detail);
        }
    }
    Ok(details)
}

/// TODO Social/multi-comptes : scanne *tout* `api_cache` pour les détails de match, pas
/// seulement ceux déjà indexés dans `party_matches` (contrairement à
/// `get_cached_match_details_for_puuid`, borné à `list_match_ids_for_puuid`) — utilisé par
/// `commands::retro_populate_rivalry` pour retrouver un adversaire jamais encore croisé côté
/// `party_matches` mais déjà présent dans un détail de match consulté (ex. MatchDetail.tsx)
/// avant que ce backlog n'existe. Plus lourd qu'un scan borné, mais reste local (aucun appel
/// réseau) et n'est déclenché qu'à la demande explicite de l'utilisateur, pas en continu.
pub fn scan_all_cached_match_details(conn: &Connection) -> rusqlite::Result<Vec<MatchDetailData>> {
    let mut stmt =
        conn.prepare("SELECT payload FROM api_cache WHERE url LIKE '/valorant/v2/match/%'")?;
    let payloads = stmt.query_map([], |row| row.get::<_, String>(0))?;
    let mut details = Vec::new();
    for payload in payloads {
        let payload = payload?;
        if let Ok(envelope) = serde_json::from_str::<HenrikEnvelope<MatchDetailData>>(&payload) {
            details.push(envelope.data);
        }
    }
    Ok(details)
}

#[cfg(test)]
mod redact_ids_tests {
    use super::*;

    #[test]
    fn masks_well_formed_uuid_segment() {
        let path = "/valorant/v2/by-puuid/account/2a4d1e3f-8b7c-4e2a-9f1d-6c5b4a3e2d1f";
        assert_eq!(
            redact_ids(path),
            "/valorant/v2/by-puuid/account/<id>"
        );
    }

    #[test]
    fn leaves_non_uuid_segments_untouched() {
        assert!(!is_uuid_like("match"));
        assert!(!is_uuid_like("account"));
        assert!(!is_uuid_like("Ascent"));
        assert_eq!(redact_ids("/valorant/v2/match"), "/valorant/v2/match");
    }

    #[test]
    fn masks_all_uuid_segments_when_path_has_several() {
        let path = "/valorant/v2/match/2a4d1e3f-8b7c-4e2a-9f1d-6c5b4a3e2d1f/player/7c1e9d2a-3f4b-4a5c-8d6e-1f2a3b4c5d6e";
        assert_eq!(redact_ids(path), "/valorant/v2/match/<id>/player/<id>");
    }

    #[test]
    fn path_without_uuid_segments_is_returned_unchanged() {
        let path = "/valorant/v1/status/eu";
        assert_eq!(redact_ids(path), path);
    }
}

#[cfg(test)]
mod stored_fallback_tests {
    use super::*;
    use super::super::types::{
        NamedRef, StoredMatchMeta, StoredMatchStats, StoredMatchTeamScore, TierRef,
    };

    fn sample_stored_match(team: &str, own: i64, other: i64) -> StoredMatch {
        let (red, blue) = if team.eq_ignore_ascii_case("red") {
            (own, other)
        } else {
            (other, own)
        };
        StoredMatch {
            meta: StoredMatchMeta {
                id: "match-1".to_string(),
                map: NamedRef {
                    id: None,
                    name: Some("Ascent".to_string()),
                },
                mode: "Competitive".to_string(),
                started_at: "2026-07-11T00:00:00Z".to_string(),
            },
            stats: StoredMatchStats {
                puuid: "puuid-1".to_string(),
                team: team.to_string(),
                character: NamedRef {
                    id: None,
                    name: Some("Jett".to_string()),
                },
                score: 250,
                kills: 20,
                deaths: 10,
                assists: 5,
            },
            teams: StoredMatchTeamScore { red, blue },
        }
    }

    #[test]
    fn stored_match_to_entry_marks_win_when_own_team_scores_higher() {
        let entry = stored_match_to_entry(sample_stored_match("Red", 13, 7));
        assert_eq!(entry.teams[0].won, Some(true));
        assert_eq!(entry.players[0].puuid.as_deref(), Some("puuid-1"));
    }

    #[test]
    fn stored_match_to_entry_marks_loss_when_own_team_scores_lower_on_blue_side() {
        let entry = stored_match_to_entry(sample_stored_match("Blue", 7, 13));
        assert_eq!(entry.teams[0].won, Some(false));
        assert_eq!(entry.metadata.map.unwrap().name.as_deref(), Some("Ascent"));
    }

    #[test]
    fn stored_mmr_to_entry_carries_over_rr_and_tier() {
        let entry = stored_mmr_to_entry(StoredMmrEntry {
            match_id: "match-1".to_string(),
            tier: TierRef {
                id: Some(21),
                name: Some("Immortal 1".to_string()),
            },
            map: NamedRef {
                id: None,
                name: Some("Bind".to_string()),
            },
            ranking_in_tier: 42,
            last_mmr_change: -15,
            elo: 1234,
            date: "2026-07-11".to_string(),
        });
        assert_eq!(entry.rr, Some(42));
        assert_eq!(entry.last_change, Some(-15));
        assert_eq!(entry.tier.unwrap().name.as_deref(), Some("Immortal 1"));
    }
}

#[cfg(test)]
mod scan_all_cached_match_details_tests {
    use super::*;
    use crate::api::henrik::types::{
        MatchDetailMetadata, MatchDetailPlayer, MatchDetailPlayers, MatchDetailTeams,
    };

    fn memory_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&conn).unwrap();
        conn
    }

    fn make_player(puuid: &str, team: &str) -> MatchDetailPlayer {
        MatchDetailPlayer {
            puuid: puuid.to_string(),
            name: "p".to_string(),
            tag: "1234".to_string(),
            team: team.to_string(),
            level: None,
            character: None,
            currenttier: None,
            currenttier_patched: None,
            party_id: None,
            assets: None,
            stats: None,
            economy: None,
            damage_made: None,
            damage_received: None,
        }
    }

    fn make_match(match_id: &str, players: Vec<MatchDetailPlayer>) -> MatchDetailData {
        MatchDetailData {
            metadata: MatchDetailMetadata {
                matchid: Some(match_id.to_string()),
                map: None,
                mode: None,
                queue: None,
                season_id: None,
                game_length: None,
                game_start: None,
                game_start_patched: None,
                rounds_played: None,
            },
            players: MatchDetailPlayers { all_players: players },
            teams: MatchDetailTeams { red: None, blue: None },
            rounds: vec![],
        }
    }

    fn store_match(conn: &Connection, match_id: &str, detail: &MatchDetailData) {
        let payload = serde_json::json!({ "status": 200, "data": detail }).to_string();
        let path = format!("/valorant/v2/match/{match_id}");
        cache::set(conn, &path, &payload, TtlSeconds(3600)).unwrap();
    }

    #[test]
    fn finds_matches_across_the_whole_cache_not_just_party_matches() {
        let conn = memory_conn();
        let detail = make_match(
            "match-1",
            vec![make_player("me", "Red"), make_player("nemesis", "Blue")],
        );
        store_match(&conn, "match-1", &detail);
        // Bruit : une autre entrée de cache sans rapport (pas un détail de match).
        cache::set(&conn, "/valorant/v1/account/foo/1234", "{}", TtlSeconds(3600)).unwrap();

        let found = scan_all_cached_match_details(&conn).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].metadata.matchid.as_deref(), Some("match-1"));
        assert_eq!(found[0].players.all_players.len(), 2);
    }

    #[test]
    fn ignores_unparsable_payloads() {
        let conn = memory_conn();
        cache::set(&conn, "/valorant/v2/match/broken", "not json", TtlSeconds(3600)).unwrap();

        assert!(scan_all_cached_match_details(&conn).unwrap().is_empty());
    }
}
