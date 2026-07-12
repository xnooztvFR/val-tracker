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
use crate::db::{DuoStat, ProgressionGoal, RankSnapshot, SquadStat, TrackedPlayer};
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
                crate::applog!("[henrik] échec de désérialisation: {e}");
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

/// Rejette une valeur hors de la liste attendue — les settings énumérés sont contraints
/// côté frontend (boutons radio), mais la commande reste la seule porte d'entrée vers le
/// stockage et ne doit pas faire confiance à la webview pour ça.
fn ensure_one_of(value: &str, allowed: &[&str], field: &str) -> Result<(), CommandError> {
    if allowed.contains(&value) {
        Ok(())
    } else {
        Err(CommandError::Unknown {
            message: format!("{field} invalide: attendu l'un de {allowed:?}"),
        })
    }
}

#[tauri::command]
pub async fn save_default_region(
    state: State<'_, AppState>,
    region: String,
) -> Result<(), CommandError> {
    // Superset des régions proposées par le frontend (REGIONS de lib/format.ts) : les
    // régions Henrik valides restent acceptées même si l'UI n'en liste que 4.
    ensure_one_of(&region, &["eu", "na", "ap", "kr", "latam", "br"], "region")?;
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

/// Backlog #50 : active/désactive l'accumulation locale de métriques d'usage (cache hit
/// rate, erreurs API) — opt-in, 100% local, voir `api::henrik::endpoints::
/// record_usage_if_enabled`.
#[tauri::command]
pub async fn save_usage_metrics_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_usage_metrics_enabled(&conn, enabled)?;
    Ok(())
}

/// Backlog #33 : `"dark"` | `"light"`.
#[tauri::command]
pub async fn save_ui_theme(state: State<'_, AppState>, theme: String) -> Result<(), CommandError> {
    ensure_one_of(&theme, &["dark", "light"], "theme")?;
    let conn = state.db.lock().await;
    crate::settings::set_ui_theme(&conn, &theme)?;
    Ok(())
}

/// Backlog #38 : `"red"` | `"cyan"` | `"violet"` | `"amber"`.
#[tauri::command]
pub async fn save_ui_accent(
    state: State<'_, AppState>,
    accent: String,
) -> Result<(), CommandError> {
    ensure_one_of(&accent, &["red", "cyan", "violet", "amber"], "accent")?;
    let conn = state.db.lock().await;
    crate::settings::set_ui_accent(&conn, &accent)?;
    Ok(())
}

/// Backlog #31 : `"compact"` | `"detailed"`.
#[tauri::command]
pub async fn save_overlay_density(
    state: State<'_, AppState>,
    density: String,
) -> Result<(), CommandError> {
    ensure_one_of(&density, &["compact", "detailed"], "density")?;
    let conn = state.db.lock().await;
    crate::settings::set_overlay_density(&conn, &density)?;
    Ok(())
}

/// Backlog #24 : toggle + seuil de l'alerte "N défaites d'affilée" (comptes "à soi"
/// uniquement — voir `fetch_matches` pour le check déclenché après chaque refetch).
#[tauri::command]
pub async fn save_loss_streak_alert_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_loss_streak_alert_enabled(&conn, enabled)?;
    Ok(())
}

#[tauri::command]
pub async fn save_loss_streak_alert_count(
    state: State<'_, AppState>,
    count: i64,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_loss_streak_alert_count(&conn, count)?;
    Ok(())
}

/// Backlog #32 : toggle + seuil (en jours) du rappel d'inactivité — voir
/// `inactivity_reminder.rs`.
#[tauri::command]
pub async fn save_inactivity_reminder_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_inactivity_reminder_enabled(&conn, enabled)?;
    Ok(())
}

#[tauri::command]
pub async fn save_inactivity_reminder_days(
    state: State<'_, AppState>,
    days: i64,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_inactivity_reminder_days(&conn, days)?;
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

    let auth = crate::api::henrik::HenrikAuth::Direct(api_key.to_string());
    match state.henrik.get_raw("/valorant/v2/account/Henrik/DEV", &auth).await {
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
        api_key.as_ref(),
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
        api_key.as_ref(),
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
    app: tauri::AppHandle,
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
        api_key.as_ref(),
        &region,
        &name,
        &tag,
        size,
        force,
    )
    .await?;

    {
        let conn = state.db.lock().await;
        if let Ok(settings) = crate::settings::load_settings(&conn) {
            if settings.loss_streak_alert_enabled {
                maybe_notify_loss_streak(
                    &app,
                    &conn,
                    &name,
                    &tag,
                    &result.data,
                    settings.loss_streak_alert_count,
                );
            }
        }
    }

    Ok(result)
}

