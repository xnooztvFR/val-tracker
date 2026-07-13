//! Cache API générique adossé à la table SQLite `api_cache` (clé = URL complète), même
//! principe que `api_cache` côté bot Discord : on stocke le JSON brut avec une date
//! d'expiration, et on sert le cache tel quel s'il est encore valide.

use rusqlite::{Connection, OptionalExtension};

use super::TtlSeconds;

fn now_unix() -> i64 {
    chrono::Utc::now().timestamp()
}

/// Renvoie `(payload, expires_at)` en cache pour `url` s'il existe et n'est pas expiré.
pub fn get_fresh(conn: &Connection, url: &str) -> rusqlite::Result<Option<(String, i64)>> {
    let row: Option<(String, i64)> = conn
        .query_row(
            "SELECT payload, expires_at FROM api_cache WHERE url = ?1",
            [url],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;

    Ok(row.filter(|(_, expires_at)| *expires_at > now_unix()))
}

/// Renvoie le dernier payload connu pour `url`, même expiré — utilisé comme repli quand
/// le réseau/l'API est en panne (bandeau "Données en cache, dernière mise à jour ...").
pub fn get_stale(conn: &Connection, url: &str) -> rusqlite::Result<Option<(String, i64)>> {
    conn.query_row(
        "SELECT payload, expires_at FROM api_cache WHERE url = ?1",
        [url],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()
}

/// Backlog #52 : liste les payloads dont l'URL commence par `prefix` (même expirés — même
/// esprit que `get_stale`, on ne recalcule qu'à partir de ce qui est déjà en cache, aucun
/// fetch réseau). Utilisé pour agréger les détails de match déjà consultés sans lister
/// chaque `match_id` un par un.
pub fn list_by_prefix(conn: &Connection, prefix: &str) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT payload FROM api_cache WHERE url LIKE ?1")?;
    let like_pattern = format!("{prefix}%");
    let rows = stmt.query_map([like_pattern], |row| row.get::<_, String>(0))?;
    rows.collect()
}

pub fn set(conn: &Connection, url: &str, payload: &str, ttl: TtlSeconds) -> rusqlite::Result<()> {
    let expires_at = now_unix() + ttl.0;
    conn.execute(
        "INSERT INTO api_cache (url, payload, expires_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(url) DO UPDATE SET payload = excluded.payload, expires_at = excluded.expires_at",
        (url, payload, expires_at),
    )?;
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
    fn fresh_entry_is_returned_by_get_fresh_and_get_stale() {
        let conn = memory_conn();
        set(&conn, "https://api/a", "payload-a", TtlSeconds(3600)).unwrap();

        let fresh = get_fresh(&conn, "https://api/a").unwrap();
        assert_eq!(fresh.unwrap().0, "payload-a");

        let stale = get_stale(&conn, "https://api/a").unwrap();
        assert_eq!(stale.unwrap().0, "payload-a");
    }

    #[test]
    fn expired_entry_is_hidden_from_get_fresh_but_visible_in_get_stale() {
        let conn = memory_conn();
        // TTL négatif : expire immédiatement.
        set(&conn, "https://api/b", "payload-b", TtlSeconds(-3600)).unwrap();

        assert!(get_fresh(&conn, "https://api/b").unwrap().is_none());
        assert_eq!(get_stale(&conn, "https://api/b").unwrap().unwrap().0, "payload-b");
    }

    #[test]
    fn missing_entry_returns_none_for_both() {
        let conn = memory_conn();
        assert!(get_fresh(&conn, "https://api/never-set").unwrap().is_none());
        assert!(get_stale(&conn, "https://api/never-set").unwrap().is_none());
    }

    #[test]
    fn set_overwrites_previous_payload_for_same_url() {
        let conn = memory_conn();
        set(&conn, "https://api/c", "v1", TtlSeconds(3600)).unwrap();
        set(&conn, "https://api/c", "v2", TtlSeconds(3600)).unwrap();

        assert_eq!(get_fresh(&conn, "https://api/c").unwrap().unwrap().0, "v2");
    }

    #[test]
    fn list_by_prefix_returns_only_matching_urls_even_if_expired() {
        let conn = memory_conn();
        set(&conn, "/valorant/v2/match/m1", "payload-1", TtlSeconds(-3600)).unwrap();
        set(&conn, "/valorant/v2/match/m2", "payload-2", TtlSeconds(3600)).unwrap();
        set(&conn, "/valorant/v2/account/foo", "payload-3", TtlSeconds(3600)).unwrap();

        let mut payloads = list_by_prefix(&conn, "/valorant/v2/match/").unwrap();
        payloads.sort();
        assert_eq!(payloads, vec!["payload-1", "payload-2"]);
    }
}
