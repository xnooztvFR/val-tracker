//! Connexion SQLite locale (dossier de données Tauri) + migrations idempotentes.
//!
//! Une seule connexion est ouverte au démarrage et partagée (via `Arc<Mutex<Connection>>`
//! dans l'état géré par Tauri) entre les commands et la couche cache de `api::henrik`.
//!
//! Découpé par domaine de table (voir `CREATE TABLE` ci-dessous) : `players` (tracked_players),
//! `party` (party_matches), `goals` (progression_goals), `snapshots` (rank_snapshots),
//! `timeline` (timeline_events), `metrics` (usage_metrics_events). Ce module ne garde que la
//! connexion/migrations partagées + `reset_local_stats`, qui touche plusieurs tables à la fois.

use std::path::{Path, PathBuf};

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

mod changelog;
mod goals;
mod metrics;
mod party;
mod players;
mod snapshots;
mod timeline;

pub use changelog::*;
pub use goals::*;
pub use metrics::*;
pub use party::*;
pub use players::*;
pub use snapshots::*;
pub use timeline::*;

pub const DB_FILE_NAME: &str = "val-tracker.db";

/// Ancien identifiant du bundle (v0.1.0 et avant), avant renommage en `com.xnooztv.val-tracker`.
/// Tauri dérive `app_data_dir()` de l'identifiant courant, donc ce renommage change de dossier
/// de données — sans la migration ci-dessous, la clé API et les préférences des utilisateurs
/// déjà installés paraîtraient "réinitialisées" à la mise à jour alors qu'elles sont juste
/// restées dans l'ancien dossier.
const OLD_IDENTIFIER: &str = "com.mri-bot.val-tracker";

/// Résout le chemin du fichier SQLite dans le dossier de données de l'app
/// (`%APPDATA%\com.xnooztv.val-tracker` sous Windows), en créant le dossier si besoin, et migre
/// depuis l'ancien dossier de données si nécessaire (voir `OLD_IDENTIFIER`).
pub fn resolve_db_path(app_handle: &AppHandle) -> anyhow::Result<PathBuf> {
    let dir = app_handle.path().app_data_dir()?;
    std::fs::create_dir_all(&dir)?;
    let db_path = dir.join(DB_FILE_NAME);
    migrate_from_old_identifier(&dir, &db_path);
    Ok(db_path)
}

