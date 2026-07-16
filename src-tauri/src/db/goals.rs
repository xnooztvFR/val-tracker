//! `progression_goals` : objectif de rang (backlog #13) + objectifs hebdomadaires custom
//! (backlog #55, étendu TODO Fonctionnalités#7 à `weekly_kd`/`weekly_hs`), distingués par
//! `goal_type` (chaîne libre, aucune validation côté Rust — voir `commands::save_weekly_goal`).

use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;

/// Backlog #13 : objectif de progression ("atteindre Diamant 2") défini pour un joueur suivi.
/// Backlog #55 : étendu à des objectifs hebdomadaires custom via `goal_type`
/// (`"rank"` | `"weekly_matches"` | `"weekly_winrate"`) — `target_tier`/`target_tier_patched`/
/// `target_rr` ne sont renseignés que pour `"rank"`, `target_value` que pour les objectifs
/// hebdo (nombre de matchs, ou winrate en % 0-100).
#[derive(Debug, Clone, Serialize)]
pub struct ProgressionGoal {
    pub goal_type: String,
    pub target_tier: Option<i64>,
    pub target_tier_patched: Option<String>,
    pub target_rr: Option<i64>,
    pub target_value: Option<i64>,
    pub created_at: i64,
}

fn map_progression_goal(row: &rusqlite::Row) -> rusqlite::Result<ProgressionGoal> {
    Ok(ProgressionGoal {
        goal_type: row.get(0)?,
        target_tier: row.get(1)?,
        target_tier_patched: row.get(2)?,
        target_rr: row.get(3)?,
        target_value: row.get(4)?,
        created_at: row.get(5)?,
    })
}

pub fn set_progression_goal(
    conn: &Connection,
    puuid: &str,
    target_tier: i64,
    target_tier_patched: &str,
    target_rr: Option<i64>,
) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "INSERT INTO progression_goals (puuid, goal_type, target_tier, target_tier_patched, target_rr, created_at)
         VALUES (?1, 'rank', ?2, ?3, ?4, ?5)
         ON CONFLICT(puuid, goal_type) DO UPDATE SET
            target_tier = excluded.target_tier,
            target_tier_patched = excluded.target_tier_patched,
            target_rr = excluded.target_rr",
        (puuid, target_tier, target_tier_patched, target_rr, now),
    )?;
    Ok(())
}

pub fn get_progression_goal(
    conn: &Connection,
    puuid: &str,
) -> rusqlite::Result<Option<ProgressionGoal>> {
    conn.query_row(
        "SELECT goal_type, target_tier, target_tier_patched, target_rr, target_value, created_at
         FROM progression_goals WHERE puuid = ?1 AND goal_type = 'rank'",
        [puuid],
        map_progression_goal,
    )
    .optional()
}

pub fn clear_progression_goal(conn: &Connection, puuid: &str) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM progression_goals WHERE puuid = ?1 AND goal_type = 'rank'",
        [puuid],
    )?;
    Ok(())
}

/// Backlog #55 : objectif hebdomadaire custom (`goal_type` = `"weekly_matches"` ou
/// `"weekly_winrate"`) — `target_value` est un nombre de matchs ou un pourcentage de
/// winrate (0-100) selon le type ; la progression réelle se calcule côté frontend sur les
/// matchs de la semaine en cours déjà en cache, pas besoin de stocker de période ici.
pub fn set_weekly_goal(
    conn: &Connection,
    puuid: &str,
    goal_type: &str,
    target_value: i64,
) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "INSERT INTO progression_goals (puuid, goal_type, target_value, created_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(puuid, goal_type) DO UPDATE SET
            target_value = excluded.target_value",
        (puuid, goal_type, target_value, now),
    )?;
    Ok(())
}

pub fn list_weekly_goals(conn: &Connection, puuid: &str) -> rusqlite::Result<Vec<ProgressionGoal>> {
    let mut stmt = conn.prepare(
        "SELECT goal_type, target_tier, target_tier_patched, target_rr, target_value, created_at
         FROM progression_goals WHERE puuid = ?1 AND goal_type != 'rank'
         ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map([puuid], map_progression_goal)?;
    rows.collect()
}

pub fn clear_weekly_goal(conn: &Connection, puuid: &str, goal_type: &str) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM progression_goals WHERE puuid = ?1 AND goal_type = ?2",
        (puuid, goal_type),
    )?;
    Ok(())
}

/// Backlog #57 : marque un objectif hebdo comme atteint pour une période donnée
/// (`period_key`, ex. "2026-W03") — idempotent (`INSERT OR IGNORE`) : appelé à chaque
/// rendu du panneau d'objectifs tant que l'objectif reste atteint, sans dupliquer
/// l'événement ni en avancer la date la première fois qu'il a été détecté.
pub fn record_goal_achieved_event(
    conn: &Connection,
    puuid: &str,
    goal_type: &str,
    period_key: &str,
) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "INSERT OR IGNORE INTO timeline_events (puuid, event_type, goal_type, period_key, occurred_at)
         VALUES (?1, 'goal_achieved', ?2, ?3, ?4)",
        (puuid, goal_type, period_key, now),
    )?;
    Ok(())
}

