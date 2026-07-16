//! `party_matches` : co-occurrences de `party_id` par match consulté — alimente les stats de
//! duo/squad et la rivalité (backlog #58), sans jamais avoir à refetch Henrik en masse.

use rusqlite::Connection;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct DuoStat {
    pub teammate_puuid: String,
    pub teammate_name: String,
    pub teammate_tag: String,
    pub matches_played: i64,
    pub matches_won: i64,
}

/// Enregistre qu'un coéquipier (relation = "teammate") ou un adversaire (relation =
/// "opponent", backlog #58) partageait ce match avec `tracked_puuid`. Idempotent : rejouer
/// le même match (ex. `force` refresh) écrase juste le nom/tag/résultat au lieu de
/// dupliquer la ligne (clé primaire composite) — un joueur ne peut être à la fois
/// coéquipier et adversaire sur un même match, donc la relation ne change jamais pour une
/// même ligne en pratique.
#[allow(clippy::too_many_arguments)]
pub fn record_party_match(
    conn: &Connection,
    match_id: &str,
    tracked_puuid: &str,
    teammate_puuid: &str,
    teammate_name: &str,
    teammate_tag: &str,
    won: bool,
    relation: &str,
) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "INSERT INTO party_matches
            (match_id, tracked_puuid, teammate_puuid, teammate_name, teammate_tag, won, recorded_at, relation)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(match_id, tracked_puuid, teammate_puuid) DO UPDATE SET
            teammate_name = excluded.teammate_name,
            teammate_tag = excluded.teammate_tag,
            won = excluded.won,
            relation = excluded.relation",
        (
            match_id,
            tracked_puuid,
            teammate_puuid,
            teammate_name,
            teammate_tag,
            won as i64,
            now,
            relation,
        ),
    )?;
    Ok(())
}

/// Liste les `match_id` distincts pour lesquels `tracked_puuid` a une ligne dans
/// `party_matches` (coéquipier ou adversaire) — utilisé pour borner un scan de cache de
/// détail de match à ce que ce joueur a effectivement déjà consulté, plutôt que tout le
/// cache `api_cache` de l'app (voir `api::henrik::endpoints::get_cached_match_details_for_puuid`).
pub fn list_match_ids_for_puuid(conn: &Connection, puuid: &str) -> rusqlite::Result<Vec<String>> {
    let mut stmt =
        conn.prepare("SELECT DISTINCT match_id FROM party_matches WHERE tracked_puuid = ?1")?;
    let rows = stmt.query_map([puuid], |row| row.get::<_, String>(0))?;
    rows.collect()
}

