//! `rank_snapshots` : historique de rank dans le temps, pour tracer une courbe de
//! progression même quand Henrik ne renvoie pas d'historique long pour un joueur donné.

use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct RankSnapshot {
    pub tier: i64,
    pub tier_patched: String,
    pub rr: Option<i64>,
    pub recorded_at: i64,
}

pub fn insert_rank_snapshot(
    conn: &Connection,
    puuid: &str,
    tier: i64,
    tier_patched: &str,
    rr: Option<i64>,
) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "INSERT INTO rank_snapshots (puuid, tier, tier_patched, rr, recorded_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        (puuid, tier, tier_patched, rr, now),
    )?;
    Ok(())
}

/// Dernier snapshot connu pour ce joueur (le plus récent), utilisé pour détecter une
/// promotion/dérank juste avant d'insérer le nouveau (voir `commands::fetch_mmr`).
pub fn latest_rank_snapshot(conn: &Connection, puuid: &str) -> rusqlite::Result<Option<RankSnapshot>> {
    conn.query_row(
        "SELECT tier, tier_patched, rr, recorded_at
         FROM rank_snapshots
         WHERE puuid = ?1
         ORDER BY recorded_at DESC
         LIMIT 1",
        [puuid],
        |row| {
            Ok(RankSnapshot {
                tier: row.get(0)?,
                tier_patched: row.get(1)?,
                rr: row.get(2)?,
                recorded_at: row.get(3)?,
            })
        },
    )
    .optional()
}

pub fn list_rank_snapshots(conn: &Connection, puuid: &str) -> rusqlite::Result<Vec<RankSnapshot>> {
    let mut stmt = conn.prepare(
        "SELECT tier, tier_patched, rr, recorded_at
         FROM rank_snapshots
         WHERE puuid = ?1
         ORDER BY recorded_at ASC",
    )?;
    let rows = stmt.query_map([puuid], |row| {
        Ok(RankSnapshot {
            tier: row.get(0)?,
            tier_patched: row.get(1)?,
            rr: row.get(2)?,
            recorded_at: row.get(3)?,
        })
    })?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memory_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn latest_rank_snapshot_returns_most_recent_or_none() {
        let conn = memory_conn();
        assert!(latest_rank_snapshot(&conn, "puuid-1").unwrap().is_none());

        insert_rank_snapshot(&conn, "puuid-1", 10, "Argent 1", Some(20)).unwrap();
        insert_rank_snapshot(&conn, "puuid-1", 11, "Argent 2", Some(40)).unwrap();

        let latest = latest_rank_snapshot(&conn, "puuid-1").unwrap().unwrap();
        assert_eq!(latest.tier, 11);
    }

    #[test]
    fn rank_snapshots_are_ordered_chronologically() {
        let conn = memory_conn();
        insert_rank_snapshot(&conn, "puuid-1", 10, "Argent 1", Some(20)).unwrap();
        insert_rank_snapshot(&conn, "puuid-1", 11, "Argent 2", Some(40)).unwrap();
        insert_rank_snapshot(&conn, "puuid-2", 20, "Diamant 1", Some(0)).unwrap();

        let snapshots = list_rank_snapshots(&conn, "puuid-1").unwrap();
        assert_eq!(snapshots.len(), 2);
        assert_eq!(snapshots[0].tier, 10);
        assert_eq!(snapshots[1].tier, 11);
    }
}
