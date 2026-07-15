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

/// Enregistre un évènement de métrique d'usage, avec une durée en millisecondes pour les
/// évènements qui ont effectivement touché le réseau (`NetworkFetch`/`ApiError`) — `None`
/// pour `CacheHit`, qui n'a pas de latence réseau à mesurer. Best-effort côté appelant :
/// une écriture manquée ne doit jamais faire échouer la requête Henrik qu'elle mesure.
pub fn record_usage_event(
    conn: &Connection,
    kind: UsageEventKind,
    duration_ms: Option<i64>,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO usage_metrics_events (kind, occurred_at, duration_ms) VALUES (?1, ?2, ?3)",
        rusqlite::params![kind.as_str(), chrono::Utc::now().timestamp(), duration_ms],
    )?;
    Ok(())
}

/// Une tranche de l'histogramme de latence — bornes en millisecondes, `max_ms: None` pour
/// la dernière tranche ouverte ("2000ms et plus").
#[derive(Debug, Clone, Serialize)]
pub struct LatencyBucket {
    pub label: &'static str,
    pub count: i64,
}

/// Bornes hautes (exclusives) des tranches de l'histogramme, dans l'ordre. La dernière
/// tranche ("2000ms+") n'a pas de borne haute.
const BUCKET_BOUNDS_MS: [(i64, &str); 4] =
    [(200, "<200ms"), (500, "200-500ms"), (1000, "500ms-1s"), (2000, "1-2s")];
const LAST_BUCKET_LABEL: &str = "2s+";

#[derive(Debug, Clone, Serialize, Default)]
pub struct UsageMetricsSummary {
    pub cache_hits: i64,
    pub network_fetches: i64,
    pub api_errors: i64,
    /// Latence moyenne des requêtes réseau (fetch + erreurs), en millisecondes — `None` si
    /// aucune requête réseau n'a de durée mesurée dans la fenêtre (build antérieur à
    /// l'ajout de `duration_ms`, ou fenêtre vide).
    pub avg_duration_ms: Option<i64>,
    /// Histogramme sommaire des durées de requête réseau, tranches croissantes.
    pub duration_buckets: Vec<LatencyBucket>,
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

    let mut durations_stmt = conn.prepare(
        "SELECT duration_ms FROM usage_metrics_events
         WHERE occurred_at >= ?1 AND duration_ms IS NOT NULL",
    )?;
    let durations: Vec<i64> = durations_stmt
        .query_map([since_ts], |row| row.get::<_, i64>(0))?
        .filter_map(Result::ok)
        .collect();

    if !durations.is_empty() {
        summary.avg_duration_ms = Some(durations.iter().sum::<i64>() / durations.len() as i64);
    }
    summary.duration_buckets = bucket_durations(&durations);

    Ok(summary)
}

fn bucket_durations(durations: &[i64]) -> Vec<LatencyBucket> {
    let mut counts = vec![0i64; BUCKET_BOUNDS_MS.len() + 1];
    for &d in durations {
        let idx = BUCKET_BOUNDS_MS
            .iter()
            .position(|(bound, _)| d < *bound)
            .unwrap_or(BUCKET_BOUNDS_MS.len());
        counts[idx] += 1;
    }
    BUCKET_BOUNDS_MS
        .iter()
        .map(|(_, label)| *label)
        .chain(std::iter::once(LAST_BUCKET_LABEL))
        .zip(counts)
        .map(|(label, count)| LatencyBucket { label, count })
        .collect()
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
        record_usage_event(&conn, UsageEventKind::CacheHit, None).unwrap();
        record_usage_event(&conn, UsageEventKind::CacheHit, None).unwrap();
        record_usage_event(&conn, UsageEventKind::NetworkFetch, Some(120)).unwrap();
        record_usage_event(&conn, UsageEventKind::ApiError, Some(3000)).unwrap();

        let summary = usage_metrics_summary(&conn, 0).unwrap();
        assert_eq!(summary.cache_hits, 2);
        assert_eq!(summary.network_fetches, 1);
        assert_eq!(summary.api_errors, 1);
        assert_eq!(summary.avg_duration_ms, Some(1560));
        let lt_200 = summary.duration_buckets.iter().find(|b| b.label == "<200ms").unwrap();
        assert_eq!(lt_200.count, 1);
        let gt_2s = summary.duration_buckets.iter().find(|b| b.label == "2s+").unwrap();
        assert_eq!(gt_2s.count, 1);
    }

    #[test]
    fn usage_metrics_summary_has_no_avg_duration_without_network_events() {
        let conn = memory_conn();
        record_usage_event(&conn, UsageEventKind::CacheHit, None).unwrap();

        let summary = usage_metrics_summary(&conn, 0).unwrap();
        assert_eq!(summary.avg_duration_ms, None);
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
