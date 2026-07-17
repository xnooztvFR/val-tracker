//! TODO Social/multi-comptes#6/#40 : "record personnel battu" d'un ami suivi — mémorise la
//! meilleure valeur connue par métrique (kills, score) pour comparer un nouveau match détecté
//! par `friend_watcher.rs` au record précédent, plutôt qu'à la simple victoire/défaite déjà
//! notifiée. Une ligne par (puuid, metric) — pas d'historique, seule la meilleure valeur
//! connue est gardée.

use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PersonalBestMetric {
    Kills,
    Score,
}

impl PersonalBestMetric {
    pub fn as_str(self) -> &'static str {
        match self {
            PersonalBestMetric::Kills => "kills",
            PersonalBestMetric::Score => "score",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct FriendPersonalBest {
    pub metric: String,
    pub value: i64,
    pub match_id: String,
    pub achieved_at: i64,
}

pub fn get_personal_best(
    conn: &Connection,
    puuid: &str,
    metric: PersonalBestMetric,
) -> rusqlite::Result<Option<i64>> {
    conn.query_row(
        "SELECT value FROM friend_personal_bests WHERE puuid = ?1 AND metric = ?2",
        (puuid, metric.as_str()),
        |row| row.get(0),
    )
    .optional()
}

/// Liste tous les records connus pour un ami suivi (au plus une ligne par métrique) — utilisé
/// côté UI pour afficher "meilleur score : X" à côté de son dernier match (voir
/// `FollowedFriendsPanel.tsx`), en complément de la notification OS de `friend_watcher.rs`.
pub fn list_personal_bests(conn: &Connection, puuid: &str) -> rusqlite::Result<Vec<FriendPersonalBest>> {
    let mut stmt = conn.prepare(
        "SELECT metric, value, match_id, achieved_at FROM friend_personal_bests WHERE puuid = ?1",
    )?;
    let rows = stmt.query_map([puuid], |row| {
        Ok(FriendPersonalBest {
            metric: row.get(0)?,
            value: row.get(1)?,
            match_id: row.get(2)?,
            achieved_at: row.get(3)?,
        })
    })?;
    rows.collect()
}

/// Écrase le record précédent — n'appeler qu'après avoir déjà vérifié côté appelant que
/// `value` dépasse (ou qu'aucun record n'existe encore pour) cette métrique.
pub fn set_personal_best(
    conn: &Connection,
    puuid: &str,
    metric: PersonalBestMetric,
    value: i64,
    match_id: &str,
) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "INSERT INTO friend_personal_bests (puuid, metric, value, match_id, achieved_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(puuid, metric) DO UPDATE SET
            value = excluded.value,
            match_id = excluded.match_id,
            achieved_at = excluded.achieved_at",
        (puuid, metric.as_str(), value, match_id, now),
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
    fn get_personal_best_is_none_when_never_set() {
        let conn = memory_conn();
        assert_eq!(get_personal_best(&conn, "p1", PersonalBestMetric::Kills).unwrap(), None);
    }

    #[test]
    fn set_then_get_personal_best_round_trips() {
        let conn = memory_conn();
        set_personal_best(&conn, "p1", PersonalBestMetric::Kills, 30, "match-1").unwrap();
        assert_eq!(get_personal_best(&conn, "p1", PersonalBestMetric::Kills).unwrap(), Some(30));
        // Une autre métrique pour le même joueur reste indépendante.
        assert_eq!(get_personal_best(&conn, "p1", PersonalBestMetric::Score).unwrap(), None);
    }

    #[test]
    fn set_personal_best_overwrites_previous_value_for_same_metric() {
        let conn = memory_conn();
        set_personal_best(&conn, "p1", PersonalBestMetric::Kills, 20, "match-1").unwrap();
        set_personal_best(&conn, "p1", PersonalBestMetric::Kills, 35, "match-2").unwrap();
        assert_eq!(get_personal_best(&conn, "p1", PersonalBestMetric::Kills).unwrap(), Some(35));
    }

    #[test]
    fn list_personal_bests_returns_one_row_per_metric() {
        let conn = memory_conn();
        set_personal_best(&conn, "p1", PersonalBestMetric::Kills, 30, "match-1").unwrap();
        set_personal_best(&conn, "p1", PersonalBestMetric::Score, 400, "match-1").unwrap();
        set_personal_best(&conn, "other", PersonalBestMetric::Kills, 99, "match-2").unwrap();

        let bests = list_personal_bests(&conn, "p1").unwrap();
        assert_eq!(bests.len(), 2);
        assert!(bests.iter().any(|b| b.metric == "kills" && b.value == 30));
        assert!(bests.iter().any(|b| b.metric == "score" && b.value == 400));
    }
}
