//! Toutes les commandes exposées au frontend via `invoke()`. Reste volontairement fin :
//! la logique métier vit dans `db.rs` (état local) et `api::henrik` (Henrik Dev).

use serde::Serialize;
use tauri::State;

use crate::api::henrik::endpoints::Fetched;
use crate::api::henrik::types::{
    AccountData, EsportsScheduleEntry, LeaderboardData, MatchDetailData, MatchEntry, MmrData,
    MmrHistoryData, QueueStatusEntry, StatusData,
};
use crate::api::henrik::types_esports::{
    VlrEvent, VlrEventMatch, VlrMatchDetail, VlrPlayer, VlrPlayerMatch, VlrTeam, VlrTeamMatch,
};
use crate::api::henrik::types_premier::{PremierTeamDetail, PremierTeamHistory, PremierTeamLite};
use crate::api::henrik::HenrikError;
use crate::db::{DuoStat, RankSnapshot, TrackedPlayer};
use crate::settings::AppSettings;
use crate::AppState;

/// Erreur sérialisable renvoyée au frontend. Le champ `kind` permet à l'UI de distinguer
/// rate-limit / 404 / panne réseau / clé manquante (voir README §6 "Gestion des erreurs").
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CommandError {
    MissingApiKey,
    NotFound,
    RateLimited { retry_after_secs: Option<u64> },
    CircuitOpen,
    Network { message: String },
    Api { status: u16, message: String },
    Database { message: String },
    Unknown { message: String },
}

impl From<HenrikError> for CommandError {
    fn from(err: HenrikError) -> Self {
        match err {
            HenrikError::MissingApiKey => CommandError::MissingApiKey,
            HenrikError::NotFound => CommandError::NotFound,
            HenrikError::RateLimited { retry_after_secs } => {
                CommandError::RateLimited { retry_after_secs }
            }
            HenrikError::CircuitOpen => CommandError::CircuitOpen,
            HenrikError::Network(e) => CommandError::Network {
                message: e.to_string(),
            },
            HenrikError::Api { status, message } => CommandError::Api { status, message },
            HenrikError::Database(e) => CommandError::Database {
                message: e.to_string(),
            },
            HenrikError::Serde(e) => {
                eprintln!("[henrik] échec de désérialisation: {e}");
                CommandError::Unknown {
                    message: format!("réponse Henrik inattendue: {e}"),
                }
            }
        }
    }
}

impl From<rusqlite::Error> for CommandError {
    fn from(err: rusqlite::Error) -> Self {
        CommandError::Database {
            message: err.to_string(),
        }
    }
}

impl From<anyhow::Error> for CommandError {
    fn from(err: anyhow::Error) -> Self {
        CommandError::Unknown {
            message: err.to_string(),
        }
    }
}

// ---- Settings ----

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::settings::load_settings(&conn)?)
}

#[tauri::command]
pub async fn save_henrik_api_key(
    state: State<'_, AppState>,
    api_key: String,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_henrik_api_key(&conn, api_key.trim())?;
    Ok(())
}

#[tauri::command]
pub async fn save_default_region(
    state: State<'_, AppState>,
    region: String,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_default_region(&conn, &region)?;
    Ok(())
}

#[tauri::command]
pub async fn save_auto_update_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_auto_update_enabled(&conn, enabled)?;
    Ok(())
}

/// V2 : active/désactive la détection automatique de partie + overlay. Le poller relit
/// ce réglage à chaque tick, pas besoin de redémarrer l'app.
#[tauri::command]
pub async fn save_riot_local_disabled(
    state: State<'_, AppState>,
    disabled: bool,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_riot_local_disabled(&conn, disabled)?;
    Ok(())
}

