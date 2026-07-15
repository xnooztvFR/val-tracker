//! Données locales : historique de recherche, favoris, snapshots de rank, notes perso,
//! objectifs de progression (rang + hebdo).

use tauri::State;

use super::CommandError;
use crate::db::{ProgressionGoal, RankSnapshot, TrackedPlayer};
use crate::AppState;

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

/// Longueur max d'une note perso — une note libre n'a jamais besoin de dépasser ça, et ça
/// évite qu'une chaîne non bornée finisse en SQLite sans limite (contrairement à
/// `save_notes_pin` qui rejette au moins le vide).
const MAX_NOTES_LEN: usize = 2000;

/// Backlog #12 : note libre sur un joueur suivi (Home.tsx).
#[tauri::command]
pub async fn save_player_notes(
    state: State<'_, AppState>,
    puuid: String,
    notes: String,
) -> Result<(), CommandError> {
    if notes.chars().count() > MAX_NOTES_LEN {
        return Err(CommandError::Unknown {
            message: format!("la note dépasse {MAX_NOTES_LEN} caractères"),
        });
    }
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

/// Backlog #55 : objectifs hebdomadaires custom ("X matchs cette semaine", "winrate ≥ 50%"),
/// en complément de l'objectif de rang ci-dessus — même table (`progression_goals`),
/// distingués par `goal_type`.
#[tauri::command]
pub async fn list_weekly_goals(
    state: State<'_, AppState>,
    puuid: String,
) -> Result<Vec<ProgressionGoal>, CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::list_weekly_goals(&conn, &puuid)?)
}

#[tauri::command]
pub async fn save_weekly_goal(
    state: State<'_, AppState>,
    puuid: String,
    goal_type: String,
    target_value: i64,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::set_weekly_goal(&conn, &puuid, &goal_type, target_value)?)
}

#[tauri::command]
pub async fn clear_weekly_goal(
    state: State<'_, AppState>,
    puuid: String,
    goal_type: String,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::clear_weekly_goal(&conn, &puuid, &goal_type)?)
}
