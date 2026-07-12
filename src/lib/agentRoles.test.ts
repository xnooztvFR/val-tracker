import { describe, expect, it } from "vitest";

import { agentRole, agentRoleLabel } from "./agentRoles";

describe("agentRole", () => {
  it("maps known agent names to their role, case-insensitively", () => {
    expect(agentRole("Jett")).toBe("Duelist");
    expect(agentRole("viper")).toBe("Controller");
    expect(agentRole("SOVA")).toBe("Initiator");
    expect(agentRole("Killjoy")).toBe("Sentinel");
  });

  it("returns null for unknown or missing names", () => {
    expect(agentRole("NotAnAgent")).toBeNull();
    expect(agentRole(null)).toBeNull();
    expect(agentRole(undefined)).toBeNull();
  });
});

describe("agentRoleLabel", () => {
  it("returns the (French, default language) label for each role", () => {
    expect(agentRoleLabel("Duelist")).toBe("Duelliste");
    expect(agentRoleLabel(null)).toBe("Inconnu");
  });
});
