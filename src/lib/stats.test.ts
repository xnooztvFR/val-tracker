import { describe, expect, it } from "vitest";

import {
  computeAgentWinrates,
  computeHeatmap,
  computeLeaderboardPercentile,
  computeOverview,
  computeRegularity,
  computeSeasonComparison,
  computeWeeklyMatchStats,
} from "./stats";
import type { LeaderboardThreshold, MatchEntry, MmrHistoryEntry } from "./tauriApi";

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

describe("computeWeeklyMatchStats", () => {
  it("only counts matches within the current ISO week (Monday-based)", () => {
    // 2024-03-06 est un mercredi ; la semaine ISO commence le lundi 2024-03-04.
    const now = new Date("2024-03-06T12:00:00Z");
    const matches = [
      makeMatch({ matchId: "in-week", startedAt: "2024-03-05T10:00:00Z", won: true }),
      makeMatch({ matchId: "before-week", startedAt: "2024-02-28T10:00:00Z", won: true }),
    ];
    const stats = computeWeeklyMatchStats(matches, "me", now);
    expect(stats.matches).toBe(1);
    expect(stats.wins).toBe(1);
    expect(stats.winPercent).toBe(100);
  });

  it("returns zero winrate when no matches were played this week", () => {
    const now = new Date("2024-03-06T12:00:00Z");
    expect(computeWeeklyMatchStats([], "me", now)).toEqual({ matches: 0, wins: 0, winPercent: 0 });
  });
});

describe("computeRegularity", () => {
  it("returns zero coefficient of variation for a perfectly consistent player", () => {
    const matches = [
      makeMatch({ matchId: "m1", startedAt: "2024-03-05T14:00:00Z", won: true, kills: 10, deaths: 5 }),
      makeMatch({ matchId: "m2", startedAt: "2024-03-05T15:00:00Z", won: false, kills: 10, deaths: 5 }),
    ];
    const regularity = computeRegularity(matches, "me");
    expect(regularity.sampleSize).toBe(2);
    expect(regularity.kdaStdDev).toBe(0);
    expect(regularity.coefficientOfVariation).toBe(0);
  });

  it("reports a higher coefficient of variation for erratic performances", () => {
    const matches = [
      makeMatch({ matchId: "m1", startedAt: "2024-03-05T14:00:00Z", won: true, kills: 20, deaths: 2 }),
      makeMatch({ matchId: "m2", startedAt: "2024-03-05T15:00:00Z", won: false, kills: 2, deaths: 10 }),
    ];
    const regularity = computeRegularity(matches, "me");
    expect(regularity.sampleSize).toBe(2);
    expect(regularity.coefficientOfVariation).toBeGreaterThan(0.5);
  });

  it("ignores matches where the player has no stats entry", () => {
    const match = makeMatch({ matchId: "m1", startedAt: null, won: true });
    match.players[0].stats = null;
    expect(computeRegularity([match], "me").sampleSize).toBe(0);
  });
});

describe("computeLeaderboardPercentile", () => {
  function makeThreshold(startIndex: number, tierName: string): LeaderboardThreshold {
    return { start_index: startIndex, threshold: null, tier: { id: 0, name: tierName } };
  }

  it("locates the player's rank inside its tier bracket", () => {
    const thresholds = [makeThreshold(1, "Radiant"), makeThreshold(51, "Immortal 3"), makeThreshold(301, "Immortal 2")];
    const result = computeLeaderboardPercentile(75, thresholds);
    expect(result?.tierName).toBe("Immortal 3");
    expect(result?.playersAboveInTier).toBe(24);
    expect(result?.playersInTier).toBe(250);
    expect(result?.percentileInTier).toBeCloseTo(9.6, 1);
  });

  it("returns null when the rank is above the first threshold", () => {
    const thresholds = [makeThreshold(51, "Immortal 3")];
    expect(computeLeaderboardPercentile(10, thresholds)).toBeNull();
  });

  it("handles the last (uncapped) tier without a players-in-tier count", () => {
    const thresholds = [makeThreshold(1, "Radiant"), makeThreshold(51, "Immortal 3")];
    const result = computeLeaderboardPercentile(500, thresholds);
    expect(result?.tierName).toBe("Immortal 3");
    expect(result?.playersInTier).toBeNull();
    expect(result?.percentileInTier).toBe(0);
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
