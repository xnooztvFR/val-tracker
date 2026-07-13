//! Table statique UUID Riot → nom d'agent, pour résoudre le `CharacterID` renvoyé par le
//! pregame local (`client::fetch_pregame_player_puuids`) en un nom d'agent affichable et
//! croisable avec `agentRoles.ts` côté frontend (voir backlog "contre-pick en overlay").
//!
//! **Best-effort par construction** : ces UUID proviennent de références publiques
//! (valorant-api.com et divers outils communautaires), pas d'un endpoint interrogé par ce
//! projet — comme `agentRoles.ts` (backlog #17), à mettre à jour manuellement à chaque
//! nouvel agent Riot. Un UUID absent de la table ou un `CharacterID` vide (agent pas encore
//! locké) renvoie simplement `None` : aucune fonctionnalité ne doit dépendre de cette
//! résolution pour fonctionner, seulement s'enrichir si elle réussit.
const AGENT_NAME_BY_UUID: &[(&str, &str)] = &[
    ("9f0d8ba9-4140-b941-57d3-a7ad57c6b417", "Brimstone"),
    ("707eab51-4836-f488-046a-cda6bf494859", "Viper"),
    ("8e253930-4c05-31dd-1b6c-968525494517", "Omen"),
    ("1e58de9c-4950-5125-93e9-a0aee9f98746", "Killjoy"),
    ("117ed9e3-49f3-6512-3ccf-0cada7e3823b", "Cypher"),
    ("320b2a48-4d9b-a075-30f1-1f93a9b638fa", "Sova"),
    ("569fdd95-4d10-43ab-ca70-79becc718b46", "Sage"),
    ("eb93336a-449b-9c1b-0a54-a891f7921d69", "Phoenix"),
    ("add6443a-41bd-e414-f6ad-e58d267f4e95", "Jett"),
    ("a3bfb853-43b2-7238-a4f1-ad90e9e46bcc", "Reyna"),
    ("f94c3b30-42be-e959-889c-5aa313dba261", "Raze"),
    ("5f8d3a7f-467b-97f3-062c-13acf203c006", "Breach"),
    ("6f2a04ca-43e0-be17-7f36-b3908627744d", "Skye"),
    ("7f94d92c-4234-0a36-9646-3a87eb8b5c89", "Yoru"),
    ("41fb69c1-4189-7b37-f117-bcaf1e96f1bf", "Astra"),
    ("601dbbe7-43ce-be57-2a40-4abd24953621", "KAY/O"),
    ("22697a3d-45bf-8dd7-4fec-84a9e28c69d7", "Chamber"),
    ("bb2a4828-46eb-8cd1-e765-15848195d751", "Neon"),
    ("dade69b4-4f5a-8528-247b-219e5a1facd6", "Fade"),
    ("95b78ed7-4637-86d9-7e41-71ba8c293152", "Harbor"),
    ("e370fa57-4757-3604-3648-499e1f642d3f", "Gekko"),
    ("cc8b64c8-4b25-4ff9-6e7f-37b4da43d235", "Deadlock"),
    ("0e38b510-41a8-5780-5e8f-568b2a4f2d6c", "Iso"),
    ("1dbf2edb-4463-467d-8c3b-2ea4b1d97b6b", "Clove"),
    ("efba5359-4016-a1e5-7626-b1ae76895940", "Vyse"),
    ("b444168c-4e35-8076-95d4-4d6c1c99f3c0", "Tejo"),
];

/// Résout un `CharacterID` (UUID Riot, tel que renvoyé par `AllyTeam.Players[].CharacterID`
/// en pregame) en nom d'agent. `None` si l'UUID est vide (agent pas encore locké) ou absent
/// de la table (nouvel agent pas encore ajouté, ou schéma de champ différent de ce qui est
/// attendu — voir doc du module).
pub fn agent_name_from_character_id(character_id: &str) -> Option<&'static str> {
    if character_id.is_empty() {
        return None;
    }
    AGENT_NAME_BY_UUID
        .iter()
        .find(|(id, _)| id.eq_ignore_ascii_case(character_id))
        .map(|(_, name)| *name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_known_uuid_case_insensitively() {
        assert_eq!(
            agent_name_from_character_id("ADD6443A-41BD-E414-F6AD-E58D267F4E95"),
            Some("Jett")
        );
    }

    #[test]
    fn empty_or_unknown_uuid_resolves_to_none() {
        assert_eq!(agent_name_from_character_id(""), None);
        assert_eq!(agent_name_from_character_id("not-a-real-uuid"), None);
    }
}