/// Copie best-effort la base (+ ses fichiers WAL/SHM le cas échéant) depuis l'ancien dossier
/// de données vers le nouveau, une seule fois (no-op si `db_path` existe déjà). Ne supprime
/// jamais l'ancien dossier : en cas d'échec partiel, aucune donnée n'est perdue.
fn migrate_from_old_identifier(new_dir: &Path, db_path: &Path) {
    if db_path.exists() {
        return;
    }
    let Some(data_root) = new_dir.parent() else { return };
    let old_db_path = data_root.join(OLD_IDENTIFIER).join(DB_FILE_NAME);
    if !old_db_path.exists() {
        return;
    }
    for ext in ["", "-wal", "-shm"] {
        let src = PathBuf::from(format!("{}{ext}", old_db_path.display()));
        if !src.exists() {
            continue;
        }
        let dest = PathBuf::from(format!("{}{ext}", db_path.display()));
        if let Err(e) = std::fs::copy(&src, &dest) {
            crate::applog!("Migration DB depuis l'ancien identifiant échouée ({src:?}): {e}");
        }
    }
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

        -- Backlog #50 : métriques d'usage local (opt-in, settings::AppSettings::
        -- usage_metrics_enabled), jamais envoyées nulle part — juste un petit dashboard
        -- santé pour le dev solo (taux de cache hit, erreurs API des 7 derniers jours).
        CREATE TABLE IF NOT EXISTS usage_metrics_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,
            occurred_at INTEGER NOT NULL
        );

        -- Backlog #13 : objectif de progression ("atteindre Diamant 2") par joueur suivi,
        -- affiché en barre de progression sur Home.tsx face au rank/RR actuel.
        CREATE TABLE IF NOT EXISTS progression_goals (
            puuid TEXT PRIMARY KEY,
            target_tier INTEGER NOT NULL,
            target_tier_patched TEXT NOT NULL,
            target_rr INTEGER,
            created_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_rank_snapshots_puuid
            ON rank_snapshots (puuid, recorded_at);

        CREATE INDEX IF NOT EXISTS idx_tracked_players_last_viewed
            ON tracked_players (last_viewed_at DESC);

        CREATE INDEX IF NOT EXISTS idx_party_matches_tracked
            ON party_matches (tracked_puuid, teammate_puuid);

        CREATE INDEX IF NOT EXISTS idx_usage_metrics_events_occurred_at
            ON usage_metrics_events (occurred_at);

        -- Backlog #88 : nécessaire pour que la purge des entrées expirées avant VACUUM
        -- (voir maybe_vacuum) ne fasse pas un scan complet de api_cache à mesure qu'il
        -- grossit.
        CREATE INDEX IF NOT EXISTS idx_api_cache_expires_at
            ON api_cache (expires_at);
        "#,
    )?;

    add_column_if_missing(conn, "tracked_players", "is_self", "INTEGER NOT NULL DEFAULT 0")?;
    // Backlog #12 : note libre par joueur suivi (tags "smurf"/"toxique"/"duo régulier"...).
    add_column_if_missing(conn, "tracked_players", "notes", "TEXT")?;
    // Backlog #24 : dédup de la notification "N défaites d'affilée" — mémorise le dernier
    // match pour lequel l'alerte a déjà été envoyée, pour ne pas re-notifier à chaque
    // refetch tant qu'aucune nouvelle défaite n'a été jouée depuis.
    add_column_if_missing(
        conn,
        "tracked_players",
        "last_loss_streak_notified_match_id",
        "TEXT",
    )?;
    // Backlog #27 : ordre d'affichage explicite des favoris (drag & drop), au lieu de
    // toujours trier par date de dernière consultation.
    add_column_if_missing(conn, "tracked_players", "sort_order", "INTEGER NOT NULL DEFAULT 0")?;

    goals::migrate_progression_goals_multi(conn)?;

    // Backlog #58 : réutilise `party_matches` pour aussi capturer les adversaires
    // ("rivalité"), pas seulement les coéquipiers de party — voir `record_party_match` et
    // `list_rivalry_stats`. `teammate_puuid`/`teammate_name`/`teammate_tag` désignent alors
    // l'adversaire, `relation` distingue les deux cas. Défaut 'teammate' pour ne pas
    // réinterpréter les lignes déjà enregistrées par des versions antérieures.
    add_column_if_missing(conn, "party_matches", "relation", "TEXT NOT NULL DEFAULT 'teammate'")?;

    // Backlog #57 : date de dernière modification de la note perso, voir `set_player_notes`.
    add_column_if_missing(conn, "tracked_players", "notes_updated_at", "INTEGER")?;

    // TODO stats & analyse joueur : tags structurés à côté du texte libre de `notes` (voir
    // `set_player_tags`) — liste de slugs fixes séparés par des virgules (ex.
    // "smurf,duo_regulier"), filtrables depuis les écrans duo/rivalité. Stocké en clair
    // (contrairement à `notes`) : ce sont des étiquettes courtes d'une liste fermée, pas du
    // texte libre pouvant contenir des informations sensibles.
    add_column_if_missing(conn, "tracked_players", "tags", "TEXT NOT NULL DEFAULT ''")?;

    // Histogramme de latence du dashboard santé : durée en ms des évènements
    // NetworkFetch/ApiError (NULL pour CacheHit, qui n'a pas de latence réseau) — voir
    // `metrics::usage_metrics_summary`.
    add_column_if_missing(conn, "usage_metrics_events", "duration_ms", "INTEGER")?;

    conn.execute_batch(
        r#"
        -- Backlog #57 : marqueurs datés pour la frise "vie du compte" (objectifs hebdo
        -- atteints) — les changements de rang et la note perso, eux, sont dérivés à la
        -- volée depuis rank_snapshots/tracked_players.notes_updated_at (voir
        -- `list_account_timeline`), pas besoin de les dupliquer ici.
        CREATE TABLE IF NOT EXISTS timeline_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            puuid TEXT NOT NULL,
            event_type TEXT NOT NULL,
            goal_type TEXT,
            period_key TEXT,
            occurred_at INTEGER NOT NULL,
            UNIQUE(puuid, event_type, goal_type, period_key)
        );

        CREATE INDEX IF NOT EXISTS idx_timeline_events_puuid
            ON timeline_events (puuid, occurred_at);

        -- Historique des changelogs déjà installés (voir db/changelog.rs), pour un
        -- "Nouveautés" consultable dans Paramètres au-delà de la popup post-update unique.
        CREATE TABLE IF NOT EXISTS changelog_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version TEXT NOT NULL,
            notes TEXT NOT NULL,
            installed_at INTEGER NOT NULL
        );
        "#,
    )?;

    Ok(())
}

const VACUUM_THRESHOLD_BYTES: u64 = 100 * 1024 * 1024;

