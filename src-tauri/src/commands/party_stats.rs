//! V3 : stats de duo/squad/rivalité (party_id) + frise "vie du compte" (backlog #57).

use tauri::State;

use super::CommandError;
use crate::api::henrik::types::MatchDetailData;
use crate::db::{AccountTimelineEvent, DuoStat, FullRosterStat, MatchNote, RivalryStat, SquadStat};
use crate::AppState;

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
    let detail = {
        let conn = state.db.lock().await;
        crate::api::henrik::endpoints::get_cached_match_detail(&conn, &match_id)?
    };
    let Some(detail) = detail else {
        return Ok(());
    };

    let Some(me) = detail
        .players
        .all_players
        .iter()
        .find(|p| p.puuid == tracked_puuid)
    else {
        return Ok(());
    };
    let my_party_id = me.party_id.clone();
    let my_team = me.team.clone();
    let won = team_won(&detail, &me.team);

    let conn = state.db.lock().await;
    // Perf : une seule transaction pour toute la boucle plutôt qu'un commit implicite par
    // joueur (jusqu'à ~9 `INSERT` séparés sinon) — voir `db::reorder_favorites` pour le même
    // pattern.
    let tx = conn.unchecked_transaction()?;
    for player in &detail.players.all_players {
        if player.puuid == tracked_puuid {
            continue;
        }
        // Backlog #58 : réutilise cette même boucle (détail de match déjà en cache, aucun
        // appel réseau de plus) pour aussi enregistrer les adversaires — `relation`
        // distingue les deux cas dans `party_matches` (voir db::record_party_match).
        let relation = if player.team != my_team {
            "opponent"
        } else if my_party_id.as_deref().is_some() && player.party_id == my_party_id {
            "teammate"
        } else {
            continue;
        };
        crate::db::record_party_match(
            &tx,
            &match_id,
            &tracked_puuid,
            &player.puuid,
            &player.name,
            &player.tag,
            won,
            relation,
        )?;
    }
    tx.commit()?;
    Ok(())
}

/// Backlog #52 : winrate Attaque vs Défense agrégé sur tous les détails de match déjà en
/// cache pour ce puuid (aucun appel réseau — voir `side_stats::compute_side_winrate`).
#[tauri::command]
pub async fn get_side_winrate(
    state: State<'_, AppState>,
    puuid: String,
) -> Result<crate::side_stats::SideWinrateStat, CommandError> {
    let matches = {
        let conn = state.db.lock().await;
        crate::api::henrik::endpoints::get_cached_match_details_for_puuid(&conn, &puuid)?
    };

    Ok(crate::side_stats::compute_side_winrate(&matches, &puuid))
}

/// TODO stats & analyse joueur : winrate par type d'achat (eco/half-buy/full-buy) agrégé sur
/// tous les détails de match déjà en cache pour ce puuid (aucun appel réseau — voir
/// `economy_stats::compute_economy_stats`).
#[tauri::command]
pub async fn get_economy_stats(
    state: State<'_, AppState>,
    puuid: String,
) -> Result<crate::economy_stats::EconomyStat, CommandError> {
    let matches = {
        let conn = state.db.lock().await;
        crate::api::henrik::endpoints::get_cached_match_details_for_puuid(&conn, &puuid)?
    };

    Ok(crate::economy_stats::compute_economy_stats(&matches, &puuid))
}

/// TODO stats & analyse joueur : comparaison à la moyenne perso sur une carte (ADR/K/D/score)
/// agrégée sur tous les détails de match déjà en cache pour ce puuid sur cette carte (aucun
/// appel réseau — voir `map_averages::compute_map_average`).
#[tauri::command]
pub async fn get_map_average_stats(
    state: State<'_, AppState>,
    puuid: String,
    map: String,
) -> Result<Option<crate::map_averages::MapAverageStat>, CommandError> {
    let matches = {
        let conn = state.db.lock().await;
        crate::api::henrik::endpoints::get_cached_match_details_for_puuid(&conn, &puuid)?
    };

    Ok(crate::map_averages::compute_map_average(&matches, &puuid, &map))
}

/// TODO stats & analyse joueur : winrate solo-queue vs party (duo/squad) agrégé sur tous les
/// détails de match déjà en cache pour ce puuid (aucun appel réseau — voir
/// `queue_stats::compute_queue_stats`).
#[tauri::command]
pub async fn get_queue_stats(
    state: State<'_, AppState>,
    puuid: String,
) -> Result<crate::queue_stats::QueueStat, CommandError> {
    let matches = {
        let conn = state.db.lock().await;
        crate::api::henrik::endpoints::get_cached_match_details_for_puuid(&conn, &puuid)?
    };

    Ok(crate::queue_stats::compute_queue_stats(&matches, &puuid))
}

