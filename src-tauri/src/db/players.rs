//! `tracked_players` : historique de recherche, favoris, comptes "à soi" (V4), notes perso.

use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;

/// Marqueur de préfixe distinguant une note chiffrée via DPAPI d'une note en clair héritée
/// d'une version antérieure de l'app (avant le chiffrement au repos) — même convention que
/// `settings.rs::DPAPI_PREFIX` pour la clé API Henrik. Sans ça, `tracked_players.notes`
/// restait en clair dans `val-tracker.db`, lisible par n'importe quel outil SQLite avec accès
/// au dossier de données, alors que le PIN (backlog #99) ne protège que l'affichage.
const NOTES_DPAPI_PREFIX: &str = "dpapi:";

fn encrypt_notes(notes: &str) -> String {
    match crate::dpapi::protect(notes) {
        Ok(encrypted) => format!("{NOTES_DPAPI_PREFIX}{encrypted}"),
        Err(e) => {
            crate::applog!(
                "[db] chiffrement DPAPI de la note perso échoué, stockage en clair en secours: {e}"
            );
            notes.to_string()
        }
    }
}

/// Déchiffre une note lue en base. Une valeur sans le préfixe `dpapi:` est une note
/// enregistrée par une version antérieure de l'app (en clair) : renvoyée telle quelle,
/// re-chiffrée transparemment à la prochaine sauvegarde via `set_player_notes` (pas de
/// migration au moment de la lecture ici, contrairement à `settings::get_encrypted` — cette
/// fonction ne reçoit pas de `Connection` pour ré-écrire, seulement la ligne).
fn decrypt_notes(raw: Option<String>) -> Option<String> {
    let raw = raw?;
    match raw.strip_prefix(NOTES_DPAPI_PREFIX) {
        Some(encoded) => match crate::dpapi::unprotect(encoded) {
            Ok(plain) => Some(plain),
            Err(e) => {
                // Un blob DPAPI illisible (profil Windows recréé, compte migré...) ne doit
                // jamais faire planter le chargement de la liste des joueurs suivis.
                crate::applog!("[db] déchiffrement DPAPI de la note perso échoué: {e}");
                None
            }
        },
        None => Some(raw),
    }
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
    /// TODO stats & analyse joueur : tags structurés (smurf/toxique/carry/duo régulier...),
    /// liste de slugs fixes — voir `set_player_tags`/`ALLOWED_TAGS`.
    pub tags: Vec<String>,
}

/// Liste fermée de tags autorisés — un slug hors de cette liste est rejeté par
/// `set_player_tags` plutôt que stocké tel quel, pour garder les filtres des écrans
/// duo/rivalité prévisibles (pas de texte libre ici, contrairement à `notes`).
pub const ALLOWED_TAGS: &[&str] = &["smurf", "toxic", "carry", "regular_duo"];

fn parse_tags(raw: String) -> Vec<String> {
    raw.split(',').map(str::trim).filter(|s| !s.is_empty()).map(str::to_string).collect()
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
        notes: decrypt_notes(row.get(7)?),
        tags: parse_tags(row.get(8)?),
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
        "SELECT puuid, name, tag, region, is_favorite, last_viewed_at, is_self, notes, tags
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
        "SELECT puuid, name, tag, region, is_favorite, last_viewed_at, is_self, notes, tags
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
        "SELECT puuid, name, tag, region, is_favorite, last_viewed_at, is_self, notes, tags
         FROM tracked_players
         WHERE is_self = 1
         ORDER BY last_viewed_at DESC",
    )?;
    let rows = stmt.query_map([], map_tracked_player)?;
    rows.collect()
}

