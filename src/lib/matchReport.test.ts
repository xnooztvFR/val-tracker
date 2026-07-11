import { describe, expect, it } from "vitest";

import { buildMatchReport, economyTier } from "./matchReport";
import type {
  MatchDetailData,
  MatchDetailPlayer,
  MatchDetailRound,
  MatchDetailRoundPlayerStat,
} from "./tauriApi";

function makePlayer(puuid: string, team: string): MatchDetailPlayer {
  return {
    puuid,
    name: puuid,
    tag: "0000",
    team,
    level: null,
    character: null,
    currenttier: null,
    currenttier_patched: null,
    party_id: null,
    assets: null,
    stats: null,
    economy: null,
    damage_made: null,
    damage_received: null,
  };
}

function makeRoundStat(
  puuid: string,
  team: string,
  overrides: Partial<MatchDetailRoundPlayerStat> = {},
): MatchDetailRoundPlayerStat {
  return {
    player_puuid: puuid,
    player_display_name: puuid,
    player_team: team,
    damage: 0,
    bodyshots: 0,
    headshots: 0,
    legshots: 0,
    kills: 0,
    score: 0,
    was_afk: false,
    economy: null,
    ...overrides,
  };
}

function makeRound(overrides: Partial<MatchDetailRound> = {}): MatchDetailRound {
  return {
    winning_team: null,
    end_type: null,
    bomb_planted: false,
    bomb_defused: false,
    player_stats: [],
    ...overrides,
  };
}

function makeMatch(overrides: Partial<MatchDetailData> = {}): MatchDetailData {
  return {
    metadata: {
      matchid: "m1",
      map: "Bind",
      mode: "Competitive",
      queue: "competitive",
      season_id: null,
      game_length: null,
      game_start: null,
      game_start_patched: null,
      rounds_played: null,
    },
    players: { all_players: [] },
    teams: { red: null, blue: null },
    rounds: [],
    ...overrides,
  };
}

describe("economyTier", () => {
  it("buckets by average team loadout value", () => {
    expect(economyTier(500)).toBe("eco");
    expect(economyTier(1999)).toBe("eco");
    expect(economyTier(2000)).toBe("force");
    expect(economyTier(3399)).toBe("force");
    expect(economyTier(3400)).toBe("full");
    expect(economyTier(5000)).toBe("full");
  });
});

describe("buildMatchReport", () => {
  it("returns null when the puuid is not part of this match", () => {
    const data = makeMatch({ players: { all_players: [makePlayer("other", "Red")] } });
    expect(buildMatchReport(data, "me")).toBeNull();
  });

  it("computes round win/loss relative to the tracked player's team", () => {
    const data = makeMatch({
      players: { all_players: [makePlayer("me", "Red"), makePlayer("enemy", "Blue")] },
      rounds: [
        makeRound({ winning_team: "Red", player_stats: [makeRoundStat("me", "Red")] }),
        makeRound({ winning_team: "Blue", player_stats: [makeRoundStat("me", "Red")] }),
      ],
    });

    const report = buildMatchReport(data, "me");
    expect(report?.myTeam).toBe("Red");
    expect(report?.rounds[0].won).toBe(true);
    expect(report?.rounds[1].won).toBe(false);
  });

  it("buckets each round's economy from the tracked player's team average loadout", () => {
    const data = makeMatch({
      players: { all_players: [makePlayer("me", "Red")] },
      rounds: [
        makeRound({
          winning_team: "Red",
          player_stats: [
            makeRoundStat("me", "Red", { economy: { loadout_value: 800, remaining: 0, spent: 0, weapon: null, armor: null } }),
            makeRoundStat("teammate", "Red", { economy: { loadout_value: 800, remaining: 0, spent: 0, weapon: null, armor: null } }),
          ],
        }),
        makeRound({
          winning_team: "Blue",
          player_stats: [
            makeRoundStat("me", "Red", { economy: { loadout_value: 4500, remaining: 0, spent: 0, weapon: null, armor: null } }),
          ],
        }),
      ],
    });

    const report = buildMatchReport(data, "me")!;
    expect(report.rounds[0].economyTier).toBe("eco");
    expect(report.rounds[1].economyTier).toBe("full");

    const eco = report.economyBreakdown.find((b) => b.tier === "eco")!;
    expect(eco.roundsPlayed).toBe(1);
    expect(eco.roundsWon).toBe(1);
    const full = report.economyBreakdown.find((b) => b.tier === "full")!;
    expect(full.roundsPlayed).toBe(1);
    expect(full.roundsWon).toBe(0);
  });

  it("finds the tracked player's best and worst round by damage", () => {
    const data = makeMatch({
      players: { all_players: [makePlayer("me", "Red")] },
      rounds: [
        makeRound({ player_stats: [makeRoundStat("me", "Red", { damage: 40, kills: 0 })] }),
        makeRound({ player_stats: [makeRoundStat("me", "Red", { damage: 220, kills: 3 })] }),
        makeRound({ player_stats: [makeRoundStat("me", "Red", { damage: 90, kills: 1 })] }),
      ],
    });

    const report = buildMatchReport(data, "me")!;
    expect(report.bestRound).toEqual({ index: 2, kills: 3, damage: 220 });
    expect(report.worstRound).toEqual({ index: 1, kills: 0, damage: 40 });
  });

  it("collects rounds where the tracked player was flagged AFK", () => {
    const data = makeMatch({
      players: { all_players: [makePlayer("me", "Red")] },
      rounds: [
        makeRound({ player_stats: [makeRoundStat("me", "Red", { was_afk: true })] }),
        makeRound({ player_stats: [makeRoundStat("me", "Red", { was_afk: false })] }),
      ],
    });

    const report = buildMatchReport(data, "me")!;
    expect(report.afkRounds).toEqual([1]);
  });

  it("skips rounds where the tracked player has no stat entry instead of crashing", () => {
    const data = makeMatch({
      players: { all_players: [makePlayer("me", "Red")] },
      rounds: [makeRound({ player_stats: [makeRoundStat("someone-else", "Red")] })],
    });

    const report = buildMatchReport(data, "me")!;
    expect(report.bestRound).toBeNull();
    expect(report.worstRound).toBeNull();
    expect(report.afkRounds).toEqual([]);
  });
});
