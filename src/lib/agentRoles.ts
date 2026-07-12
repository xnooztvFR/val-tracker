// Backlog #17 : Henrik n'expose pas le rôle d'agent (Duelist/Controller/Initiator/Sentinel)
// dans ses réponses — seulement le nom. Table statique à mettre à jour manuellement à
// chaque nouvel agent Riot (pas de endpoint dédié consulté pour l'instant, voir aussi la
// remarque similaire sur v1/content dans TODO.md #7).

import i18n from "../i18n";

export type AgentRole = "Duelist" | "Controller" | "Initiator" | "Sentinel";

const ROLE_BY_AGENT_NAME: Record<string, AgentRole> = {
  jett: "Duelist",
  phoenix: "Duelist",
  raze: "Duelist",
  reyna: "Duelist",
  yoru: "Duelist",
  neon: "Duelist",
  iso: "Duelist",
  brimstone: "Controller",
  viper: "Controller",
  omen: "Controller",
  astra: "Controller",
  harbor: "Controller",
  clove: "Controller",
  sova: "Initiator",
  breach: "Initiator",
  skye: "Initiator",
  "kay/o": "Initiator",
  kayo: "Initiator",
  fade: "Initiator",
  gekko: "Initiator",
  tejo: "Initiator",
  killjoy: "Sentinel",
  cypher: "Sentinel",
  sage: "Sentinel",
  chamber: "Sentinel",
  deadlock: "Sentinel",
  vyse: "Sentinel",
};

const ROLE_LABEL_KEYS: Record<AgentRole, string> = {
  Duelist: "stats:agentRoles.duelist",
  Controller: "stats:agentRoles.controller",
  Initiator: "stats:agentRoles.initiator",
  Sentinel: "stats:agentRoles.sentinel",
};

export function agentRole(agentName: string | null | undefined): AgentRole | null {
  if (!agentName) return null;
  const key = agentName.trim().toLowerCase();
  return ROLE_BY_AGENT_NAME[key] ?? null;
}

export function agentRoleLabel(role: AgentRole | null): string {
  return i18n.t(role ? ROLE_LABEL_KEYS[role] : "stats:agentRoles.unknown");
}

export const AGENT_ROLE_ORDER: AgentRole[] = ["Duelist", "Initiator", "Controller", "Sentinel"];
