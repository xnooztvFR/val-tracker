//! Connexion SQLite locale (dossier de données Tauri) + migrations idempotentes.
//!
//! Une seule connexion est ouverte au démarrage et partagée (via `Arc<Mutex<Connection>>`
//! dans l'état géré par Tauri) entre les commands et la couche cache de `api::henrik`.

use std::path::{Path, PathBuf};

use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use tauri::{AppHandle, Manager};

pub const DB_FILE_NAME: &str = "val-tracker.db";

/// Résout le chemin du fichier SQLite dans le dossier de données de l'app
/// (`%APPDATA%\com.mri-bot.val-tracker` sous Windows), en créant le dossier si besoin.
pub fn resolve_db_path(app_handle: &AppHandle) -> anyhow::Result<PathBuf> {
    let dir = app_handle.path().app_data_dir()?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join(DB_FILE_NAME))
}

/// Ouvre la connexion SQLite, active WAL + foreign_keys, puis applique les migrations.
pub fn init_db(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;

    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;

    run_migrations(&conn)?;

    Ok(conn)
}

pub(crate) fn run_migrations(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        -- Joueurs recherchés récemment (favoris + historique de recherche)
        CREATE TABLE IF NOT EXISTS tracked_players (
            puuid TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            tag TEXT NOT NULL,
            region TEXT NOT NULL,
            is_favorite INTEGER NOT NULL DEFAULT 0,
            last_viewed_at INTEGER NOT NULL
        );

        -- Cache API générique (clé = URL complète, comme api_cache côté bot Discord)
        CREATE TABLE IF NOT EXISTS api_cache (
            url TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            expires_at INTEGER NOT NULL
        );

        -- Snapshots de rank dans le temps, pour tracer une courbe de progression
        -- même quand Henrik ne renvoie pas d'historique long pour un joueur donné.
        CREATE TABLE IF NOT EXISTS rank_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            puuid TEXT NOT NULL,
            tier INTEGER NOT NULL,
            tier_patched TEXT NOT NULL,
            rr INTEGER,
            recorded_at INTEGER NOT NULL
        );

        -- Config app (clé API Henrik, préférences UI, etc.)
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        -- V3 : co-occurrences de party_id par match consulté (voir commands::
        -- record_party_from_match), pour calculer un winrate en duo/squad sans jamais
        -- refetch Henrik en masse — accumulé au fil de la navigation dans l'historique.
        CREATE TABLE IF NOT EXISTS party_matches (
            match_id TEXT NOT NULL,
            tracked_puuid TEXT NOT NULL,
            teammate_puuid TEXT NOT NULL,
            teammate_name TEXT NOT NULL,
            teammate_tag TEXT NOT NULL,
            won INTEGER NOT NULL,
            recorded_at INTEGER NOT NULL,
            PRIMARY KEY (match_id, tracked_puuid, teammate_puuid)
        );

        CREATE INDEX IF NOT EXISTS idx_rank_snapshots_puuid
            ON rank_snapshots (puuid, recorded_at);

        CREATE INDEX IF NOT EXISTS idx_tracked_players_last_viewed
            ON tracked_players (last_viewed_at DESC);

        CREATE INDEX IF NOT EXISTS idx_party_matches_tracked
            ON party_matches (tracked_puuid, teammate_puuid);
        "#,
    )
}

#[derive(Debug, Clone, Serialize)]
pub struct TrackedPlayer {
    pub puuid: String,
    pub name: String,
    pub tag: String,
    pub region: String,
    pub is_favorite: bool,
    pub last_viewed_at: i64,
}

fn map_tracked_player(row: &rusqlite::Row) -> rusqlite::Result<TrackedPlayer> {
    Ok(TrackedPlayer {
        puuid: row.get(0)?,
        name: row.get(1)?,
        tag: row.get(2)?,
        region: row.get(3)?,
        is_favorite: row.get::<_, i64>(4)? != 0,
        last_viewed_at: row.get(5)?,
    })
}

pub fn upsert_tracked_player(
    conn: &Connection,
    puuid: &str,
    name: &str,
    tag: &str,
    region: &str,
) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "INSERT INTO tracked_players (puuid, name, tag, region, is_favorite, last_viewed_at)
         VALUES (?1, ?2, ?3, ?4, 0, ?5)
         ON CONFLICT(puuid) DO UPDATE SET
            name = excluded.name,
            tag = excluded.tag,
            region = excluded.region,
            last_viewed_at = excluded.last_viewed_at",
        (puuid, name, tag, region, now),
    )?;
    Ok(())
}