/// Backlog #88 : purge les entrées expirées de `api_cache` puis `VACUUM` la base si le
/// fichier dépasse `VACUUM_THRESHOLD_BYTES` — même esprit que la troncature périodique de
/// `val-tracker.log` (voir `applog.rs`). Sans la purge, `VACUUM` seul ne libère rien : les
/// lignes expirées ne sont jamais supprimées ailleurs (juste écrasées par `ON CONFLICT` si
/// la même URL est re-fetchée). Best-effort : ne doit jamais empêcher le démarrage de
/// l'app si le fichier est inaccessible ou si la purge/le VACUUM échoue.
pub fn maybe_vacuum(conn: &Connection, db_path: &Path) {
    maybe_vacuum_with_threshold(conn, db_path, VACUUM_THRESHOLD_BYTES);
}

fn maybe_vacuum_with_threshold(conn: &Connection, db_path: &Path, threshold_bytes: u64) {
    let Ok(meta) = std::fs::metadata(db_path) else {
        return;
    };
    if meta.len() <= threshold_bytes {
        return;
    }
    let now = chrono::Utc::now().timestamp();
    if let Err(e) = conn.execute("DELETE FROM api_cache WHERE expires_at < ?1", [now]) {
        crate::applog!("Purge api_cache avant VACUUM échouée: {e}");
    }
    if let Err(e) = conn.execute_batch("VACUUM") {
        crate::applog!("VACUUM SQLite échoué: {e}");
    }
}

/// Rétention des lignes accumulées sans limite pour un compte suivi pendant des années
/// (`party_matches` : duo/squad/rivalité, `usage_metrics_events` : dashboard santé) —
/// contrairement à `api_cache`, rien ne les purgeait jusqu'ici (voir `maybe_vacuum`). Fenêtre
/// de 90 jours cohérente avec le "7 derniers jours" déjà affiché par le dashboard santé
/// (backlog #50) : largement suffisant pour ne jamais purger une donnée encore consultée,
/// tout en bornant la croissance de ces deux tables. Best-effort, appelé au démarrage comme
/// `maybe_vacuum` — ne doit jamais empêcher l'app de démarrer si la purge échoue.
const RETENTION_DAYS: i64 = 90;

pub fn purge_old_events(conn: &Connection) {
    let cutoff = chrono::Utc::now().timestamp() - RETENTION_DAYS * 24 * 60 * 60;
    if let Err(e) = conn.execute("DELETE FROM party_matches WHERE recorded_at < ?1", [cutoff]) {
        crate::applog!("Purge party_matches (rétention {RETENTION_DAYS}j) échouée: {e}");
    }
    if let Err(e) = conn.execute(
        "DELETE FROM usage_metrics_events WHERE occurred_at < ?1",
        [cutoff],
    ) {
        crate::applog!("Purge usage_metrics_events (rétention {RETENTION_DAYS}j) échouée: {e}");
    }
}

/// `ALTER TABLE ADD COLUMN` n'a pas de variante `IF NOT EXISTS` en SQLite : on vérifie donc
/// via `pragma_table_info` avant d'ajouter la colonne, pour que cette migration reste
/// idempotente (rejouée à chaque démarrage de l'app comme le reste de `run_migrations`).
fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> rusqlite::Result<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let exists = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .filter_map(Result::ok)
        .any(|name| name == column);
    drop(stmt);

    if !exists {
        conn.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"))?;
    }
    Ok(())
}