/// V3 : active/désactive la Rich Presence Discord. Si on vient de désactiver, on efface
/// tout de suite l'activité affichée plutôt que d'attendre le prochain tick du poller.
#[tauri::command]
pub async fn save_discord_rpc_enabled(
    state: State<'_, AppState>,
    rpc: State<'_, crate::discord_rpc::DiscordRpcHandle>,
    enabled: bool,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_discord_rpc_enabled(&conn, enabled)?;
    if !enabled {
        rpc.clear();
    }
    Ok(())
}

#[tauri::command]
pub async fn save_discord_rpc_client_id(
    state: State<'_, AppState>,
    client_id: String,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_discord_rpc_client_id(&conn, &client_id)?;
    Ok(())
}

/// V3 : active/désactive le watcher de statut serveur/file d'attente en arrière-plan
/// (voir `status_watcher.rs`) — seul réglage qui déclenche un appel réseau périodique
/// même quand l'utilisateur ne regarde pas l'app, donc opt-in.
#[tauri::command]
pub async fn save_status_watcher_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_status_watcher_enabled(&conn, enabled)?;
    Ok(())
}

/// Teste une clé API Henrik candidate (pas forcément encore enregistrée) contre un
/// endpoint authentifié. Un 404 (joueur introuvable) compte comme "clé valide" : ça
/// prouve juste que l'authentification est passée.
#[tauri::command]
pub async fn verify_henrik_api_key(
    state: State<'_, AppState>,
    api_key: String,
) -> Result<bool, CommandError> {
    let api_key = api_key.trim();
    if api_key.is_empty() {
        return Ok(false);
    }

    match state.henrik.get_raw("/valorant/v2/account/Henrik/DEV", api_key).await {
        Ok(_) => Ok(true),
        Err(HenrikError::NotFound) => Ok(true),
        Err(HenrikError::Api { status: 401, .. }) | Err(HenrikError::Api { status: 403, .. }) => {
            Ok(false)
        }
        Err(err) => Err(err.into()),
    }
}

// ---- Henrik: compte / rank / matchs ----

#[tauri::command]
pub async fn fetch_account(
    state: State<'_, AppState>,
    name: String,
    tag: String,
    force: bool,
) -> Result<Fetched<AccountData>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };

    let result = crate::api::henrik::endpoints::get_account(
        &state.db,
        &state.henrik,
        api_key.as_deref(),
        &name,
        &tag,
        force,
    )
    .await?;

    {
        let conn = state.db.lock().await;
        let region = match result.data.region.clone() {
            Some(region) => region,
            None => crate::settings::load_settings(&conn)?.default_region,
        };
        crate::db::upsert_tracked_player(&conn, &result.data.puuid, &name, &tag, &region)?;
    }

    Ok(result)
}

#[tauri::command]
pub async fn fetch_mmr(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    puuid: String,
    region: String,
    name: String,
    tag: String,
    force: bool,
) -> Result<Fetched<MmrData>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };

    let result = crate::api::henrik::endpoints::get_mmr(
        &state.db,
        &state.henrik,
        api_key.as_deref(),
        &region,
        &name,
        &tag,
        force,
    )
    .await?;

    // On ne journalise un snapshot que si la donnée vient réellement du réseau, pour ne
    // pas empiler des points identiques à chaque relecture d'un cache encore frais.
    if result.from_network {
        if let Some(current) = &result.data.current_data {
            if let Some(tier) = current.currenttier {
                let tier_patched = current.currenttierpatched.as_deref().unwrap_or("Inconnu");
                let conn = state.db.lock().await;
                // V3 : lu avant l'insertion pour comparer avec le nouveau tier — c'est ce
                // qui alimente la notification de promotion/dérank (voir plus bas), sans
                // appel réseau supplémentaire : on observe juste ce que cette commande
                // récupère déjà.
                let previous = crate::db::latest_rank_snapshot(&conn, &puuid)?;
                crate::db::insert_rank_snapshot(
                    &conn,
                    &puuid,
                    tier,
                    tier_patched,
                    current.ranking_in_tier,
                )?;
                drop(conn);

                if let Some(previous) = previous {
                    if previous.tier != tier {
                        notify_rank_change(&app, &previous.tier_patched, tier_patched, tier > previous.tier);
                    }
                }
            }
        }
    }

    Ok(result)
}

