//! Connexion SQLite locale (dossier de données Tauri) + migrations idempotentes.
//!
//! Une seule connexion est ouverte au démarrage et partagée (via `Arc<Mutex<Connection>>`
//! dans l'état géré par Tauri) entre les commands et la couche cache de `api::henrik`.

use std::path::{Path, PathBuf};

use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use tauri::{AppHandle, Manager};

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

    migrate_progression_goals_multi(conn)?;

    Ok(())
}

/// Backlog #55 : `progression_goals` avait `puuid` en clé primaire (un seul objectif de
/// rang par joueur) — les objectifs hebdo custom ("X matchs cette semaine", "winrate ≥
/// 50%") doivent pouvoir coexister avec l'objectif de rang existant, d'où le passage à une
/// clé auto-incrémentée + `UNIQUE(puuid, goal_type)`. `ALTER TABLE` ne sait pas changer une
/// clé primaire en SQLite : on reconstruit donc la table (idempotent, déclenché seulement
/// si `goal_type` n'existe pas encore) en préservant les objectifs de rang déjà enregistrés.
fn migrate_progression_goals_multi(conn: &Connection) -> rusqlite::Result<()> {
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

#[derive(Debug, Clone, Serialize)]
pub struct TrackedPlayer {
    pub puuid: String,
    pub name: String,
    pub tag: String,
    pub region: String,
    pub is_favorite: bool,
    pub last_viewed_at: i64,
    /// V4 : marque ce Riot ID comme l'un des comptes Valorant "à soi" de l'utilisateur
    /// (multi-comptes) — voir `set_self_account`/`list_self_accounts`. Distinct de
    /// `is_favorite`, qui reste un simple marque-page sur des profils tiers.
    pub is_self: bool,
    /// Backlog #12 : note libre attachée à ce joueur, éditable depuis Home.tsx. `None` si
    /// jamais renseignée.
    pub notes: Option<String>,
}

fn map_tracked_player(row: &rusqlite::Row) -> rusqlite::Result<TrackedPlayer> {
    Ok(TrackedPlayer {
        puuid: row.get(0)?,
        name: row.get(1)?,
        tag: row.get(2)?,
        region: row.get(3)?,
        is_favorite: row.get::<_, i64>(4)? != 0,
        last_viewed_at: row.get(5)?,
        is_self: row.get::<_, i64>(6)? != 0,
        notes: row.get(7)?,
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
        "SELECT puuid, name, tag, region, is_favorite, last_viewed_at, is_self, notes
         FROM tracked_players
         ORDER BY is_favorite DESC, last_viewed_at DESC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map([limit], map_tracked_player)?;
    rows.collect()
}

/// Retrouve un Riot ID déjà suivi par son puuid, sans filtrer sur `is_self` — utilisé par
/// le poller pour bâtir le lien direct vers le récap du dernier match dans la notification
/// de fin de partie (backlog #81 ; voir `riot_local::poller::on_state_changed`).
pub fn find_tracked_player(conn: &Connection, puuid: &str) -> rusqlite::Result<Option<TrackedPlayer>> {
    conn.query_row(
        "SELECT puuid, name, tag, region, is_favorite, last_viewed_at, is_self, notes
         FROM tracked_players WHERE puuid = ?1",
        [puuid],
        map_tracked_player,
    )
    .optional()
}

/// Marque (ou démarque) un Riot ID déjà suivi comme l'un des comptes "à soi" de
/// l'utilisateur (V4, multi-comptes) — voir doc de `TrackedPlayer::is_self`.
pub fn set_self_account(conn: &Connection, puuid: &str, is_self: bool) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE tracked_players SET is_self = ?2 WHERE puuid = ?1",
        (puuid, is_self as i64),
    )?;
    Ok(())
}

/// Comptes marqués `is_self`, triés par dernière consultation (le plus récemment
/// consulté/switché en premier) — alimente le sélecteur de comptes de TopNav.
pub fn list_self_accounts(conn: &Connection) -> rusqlite::Result<Vec<TrackedPlayer>> {
    let mut stmt = conn.prepare(
        "SELECT puuid, name, tag, region, is_favorite, last_viewed_at, is_self, notes
         FROM tracked_players
         WHERE is_self = 1
         ORDER BY last_viewed_at DESC",
    )?;
    let rows = stmt.query_map([], map_tracked_player)?;
    rows.collect()
}

/// Backlog #12 : enregistre (ou efface, si vide) la note libre attachée à un joueur suivi.
pub fn set_player_notes(conn: &Connection, puuid: &str, notes: &str) -> rusqlite::Result<()> {
    let trimmed = notes.trim();
    let value: Option<&str> = if trimmed.is_empty() { None } else { Some(trimmed) };
    conn.execute(
        "UPDATE tracked_players SET notes = ?2 WHERE puuid = ?1",
        (puuid, value),
    )?;
    Ok(())
}

/// Backlog #24 : dernier match pour lequel une alerte "N défaites d'affilée" a déjà été
/// envoyée à ce joueur — évite de renotifier à chaque refetch tant qu'aucune nouvelle
/// défaite n'a été jouée depuis (voir `commands::fetch_matches`).
pub fn last_loss_streak_notified_match_id(
    conn: &Connection,
    puuid: &str,
) -> rusqlite::Result<Option<String>> {
    conn.query_row(
        "SELECT last_loss_streak_notified_match_id FROM tracked_players WHERE puuid = ?1",
        [puuid],
        |row| row.get::<_, Option<String>>(0),
    )
    .optional()
    .map(|opt| opt.flatten())
}

pub fn set_last_loss_streak_notified_match_id(
    conn: &Connection,
    puuid: &str,
    match_id: &str,
) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE tracked_players SET last_loss_streak_notified_match_id = ?2 WHERE puuid = ?1",
        (puuid, match_id),
    )?;
    Ok(())
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

