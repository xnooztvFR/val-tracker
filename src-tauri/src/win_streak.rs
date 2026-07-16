//! TODO Fonctionnalités#5 : pendant positif de `loss_streak.rs` — détection de série de
//! victoires côté "mes comptes", même structure (dédup via
//! `tracked_players.last_win_streak_notified_match_id`, seuil global
//! `settings::AppSettings::win_streak_alert_count`, opt-in comme son pendant négatif).

use crate::api::henrik::types::MatchEntry;

/// Notifie si le compte "à soi" (`tracked_players.is_self`) correspondant à `name#tag`
/// enchaîne `threshold` victoires d'affilée sur ses matchs les plus récents (`matches[0]` en
/// tête, comme renvoyé par Henrik). Ne notifie jamais deux fois pour la même série (dédup via
/// `tracked_players.last_win_streak_notified_match_id`). Best-effort et silencieux : aucune
/// erreur ne doit remonter jusqu'à `commands::fetch_matches`.
pub fn maybe_notify(
    app: &tauri::AppHandle,
    conn: &rusqlite::Connection,
    name: &str,
    tag: &str,
    matches: &[MatchEntry],
    default_threshold: i64,
) {
    let Some(puuid) = matches.iter().find_map(|entry| {
        entry.players.iter().find_map(|p| {
            let matches_riot_id = p.name.as_deref().is_some_and(|n| n.eq_ignore_ascii_case(name))
                && p.tag.as_deref().is_some_and(|t| t.eq_ignore_ascii_case(tag));
            matches_riot_id.then(|| p.puuid.clone()).flatten()
        })
    }) else {
        return;
    };

    let Ok(Some(account)) = crate::db::find_tracked_player(conn, &puuid) else {
        return;
    };
    if !account.is_self {
        return;
    }
    if default_threshold < 1 {
        return;
    }
    let threshold = default_threshold;

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
        if !won {
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
    let already_notified = crate::db::last_win_streak_notified_match_id(conn, &puuid)
        .ok()
        .flatten()
        .as_deref()
        == Some(latest_match_id.as_str());
    if already_notified {
        return;
    }
    if let Err(e) = crate::db::set_last_win_streak_notified_match_id(conn, &puuid, &latest_match_id) {
        crate::applog!("[win_streak] échec d'écriture de la dédup ({puuid}): {e}");
    }

    use tauri_plugin_notification::NotificationExt;
    let _ = app
        .notification()
        .builder()
        .title("Série de victoires !")
        .body(format!("{threshold} victoires d'affilée — sur ta lancée !"))
        .show();
}