/// Notification native de changement de rank (promotion/dérank) — voir la doc de
/// `fetch_mmr` pour le contexte. Best-effort, ne fait jamais échouer la commande.
fn notify_rank_change(app: &tauri::AppHandle, from: &str, to: &str, promoted: bool) {
    use tauri_plugin_notification::NotificationExt;

    let title = if promoted { "Promotion !" } else { "Dérank" };
    let _ = app
        .notification()
        .builder()
        .title(title)
        .body(format!("{from} → {to}"))
        .show();
}

#[tauri::command]
pub async fn fetch_matches(
    state: State<'_, AppState>,
    region: String,
    name: String,
    tag: String,
    size: u32,
    force: bool,
) -> Result<Fetched<Vec<MatchEntry>>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };

    let result = crate::api::henrik::endpoints::get_matches(
        &state.db,
        &state.henrik,
        api_key.as_deref(),
        &region,
        &name,
        &tag,
        size,
        force,
    )
    .await?;

    Ok(result)
}

#[tauri::command]
pub async fn fetch_mmr_history(
    state: State<'_, AppState>,
    region: String,
    name: String,
    tag: String,
    force: bool,
) -> Result<Fetched<MmrHistoryData>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };

    Ok(crate::api::henrik::endpoints::get_mmr_history(
        &state.db,
        &state.henrik,
        api_key.as_deref(),
        &region,
        &name,
        &tag,
        force,
    )
    .await?)
}

#[tauri::command]
pub async fn fetch_match_detail(
    state: State<'_, AppState>,
    match_id: String,
    force: bool,
) -> Result<Fetched<MatchDetailData>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };

    Ok(crate::api::henrik::endpoints::get_match_detail(
        &state.db,
        &state.henrik,
        api_key.as_deref(),
        &match_id,
        force,
    )
    .await?)
}

#[tauri::command]
pub async fn fetch_leaderboard(
    state: State<'_, AppState>,
    region: String,
    size: u32,
    start_index: u32,
    name: Option<String>,
    tag: Option<String>,
    force: bool,
) -> Result<Fetched<LeaderboardData>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };

    Ok(crate::api::henrik::endpoints::get_leaderboard(
        &state.db,
        &state.henrik,
        api_key.as_deref(),
        &region,
        size,
        start_index,
        name.as_deref(),
        tag.as_deref(),
        force,
    )
    .await?)
}

#[tauri::command]
pub async fn fetch_status(
    state: State<'_, AppState>,
    region: String,
) -> Result<Fetched<StatusData>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };

    Ok(crate::api::henrik::endpoints::get_status(
        &state.db,
        &state.henrik,
        api_key.as_deref(),
        &region,
        false,
    )
    .await?)
}

#[tauri::command]
pub async fn fetch_queue_status(
    state: State<'_, AppState>,
    region: String,
) -> Result<Fetched<Vec<QueueStatusEntry>>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };

    Ok(crate::api::henrik::endpoints::get_queue_status(
        &state.db,
        &state.henrik,
        api_key.as_deref(),
        &region,
        false,
    )
    .await?)
}

#[tauri::command]
pub async fn fetch_esports_schedule(
    state: State<'_, AppState>,
    region: Option<String>,
    league: Option<String>,
) -> Result<Fetched<Vec<EsportsScheduleEntry>>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };

    Ok(crate::api::henrik::endpoints::get_esports_schedule(
        &state.db,
        &state.henrik,
        api_key.as_deref(),
        region.as_deref(),
        league.as_deref(),
        false,
    )
    .await?)
}