/// Efface le cache API, l'historique de rank et l'historique de recherche — mais pas les
/// réglages (clé API, région, préférences). Équivalent du "Erase Local Stats and Matches
/// Only" de l'app de référence.
pub fn reset_local_stats(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "DELETE FROM api_cache; DELETE FROM rank_snapshots; DELETE FROM tracked_players;
         DELETE FROM party_matches; DELETE FROM usage_metrics_events;
         DELETE FROM progression_goals;",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    pub(crate) fn memory_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn purge_old_events_removes_entries_older_than_retention_but_keeps_recent() {
        let conn = memory_conn();
        let now = chrono::Utc::now().timestamp();
        let old = now - (RETENTION_DAYS + 1) * 24 * 60 * 60;
        let recent = now - 24 * 60 * 60;

        party::record_party_match(&conn, "match-old", "puuid-1", "buddy", "Buddy", "1111", true, "teammate")
            .unwrap();
        conn.execute(
            "UPDATE party_matches SET recorded_at = ?1 WHERE match_id = 'match-old'",
            [old],
        )
        .unwrap();
        party::record_party_match(&conn, "match-recent", "puuid-1", "buddy", "Buddy", "1111", true, "teammate")
            .unwrap();
        conn.execute(
            "UPDATE party_matches SET recorded_at = ?1 WHERE match_id = 'match-recent'",
            [recent],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO usage_metrics_events (kind, occurred_at) VALUES ('cache_hit', ?1)",
            [old],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO usage_metrics_events (kind, occurred_at) VALUES ('cache_hit', ?1)",
            [recent],
        )
        .unwrap();

        purge_old_events(&conn);

        let party_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM party_matches", [], |r| r.get(0))
            .unwrap();
        assert_eq!(party_count, 1);
        let metrics_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM usage_metrics_events", [], |r| r.get(0))
            .unwrap();
        assert_eq!(metrics_count, 1);
    }

    #[test]
    fn add_column_if_missing_is_idempotent() {
        let conn = memory_conn();
        // Rejouer la migration (comme au prochain démarrage de l'app) ne doit pas
        // échouer sur la colonne déjà présente.
        run_migrations(&conn).unwrap();
        run_migrations(&conn).unwrap();
    }

    #[test]
    fn reset_local_stats_clears_cache_history_search_and_party_but_not_settings() {
        let conn = memory_conn();
        players::upsert_tracked_player(&conn, "puuid-1", "Player1", "1234", "eu").unwrap();
        snapshots::insert_rank_snapshot(&conn, "puuid-1", 10, "Argent 1", Some(20)).unwrap();
        party::record_party_match(&conn, "match-1", "puuid-1", "buddy", "Buddy", "1111", true, "teammate")
            .unwrap();
        cache_set_for_test(&conn, "https://example/api", "{}", 999_999_999_999);
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('henrik_api_key', 'secret')",
            [],
        )
        .unwrap();

        reset_local_stats(&conn).unwrap();

        assert!(players::list_recent_players(&conn, 10).unwrap().is_empty());
        assert!(snapshots::list_rank_snapshots(&conn, "puuid-1").unwrap().is_empty());
        assert!(party::list_duo_stats(&conn, "puuid-1", 1).unwrap().is_empty());
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

    #[test]
    fn reset_local_stats_also_clears_usage_metrics_events() {
        let conn = memory_conn();
        metrics::record_usage_event(&conn, metrics::UsageEventKind::ApiError, None).unwrap();

        reset_local_stats(&conn).unwrap();

        let summary = metrics::usage_metrics_summary(&conn, 0).unwrap();
        assert_eq!(summary.api_errors, 0);
    }

    #[test]
    fn reset_local_stats_also_clears_progression_goals() {
        let conn = memory_conn();
        goals::set_progression_goal(&conn, "puuid-1", 20, "Diamant 2", Some(50)).unwrap();

        reset_local_stats(&conn).unwrap();

        assert!(goals::get_progression_goal(&conn, "puuid-1").unwrap().is_none());
    }

    /// Backlog #88 : `maybe_vacuum` a besoin d'un fichier réel sur disque (pas
    /// `:memory:`) pour vérifier sa taille — connexion de test dédiée dans un dossier
    /// temporaire unique, nettoyée en fin de test.
    fn file_conn(path: &Path) -> Connection {
        let conn = Connection::open(path).unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn maybe_vacuum_purges_expired_cache_below_threshold_forces_run() {
        let path = std::env::temp_dir().join(format!(
            "val-tracker-test-vacuum-{}.db",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&path);
        let conn = file_conn(&path);

        let now = chrono::Utc::now().timestamp();
        conn.execute(
            "INSERT INTO api_cache (url, payload, expires_at) VALUES ('expired', 'x', ?1)",
            [now - 3600],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO api_cache (url, payload, expires_at) VALUES ('fresh', 'y', ?1)",
            [now + 3600],
        )
        .unwrap();

        // Seuil au-dessus de la taille réelle du fichier : ne doit rien purger.
        maybe_vacuum_with_threshold(&conn, &path, u64::MAX);
        let remaining: i64 = conn
            .query_row("SELECT COUNT(*) FROM api_cache", [], |row| row.get(0))
            .unwrap();
        assert_eq!(remaining, 2);

        // Seuil à 0 : force la purge + VACUUM, l'entrée expirée doit disparaître, la
        // fraîche doit rester.
        maybe_vacuum_with_threshold(&conn, &path, 0);
        let urls: Vec<String> = conn
            .prepare("SELECT url FROM api_cache ORDER BY url")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert_eq!(urls, vec!["fresh".to_string()]);

        drop(conn);
        let _ = std::fs::remove_file(&path);
    }
}
