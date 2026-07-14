//! `usage_metrics_events` : métriques d'usage local (backlog #50), opt-in, jamais transmises
//! nulle part — juste un petit dashboard santé (taux de cache hit, erreurs API des 7 derniers
//! jours) pour le dev solo.

use rusqlite::Connection;
use serde::Serialize;

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

#[cfg(test)]
mod tests {
    use super::*;

    fn memory_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&conn).unwrap();
        conn
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
}