/// Renvoie l'image du crosshair en base64 (data URL construite côté frontend), pour un
/// code de crosshair donné — outil de prévisualisation dans Paramètres.
#[tauri::command]
pub async fn fetch_crosshair_preview(
    state: State<'_, AppState>,
    code: String,
) -> Result<String, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };

    Ok(crate::api::henrik::endpoints::get_crosshair_preview(
        &state.db,
        &state.henrik,
        api_key.as_deref(),
        &code,
        false,
    )
    .await?)
}

// ---- Premier ----

#[tauri::command]
pub async fn search_premier_teams(
    state: State<'_, AppState>,
    name: Option<String>,
    tag: Option<String>,
) -> Result<Fetched<Vec<PremierTeamLite>>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };
    Ok(crate::api::henrik::endpoints_premier::search_premier_teams(
        &state.db,
        &state.henrik,
        api_key.as_deref(),
        name.as_deref(),
        tag.as_deref(),
    )
    .await?)
}

#[tauri::command]
pub async fn fetch_premier_leaderboard(
    state: State<'_, AppState>,
    region: String,
) -> Result<Fetched<Vec<PremierTeamLite>>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };
    Ok(
        crate::api::henrik::endpoints_premier::get_premier_leaderboard(
            &state.db,
            &state.henrik,
            api_key.as_deref(),
            &region,
        )
        .await?,
    )
}

#[tauri::command]
pub async fn fetch_premier_team(
    state: State<'_, AppState>,
    name: Option<String>,
    tag: Option<String>,
    team_id: Option<String>,
) -> Result<Fetched<PremierTeamDetail>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };
    if let (Some(name), Some(tag)) = (&name, &tag) {
        return Ok(crate::api::henrik::endpoints_premier::get_premier_team_by_name(
            &state.db,
            &state.henrik,
            api_key.as_deref(),
            name,
            tag,
        )
        .await?);
    }
    if let Some(team_id) = &team_id {
        return Ok(crate::api::henrik::endpoints_premier::get_premier_team_by_id(
            &state.db,
            &state.henrik,
            api_key.as_deref(),
            team_id,
        )
        .await?);
    }
    Err(CommandError::Unknown {
        message: "fetch_premier_team: fournir soit name+tag, soit team_id".to_string(),
    })
}

#[tauri::command]
pub async fn fetch_premier_team_history(
    state: State<'_, AppState>,
    name: Option<String>,
    tag: Option<String>,
    team_id: Option<String>,
) -> Result<Fetched<PremierTeamHistory>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };
    if let (Some(name), Some(tag)) = (&name, &tag) {
        return Ok(
            crate::api::henrik::endpoints_premier::get_premier_team_history_by_name(
                &state.db,
                &state.henrik,
                api_key.as_deref(),
                name,
                tag,
            )
            .await?,
        );
    }
    if let Some(team_id) = &team_id {
        return Ok(
            crate::api::henrik::endpoints_premier::get_premier_team_history_by_id(
                &state.db,
                &state.henrik,
                api_key.as_deref(),
                team_id,
            )
            .await?,
        );
    }
    Err(CommandError::Unknown {
        message: "fetch_premier_team_history: fournir soit name+tag, soit team_id".to_string(),
    })
}

// ---- Esport pro (VLR) ----

#[tauri::command]
pub async fn fetch_vlr_events(
    state: State<'_, AppState>,
    region: Option<String>,
    event_type: Option<String>,
    page: u32,
) -> Result<Fetched<Vec<VlrEvent>>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };
    Ok(crate::api::henrik::endpoints_esports::get_vlr_events(
        &state.db,
        &state.henrik,
        api_key.as_deref(),
        region.as_deref(),
        event_type.as_deref(),
        page,
    )
    .await?)
}

