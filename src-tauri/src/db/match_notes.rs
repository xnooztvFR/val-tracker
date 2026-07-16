//! TODO Fonctionnalités#15 : notes horodatées liées à un match précis — au-delà de
//! `tracked_players.notes` (une seule note libre par joueur), plusieurs notes possibles par
//! match, chacune avec son propre horodatage. Table dédiée `match_notes` plutôt qu'une
//! extension de `tracked_players` : la relation est (puuid, match_id) → N notes, pas 1:1.

use rusqlite::Connection;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct MatchNote {
    pub id: i64,
    pub match_id: String,
    pub puuid: String,
    pub note: String,
    pub created_at: i64,
}

pub fn add_match_note(
    conn: &Connection,
    match_id: &str,
    puuid: &str,
    note: &str,
) -> rusqlite::Result<MatchNote> {
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "INSERT INTO match_notes (match_id, puuid, note, created_at) VALUES (?1, ?2, ?3, ?4)",
        (match_id, puuid, note, now),
    )?;
    let id = conn.last_insert_rowid();
    Ok(MatchNote {
        id,
        match_id: match_id.to_string(),
        puuid: puuid.to_string(),
        note: note.to_string(),
        created_at: now,
    })
}

pub fn list_match_notes(
    conn: &Connection,
    match_id: &str,
    puuid: &str,
) -> rusqlite::Result<Vec<MatchNote>> {
    let mut stmt = conn.prepare(
        "SELECT id, match_id, puuid, note, created_at
         FROM match_notes WHERE match_id = ?1 AND puuid = ?2
         ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map((match_id, puuid), |row| {
        Ok(MatchNote {
            id: row.get(0)?,
            match_id: row.get(1)?,
            puuid: row.get(2)?,
            note: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;
    rows.collect()
}

pub fn delete_match_note(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM match_notes WHERE id = ?1", [id])?;
    Ok(())
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
    fn add_then_list_match_notes_ordered_by_creation() {
        let conn = memory_conn();
        let first = add_match_note(&conn, "match-1", "me", "Bon round 7").unwrap();
        assert!(first.id > 0);
        add_match_note(&conn, "match-1", "me", "Clutch en round 12").unwrap();
        add_match_note(&conn, "match-2", "me", "Note sur un autre match").unwrap();

        let notes = list_match_notes(&conn, "match-1", "me").unwrap();
        assert_eq!(notes.len(), 2);
        assert_eq!(notes[0].note, "Bon round 7");
        assert_eq!(notes[1].note, "Clutch en round 12");
    }

    #[test]
    fn delete_match_note_removes_only_that_note() {
        let conn = memory_conn();
        let a = add_match_note(&conn, "match-1", "me", "A").unwrap();
        add_match_note(&conn, "match-1", "me", "B").unwrap();

        delete_match_note(&conn, a.id).unwrap();

        let notes = list_match_notes(&conn, "match-1", "me").unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].note, "B");
    }
}