/// TODO Fonctionnalités#1 : "Tracker Score" composite /1000 (voir `tracker_score.rs`).
/// Contrairement à `get_side_winrate`/`get_economy_stats`/etc. (qui ne regardent que les
/// détails de match déjà en cache par navigation manuelle), cette commande **backfill
/// automatiquement** le cache de détail pour les `size` derniers matchs compétitifs de ce
/// joueur avant de calculer le score — le Tracker Score doit refléter tout l'historique
/// récent, pas seulement les quelques matchs que l'utilisateur a ouverts en détail. Chaque
/// appel `get_match_detail` reste cache-first (aucune requête réseau pour un match déjà
/// backfillé une fois) et passe par le même rate limiter/circuit breaker que le reste de
/// l'app, donc pas de rafale non maîtrisée même sur un profil jamais consulté. Le rang
/// courant (`current_tier`, déjà fetché via `fetch_mmr` côté frontend) choisit le bracket de
/// benchmarks — `None` retombe sur le bracket le plus indulgent (Iron/Bronze).
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn get_tracker_score(
    state: State<'_, AppState>,
    puuid: String,
    region: String,
    name: String,
    tag: String,
    current_tier: Option<i64>,
    size: u32,
) -> Result<crate::tracker_score::TrackerScoreResult, CommandError> {
    let api_key = {
        let conn = state.db.lock().await;
        crate::settings::get_henrik_api_key(&conn)?
    };

    let match_list = crate::api::henrik::endpoints::get_matches(
        &state.db,
        &state.henrik,
        api_key.as_ref(),
        &region,
        &name,
        &tag,
        size,
        false,
    )
    .await?;

    for entry in &match_list.data {
        let Some(match_id) = &entry.metadata.match_id else { continue };
        // Best-effort : un match individuellement indisponible (panne ponctuelle, match_id
        // orphelin) ne doit jamais empêcher le calcul du score sur le reste de l'historique.
        let _ = crate::api::henrik::endpoints::get_match_detail(
            &state.db,
            &state.henrik,
            api_key.as_ref(),
            match_id,
            false,
        )
        .await;
    }

    let matches = {
        let conn = state.db.lock().await;
        crate::api::henrik::endpoints::get_cached_match_details_for_puuid(&conn, &puuid)?
    };

    Ok(crate::tracker_score::compute_tracker_score(&matches, &puuid, current_tier))
}

/// TODO Fonctionnalités#4/#33 : moments forts (clutch 1vX, multikills) d'un match précis,
/// dérivés des `kill_events` déjà en cache (voir `highlights.rs`) — aucun appel réseau.
#[tauri::command]
pub async fn get_match_highlights(
    state: State<'_, AppState>,
    match_id: String,
    puuid: String,
) -> Result<Vec<crate::highlights::MatchHighlight>, CommandError> {
    let detail = {
        let conn = state.db.lock().await;
        crate::api::henrik::endpoints::get_cached_match_detail(&conn, &match_id)?
    };
    let Some(detail) = detail else {
        return Ok(vec![]);
    };
    Ok(crate::highlights::detect_match_highlights(&detail, &puuid))
}

/// TODO Fonctionnalités#4/#33 : moments forts agrégés sur tous les détails de match déjà en
/// cache pour ce puuid (aucun appel réseau) — utilisé pour le badge "moment fort" dans
/// l'historique de match sans devoir rouvrir chaque match un par un.
#[tauri::command]
pub async fn get_all_match_highlights(
    state: State<'_, AppState>,
    puuid: String,
) -> Result<Vec<crate::highlights::MatchHighlight>, CommandError> {
    let matches = {
        let conn = state.db.lock().await;
        crate::api::henrik::endpoints::get_cached_match_details_for_puuid(&conn, &puuid)?
    };
    Ok(crate::highlights::detect_highlights(&matches, &puuid))
}

/// TODO Social/multi-comptes#6/#40 : records personnels connus (kills/score) d'un ami suivi
/// (voir `friend_personal_bests.rs`/`friend_watcher.rs`) — utilisé côté UI en complément de
/// la notification OS de dépassement de record.
#[tauri::command]
pub async fn list_friend_personal_bests(
    state: State<'_, AppState>,
    puuid: String,
) -> Result<Vec<crate::db::FriendPersonalBest>, CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::list_personal_bests(&conn, &puuid)?)
}

/// TODO Fonctionnalités#14 : recommandation de carte/agent basée sur l'historique perso
/// (winrate), agrégée sur tous les détails de match déjà en cache pour ce puuid (aucun appel
/// réseau — voir `recommendations::compute_recommendations`).
#[tauri::command]
pub async fn get_recommendations(
    state: State<'_, AppState>,
    puuid: String,
    min_matches: i64,
) -> Result<crate::recommendations::RecommendationStats, CommandError> {
    let matches = {
        let conn = state.db.lock().await;
        crate::api::henrik::endpoints::get_cached_match_details_for_puuid(&conn, &puuid)?
    };

    Ok(crate::recommendations::compute_recommendations(&matches, &puuid, min_matches.max(1)))
}

