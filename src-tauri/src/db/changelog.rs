//! `changelog_history` : historique des notes de version déjà installées (backlog Frontend/
//! UX — `ChangelogModal.tsx` n'affiche le changelog qu'une fois, à la volée, juste après
//! l'auto-update, voir `settings::set_pending_changelog`/`take_pending_changelog`). Cette
//! table conserve un journal consultable depuis Paramètres pour l'utilisateur qui a fermé la
//! popup trop vite ou veut comparer deux versions.

use rusqlite::Connection;
use serde::Serialize;

/// Nombre d'entrées conservées — largement suffisant pour consulter l'historique récent
/// sans laisser la table grossir indéfiniment au fil des mises à jour.
const MAX_HISTORY_ENTRIES: i64 = 30;

#[derive(Debug, Clone, Serialize)]
pub struct ChangelogHistoryEntry {
    pub version: String,
    pub notes: String,
    pub installed_at: i64,
}

/// Ajoute une entrée à l'historique — appelé juste avant `relaunch()` en parallèle de
/// `settings::set_pending_changelog` (voir `commands::set_pending_changelog`), jamais
/// écrasé (contrairement au changelog "en attente" qui lui est effacé après une lecture).
pub fn insert_changelog_history(conn: &Connection, version: &str, notes: &str) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "INSERT INTO changelog_history (version, notes, installed_at) VALUES (?1, ?2, ?3)",
        (version, notes, now),
    )?;
    conn.execute(
        "DELETE FROM changelog_history WHERE id NOT IN (
            SELECT id FROM changelog_history ORDER BY id DESC LIMIT ?1
        )",
        [MAX_HISTORY_ENTRIES],
    )?;
    Ok(())
}

pub fn list_changelog_history(conn: &Connection) -> rusqlite::Result<Vec<ChangelogHistoryEntry>> {
    let mut stmt = conn.prepare(
        "SELECT version, notes, installed_at FROM changelog_history ORDER BY id DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(ChangelogHistoryEntry {
            version: row.get(0)?,
            notes: row.get(1)?,
            installed_at: row.get(2)?,
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
    fn insert_and_list_changelog_history_orders_most_recent_first() {
        let conn = memory_conn();
        insert_changelog_history(&conn, "0.3.9", "{\"fr\":\"a\"}").unwrap();
        insert_changelog_history(&conn, "0.3.10", "{\"fr\":\"b\"}").unwrap();

        let history = list_changelog_history(&conn).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].version, "0.3.10");
        assert_eq!(history[1].version, "0.3.9");
    }

    #[test]
    fn changelog_history_is_capped_to_max_entries() {
        let conn = memory_conn();
        for i in 0..(MAX_HISTORY_ENTRIES + 5) {
            insert_changelog_history(&conn, &format!("0.3.{i}"), "{}").unwrap();
        }

        let history = list_changelog_history(&conn).unwrap();
        assert_eq!(history.len(), MAX_HISTORY_ENTRIES as usize);
        assert_eq!(history[0].version, format!("0.3.{}", MAX_HISTORY_ENTRIES + 4));
    }
}