#[tauri::command]
pub async fn fetch_vlr_event_matches(
    state: State<'_, AppState>,
    event_id: u32,
) -> Result<Fetched<Vec<VlrEventMatch>>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };
    Ok(
        crate::api::henrik::endpoints_esports::get_vlr_event_matches(
            &state.db,
            &state.henrik,
            api_key.as_deref(),
            event_id,
        )
        .await?,
    )
}

#[tauri::command]
pub async fn fetch_vlr_match(
    state: State<'_, AppState>,
    match_id: u32,
) -> Result<Fetched<VlrMatchDetail>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };
    Ok(crate::api::henrik::endpoints_esports::get_vlr_match(
        &state.db,
        &state.henrik,
        api_key.as_deref(),
        match_id,
    )
    .await?)
}

#[tauri::command]
pub async fn fetch_vlr_team(
    state: State<'_, AppState>,
    team_id: u32,
) -> Result<Fetched<VlrTeam>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };
    Ok(crate::api::henrik::endpoints_esports::get_vlr_team(
        &state.db,
        &state.henrik,
        api_key.as_deref(),
        team_id,
    )
    .await?)
}

#[tauri::command]
pub async fn fetch_vlr_team_matches(
    state: State<'_, AppState>,
    team_id: u32,
    page: u32,
) -> Result<Fetched<Vec<VlrTeamMatch>>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };
    Ok(
        crate::api::henrik::endpoints_esports::get_vlr_team_matches(
            &state.db,
            &state.henrik,
            api_key.as_deref(),
            team_id,
            page,
        )
        .await?,
    )
}

#[tauri::command]
pub async fn fetch_vlr_player(
    state: State<'_, AppState>,
    player_id: u32,
    timespan: Option<String>,
) -> Result<Fetched<VlrPlayer>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };
    Ok(crate::api::henrik::endpoints_esports::get_vlr_player(
        &state.db,
        &state.henrik,
        api_key.as_deref(),
        player_id,
        timespan.as_deref(),
    )
    .await?)
}

#[tauri::command]
pub async fn fetch_vlr_player_matches(
    state: State<'_, AppState>,
    player_id: u32,
    page: u32,
) -> Result<Fetched<Vec<VlrPlayerMatch>>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };
    Ok(
        crate::api::henrik::endpoints_esports::get_vlr_player_matches(
            &state.db,
            &state.henrik,
            api_key.as_deref(),
            player_id,
            page,
        )
        .await?,
    )
}

/// V2 overlay : MMR d'un joueur détecté en partie, par PUUID (même cache/rate limiting
/// que le reste des appels Henrik).
#[tauri::command]
pub async fn fetch_mmr_by_puuid(
    state: State<'_, AppState>,
    puuid: String,
    region: String,
) -> Result<Fetched<MmrData>, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };

    Ok(crate::api::henrik::endpoints::get_mmr_by_puuid(
        &state.db,
        &state.henrik,
        api_key.as_deref(),
        &region,
        &puuid,
        false,
    )
    .await?)
}

/// V2 overlay : instantané de l'état de partie détecté (lu au montage de l'overlay ;
/// les mises à jour arrivent ensuite via l'event `riot-local://state`).
#[tauri::command]
pub fn get_live_state(
    live: State<'_, crate::riot_local::LiveState>,
) -> Result<crate::riot_local::LiveSnapshot, CommandError> {
    live.0
        .lock()
        .map(|guard| guard.clone())
        .map_err(|_| CommandError::Unknown {
            message: "état live indisponible".to_string(),
        })
}

/// V2 overlay : `true` si le raccourci global `Ctrl+Shift+V` a bien pu être enregistré au
/// démarrage. `false` s'il est déjà pris par une autre appli (ex: "coller sans formatage"
/// dans VS Code/Chrome/Slack) — l'UI Paramètres affiche alors un avertissement plutôt que
/// de laisser l'utilisateur découvrir en jeu que l'overlay ne peut pas être déplacé.
#[tauri::command]
pub fn get_overlay_shortcut_status(
    status: State<'_, crate::overlay::window::ShortcutStatus>,
) -> bool {
    status.0.load(std::sync::atomic::Ordering::Relaxed)
}