/// Historique des dernières recherches, favoris en tête puis par date de consultation.
pub fn list_recent_players(conn: &Connection, limit: i64) -> rusqlite::Result<Vec<TrackedPlayer>> {
    let mut stmt = conn.prepare(
        "SELECT puuid, name, tag, region, is_favorite, last_viewed_at
         FROM tracked_players
         ORDER BY is_favorite DESC, last_viewed_at DESC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map([limit], map_tracked_player)?;
    rows.collect()
}

/// Bascule le favori d'un joueur et renvoie le nouvel état.
pub fn toggle_favorite(conn: &Connection, puuid: &str) -> rusqlite::Result<bool> {
    conn.execute(
        "UPDATE tracked_players SET is_favorite = CASE is_favorite WHEN 0 THEN 1 ELSE 0 END
         WHERE puuid = ?1",
        [puuid],
    )?;
    conn.query_row(
        "SELECT is_favorite FROM tracked_players WHERE puuid = ?1",
        [puuid],
        |row| row.get::<_, i64>(0),
    )
    .map(|v| v != 0)
}

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

/// Efface le cache API, l'historique de rank et l'historique de recherche — mais pas les
/// réglages (clé API, région, préférences). Équivalent du "Erase Local Stats and Matches
/// Only" de l'app de référence.
pub fn reset_local_stats(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "DELETE FROM api_cache; DELETE FROM rank_snapshots; DELETE FROM tracked_players;
         DELETE FROM party_matches;",
    )
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

#[derive(Debug, Clone, Serialize)]
pub struct DuoStat {
    pub teammate_puuid: String,
    pub teammate_name: String,
    pub teammate_tag: String,
    pub matches_played: i64,
    pub matches_won: i64,
}

/// Enregistre qu'un coéquipier partageait le même `party_id` que `tracked_puuid` sur ce
/// match. Idempotent : rejouer le même match (ex. `force` refresh) écrase juste le nom/tag
/// et le résultat au lieu de dupliquer la ligne (clé primaire composite).
#[allow(clippy::too_many_arguments)]
pub fn record_party_match(
    conn: &Connection,
    match_id: &str,
    tracked_puuid: &str,
    teammate_puuid: &str,
    teammate_name: &str,
    teammate_tag: &str,
    won: bool,
) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "INSERT INTO party_matches
            (match_id, tracked_puuid, teammate_puuid, teammate_name, teammate_tag, won, recorded_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(match_id, tracked_puuid, teammate_puuid) DO UPDATE SET
            teammate_name = excluded.teammate_name,
            teammate_tag = excluded.teammate_tag,
            won = excluded.won",
        (
            match_id,
            tracked_puuid,
            teammate_puuid,
            teammate_name,
            teammate_tag,
            won as i64,
            now,
        ),
    )?;
    Ok(())
}