/// Agrège les matchs en duo/squad par coéquipier, triés par nombre de matchs joués
/// ensemble. `min_matches` filtre le bruit (un seul match commun, party de passage).
/// TODO Social/multi-comptes : `since_ts` (timestamp Unix, `None` = pas de filtre) ne garde
/// que les matchs enregistrés depuis cette date — garde ces panneaux pertinents dans le
/// temps ("coéquipier des 30 derniers jours" vs "coéquipier occasionnel d'il y a un an").
pub fn list_duo_stats(
    conn: &Connection,
    tracked_puuid: &str,
    min_matches: i64,
    since_ts: Option<i64>,
) -> rusqlite::Result<Vec<DuoStat>> {
    let mut stmt = conn.prepare(
        "SELECT teammate_puuid, teammate_name, teammate_tag,
                COUNT(*) AS matches_played, SUM(won) AS matches_won
         FROM party_matches
         WHERE tracked_puuid = ?1 AND relation = 'teammate'
               AND (?3 IS NULL OR recorded_at >= ?3)
         GROUP BY teammate_puuid
         HAVING matches_played >= ?2
         ORDER BY matches_played DESC, matches_won DESC",
    )?;
    let rows = stmt.query_map((tracked_puuid, min_matches, since_ts), |row| {
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

#[derive(Debug, Clone, Serialize)]
pub struct RivalryStat {
    pub opponent_puuid: String,
    pub opponent_name: String,
    pub opponent_tag: String,
    pub matches_played: i64,
    pub matches_won: i64,
}

/// Backlog #58 : rivalité suivie en continu — winrate face à un adversaire rencontré à
/// plusieurs reprises, réutilisant `party_matches`/le même schéma d'agrégation que
/// `list_duo_stats` (relation = "opponent" au lieu de "teammate"). Alimenté par
/// `record_party_match`, accumulé au fil de la consultation des matchs dans l'historique —
/// aucun appel réseau dédié.
pub fn list_rivalry_stats(
    conn: &Connection,
    tracked_puuid: &str,
    min_matches: i64,
    since_ts: Option<i64>,
) -> rusqlite::Result<Vec<RivalryStat>> {
    let mut stmt = conn.prepare(
        "SELECT teammate_puuid, teammate_name, teammate_tag,
                COUNT(*) AS matches_played, SUM(won) AS matches_won
         FROM party_matches
         WHERE tracked_puuid = ?1 AND relation = 'opponent'
               AND (?3 IS NULL OR recorded_at >= ?3)
         GROUP BY teammate_puuid
         HAVING matches_played >= ?2
         ORDER BY matches_played DESC, matches_won DESC",
    )?;
    let rows = stmt.query_map((tracked_puuid, min_matches, since_ts), |row| {
        Ok(RivalryStat {
            opponent_puuid: row.get(0)?,
            opponent_name: row.get(1)?,
            opponent_tag: row.get(2)?,
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
    since_ts: Option<i64>,
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
         WHERE a.tracked_puuid = ?1 AND a.relation = 'teammate' AND b.relation = 'teammate'
               AND (?3 IS NULL OR a.recorded_at >= ?3)
         GROUP BY a.teammate_puuid, b.teammate_puuid
         HAVING matches_played >= ?2
         ORDER BY matches_played DESC, matches_won DESC",
    )?;
    let rows = stmt.query_map((tracked_puuid, min_matches, since_ts), |row| {
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

/// TODO Fonctionnalités#1 : un membre d'un roster complet à 5 (voir `list_full_roster_stats`).
#[derive(Debug, Clone, Serialize)]
pub struct RosterMember {
    pub puuid: String,
    pub name: String,
    pub tag: String,
}

/// TODO Fonctionnalités#1 : historique de composition d'équipe — au-delà du duo/squad (2-3
/// coéquipiers), regroupe les matchs où `tracked_puuid` avait exactement 4 coéquipiers en
/// party (roster complet de 5) et rappelle le bilan de chaque composition rencontrée
/// plusieurs fois. Pas de requête SQL group-by directe possible ici (l'ensemble des 4
/// coéquipiers varie par match) : on agrège donc en mémoire après avoir groupé les lignes de
/// `party_matches` par `match_id`.
#[derive(Debug, Clone, Serialize)]
pub struct FullRosterStat {
    pub members: Vec<RosterMember>,
    pub matches_played: i64,
    pub matches_won: i64,
}

pub fn list_full_roster_stats(
    conn: &Connection,
    tracked_puuid: &str,
    min_matches: i64,
    since_ts: Option<i64>,
) -> rusqlite::Result<Vec<FullRosterStat>> {
    let mut stmt = conn.prepare(
        "SELECT match_id, teammate_puuid, teammate_name, teammate_tag, won, recorded_at
         FROM party_matches
         WHERE tracked_puuid = ?1 AND relation = 'teammate'
         ORDER BY match_id",
    )?;
    let rows = stmt.query_map([tracked_puuid], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, i64>(4)?,
            row.get::<_, i64>(5)?,
        ))
    })?;

    use std::collections::HashMap;
    let mut by_match: HashMap<String, Vec<(String, String, String, i64, i64)>> = HashMap::new();
    for row in rows {
        let (match_id, puuid, name, tag, won, recorded_at) = row?;
        if let Some(since) = since_ts {
            if recorded_at < since {
                continue;
            }
        }
        by_match
            .entry(match_id)
            .or_default()
            .push((puuid, name, tag, won, recorded_at));
    }

    // Roster complet = exactement 4 coéquipiers en plus de tracked_puuid (squad de 5).
    let mut aggregated: HashMap<String, (Vec<RosterMember>, i64, i64)> = HashMap::new();
    for (_match_id, mut teammates) in by_match {
        if teammates.len() != 4 {
            continue;
        }
        teammates.sort_by(|a, b| a.0.cmp(&b.0));
        let key = teammates
            .iter()
            .map(|t| t.0.as_str())
            .collect::<Vec<_>>()
            .join(",");
        let won = teammates[0].3 != 0;
        let entry = aggregated.entry(key).or_insert_with(|| {
            let members = teammates
                .iter()
                .map(|t| RosterMember {
                    puuid: t.0.clone(),
                    name: t.1.clone(),
                    tag: t.2.clone(),
                })
                .collect();
            (members, 0, 0)
        });
        entry.1 += 1;
        if won {
            entry.2 += 1;
        }
    }

    let mut result: Vec<FullRosterStat> = aggregated
        .into_values()
        .filter(|(_, played, _)| *played >= min_matches)
        .map(|(members, played, won)| FullRosterStat {
            members,
            matches_played: played,
            matches_won: won,
        })
        .collect();
    result.sort_by(|a, b| {
        b.matches_played
            .cmp(&a.matches_played)
            .then(b.matches_won.cmp(&a.matches_won))
    });
    Ok(result)
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
    fn record_party_match_then_list_duo_stats_aggregates_by_teammate() {
        let conn = memory_conn();
        record_party_match(&conn, "match-1", "me", "buddy", "Buddy", "1111", true, "teammate").unwrap();
        record_party_match(&conn, "match-2", "me", "buddy", "Buddy", "1111", false, "teammate").unwrap();
        record_party_match(&conn, "match-3", "me", "buddy", "Buddy", "1111", true, "teammate").unwrap();
        record_party_match(&conn, "match-1", "me", "stranger", "Stranger", "2222", true, "teammate").unwrap();

        let stats = list_duo_stats(&conn, "me", 1, None).unwrap();
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
        record_party_match(&conn, "match-1", "me", "stranger", "Stranger", "2222", true, "teammate").unwrap();

        assert_eq!(list_duo_stats(&conn, "me", 2, None).unwrap().len(), 0);
        assert_eq!(list_duo_stats(&conn, "me", 1, None).unwrap().len(), 1);
    }

    #[test]
    fn record_party_match_is_idempotent_on_replay() {
        let conn = memory_conn();
        record_party_match(&conn, "match-1", "me", "buddy", "Buddy", "1111", true, "teammate").unwrap();
        // Refetch du même match (force refresh) avec un nom mis à jour : pas de doublon,
        // juste une mise à jour de la ligne existante.
        record_party_match(&conn, "match-1", "me", "buddy", "BuddyRenamed", "1111", true, "teammate").unwrap();

        let stats = list_duo_stats(&conn, "me", 1, None).unwrap();
        assert_eq!(stats.len(), 1);
        assert_eq!(stats[0].matches_played, 1);
        assert_eq!(stats[0].teammate_name, "BuddyRenamed");
    }

    #[test]
    fn list_rivalry_stats_aggregates_opponents_separately_from_teammates() {
        let conn = memory_conn();
        record_party_match(&conn, "match-1", "me", "buddy", "Buddy", "1111", true, "teammate").unwrap();
        record_party_match(&conn, "match-1", "me", "nemesis", "Nemesis", "3333", true, "opponent").unwrap();
        record_party_match(&conn, "match-2", "me", "nemesis", "Nemesis", "3333", false, "opponent").unwrap();
        record_party_match(&conn, "match-3", "me", "nemesis", "Nemesis", "3333", true, "opponent").unwrap();

        let rivalry = list_rivalry_stats(&conn, "me", 1, None).unwrap();
        assert_eq!(rivalry.len(), 1);
        assert_eq!(rivalry[0].opponent_puuid, "nemesis");
        assert_eq!(rivalry[0].matches_played, 3);
        assert_eq!(rivalry[0].matches_won, 2);

        // La party ne doit apparaître ni dans list_rivalry_stats ni fausser le compte.
        let duo = list_duo_stats(&conn, "me", 1, None).unwrap();
        assert_eq!(duo.len(), 1);
        assert_eq!(duo[0].teammate_puuid, "buddy");
    }

    #[test]
    fn list_rivalry_stats_filters_out_below_min_matches() {
        let conn = memory_conn();
        record_party_match(&conn, "match-1", "me", "nemesis", "Nemesis", "3333", true, "opponent").unwrap();

        assert_eq!(list_rivalry_stats(&conn, "me", 2, None).unwrap().len(), 0);
        assert_eq!(list_rivalry_stats(&conn, "me", 1, None).unwrap().len(), 1);
    }

    #[test]
    fn list_squad_stats_aggregates_pairs_of_teammates_sharing_the_same_match() {
        let conn = memory_conn();
        record_party_match(&conn, "match-1", "me", "alice", "Alice", "1111", true, "teammate").unwrap();
        record_party_match(&conn, "match-1", "me", "bob", "Bob", "2222", true, "teammate").unwrap();
        record_party_match(&conn, "match-2", "me", "alice", "Alice", "1111", false, "teammate").unwrap();
        record_party_match(&conn, "match-2", "me", "bob", "Bob", "2222", false, "teammate").unwrap();
        // Match-3 : Alice seule (pas de squad complet), ne doit pas compter comme trio.
        record_party_match(&conn, "match-3", "me", "alice", "Alice", "1111", true, "teammate").unwrap();

        let squads = list_squad_stats(&conn, "me", 1, None).unwrap();
        assert_eq!(squads.len(), 1);
        assert_eq!(squads[0].matches_played, 2);
        assert_eq!(squads[0].matches_won, 1);
        // Ordre alphabétique du puuid pour ne pas dupliquer la paire (a < b).
        assert_eq!(squads[0].teammate_a_puuid, "alice");
        assert_eq!(squads[0].teammate_b_puuid, "bob");
    }

    #[test]
    fn list_full_roster_stats_aggregates_matches_with_exactly_four_teammates() {
        let conn = memory_conn();
        // Match-1 : roster complet à 5 (moi + 4 coéquipiers).
        record_party_match(&conn, "match-1", "me", "alice", "Alice", "1111", true, "teammate").unwrap();
        record_party_match(&conn, "match-1", "me", "bob", "Bob", "2222", true, "teammate").unwrap();
        record_party_match(&conn, "match-1", "me", "carol", "Carol", "3333", true, "teammate").unwrap();
        record_party_match(&conn, "match-1", "me", "dave", "Dave", "4444", true, "teammate").unwrap();
        // Match-2 : même roster complet, rejoué (ordre d'insertion différent), défaite.
        record_party_match(&conn, "match-2", "me", "dave", "Dave", "4444", false, "teammate").unwrap();
        record_party_match(&conn, "match-2", "me", "carol", "Carol", "3333", false, "teammate").unwrap();
        record_party_match(&conn, "match-2", "me", "bob", "Bob", "2222", false, "teammate").unwrap();
        record_party_match(&conn, "match-2", "me", "alice", "Alice", "1111", false, "teammate").unwrap();
        // Match-3 : squad incomplet (seulement 2 coéquipiers), ne doit pas compter.
        record_party_match(&conn, "match-3", "me", "alice", "Alice", "1111", true, "teammate").unwrap();
        record_party_match(&conn, "match-3", "me", "bob", "Bob", "2222", true, "teammate").unwrap();

        let rosters = list_full_roster_stats(&conn, "me", 1, None).unwrap();
        assert_eq!(rosters.len(), 1);
        assert_eq!(rosters[0].matches_played, 2);
        assert_eq!(rosters[0].matches_won, 1);
        assert_eq!(rosters[0].members.len(), 4);
        assert_eq!(rosters[0].members[0].puuid, "alice");
    }

    #[test]
    fn list_full_roster_stats_filters_below_min_matches() {
        let conn = memory_conn();
        record_party_match(&conn, "match-1", "me", "alice", "Alice", "1111", true, "teammate").unwrap();
        record_party_match(&conn, "match-1", "me", "bob", "Bob", "2222", true, "teammate").unwrap();
        record_party_match(&conn, "match-1", "me", "carol", "Carol", "3333", true, "teammate").unwrap();
        record_party_match(&conn, "match-1", "me", "dave", "Dave", "4444", true, "teammate").unwrap();

        assert_eq!(list_full_roster_stats(&conn, "me", 2, None).unwrap().len(), 0);
        assert_eq!(list_full_roster_stats(&conn, "me", 1, None).unwrap().len(), 1);
    }

    #[test]
    fn list_squad_stats_filters_below_min_matches() {
        let conn = memory_conn();
        record_party_match(&conn, "match-1", "me", "alice", "Alice", "1111", true, "teammate").unwrap();
        record_party_match(&conn, "match-1", "me", "bob", "Bob", "2222", true, "teammate").unwrap();

        assert_eq!(list_squad_stats(&conn, "me", 2, None).unwrap().len(), 0);
        assert_eq!(list_squad_stats(&conn, "me", 1, None).unwrap().len(), 1);
    }
}
