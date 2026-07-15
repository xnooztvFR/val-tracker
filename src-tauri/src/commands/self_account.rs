//! V4 : "Mon compte" — lier son propre compte Valorant sans RSO.
//!
//! Pas d'OAuth Riot officiel possible pour une petite app tierce (RSO est réservé aux
//! partenaires approuvés par Riot) : on se contente donc de marquer un Riot ID déjà
//! consulté comme "à soi" (favori spécial, `tracked_players.is_self`), avec une détection
//! best-effort du Riot ID local via le lockfile pour éviter à l'utilisateur de le retaper.

use serde::Serialize;
use tauri::State;

use super::CommandError;
use crate::db::TrackedPlayer;
use crate::AppState;

/// Marque/démarque un Riot ID déjà suivi (déjà présent dans `tracked_players` — donc déjà
/// consulté au moins une fois via `fetch_account`) comme l'un des comptes "à soi" de
/// l'utilisateur. Plusieurs comptes peuvent être marqués (multi-comptes/smurfs).
#[tauri::command]
pub async fn set_self_account(
    state: State<'_, AppState>,
    puuid: String,
    is_self: bool,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::set_self_account(&conn, &puuid, is_self)?)
}

#[tauri::command]
pub async fn list_self_accounts(state: State<'_, AppState>) -> Result<Vec<TrackedPlayer>, CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::list_self_accounts(&conn)?)
}

/// TODO Social/multi-comptes : surcharge (ou efface, si `None`) le seuil de notification
/// "N défaites d'affilée" pour un compte "à soi" spécifique — voir
/// `loss_streak.rs::maybe_notify`.
#[tauri::command]
pub async fn set_self_account_loss_streak_threshold(
    state: State<'_, AppState>,
    puuid: String,
    count: Option<i64>,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::set_loss_streak_alert_count_override(&conn, &puuid, count)?)
}

#[derive(Debug, Clone, Serialize)]
pub struct DetectedAccount {
    pub puuid: String,
    pub name: String,
    pub tag: String,
    pub region: String,
}

/// Détecte le Riot ID actuellement connecté dans le client Riot local (même lockfile que
/// `riot_local`), pour proposer "C'est vous ?" au premier lancement plutôt que de faire
/// retaper un Riot ID que l'app peut déjà déduire. Best-effort à tous les étages : renvoie
/// `Ok(None)` (jamais d'erreur bloquante) si le client Riot n'est pas lancé, si l'API
/// locale ne répond pas comme attendu, ou si aucune clé Henrik n'est configurée pour
/// résoudre nom/tag/région à partir du PUUID trouvé.
#[tauri::command]
pub async fn detect_local_account(
    state: State<'_, AppState>,
) -> Result<Option<DetectedAccount>, CommandError> {
    let Ok(Some(lockfile)) = crate::riot_local::lockfile::read_lockfile() else {
        return Ok(None);
    };
    let Ok(client) = crate::riot_local::client::build_local_client() else {
        return Ok(None);
    };
    let Ok(local_puuid) = crate::riot_local::client::fetch_local_puuid(&client, &lockfile).await
    else {
        return Ok(None);
    };

    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };
    let Some(api_key) = api_key else {
        return Ok(None);
    };

    let account = crate::api::henrik::endpoints::get_account_by_puuid(
        &state.db,
        &state.henrik,
        Some(&api_key),
        &local_puuid,
        false,
    )
    .await;

    let Ok(account) = account else {
        return Ok(None);
    };

    let region = match account.data.region {
        Some(region) => region,
        None => {
            let conn = state.db.lock().await;
            crate::settings::load_settings(&conn)?.default_region
        }
    };

    Ok(Some(DetectedAccount {
        puuid: account.data.puuid,
        name: account.data.name,
        tag: account.data.tag,
        region,
    }))
}
