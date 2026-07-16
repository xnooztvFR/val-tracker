# Schéma SQLite

Généré depuis `src-tauri/src/db/*.rs` via `cargo test generate_schema_doc -- --ignored --nocapture` (introspection SQLite après migrations, pas un parsing statique) — à régénérer après toute migration ajoutée. `PRAGMA user_version` courant : 1.

## `api_cache`

| Colonne | Type | NOT NULL | Défaut | PK |
| --- | --- | --- | --- | --- |
| url | TEXT |  |  | oui |
| payload | TEXT | oui |  |  |
| expires_at | INTEGER | oui |  |  |

Index :

- `idx_api_cache_expires_at` — `CREATE INDEX idx_api_cache_expires_at
            ON api_cache (expires_at)`

## `changelog_history`

| Colonne | Type | NOT NULL | Défaut | PK |
| --- | --- | --- | --- | --- |
| id | INTEGER |  |  | oui |
| version | TEXT | oui |  |  |
| notes | TEXT | oui |  |  |
| installed_at | INTEGER | oui |  |  |

## `party_matches`

| Colonne | Type | NOT NULL | Défaut | PK |
| --- | --- | --- | --- | --- |
| match_id | TEXT | oui |  | oui |
| tracked_puuid | TEXT | oui |  | oui |
| teammate_puuid | TEXT | oui |  | oui |
| teammate_name | TEXT | oui |  |  |
| teammate_tag | TEXT | oui |  |  |
| won | INTEGER | oui |  |  |
| recorded_at | INTEGER | oui |  |  |
| relation | TEXT | oui | 'teammate' |  |

Index :

- `idx_party_matches_tracked` — `CREATE INDEX idx_party_matches_tracked
            ON party_matches (tracked_puuid, teammate_puuid)`

## `progression_goals`

| Colonne | Type | NOT NULL | Défaut | PK |
| --- | --- | --- | --- | --- |
| id | INTEGER |  |  | oui |
| puuid | TEXT | oui |  |  |
| goal_type | TEXT | oui | 'rank' |  |
| target_tier | INTEGER |  |  |  |
| target_tier_patched | TEXT |  |  |  |
| target_rr | INTEGER |  |  |  |
| target_value | INTEGER |  |  |  |
| created_at | INTEGER | oui |  |  |

## `rank_snapshots`

| Colonne | Type | NOT NULL | Défaut | PK |
| --- | --- | --- | --- | --- |
| id | INTEGER |  |  | oui |
| puuid | TEXT | oui |  |  |
| tier | INTEGER | oui |  |  |
| tier_patched | TEXT | oui |  |  |
| rr | INTEGER |  |  |  |
| recorded_at | INTEGER | oui |  |  |

Index :

- `idx_rank_snapshots_puuid` — `CREATE INDEX idx_rank_snapshots_puuid
            ON rank_snapshots (puuid, recorded_at)`

## `settings`

| Colonne | Type | NOT NULL | Défaut | PK |
| --- | --- | --- | --- | --- |
| key | TEXT |  |  | oui |
| value | TEXT | oui |  |  |

## `timeline_events`

| Colonne | Type | NOT NULL | Défaut | PK |
| --- | --- | --- | --- | --- |
| id | INTEGER |  |  | oui |
| puuid | TEXT | oui |  |  |
| event_type | TEXT | oui |  |  |
| goal_type | TEXT |  |  |  |
| period_key | TEXT |  |  |  |
| occurred_at | INTEGER | oui |  |  |

Index :

- `idx_timeline_events_puuid` — `CREATE INDEX idx_timeline_events_puuid
            ON timeline_events (puuid, occurred_at)`

## `tracked_players`

| Colonne | Type | NOT NULL | Défaut | PK |
| --- | --- | --- | --- | --- |
| puuid | TEXT |  |  | oui |
| name | TEXT | oui |  |  |
| tag | TEXT | oui |  |  |
| region | TEXT | oui |  |  |
| is_favorite | INTEGER | oui | 0 |  |
| last_viewed_at | INTEGER | oui |  |  |
| is_self | INTEGER | oui | 0 |  |
| notes | TEXT |  |  |  |
| last_loss_streak_notified_match_id | TEXT |  |  |  |
| sort_order | INTEGER | oui | 0 |  |
| loss_streak_alert_count | INTEGER |  |  |  |
| notes_updated_at | INTEGER |  |  |  |
| tags | TEXT | oui | '' |  |

Index :

- `idx_tracked_players_last_viewed` — `CREATE INDEX idx_tracked_players_last_viewed
            ON tracked_players (last_viewed_at DESC)`

## `usage_metrics_events`

| Colonne | Type | NOT NULL | Défaut | PK |
| --- | --- | --- | --- | --- |
| id | INTEGER |  |  | oui |
| kind | TEXT | oui |  |  |
| occurred_at | INTEGER | oui |  |  |
| duration_ms | INTEGER |  |  |  |

Index :

- `idx_usage_metrics_events_occurred_at` — `CREATE INDEX idx_usage_metrics_events_occurred_at
            ON usage_metrics_events (occurred_at)`