/// Backlog #24 : notifie si le compte "à soi" (`tracked_players.is_self`) correspondant à
/// `name#tag` enchaîne `threshold` défaites d'affilée sur ses matchs les plus récents
/// (`matches[0]` en tête, comme renvoyé par Henrik). Ne notifie jamais deux fois pour la
/// même série (dédup via `tracked_players.last_loss_streak_notified_match_id`). Best-effort
/// et silencieux : aucune erreur ne doit remonter jusqu'à `fetch_matches`.
fn maybe_notify_loss_streak(
    app: &tauri::AppHandle,
    conn: &rusqlite::Connection,
    name: &str,
    tag: &str,
    matches: &[MatchEntry],
    threshold: i64,
) {
    if threshold < 1 {
        return;
    }
    let Some(puuid) = matches.iter().find_map(|entry| {
        entry.players.iter().find_map(|p| {
            let matches_riot_id = p.name.as_deref().is_some_and(|n| n.eq_ignore_ascii_case(name))
                && p.tag.as_deref().is_some_and(|t| t.eq_ignore_ascii_case(tag));
            matches_riot_id.then(|| p.puuid.clone()).flatten()
        })
    }) else {
        return;
    };

    let is_self = crate::db::list_self_accounts(conn)
        .map(|accounts| accounts.iter().any(|a| a.puuid == puuid))
        .unwrap_or(false);
    if !is_self {
        return;
    }

    let mut streak = 0i64;
    let mut latest_match_id: Option<String> = None;
    for entry in matches {
        let Some(player) = entry.players.iter().find(|p| p.puuid.as_deref() == Some(puuid.as_str())) else {
            break;
        };
        let Some(team_id) = &player.team_id else { break };
        let Some(won) = entry
            .teams
            .iter()
            .find(|t| t.team_id.as_deref() == Some(team_id.as_str()))
            .and_then(|t| t.won)
        else {
            break;
        };
        if latest_match_id.is_none() {
            latest_match_id = entry.metadata.match_id.clone();
        }
        if won {
            break;
        }
        streak += 1;
        if streak >= threshold {
            break;
        }
    }

    if streak < threshold {
        return;
    }
    let Some(latest_match_id) = latest_match_id else { return };
    let already_notified = crate::db::last_loss_streak_notified_match_id(conn, &puuid)
        .ok()
        .flatten()
        .as_deref()
        == Some(latest_match_id.as_str());
    if already_notified {
        return;
    }
    let _ = crate::db::set_last_loss_streak_notified_match_id(conn, &puuid, &latest_match_id);

    use tauri_plugin_notification::NotificationExt;
    let _ = app
        .notification()
        .builder()
        .title("Série de défaites")
        .body(format!("{threshold} défaites d'affilée — une petite pause ?"))
        .show();
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
        api_key.as_ref(),
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
        api_key.as_ref(),
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
        api_key.as_ref(),
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
        api_key.as_ref(),
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
        api_key.as_ref(),
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
        api_key.as_ref(),
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
        api_key.as_ref(),
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
        api_key.as_ref(),
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
            api_key.as_ref(),
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
            api_key.as_ref(),
            name,
            tag,
        )
        .await?);
    }
    if let Some(team_id) = &team_id {
        return Ok(crate::api::henrik::endpoints_premier::get_premier_team_by_id(
            &state.db,
            &state.henrik,
            api_key.as_ref(),
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
                api_key.as_ref(),
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
                api_key.as_ref(),
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
        api_key.as_ref(),
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
            api_key.as_ref(),
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
        api_key.as_ref(),
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
        api_key.as_ref(),
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
            api_key.as_ref(),
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
        api_key.as_ref(),
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
            api_key.as_ref(),
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
        api_key.as_ref(),
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

/// Backlog #23 : extension "squad" (trios) de `list_duo_stats`.
#[tauri::command]
pub async fn list_squad_stats(
    state: State<'_, AppState>,
    puuid: String,
    min_matches: i64,
) -> Result<Vec<SquadStat>, CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::list_squad_stats(&conn, &puuid, min_matches.max(1))?)
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

/// Backlog #27 : favoris dans leur ordre explicite (drag & drop), distinct de
/// `list_tracked_players` qui trie par date de consultation.
#[tauri::command]
pub async fn list_favorite_players(
    state: State<'_, AppState>,
) -> Result<Vec<TrackedPlayer>, CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::list_favorite_players(&conn)?)
}

#[tauri::command]
pub async fn reorder_favorite_players(
    state: State<'_, AppState>,
    ordered_puuids: Vec<String>,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::reorder_favorites(&conn, &ordered_puuids)?)
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

/// Backlog #12 : note libre sur un joueur suivi (Home.tsx).
#[tauri::command]
pub async fn save_player_notes(
    state: State<'_, AppState>,
    puuid: String,
    notes: String,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::set_player_notes(&conn, &puuid, &notes)?)
}

/// Backlog #13 : objectif de progression ("atteindre Diamant 2") pour un joueur suivi.
#[tauri::command]
pub async fn get_progression_goal(
    state: State<'_, AppState>,
    puuid: String,
) -> Result<Option<ProgressionGoal>, CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::get_progression_goal(&conn, &puuid)?)
}

#[tauri::command]
pub async fn save_progression_goal(
    state: State<'_, AppState>,
    puuid: String,
    target_tier: i64,
    target_tier_patched: String,
    target_rr: Option<i64>,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::set_progression_goal(
        &conn,
        &puuid,
        target_tier,
        &target_tier_patched,
        target_rr,
    )?)
}