/// TODO Social/multi-comptes : recherche manuelle d'un rival — au lieu d'attendre que
/// `record_party_from_match` le croise passivement en consultant un détail de match,
/// rétro-peuple `party_matches` (relation "opponent") pour tous les matchs *déjà en cache*
/// (`api_cache`, aucun appel réseau) où `puuid` et `opponent_name#opponent_tag` apparaissent
/// dans des équipes différentes. Contrairement à `record_party_from_match`, scanne tout
/// `api_cache` (voir `scan_all_cached_match_details`) et non les seuls matchs déjà indexés
/// dans `party_matches` — c'est justement le but : trouver un adversaire jamais encore
/// croisé côté rivalité. Renvoie le nombre de matchs rétro-peuplés (0 si aucun match en
/// cache ne contient cet adversaire face à ce compte).
#[tauri::command]
pub async fn retro_populate_rivalry(
    state: State<'_, AppState>,
    puuid: String,
    opponent_name: String,
    opponent_tag: String,
) -> Result<i64, CommandError> {
    let conn = state.db.lock().await;
    let details = crate::api::henrik::endpoints::scan_all_cached_match_details(&conn)?;

    let tx = conn.unchecked_transaction()?;
    let mut populated = 0i64;
    for detail in &details {
        let Some(match_id) = detail.metadata.matchid.clone() else {
            continue;
        };
        let Some(me) = detail.players.all_players.iter().find(|p| p.puuid == puuid) else {
            continue;
        };
        let Some(opponent) = detail.players.all_players.iter().find(|p| {
            p.team != me.team
                && p.name.eq_ignore_ascii_case(&opponent_name)
                && p.tag.eq_ignore_ascii_case(&opponent_tag)
        }) else {
            continue;
        };
        let won = team_won(detail, &me.team);
        crate::db::record_party_match(
            &tx,
            &match_id,
            &puuid,
            &opponent.puuid,
            &opponent.name,
            &opponent.tag,
            won,
            "opponent",
        )?;
        populated += 1;
    }
    tx.commit()?;
    Ok(populated)
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
    since_ts: Option<i64>,
) -> Result<Vec<DuoStat>, CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::list_duo_stats(&conn, &puuid, min_matches.max(1), since_ts)?)
}

/// Backlog #23 : extension "squad" (trios) de `list_duo_stats`.
#[tauri::command]
pub async fn list_squad_stats(
    state: State<'_, AppState>,
    puuid: String,
    min_matches: i64,
    since_ts: Option<i64>,
) -> Result<Vec<SquadStat>, CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::list_squad_stats(&conn, &puuid, min_matches.max(1), since_ts)?)
}

/// TODO Fonctionnalités#1 : historique de composition d'équipe — rosters complets à 5
/// (tracked_puuid + 4 coéquipiers) rencontrés plusieurs fois, avec leur bilan.
#[tauri::command]
pub async fn list_full_roster_stats(
    state: State<'_, AppState>,
    puuid: String,
    min_matches: i64,
    since_ts: Option<i64>,
) -> Result<Vec<FullRosterStat>, CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::list_full_roster_stats(&conn, &puuid, min_matches.max(1), since_ts)?)
}

/// Backlog #58 : rivalité suivie en continu — pendant "adversaire" de `list_duo_stats`.
#[tauri::command]
pub async fn list_rivalry_stats(
    state: State<'_, AppState>,
    puuid: String,
    min_matches: i64,
    since_ts: Option<i64>,
) -> Result<Vec<RivalryStat>, CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::list_rivalry_stats(&conn, &puuid, min_matches.max(1), since_ts)?)
}

/// Backlog #57 : marque un objectif hebdo comme atteint pour la période en cours — appelé
/// par WeeklyGoalsPanel.tsx dès que la progression calculée localement franchit la cible.
#[tauri::command]
pub async fn record_goal_achieved(
    state: State<'_, AppState>,
    puuid: String,
    goal_type: String,
    period_key: String,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::db::record_goal_achieved_event(&conn, &puuid, &goal_type, &period_key)?;
    Ok(())
}

/// Backlog #57 : frise "vie du compte" (rank_snapshots + objectifs atteints + note perso).
#[tauri::command]
pub async fn list_account_timeline(
    state: State<'_, AppState>,
    puuid: String,
) -> Result<Vec<AccountTimelineEvent>, CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::list_account_timeline(&conn, &puuid)?)
}

/// TODO Fonctionnalités#15 : notes horodatées liées à un match précis (voir
/// `db::match_notes`), affichées dans MatchDetail.tsx.
#[tauri::command]
pub async fn list_match_notes(
    state: State<'_, AppState>,
    match_id: String,
    puuid: String,
) -> Result<Vec<MatchNote>, CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::list_match_notes(&conn, &match_id, &puuid)?)
}

#[tauri::command]
pub async fn add_match_note(
    state: State<'_, AppState>,
    match_id: String,
    puuid: String,
    note: String,
) -> Result<MatchNote, CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::db::add_match_note(&conn, &match_id, &puuid, &note)?)
}

#[tauri::command]
pub async fn delete_match_note(state: State<'_, AppState>, id: i64) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::db::delete_match_note(&conn, id)?;
    Ok(())
}