/// Backlog #55 : `progression_goals` avait `puuid` en clé primaire (un seul objectif de
/// rang par joueur) — les objectifs hebdo custom ("X matchs cette semaine", "winrate ≥
/// 50%") doivent pouvoir coexister avec l'objectif de rang existant, d'où le passage à une
/// clé auto-incrémentée + `UNIQUE(puuid, goal_type)`. `ALTER TABLE` ne sait pas changer une
/// clé primaire en SQLite : on reconstruit donc la table (idempotent, déclenché seulement
/// si `goal_type` n'existe pas encore) en préservant les objectifs de rang déjà enregistrés.
pub(crate) fn migrate_progression_goals_multi(conn: &Connection) -> rusqlite::Result<()> {
    let mut stmt = conn.prepare("PRAGMA table_info(progression_goals)")?;
    let has_goal_type = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .filter_map(Result::ok)
        .any(|name| name == "goal_type");
    drop(stmt);
    if has_goal_type {
        return Ok(());
    }

    conn.execute_batch(
        "CREATE TABLE progression_goals_v2 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            puuid TEXT NOT NULL,
            goal_type TEXT NOT NULL DEFAULT 'rank',
            target_tier INTEGER,
            target_tier_patched TEXT,
            target_rr INTEGER,
            target_value INTEGER,
            created_at INTEGER NOT NULL,
            UNIQUE(puuid, goal_type)
         );
         INSERT INTO progression_goals_v2
            (puuid, goal_type, target_tier, target_tier_patched, target_rr, created_at)
         SELECT puuid, 'rank', target_tier, target_tier_patched, target_rr, created_at
         FROM progression_goals;
         DROP TABLE progression_goals;
         ALTER TABLE progression_goals_v2 RENAME TO progression_goals;",
    )
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
    fn progression_goal_set_get_clear() {
        let conn = memory_conn();
        assert!(get_progression_goal(&conn, "puuid-1").unwrap().is_none());

        set_progression_goal(&conn, "puuid-1", 20, "Diamant 2", Some(50)).unwrap();
        let goal = get_progression_goal(&conn, "puuid-1").unwrap().unwrap();
        assert_eq!(goal.target_tier, Some(20));
        assert_eq!(goal.target_tier_patched, Some("Diamant 2".to_string()));
        assert_eq!(goal.target_rr, Some(50));

        // Redéfinir l'objectif met à jour la ligne existante plutôt que d'en créer une autre.
        set_progression_goal(&conn, "puuid-1", 21, "Diamant 3", None).unwrap();
        let updated = get_progression_goal(&conn, "puuid-1").unwrap().unwrap();
        assert_eq!(updated.target_tier, Some(21));
        assert_eq!(updated.target_rr, None);

        clear_progression_goal(&conn, "puuid-1").unwrap();
        assert!(get_progression_goal(&conn, "puuid-1").unwrap().is_none());
    }

    #[test]
    fn weekly_goals_coexist_with_rank_goal_and_are_independently_settable() {
        let conn = memory_conn();
        set_progression_goal(&conn, "puuid-1", 20, "Diamant 2", Some(50)).unwrap();
        set_weekly_goal(&conn, "puuid-1", "weekly_matches", 15).unwrap();
        set_weekly_goal(&conn, "puuid-1", "weekly_winrate", 55).unwrap();

        // L'objectif de rang n'est pas affecté par les objectifs hebdo.
        let rank_goal = get_progression_goal(&conn, "puuid-1").unwrap().unwrap();
        assert_eq!(rank_goal.target_tier, Some(20));

        let weekly = list_weekly_goals(&conn, "puuid-1").unwrap();
        assert_eq!(weekly.len(), 2);
        let matches_goal = weekly.iter().find(|g| g.goal_type == "weekly_matches").unwrap();
        assert_eq!(matches_goal.target_value, Some(15));

        // Redéfinir un objectif hebdo met à jour la ligne existante.
        set_weekly_goal(&conn, "puuid-1", "weekly_matches", 20).unwrap();
        let weekly = list_weekly_goals(&conn, "puuid-1").unwrap();
        assert_eq!(weekly.len(), 2);
        let matches_goal = weekly.iter().find(|g| g.goal_type == "weekly_matches").unwrap();
        assert_eq!(matches_goal.target_value, Some(20));

        clear_weekly_goal(&conn, "puuid-1", "weekly_matches").unwrap();
        let weekly = list_weekly_goals(&conn, "puuid-1").unwrap();
        assert_eq!(weekly.len(), 1);
        assert_eq!(weekly[0].goal_type, "weekly_winrate");

        // L'objectif de rang doit toujours être là.
        assert!(get_progression_goal(&conn, "puuid-1").unwrap().is_some());
    }

    #[test]
    fn migrate_progression_goals_multi_preserves_existing_rank_goals() {
        let conn = memory_conn();
        // Simule une base pré-migration (ancien schéma, PK = puuid).
        conn.execute_batch(
            "DROP TABLE progression_goals;
             CREATE TABLE progression_goals (
                puuid TEXT PRIMARY KEY,
                target_tier INTEGER NOT NULL,
                target_tier_patched TEXT NOT NULL,
                target_rr INTEGER,
                created_at INTEGER NOT NULL
             );
             INSERT INTO progression_goals VALUES ('puuid-1', 18, 'Diamant', 30, 1000);",
        )
        .unwrap();

        migrate_progression_goals_multi(&conn).unwrap();

        let goal = get_progression_goal(&conn, "puuid-1").unwrap().unwrap();
        assert_eq!(goal.target_tier, Some(18));
        assert_eq!(goal.target_tier_patched, Some("Diamant".to_string()));
        assert_eq!(goal.target_rr, Some(30));

        // Idempotent : rejouer la migration ne casse rien.
        migrate_progression_goals_multi(&conn).unwrap();
        assert!(get_progression_goal(&conn, "puuid-1").unwrap().is_some());
    }
}