/// Backlog #12 : enregistre (ou efface, si vide) la note libre attachée à un joueur suivi.
/// Backlog #57 : mémorise aussi la date de dernière modification (`notes_updated_at`), pour
/// placer un marqueur "note mise à jour" sur la frise "vie du compte" sans dupliquer le
/// contenu de la note elle-même (voir `list_account_timeline`) — effacé en même temps que
/// la note quand elle redevient vide.
pub fn set_player_notes(conn: &Connection, puuid: &str, notes: &str) -> rusqlite::Result<()> {
    let trimmed = notes.trim();
    let value: Option<String> = if trimmed.is_empty() {
        None
    } else {
        Some(encrypt_notes(trimmed))
    };
    let updated_at = value.as_ref().map(|_| chrono::Utc::now().timestamp());
    conn.execute(
        "UPDATE tracked_players SET notes = ?2, notes_updated_at = ?3 WHERE puuid = ?1",
        (puuid, value, updated_at),
    )?;
    Ok(())
}

/// TODO stats & analyse joueur : enregistre les tags structurés d'un joueur suivi (liste
/// fermée, voir `ALLOWED_TAGS`) — tags hors liste silencieusement ignorés plutôt que de faire
/// échouer toute la sauvegarde pour une valeur obsolète (ex. renommage futur d'un slug).
pub fn set_player_tags(conn: &Connection, puuid: &str, tags: &[String]) -> rusqlite::Result<()> {
    let mut deduped: Vec<&str> = tags
        .iter()
        .map(String::as_str)
        .filter(|t| ALLOWED_TAGS.contains(t))
        .collect();
    deduped.sort_unstable();
    deduped.dedup();
    let value = deduped.join(",");
    conn.execute("UPDATE tracked_players SET tags = ?2 WHERE puuid = ?1", (puuid, value))?;
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
        "SELECT puuid, name, tag, region, is_favorite, last_viewed_at, is_self, notes, tags
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

#[cfg(test)]
mod tests {
    use super::*;

    fn memory_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&conn).unwrap();
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
    fn player_tags_round_trip_deduped_sorted_and_filters_unknown_slugs() {
        let conn = memory_conn();
        upsert_tracked_player(&conn, "puuid-1", "Player1", "1234", "eu").unwrap();
        assert!(list_recent_players(&conn, 10).unwrap()[0].tags.is_empty());

        set_player_tags(
            &conn,
            "puuid-1",
            &[
                "carry".to_string(),
                "smurf".to_string(),
                "smurf".to_string(),
                "not_a_real_tag".to_string(),
            ],
        )
        .unwrap();
        assert_eq!(
            list_recent_players(&conn, 10).unwrap()[0].tags,
            vec!["carry".to_string(), "smurf".to_string()]
        );

        set_player_tags(&conn, "puuid-1", &[]).unwrap();
        assert!(list_recent_players(&conn, 10).unwrap()[0].tags.is_empty());
    }

    #[test]
    fn player_notes_are_encrypted_at_rest() {
        let conn = memory_conn();
        upsert_tracked_player(&conn, "puuid-1", "Player1", "1234", "eu").unwrap();
        set_player_notes(&conn, "puuid-1", "smurf, duo régulier").unwrap();

        let raw: String = conn
            .query_row(
                "SELECT notes FROM tracked_players WHERE puuid = 'puuid-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(raw.starts_with(NOTES_DPAPI_PREFIX));
        assert!(!raw.contains("smurf"));

        // Relue via l'API publique, la note redevient lisible.
        assert_eq!(
            list_recent_players(&conn, 10).unwrap()[0].notes.as_deref(),
            Some("smurf, duo régulier")
        );
    }

    #[test]
    fn legacy_plaintext_notes_are_still_readable() {
        let conn = memory_conn();
        upsert_tracked_player(&conn, "puuid-1", "Player1", "1234", "eu").unwrap();
        // Simule une note enregistrée par une version antérieure de l'app, avant l'ajout du
        // chiffrement au repos — stockée en clair.
        conn.execute(
            "UPDATE tracked_players SET notes = 'legacy plaintext note', notes_updated_at = 1 WHERE puuid = 'puuid-1'",
            [],
        )
        .unwrap();

        assert_eq!(
            list_recent_players(&conn, 10).unwrap()[0].notes.as_deref(),
            Some("legacy plaintext note")
        );
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
}
