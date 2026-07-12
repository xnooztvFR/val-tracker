import { describe, expect, it } from "vitest";

import { buildProfileCardData } from "./profileCard";
import type { Overview } from "./stats";

function makeOverview(overrides: Partial<Overview> = {}): Overview {
  return {
    played: 10,
    wins: 6,
    losses: 4,
    kills: 100,
    deaths: 80,
    assists: 30,
    headshots: 25,
    winPercent: 60,
    kd: "1.25",
    hsPercent: 25,
    bodyPercent: 65,
    legPercent: 10,
    acs: 220,
    topAgent: { id: "jett", name: "Jett", matches: 5, wins: 3, kills: 50, deaths: 40 },
    ...overrides,
  };
}

describe("buildProfileCardData", () => {
  it("maps overview stats and current rank into card data", () => {
    const data = buildProfileCardData({
      name: "Player",
      tag: "1234",
      region: "eu",
      currentTier: 21,
      rr: 42,
      overview: makeOverview(),
    });

    expect(data.playerName).toBe("Player");
    expect(data.playerTag).toBe("1234");
    expect(data.region).toBe("eu");
    expect(data.rankLabel).toBe("Ascendant");
    expect(data.rankColorHex).toMatch(/^#/);
    expect(data.rr).toBe(42);
    expect(data.winPercent).toBe(60);
    expect(data.kd).toBe("1.25");
    expect(data.topAgentName).toBe("Jett");
  });

  it("falls back to zeroed stats when overview is null", () => {
    const data = buildProfileCardData({
      name: "Player",
      tag: "1234",
      region: "eu",
      currentTier: null,
      rr: null,
      overview: null,
    });

    expect(data.played).toBe(0);
    expect(data.winPercent).toBe(0);
    expect(data.kd).toBe("0.00");
    expect(data.topAgentName).toBeNull();
    expect(data.rr).toBeNull();
  });
});
