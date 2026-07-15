//! `timeline_events` : frise "vie du compte" (backlog #57) — combine changements de rang,
//! objectifs hebdo atteints et note perso mise à jour sur un seul axe temporel.

use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct AccountTimelineEvent {
    /// "rank_change" | "goal_achieved" | "note_updated"
    pub event_type: String,
    pub occurred_at: i64,
    pub tier: Option<i64>,
    pub tier_patched: Option<String>,
    pub rr: Option<i64>,
    pub goal_type: Option<String>,
}

/// Backlog #57 : frise "vie du compte" — combine, sur un seul axe temporel trié du plus
/// récent au plus ancien : les changements de rang réels (dédupliqués depuis
/// `rank_snapshots`, qui contient désormais un point à chaque refresh MMR même sans
/// changement — voir l'auto-actualisation périodique de Home.tsx), les objectifs hebdo
/// atteints (`timeline_events`) et un marqueur "note mise à jour" (`tracked_players.
/// notes_updated_at`, seulement si une note est actuellement renseignée). Aucun appel
/// réseau : uniquement des données déjà locales.
pub fn list_account_timeline(
    conn: &Connection,
    puuid: &str,
) -> rusqlite::Result<Vec<AccountTimelineEvent>> {
    let mut events = Vec::new();

    // Dédup des paires (tier, rr) consécutives poussée en SQL via `LAG()` (SQLite ≥ 3.25,
    // disponible depuis longtemps dans le feature `bundled` de rusqlite) plutôt qu'en
    // mémoire côté Rust : un compte "à soi" suivi longtemps avec l'auto-refresh périodique
    // peut accumuler des milliers de lignes dans `rank_snapshots`, la dédup n'a pas besoin
    // de toutes les charger. `IS NOT` (et pas `!=`) traite deux NULL comme égaux, ce qui
    // reproduit exactement la comparaison `Option<i64>` faite précédemment côté Rust.
    let mut stmt = conn.prepare(
        "SELECT tier, tier_patched, rr, recorded_at FROM (
             SELECT tier, tier_patched, rr, recorded_at,
                    LAG(tier) OVER w AS prev_tier,
                    LAG(rr) OVER w AS prev_rr
             FROM rank_snapshots
             WHERE puuid = ?1
             WINDOW w AS (ORDER BY recorded_at ASC)
         )
         WHERE prev_tier IS NOT tier OR prev_rr IS NOT rr
         ORDER BY recorded_at ASC",
    )?;
    let snapshot_rows = stmt.query_map([puuid], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<i64>>(2)?,
            row.get::<_, i64>(3)?,
        ))
    })?;

    for row in snapshot_rows {
        let (tier, tier_patched, rr, recorded_at) = row?;
        events.push(AccountTimelineEvent {
            event_type: "rank_change".to_string(),
            occurred_at: recorded_at,
            tier: Some(tier),
            tier_patched: Some(tier_patched),
            rr,
            goal_type: None,
        });
    }
    drop(stmt);

    let mut stmt = conn.prepare(
        "SELECT goal_type, occurred_at FROM timeline_events
         WHERE puuid = ?1 AND event_type = 'goal_achieved'",
    )?;
    let goal_rows = stmt.query_map([puuid], |row| {
        Ok(AccountTimelineEvent {
            event_type: "goal_achieved".to_string(),
            occurred_at: row.get(1)?,
            tier: None,
            tier_patched: None,
            rr: None,
            goal_type: row.get(0)?,
        })
    })?;
    for event in goal_rows {
        events.push(event?);
    }
    drop(stmt);

    let notes_marker: Option<i64> = conn
        .query_row(
            "SELECT notes_updated_at FROM tracked_players
             WHERE puuid = ?1 AND notes IS NOT NULL AND notes_updated_at IS NOT NULL",
            [puuid],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(occurred_at) = notes_marker {
        events.push(AccountTimelineEvent {
            event_type: "note_updated".to_string(),
            occurred_at,
            tier: None,
            tier_patched: None,
            rr: None,
            goal_type: None,
        });
    }

    // `sort_by` est stable : en cas d'égalité de timestamp (deux événements enregistrés à
    // la même seconde, ex. deux refresh MMR rapprochés), on veut que le plus récemment
    // *inséré* apparaisse en premier — d'où le `reverse()` avant le tri plutôt qu'un tri
    // direct qui conserverait l'ordre d'insertion (le plus ancien en tête) pour les égalités.
    events.reverse();
    events.sort_by(|a, b| b.occurred_at.cmp(&a.occurred_at));
    Ok(events)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::goals::record_goal_achieved_event;
    use crate::db::players::{set_player_notes, upsert_tracked_player};
    use crate::db::snapshots::insert_rank_snapshot;

    fn memory_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn list_account_timeline_dedupes_consecutive_identical_rank_snapshots() {
        let conn = memory_conn();
        insert_rank_snapshot(&conn, "puuid-1", 10, "Argent 1", Some(20)).unwrap();
        // Refresh périodique sans changement de rang : ne doit pas produire un second
        // événement "rank_change" identique.
        insert_rank_snapshot(&conn, "puuid-1", 10, "Argent 1", Some(20)).unwrap();
        insert_rank_snapshot(&conn, "puuid-1", 11, "Argent 2", Some(5)).unwrap();

        let timeline = list_account_timeline(&conn, "puuid-1").unwrap();
        let rank_events: Vec<_> = timeline.iter().filter(|e| e.event_type == "rank_change").collect();
        assert_eq!(rank_events.len(), 2);
        // Trié du plus récent au plus ancien.
        assert_eq!(rank_events[0].tier, Some(11));
        assert_eq!(rank_events[1].tier, Some(10));
    }

    #[test]
    fn list_account_timeline_includes_goal_achieved_and_note_updated_markers() {
        let conn = memory_conn();
        upsert_tracked_player(&conn, "puuid-1", "Player1", "1234", "eu").unwrap();
        set_player_notes(&conn, "puuid-1", "smurf, duo régulier").unwrap();
        record_goal_achieved_event(&conn, "puuid-1", "weekly_matches", "2026-W03").unwrap();
        // Idempotent : rejouer le même événement ne duplique pas la ligne.
        record_goal_achieved_event(&conn, "puuid-1", "weekly_matches", "2026-W03").unwrap();

        let timeline = list_account_timeline(&conn, "puuid-1").unwrap();
        assert_eq!(timeline.iter().filter(|e| e.event_type == "goal_achieved").count(), 1);
        assert_eq!(timeline.iter().filter(|e| e.event_type == "note_updated").count(), 1);
    }

    #[test]
    fn list_account_timeline_omits_note_marker_once_note_is_cleared() {
        let conn = memory_conn();
        upsert_tracked_player(&conn, "puuid-1", "Player1", "1234", "eu").unwrap();
        set_player_notes(&conn, "puuid-1", "smurf").unwrap();
        set_player_notes(&conn, "puuid-1", "   ").unwrap();

        let timeline = list_account_timeline(&conn, "puuid-1").unwrap();
        assert!(timeline.iter().all(|e| e.event_type != "note_updated"));
    }
}
