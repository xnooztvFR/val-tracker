import { describe, expect, it } from "vitest";

import {
  computeAgentWinrates,
  computeHeatmap,
  computeLeaderboardPercentile,
  computeOverview,
  computePeriodRecap,
  computeRankEta,
  computeRegularity,
  computeSeasonComparison,
  computeSessions,
  computeWeeklyMatchStats,
  isoWeekKey,
} from "./stats";
import type { LeaderboardThreshold, MatchEntry, MmrHistoryEntry, RankSnapshot } from "./tauriApi";

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

describe("computePeriodRecap", () => {
  function makeSnapshot(tier: number, rr: number | null, recordedAt: number): RankSnapshot {
    return { tier, tier_patched: `Tier ${tier}`, rr, recorded_at: recordedAt };
  }

  it("only aggregates matches within the current ISO week and reports the rank change", () => {
    // 2024-03-06 est un mercredi ; la semaine ISO commence le lundi 2024-03-04.
    const now = new Date("2024-03-06T12:00:00Z");
    const matches = [
      makeMatch({ matchId: "in-week", startedAt: "2024-03-05T10:00:00Z", won: true }),
      makeMatch({ matchId: "before-week", startedAt: "2024-02-28T10:00:00Z", won: true }),
    ];
    const snapshots = [
      makeSnapshot(18, 40, new Date("2024-02-27T10:00:00Z").getTime() / 1000),
      makeSnapshot(19, 10, new Date("2024-03-05T09:00:00Z").getTime() / 1000),
    ];

    const recap = computePeriodRecap(matches, snapshots, "me", "week", now);
    expect(recap.overview.played).toBe(1);
    expect(recap.rankChange?.tierStart).toBe(18);
    expect(recap.rankChange?.tierEnd).toBe(19);
    expect(recap.rankChange?.rrEnd).toBe(10);
  });

  it("only aggregates matches within the current calendar month", () => {
    const now = new Date("2024-03-15T12:00:00Z");
    const matches = [
      makeMatch({ matchId: "in-month", startedAt: "2024-03-02T10:00:00Z", won: true }),
      makeMatch({ matchId: "before-month", startedAt: "2024-02-28T10:00:00Z", won: true }),
    ];
    const recap = computePeriodRecap(matches, [], "me", "month", now);
    expect(recap.overview.played).toBe(1);
    expect(recap.rankChange).toBeNull();
  });

  it("falls back to the first snapshot of the period when none exists before it", () => {
    const now = new Date("2024-03-06T12:00:00Z");
    const snapshots = [makeSnapshot(20, 5, new Date("2024-03-05T09:00:00Z").getTime() / 1000)];
    const recap = computePeriodRecap([], snapshots, "me", "week", now);
    expect(recap.rankChange?.tierStart).toBe(20);
    expect(recap.rankChange?.tierEnd).toBe(20);
  });
});

describe("computeRankEta", () => {
  function makeSnapshot(tier: number, rr: number | null, recordedAt: number): RankSnapshot {
    return { tier, tier_patched: `Tier ${tier}`, rr, recorded_at: recordedAt };
  }

  it("estimates days to reach the target RR from a positive trend on the current tier", () => {
    const day = 86_400;
    const snapshots = [
      makeSnapshot(18, 20, 0),
      makeSnapshot(18, 30, day),
      makeSnapshot(18, 40, 2 * day),
    ];
    const eta = computeRankEta(snapshots, 100);
    expect(eta?.currentTier).toBe(18);
    expect(eta?.slopeRrPerDay).toBeCloseTo(10, 5);
    // 40 -> 100 à +10 RR/jour = 6 jours.
    expect(eta?.daysToTargetRr).toBeCloseTo(6, 5);
  });

  it("returns null days when the trend is flat or negative", () => {
    const day = 86_400;
    const snapshots = [makeSnapshot(18, 40, 0), makeSnapshot(18, 30, day), makeSnapshot(18, 20, 2 * day)];
    const eta = computeRankEta(snapshots, 100);
    expect(eta?.daysToTargetRr).toBeNull();
  });

  it("ignores snapshots from a previous tier when computing the trend", () => {
    const day = 86_400;
    const snapshots = [
      makeSnapshot(17, 90, 0),
      makeSnapshot(18, 10, day), // promotion : redémarre à un RR bas sur le nouveau tier
      makeSnapshot(18, 30, 2 * day),
    ];
    const eta = computeRankEta(snapshots, 100);
    expect(eta?.currentTier).toBe(18);
    expect(eta?.sampleSize).toBe(2);
    expect(eta?.slopeRrPerDay).toBeCloseTo(20, 5);
  });

  it("returns null with fewer than two snapshots on the current tier", () => {
    expect(computeRankEta([makeSnapshot(18, 10, 0)])).toBeNull();
    expect(computeRankEta([])).toBeNull();
  });
});