/// Backlog #27 : favoris triés par ordre explicite (`sort_order`), pour le drag & drop de
/// Search.tsx — distinct de `list_recent_players` qui trie par date de consultation.
pub fn list_favorite_players(conn: &Connection) -> rusqlite::Result<Vec<TrackedPlayer>> {
    let mut stmt = conn.prepare(
        "SELECT puuid, name, tag, region, is_favorite, last_viewed_at, is_self, notes
         FROM tracked_players
         WHERE is_favorite = 1
         ORDER BY sort_order ASC, last_viewed_at DESC",
    )?;
    let rows = stmt.query_map([], map_tracked_player)?;
    rows.collect()
}

/// Réassigne `sort_order` selon l'ordre de `ordered_puuids` (index = nouvel ordre) — la
/// liste complète des favoris dans leur nouvel ordre après un drag & drop, pas un delta.
pub fn reorder_favorites(conn: &Connection, ordered_puuids: &[String]) -> rusqlite::Result<()> {
    // Transaction : un échec au milieu de la boucle ne doit pas laisser un ordre à moitié
    // réassigné (mélange ancien/nouveau ordre).
    let tx = conn.unchecked_transaction()?;
    for (index, puuid) in ordered_puuids.iter().enumerate() {
        tx.execute(
            "UPDATE tracked_players SET sort_order = ?2 WHERE puuid = ?1",
            (puuid, index as i64),
        )?;
    }
    tx.commit()
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
         DELETE FROM party_matches; DELETE FROM usage_metrics_events;
         DELETE FROM progression_goals;",
    )
}

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

/// Nature d'un évènement de métrique d'usage local (backlog #50) — jamais transmis nulle
/// part, juste accumulé dans `usage_metrics_events` pour le dashboard Paramètres → Santé.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UsageEventKind {
    /// Requête servie depuis le cache SQLite encore frais, sans appel réseau.
    CacheHit,
    /// Cache absent/périmé : appel réseau Henrik effectué avec succès.
    NetworkFetch,
    /// Appel réseau Henrik en échec (rate limit, circuit breaker, panne...).
    ApiError,
}

impl UsageEventKind {
    fn as_str(self) -> &'static str {
        match self {
            UsageEventKind::CacheHit => "cache_hit",
            UsageEventKind::NetworkFetch => "network_fetch",
            UsageEventKind::ApiError => "api_error",
        }
    }
}

/// Enregistre un évènement de métrique d'usage. Best-effort côté appelant : une écriture
/// manquée ne doit jamais faire échouer la requête Henrik qu'elle mesure.
pub fn record_usage_event(conn: &Connection, kind: UsageEventKind) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO usage_metrics_events (kind, occurred_at) VALUES (?1, ?2)",
        rusqlite::params![kind.as_str(), chrono::Utc::now().timestamp()],
    )?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct UsageMetricsSummary {
    pub cache_hits: i64,
    pub network_fetches: i64,
    pub api_errors: i64,
}