#[tauri::command]
pub async fn clear_progression_goal(
    state: State<'_, AppState>,
    puuid: String,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::clear_progression_goal(&conn, &puuid)?)
}

// ---- V4 : "Mon compte" — lier son propre compte Valorant sans RSO ----
//
// Pas d'OAuth Riot officiel possible pour une petite app tierce (RSO est réservé aux
// partenaires approuvés par Riot) : on se contente donc de marquer un Riot ID déjà
// consulté comme "à soi" (favori spécial, `tracked_players.is_self`), avec une détection
// best-effort du Riot ID local via le lockfile pour éviter à l'utilisateur de le retaper.

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

// ---- Logs consultables (backlog #49) ----

/// Nombre maximal d'octets relus depuis la fin du fichier de log — un utilisateur qui
/// ouvre Paramètres → Logs veut voir ce qui vient de se passer, pas tout l'historique.
const LOG_TAIL_BYTES: usize = 200_000;

#[derive(Serialize)]
pub struct LogSnapshot {
    pub path: Option<String>,
    pub content: String,
}

/// Lit la fin du fichier de log local pour l'écran Paramètres → Logs — aucun appel
/// réseau, best-effort (chaîne vide si le fichier n'existe pas encore ou est illisible).
#[tauri::command]
pub fn get_recent_logs() -> LogSnapshot {
    LogSnapshot {
        path: crate::applog::path(),
        content: crate::applog::tail(LOG_TAIL_BYTES),
    }
}

// ---- Auto-update — vérification d'intégrité (backlog #97) ----

/// Vérifie le SHA256 de l'installeur pointé par `url` contre `expected_sha256` (champ
/// custom de `latest.json`, en plus de la signature Ed25519 déjà vérifiée par
/// `tauri-plugin-updater` avant l'installation — voir `updater.rs`). Best-effort : une
/// erreur réseau ici ne doit pas empêcher `downloadAndInstall` de retenter côté plugin,
/// l'appelant (useUpdater.ts) traite `Err`/`false` comme "vérification indisponible ou
/// échouée" et bloque l'installation dans les deux cas.
#[tauri::command]
pub async fn verify_update_hash(url: String, expected_sha256: String) -> Result<bool, CommandError> {
    crate::updater::verify_download_sha256(&url, &expected_sha256)
        .await
        .map_err(CommandError::from)
}

// ---- Verrou PIN des notes perso (backlog #99) ----

/// Active le verrou et enregistre `pin` (chiffré via DPAPI, voir `settings::set_notes_pin`).
/// `pin` vide rejeté ici plutôt que côté frontend seul — la commande reste la seule porte
/// d'entrée vers le stockage.
#[tauri::command]
pub async fn save_notes_pin(state: State<'_, AppState>, pin: String) -> Result<(), CommandError> {
    let pin = pin.trim();
    if pin.is_empty() {
        return Err(CommandError::Unknown {
            message: "le PIN ne peut pas être vide".to_string(),
        });
    }
    let conn = state.db.lock().await;
    crate::settings::set_notes_pin(&conn, pin)?;
    Ok(())
}

/// Désactive le verrou et efface le PIN enregistré.
#[tauri::command]
pub async fn clear_notes_pin(state: State<'_, AppState>) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::clear_notes_pin(&conn)?;
    Ok(())
}

/// Vérifie `pin` contre celui enregistré — utilisé par `PlayerNotesPanel.tsx` pour
/// déverrouiller l'affichage des notes le temps de la session courante (pas de "déverrouillé"
/// persistant, cohérent avec l'usage stream/écran partagé visé par #99).
#[tauri::command]
pub async fn verify_notes_pin(state: State<'_, AppState>, pin: String) -> Result<bool, CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::settings::verify_notes_pin(&conn, pin.trim())?)
}

// ---- Images externes VLR/esports (backlog #100) ----

/// Récupère un logo/avatar hébergé sur un CDN tiers (voir `image_proxy.rs`) et le renvoie en
/// `data:` URI, pour l'afficher sans étendre `img-src` à un domaine externe non garanti dans
/// le temps.
#[tauri::command]
pub async fn fetch_external_image(url: String) -> Result<String, CommandError> {
    crate::image_proxy::fetch_as_data_uri(&url)
        .await
        .map_err(CommandError::from)
}

// ---- Métriques d'usage local (backlog #50) ----

const USAGE_METRICS_WINDOW_SECS: i64 = 7 * 24 * 3600;

/// Résumé des métriques d'usage sur les 7 derniers jours pour le dashboard Paramètres →
/// Santé — vide (tout à zéro) si `usage_metrics_enabled` n'a jamais été activé, aucun
/// appel réseau ici, juste une lecture SQLite locale.
#[tauri::command]
pub async fn get_usage_metrics_summary(
    state: State<'_, AppState>,
) -> Result<crate::db::UsageMetricsSummary, CommandError> {
    let conn = state.db.lock().await;
    let since = chrono::Utc::now().timestamp() - USAGE_METRICS_WINDOW_SECS;
    Ok(crate::db::usage_metrics_summary(&conn, since)?)
}