/// Agrège les matchs en duo/squad par coéquipier, triés par nombre de matchs joués
/// ensemble. `min_matches` filtre le bruit (un seul match commun, party de passage).
pub fn list_duo_stats(
    conn: &Connection,
    tracked_puuid: &str,
    min_matches: i64,
) -> rusqlite::Result<Vec<DuoStat>> {
    let mut stmt = conn.prepare(
        "SELECT teammate_puuid, teammate_name, teammate_tag,
                COUNT(*) AS matches_played, SUM(won) AS matches_won
         FROM party_matches
         WHERE tracked_puuid = ?1
         GROUP BY teammate_puuid
         HAVING matches_played >= ?2
         ORDER BY matches_played DESC, matches_won DESC",
    )?;
    let rows = stmt.query_map((tracked_puuid, min_matches), |row| {
        Ok(DuoStat {
            teammate_puuid: row.get(0)?,
            teammate_name: row.get(1)?,
            teammate_tag: row.get(2)?,
            matches_played: row.get(3)?,
            matches_won: row.get(4)?,
        })
    })?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memory_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn upsert_tracked_player_then_list_recent() {
        let conn = memory_conn();
        upsert_tracked_player(&conn, "puuid-1", "Player1", "1234", "eu").unwrap();
        upsert_tracked_player(&conn, "puuid-2", "Player2", "5678", "na").unwrap();
        // `upsert_tracked_player` horodate à la seconde près (chrono::Utc::now().timestamp()) :
        // les deux appels ci-dessus peuvent tomber dans la même seconde en test, donc on
        // force un écart explicite plutôt que de dépendre de la résolution de l'horloge.
        conn.execute(
            "UPDATE tracked_players SET last_viewed_at = 200 WHERE puuid = 'puuid-2'",
            [],
        )
        .unwrap();
        conn.execute(
            "UPDATE tracked_players SET last_viewed_at = 100 WHERE puuid = 'puuid-1'",
            [],
        )
        .unwrap();

        let recent = list_recent_players(&conn, 10).unwrap();
        assert_eq!(recent.len(), 2);
        // Le plus récemment consulté (puuid-2) doit apparaître en tête, à favori égal.
        assert_eq!(recent[0].puuid, "puuid-2");
    }

    #[test]
    fn upsert_tracked_player_updates_existing_row_instead_of_duplicating() {
        let conn = memory_conn();
        upsert_tracked_player(&conn, "puuid-1", "Player1", "1234", "eu").unwrap();
        upsert_tracked_player(&conn, "puuid-1", "PlayerRenamed", "1234", "na").unwrap();

        let recent = list_recent_players(&conn, 10).unwrap();
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].name, "PlayerRenamed");
        assert_eq!(recent[0].region, "na");
    }

    #[test]
    fn toggle_favorite_flips_state_and_favorites_sort_first() {
        let conn = memory_conn();
        upsert_tracked_player(&conn, "puuid-1", "Player1", "1234", "eu").unwrap();
        upsert_tracked_player(&conn, "puuid-2", "Player2", "5678", "eu").unwrap();

        // puuid-1 est le plus ancien (donc en second dans le tri par défaut) ; le
        // favoriser doit le faire remonter en tête malgré ça.
        let now_favorite = toggle_favorite(&conn, "puuid-1").unwrap();
        assert!(now_favorite);

        let recent = list_recent_players(&conn, 10).unwrap();
        assert_eq!(recent[0].puuid, "puuid-1");
        assert!(recent[0].is_favorite);

        let now_unfavorite = toggle_favorite(&conn, "puuid-1").unwrap();
        assert!(!now_unfavorite);
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

    #[test]
    fn record_party_match_then_list_duo_stats_aggregates_by_teammate() {
        let conn = memory_conn();
        record_party_match(&conn, "match-1", "me", "buddy", "Buddy", "1111", true).unwrap();
        record_party_match(&conn, "match-2", "me", "buddy", "Buddy", "1111", false).unwrap();
        record_party_match(&conn, "match-3", "me", "buddy", "Buddy", "1111", true).unwrap();
        record_party_match(&conn, "match-1", "me", "stranger", "Stranger", "2222", true).unwrap();

        let stats = list_duo_stats(&conn, "me", 1).unwrap();
        assert_eq!(stats.len(), 2);
        // Trié par nombre de matchs joués ensemble, décroissant.
        assert_eq!(stats[0].teammate_puuid, "buddy");
        assert_eq!(stats[0].matches_played, 3);
        assert_eq!(stats[0].matches_won, 2);
        assert_eq!(stats[1].teammate_puuid, "stranger");
        assert_eq!(stats[1].matches_played, 1);
    }

    #[test]
    fn list_duo_stats_filters_out_below_min_matches() {
        let conn = memory_conn();
        record_party_match(&conn, "match-1", "me", "stranger", "Stranger", "2222", true).unwrap();

        assert_eq!(list_duo_stats(&conn, "me", 2).unwrap().len(), 0);
        assert_eq!(list_duo_stats(&conn, "me", 1).unwrap().len(), 1);
    }

    #[test]
    fn record_party_match_is_idempotent_on_replay() {
        let conn = memory_conn();
        record_party_match(&conn, "match-1", "me", "buddy", "Buddy", "1111", true).unwrap();
        // Refetch du même match (force refresh) avec un nom mis à jour : pas de doublon,
        // juste une mise à jour de la ligne existante.
        record_party_match(&conn, "match-1", "me", "buddy", "BuddyRenamed", "1111", true).unwrap();

        let stats = list_duo_stats(&conn, "me", 1).unwrap();
        assert_eq!(stats.len(), 1);
        assert_eq!(stats[0].matches_played, 1);
        assert_eq!(stats[0].teammate_name, "BuddyRenamed");
    }

    #[test]
    fn reset_local_stats_clears_cache_history_search_and_party_but_not_settings() {
        let conn = memory_conn();
        upsert_tracked_player(&conn, "puuid-1", "Player1", "1234", "eu").unwrap();
        insert_rank_snapshot(&conn, "puuid-1", 10, "Argent 1", Some(20)).unwrap();
        record_party_match(&conn, "match-1", "puuid-1", "buddy", "Buddy", "1111", true).unwrap();
        cache_set_for_test(&conn, "https://example/api", "{}", 999_999_999_999);
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('henrik_api_key', 'secret')",
            [],
        )
        .unwrap();

        reset_local_stats(&conn).unwrap();

        assert!(list_recent_players(&conn, 10).unwrap().is_empty());
        assert!(list_rank_snapshots(&conn, "puuid-1").unwrap().is_empty());
        assert!(list_duo_stats(&conn, "puuid-1", 1).unwrap().is_empty());
        let cache_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM api_cache", [], |r| r.get(0))
            .unwrap();
        assert_eq!(cache_count, 0);
        let settings_value: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'henrik_api_key'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(settings_value, "secret");
    }

    fn cache_set_for_test(conn: &Connection, url: &str, payload: &str, expires_at: i64) {
        conn.execute(
            "INSERT INTO api_cache (url, payload, expires_at) VALUES (?1, ?2, ?3)",
            (url, payload, expires_at),
        )
        .unwrap();
    }
}
