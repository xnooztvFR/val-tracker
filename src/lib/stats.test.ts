import { describe, expect, it } from "vitest";

import { computeAgentWinrates, computeHeatmap, computeOverview, computeSeasonComparison } from "./stats";
import type { MatchEntry, MmrHistoryEntry } from "./tauriApi";

function makeMatch(opts: {
  matchId: string;
  startedAt: string | null;
  won: boolean;
  agentId?: string;
  agentName?: string;
  kills?: number;
  deaths?: number;
}): MatchEntry {
  return {
    metadata: {
      match_id: opts.matchId,
      map: null,
      queue: null,
      started_at: opts.startedAt,
      game_length_in_ms: null,
    },
    players: [
      {
        puuid: "me",
        name: "Me",
        tag: "1234",
        team_id: "Red",
        agent: opts.agentId ? { id: opts.agentId, name: opts.agentName ?? "Agent" } : null,
        stats: {
          score: 200,
          kills: opts.kills ?? 10,
          deaths: opts.deaths ?? 5,
          assists: 3,
          headshots: 4,
          bodyshots: 4,
          legshots: 2,
        },
      },
    ],
    teams: [{ team_id: "Red", won: opts.won, rounds: { won: 13, lost: 8 } }],
  };
}

describe("computeOverview", () => {
  it("aggregates wins/losses/kda across matches for the given puuid", () => {
    const matches = [
      makeMatch({ matchId: "m1", startedAt: "2024-03-05T14:00:00Z", won: true, agentId: "a1", agentName: "Jett" }),
      makeMatch({ matchId: "m2", startedAt: "2024-03-05T15:00:00Z", won: false, agentId: "a1", agentName: "Jett" }),
    ];
    const overview = computeOverview(matches, "me");
    expect(overview.played).toBe(2);
    expect(overview.wins).toBe(1);
    expect(overview.losses).toBe(1);
    expect(overview.winPercent).toBe(50);
    expect(overview.topAgent?.name).toBe("Jett");
    expect(overview.topAgent?.matches).toBe(2);
  });

  it("ignores matches where the player has no stats entry", () => {
    const match = makeMatch({ matchId: "m1", startedAt: null, won: true });
    match.players[0].stats = null;
    expect(computeOverview([match], "me").played).toBe(0);
  });
});

describe("computeHeatmap", () => {
  it("buckets a match into its day-of-week/hour cell", () => {
    // 2024-03-05 est un mardi (index 1 avec lundi=0).
    const matches = [makeMatch({ matchId: "m1", startedAt: "2024-03-05T14:30:00Z", won: true })];
    const cells = computeHeatmap(matches, "me");
    expect(cells).toHaveLength(7 * 24);
    const totalMatches = cells.reduce((sum, c) => sum + c.matches, 0);
    expect(totalMatches).toBe(1);
    const totalWins = cells.reduce((sum, c) => sum + c.wins, 0);
    expect(totalWins).toBe(1);
  });

  it("ignores matches with a missing or invalid timestamp", () => {
    const matches = [makeMatch({ matchId: "m1", startedAt: null, won: true })];
    const cells = computeHeatmap(matches, "me");
    expect(cells.reduce((sum, c) => sum + c.matches, 0)).toBe(0);
  });
});

describe("computeAgentWinrates", () => {
  it("computes winrate per agent, sorted best-first, filtering below minMatches", () => {
    const matches = [
      makeMatch({ matchId: "m1", startedAt: "2024-03-05T14:00:00Z", won: true, agentId: "a1", agentName: "Jett" }),
      makeMatch({ matchId: "m2", startedAt: "2024-03-05T15:00:00Z", won: true, agentId: "a1", agentName: "Jett" }),
      makeMatch({ matchId: "m3", startedAt: "2024-03-05T16:00:00Z", won: false, agentId: "a2", agentName: "Sova" }),
      makeMatch({ matchId: "m4", startedAt: "2024-03-05T17:00:00Z", won: true, agentId: "a3", agentName: "OnceOnly" }),
    ];
    const winrates = computeAgentWinrates(matches, "me", 2);
    expect(winrates).toHaveLength(1);
    expect(winrates[0].name).toBe("Jett");
    expect(winrates[0].winPercent).toBe(100);
  });
});

describe("computeSeasonComparison", () => {
  function makeEntry(season: string, lastChange: number, tier: number): MmrHistoryEntry {
    return {
      date: null,
      elo: null,
      last_change: lastChange,
      rr: null,
      match_id: null,
      refunded_rr: null,
      was_derank_protected: null,
      map: null,
      season: { id: season, short: season },
      tier: { id: tier, name: null },
    };
  }

  it("groups RR change and highest tier by season", () => {
    const history = [makeEntry("e8a1", 15, 18), makeEntry("e8a1", -10, 19), makeEntry("e8a2", 20, 20)];
    const result = computeSeasonComparison(history);
    expect(result).toHaveLength(2);
    const e8a1 = result.find((r) => r.season === "e8a1")!;
    expect(e8a1.games).toBe(2);
    expect(e8a1.netRr).toBe(5);
    expect(e8a1.highestTier).toBe(19);
  });
});