// ---- V3 : stats de duo/squad (party_id) ----

/// Reconstruit les co-occurrences de `party_id` pour ce match et les enregistre en local
/// (`db::record_party_match`) pour `tracked_puuid`. Ne fait *aucun* appel réseau : relit
/// simplement le détail de match déjà mis en cache par `fetch_match_detail` (appelé juste
/// avant par l'écran MatchDetail) — no-op silencieux si jamais rien n'est en cache. C'est
/// ce qui permet d'accumuler des stats de duo/squad sans jamais avoir à refetch les 100
/// derniers matchs d'un coup.
#[tauri::command]
pub async fn record_party_from_match(
    state: State<'_, AppState>,
    match_id: String,
    tracked_puuid: String,
) -> Result<(), CommandError> {
    let path = format!(
        "/valorant/v2/match/{}",
        crate::api::henrik::endpoints::encode(&match_id)
    );
    let payload = {
        let conn = state.db.lock().await;
        crate::api::henrik::cache::get_stale(&conn, &path)?
    };
    let Some((payload, _)) = payload else {
        return Ok(());
    };
    let envelope: crate::api::henrik::types::HenrikEnvelope<MatchDetailData> =
        match serde_json::from_str(&payload) {
            Ok(v) => v,
            Err(_) => return Ok(()),
        };
    let detail = envelope.data;

    let Some(me) = detail
        .players
        .all_players
        .iter()
        .find(|p| p.puuid == tracked_puuid)
    else {
        return Ok(());
    };
    let Some(my_party_id) = me.party_id.clone() else {
        return Ok(());
    };
    let won = team_won(&detail, &me.team);

    let conn = state.db.lock().await;
    for player in &detail.players.all_players {
        if player.puuid == tracked_puuid {
            continue;
        }
        if player.party_id.as_deref() != Some(my_party_id.as_str()) {
            continue;
        }
        crate::db::record_party_match(
            &conn,
            &match_id,
            &tracked_puuid,
            &player.puuid,
            &player.name,
            &player.tag,
            won,
        )?;
    }
    Ok(())
}

fn team_won(detail: &MatchDetailData, team: &str) -> bool {
    let team_data = if team.eq_ignore_ascii_case("red") {
        detail.teams.red.as_ref()
    } else if team.eq_ignore_ascii_case("blue") {
        detail.teams.blue.as_ref()
    } else {
        None
    };
    team_data.and_then(|t| t.has_won).unwrap_or(false)
}

#[tauri::command]
pub async fn list_duo_stats(
    state: State<'_, AppState>,
    puuid: String,
    min_matches: i64,
) -> Result<Vec<DuoStat>, CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::list_duo_stats(&conn, &puuid, min_matches.max(1))?)
}

// ---- Données locales (historique de recherche, favoris, snapshots de rank) ----

#[tauri::command]
pub async fn list_tracked_players(
    state: State<'_, AppState>,
    limit: i64,
) -> Result<Vec<TrackedPlayer>, CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::list_recent_players(&conn, limit)?)
}

#[tauri::command]
pub async fn toggle_favorite_player(
    state: State<'_, AppState>,
    puuid: String,
) -> Result<bool, CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::toggle_favorite(&conn, &puuid)?)
}

#[tauri::command]
pub async fn list_rank_snapshots(
    state: State<'_, AppState>,
    puuid: String,
) -> Result<Vec<RankSnapshot>, CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::list_rank_snapshots(&conn, &puuid)?)
}

/// Efface le cache API, l'historique de rank et l'historique de recherche (pas les
/// réglages) — écran Paramètres, section "Données locales".
#[tauri::command]
pub async fn reset_local_stats(state: State<'_, AppState>) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::reset_local_stats(&conn)?)
}