/// Résumé des métriques d'usage depuis `since_ts` (typiquement les 7 derniers jours) —
/// alimente le dashboard santé de Paramètres.
pub fn usage_metrics_summary(
    conn: &Connection,
    since_ts: i64,
) -> rusqlite::Result<UsageMetricsSummary> {
    let mut stmt = conn.prepare(
        "SELECT kind, COUNT(*) FROM usage_metrics_events
         WHERE occurred_at >= ?1
         GROUP BY kind",
    )?;
    let mut summary = UsageMetricsSummary::default();
    let rows = stmt.query_map([since_ts], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;
    for row in rows {
        let (kind, count) = row?;
        match kind.as_str() {
            "cache_hit" => summary.cache_hits = count,
            "network_fetch" => summary.network_fetches = count,
            "api_error" => summary.api_errors = count,
            _ => {}
        }
    }
    Ok(summary)
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

/// Backlog #23 : extension de `DuoStat` à des trios ("squad") — deux coéquipiers
/// (`teammate_a`/`teammate_b`) qui ont partagé le même `party_id` que `tracked_puuid` sur
/// les mêmes matchs, via un auto-jointure de `party_matches` sur `match_id` +
/// `tracked_puuid` (voir `list_squad_stats`).
#[derive(Debug, Clone, Serialize)]
pub struct SquadStat {
    pub teammate_a_puuid: String,
    pub teammate_a_name: String,
    pub teammate_a_tag: String,
    pub teammate_b_puuid: String,
    pub teammate_b_name: String,
    pub teammate_b_tag: String,
    pub matches_played: i64,
    pub matches_won: i64,
}

/// Agrège les matchs joués avec deux coéquipiers *simultanément* (squad de 3, tracked_puuid
/// inclus) — auto-jointure de `party_matches` sur le même match/tracked_puuid, avec
/// `a.teammate_puuid < b.teammate_puuid` pour ne compter chaque paire qu'une fois.
pub fn list_squad_stats(
    conn: &Connection,
    tracked_puuid: &str,
    min_matches: i64,
) -> rusqlite::Result<Vec<SquadStat>> {
    let mut stmt = conn.prepare(
        "SELECT a.teammate_puuid, a.teammate_name, a.teammate_tag,
                b.teammate_puuid, b.teammate_name, b.teammate_tag,
                COUNT(*) AS matches_played, SUM(a.won) AS matches_won
         FROM party_matches a
         JOIN party_matches b
            ON a.match_id = b.match_id
            AND a.tracked_puuid = b.tracked_puuid
            AND a.teammate_puuid < b.teammate_puuid
         WHERE a.tracked_puuid = ?1
         GROUP BY a.teammate_puuid, b.teammate_puuid
         HAVING matches_played >= ?2
         ORDER BY matches_played DESC, matches_won DESC",
    )?;
    let rows = stmt.query_map((tracked_puuid, min_matches), |row| {
        Ok(SquadStat {
            teammate_a_puuid: row.get(0)?,
            teammate_a_name: row.get(1)?,
            teammate_a_tag: row.get(2)?,
            teammate_b_puuid: row.get(3)?,
            teammate_b_name: row.get(4)?,
            teammate_b_tag: row.get(5)?,
            matches_played: row.get(6)?,
            matches_won: row.get(7)?,
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
    fn set_self_account_then_list_self_accounts() {
        let conn = memory_conn();
        upsert_tracked_player(&conn, "puuid-1", "Me", "1234", "eu").unwrap();
        upsert_tracked_player(&conn, "puuid-2", "SomeoneElse", "5678", "eu").unwrap();

        assert!(list_self_accounts(&conn).unwrap().is_empty());

        set_self_account(&conn, "puuid-1", true).unwrap();
        let selves = list_self_accounts(&conn).unwrap();
        assert_eq!(selves.len(), 1);
        assert_eq!(selves[0].puuid, "puuid-1");
        assert!(selves[0].is_self);

        set_self_account(&conn, "puuid-1", false).unwrap();
        assert!(list_self_accounts(&conn).unwrap().is_empty());
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

    #[test]
    fn usage_metrics_summary_counts_events_by_kind() {
        let conn = memory_conn();
        record_usage_event(&conn, UsageEventKind::CacheHit).unwrap();
        record_usage_event(&conn, UsageEventKind::CacheHit).unwrap();
        record_usage_event(&conn, UsageEventKind::NetworkFetch).unwrap();
        record_usage_event(&conn, UsageEventKind::ApiError).unwrap();

        let summary = usage_metrics_summary(&conn, 0).unwrap();
        assert_eq!(summary.cache_hits, 2);
        assert_eq!(summary.network_fetches, 1);
        assert_eq!(summary.api_errors, 1);
    }

    #[test]
    fn usage_metrics_summary_ignores_events_before_the_window() {
        let conn = memory_conn();
        conn.execute(
            "INSERT INTO usage_metrics_events (kind, occurred_at) VALUES ('cache_hit', 100)",
            [],
        )
        .unwrap();

        let summary = usage_metrics_summary(&conn, 500).unwrap();
        assert_eq!(summary.cache_hits, 0);
    }

    #[test]
    fn reset_local_stats_also_clears_usage_metrics_events() {
        let conn = memory_conn();
        record_usage_event(&conn, UsageEventKind::ApiError).unwrap();

        reset_local_stats(&conn).unwrap();

        let summary = usage_metrics_summary(&conn, 0).unwrap();
        assert_eq!(summary.api_errors, 0);
    }

    #[test]
    fn player_notes_round_trip_and_clear_on_blank() {
        let conn = memory_conn();
        upsert_tracked_player(&conn, "puuid-1", "Player1", "1234", "eu").unwrap();
        assert!(list_recent_players(&conn, 10).unwrap()[0].notes.is_none());

        set_player_notes(&conn, "puuid-1", "  smurf, duo régulier  ").unwrap();
        assert_eq!(
            list_recent_players(&conn, 10).unwrap()[0].notes.as_deref(),
            Some("smurf, duo régulier")
        );

        set_player_notes(&conn, "puuid-1", "   ").unwrap();
        assert!(list_recent_players(&conn, 10).unwrap()[0].notes.is_none());
    }

    #[test]
    fn loss_streak_notified_marker_round_trip() {
        let conn = memory_conn();
        upsert_tracked_player(&conn, "puuid-1", "Player1", "1234", "eu").unwrap();
        assert!(last_loss_streak_notified_match_id(&conn, "puuid-1")
            .unwrap()
            .is_none());

        set_last_loss_streak_notified_match_id(&conn, "puuid-1", "match-1").unwrap();
        assert_eq!(
            last_loss_streak_notified_match_id(&conn, "puuid-1").unwrap(),
            Some("match-1".to_string())
        );
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
    fn reset_local_stats_also_clears_progression_goals() {
        let conn = memory_conn();
        set_progression_goal(&conn, "puuid-1", 20, "Diamant 2", Some(50)).unwrap();

        reset_local_stats(&conn).unwrap();

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

    #[test]
    fn reorder_favorites_then_list_favorite_players_respects_order() {
        let conn = memory_conn();
        upsert_tracked_player(&conn, "puuid-1", "Player1", "1234", "eu").unwrap();
        upsert_tracked_player(&conn, "puuid-2", "Player2", "5678", "eu").unwrap();
        upsert_tracked_player(&conn, "puuid-3", "Player3", "9999", "eu").unwrap();
        toggle_favorite(&conn, "puuid-1").unwrap();
        toggle_favorite(&conn, "puuid-2").unwrap();
        // puuid-3 reste non-favori : ne doit jamais apparaître dans la liste.

        reorder_favorites(
            &conn,
            &["puuid-2".to_string(), "puuid-1".to_string()],
        )
        .unwrap();

        let favorites = list_favorite_players(&conn).unwrap();
        assert_eq!(favorites.len(), 2);
        assert_eq!(favorites[0].puuid, "puuid-2");
        assert_eq!(favorites[1].puuid, "puuid-1");
    }

    #[test]
    fn list_squad_stats_aggregates_pairs_of_teammates_sharing_the_same_match() {
        let conn = memory_conn();
        record_party_match(&conn, "match-1", "me", "alice", "Alice", "1111", true).unwrap();
        record_party_match(&conn, "match-1", "me", "bob", "Bob", "2222", true).unwrap();
        record_party_match(&conn, "match-2", "me", "alice", "Alice", "1111", false).unwrap();
        record_party_match(&conn, "match-2", "me", "bob", "Bob", "2222", false).unwrap();
        // Match-3 : Alice seule (pas de squad complet), ne doit pas compter comme trio.
        record_party_match(&conn, "match-3", "me", "alice", "Alice", "1111", true).unwrap();

        let squads = list_squad_stats(&conn, "me", 1).unwrap();
        assert_eq!(squads.len(), 1);
        assert_eq!(squads[0].matches_played, 2);
        assert_eq!(squads[0].matches_won, 1);
        // Ordre alphabétique du puuid pour ne pas dupliquer la paire (a < b).
        assert_eq!(squads[0].teammate_a_puuid, "alice");
        assert_eq!(squads[0].teammate_b_puuid, "bob");
    }

    #[test]
    fn list_squad_stats_filters_below_min_matches() {
        let conn = memory_conn();
        record_party_match(&conn, "match-1", "me", "alice", "Alice", "1111", true).unwrap();
        record_party_match(&conn, "match-1", "me", "bob", "Bob", "2222", true).unwrap();

        assert_eq!(list_squad_stats(&conn, "me", 2).unwrap().len(), 0);
        assert_eq!(list_squad_stats(&conn, "me", 1).unwrap().len(), 1);
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
