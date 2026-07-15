//! Backlog #24 : détection de série de défaites côté "mes comptes" — extrait de
//! `commands.rs` (voir `aidd_docs/tasks/2026_07/2026_07_14_audit/report.md`, la commande
//! ne doit rester qu'un orchestrateur fin, la logique métier vit ici).

use crate::api::henrik::types::MatchEntry;

/// Notifie si le compte "à soi" (`tracked_players.is_self`) correspondant à `name#tag`
/// enchaîne `threshold` défaites d'affilée sur ses matchs les plus récents (`matches[0]` en
/// tête, comme renvoyé par Henrik). `default_threshold` est le seuil global
/// (`settings::AppSettings::loss_streak_alert_count`) — surchargé si ce compte a une valeur
/// dans `tracked_players.loss_streak_alert_count` (TODO Social/multi-comptes : seuil
/// différencié par compte, voir `db::set_loss_streak_alert_count_override`). Ne notifie
/// jamais deux fois pour la même série (dédup via
/// `tracked_players.last_loss_streak_notified_match_id`). Best-effort et silencieux : aucune
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
    let threshold = account.loss_streak_alert_count.unwrap_or(default_threshold);
    if threshold < 1 {
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
    if let Err(e) = crate::db::set_last_loss_streak_notified_match_id(conn, &puuid, &latest_match_id) {
        crate::applog!("[loss_streak] échec d'écriture de la dédup ({puuid}): {e}");
    }

    use tauri_plugin_notification::NotificationExt;
    let _ = app
        .notification()
        .builder()
        .title("Série de défaites")
        .body(format!("{threshold} défaites d'affilée — une petite pause ?"))
        .show();
}