describe("computeSessions", () => {
  it("splits matches into sessions on a gap greater than 2 hours", () => {
    const matches = [
      makeMatch({ matchId: "m1", startedAt: "2024-03-05T10:00:00Z", won: true }),
      makeMatch({ matchId: "m2", startedAt: "2024-03-05T10:40:00Z", won: true }),
      // écart de 3h -> nouvelle session
      makeMatch({ matchId: "m3", startedAt: "2024-03-05T13:40:00Z", won: false }),
    ];
    const sessions = computeSessions(matches, "me");
    expect(sessions).toHaveLength(2);
    // la plus récente en premier
    expect(sessions[0].matches).toBe(1);
    expect(sessions[1].matches).toBe(2);
    expect(sessions[1].wins).toBe(2);
    expect(sessions[1].winPercent).toBe(100);
  });

  it("does not split on a gap of exactly 2 hours or less", () => {
    const matches = [
      makeMatch({ matchId: "m1", startedAt: "2024-03-05T10:00:00Z", won: true }),
      makeMatch({ matchId: "m2", startedAt: "2024-03-05T12:00:00Z", won: true }),
    ];
    const sessions = computeSessions(matches, "me");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].matches).toBe(2);
  });

  it("reports a tilt signal only from 3 matches onward, comparing last third to first third K/D", () => {
    const twoMatches = [
      makeMatch({ matchId: "m1", startedAt: "2024-03-05T10:00:00Z", won: true, kills: 20, deaths: 5 }),
      makeMatch({ matchId: "m2", startedAt: "2024-03-05T10:20:00Z", won: false, kills: 5, deaths: 20 }),
    ];
    expect(computeSessions(twoMatches, "me")[0].tiltDeltaKd).toBeNull();

    const threeMatches = [
      makeMatch({ matchId: "m1", startedAt: "2024-03-05T10:00:00Z", won: true, kills: 20, deaths: 5 }),
      makeMatch({ matchId: "m2", startedAt: "2024-03-05T10:20:00Z", won: true, kills: 15, deaths: 5 }),
      makeMatch({ matchId: "m3", startedAt: "2024-03-05T10:40:00Z", won: false, kills: 2, deaths: 20 }),
    ];
    const tilt = computeSessions(threeMatches, "me")[0].tiltDeltaKd;
    expect(tilt).not.toBeNull();
    expect(tilt as number).toBeLessThan(0);
  });

  it("ignores matches with a missing or invalid timestamp", () => {
    const match = makeMatch({ matchId: "m1", startedAt: null, won: true });
    expect(computeSessions([match], "me")).toHaveLength(0);
  });
});

describe("isoWeekKey", () => {
  it("returns the same key for every day within the same ISO week", () => {
    // 2026-01-05 (lundi) à 2026-01-11 (dimanche) sont la semaine ISO 2026-W02 — heures
    // choisies en milieu de journée UTC pour rester dans le bon jour local quel que soit
    // le fuseau d'exécution des tests.
    expect(isoWeekKey(new Date("2026-01-05T12:00:00Z"))).toBe("2026-W02");
    expect(isoWeekKey(new Date("2026-01-11T12:00:00Z"))).toBe("2026-W02");
  });

  it("attributes the last days of December to next year's week 1 when applicable", () => {
    // 2025-12-29 est un lundi, première semaine ISO complète de 2026 (heure milieu de
    // journée UTC pour ne pas dépendre du fuseau d'exécution des tests).
    expect(isoWeekKey(new Date("2025-12-29T12:00:00Z"))).toBe("2026-W01");
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
