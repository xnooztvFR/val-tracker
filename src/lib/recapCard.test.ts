import { describe, expect, it } from "vitest";

import { buildMatchRecapData } from "./recapCard";
import type { MatchDetailData, MatchDetailPlayer } from "./tauriApi";

function makePlayer(overrides: Partial<MatchDetailPlayer> = {}): MatchDetailPlayer {
  return {
    puuid: "me",
    name: "Player",
    tag: "1234",
    team: "Blue",
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

describe("buildMatchRecapData", () => {
  it("returns null when the puuid is not part of this match", () => {
    expect(buildMatchRecapData(makeMatch(), "me")).toBeNull();
  });

  it("picks the tracked player's own team score as scoreFor and the opponent's as scoreAgainst", () => {
    const data = makeMatch({
      players: { all_players: [makePlayer({ team: "Blue" })] },
      teams: {
        blue: { has_won: true, rounds_won: 13, rounds_lost: 7 },
        red: { has_won: false, rounds_won: 7, rounds_lost: 13 },
      },
    });

    const recap = buildMatchRecapData(data, "me")!;
    expect(recap.won).toBe(true);
    expect(recap.scoreFor).toBe(13);
    expect(recap.scoreAgainst).toBe(7);
  });

  it("swaps the score perspective for a player on the red team", () => {
    const data = makeMatch({
      players: { all_players: [makePlayer({ team: "Red" })] },
      teams: {
        blue: { has_won: true, rounds_won: 13, rounds_lost: 4 },
        red: { has_won: false, rounds_won: 4, rounds_lost: 13 },
      },
    });

    const recap = buildMatchRecapData(data, "me")!;
    expect(recap.won).toBe(false);
    expect(recap.scoreFor).toBe(4);
    expect(recap.scoreAgainst).toBe(13);
  });

  it("maps currenttier to a rank label and color, and omits both when tier is unknown", () => {
    const withTier = makeMatch({
      players: { all_players: [makePlayer({ currenttier: 21 })] },
    });
    const recapWithTier = buildMatchRecapData(withTier, "me")!;
    expect(recapWithTier.rankLabel).toBe("Ascendant");
    expect(recapWithTier.rankColorHex).toMatch(/^#/);

    const withoutTier = makeMatch({ players: { all_players: [makePlayer({ currenttier: null })] } });
    const recapWithoutTier = buildMatchRecapData(withoutTier, "me")!;
    expect(recapWithoutTier.rankLabel).toBeNull();
    expect(recapWithoutTier.rankColorHex).toBeNull();
  });

  it("falls back to zeroed stats when the player has no stats block", () => {
    const data = makeMatch({ players: { all_players: [makePlayer({ stats: null })] } });
    const recap = buildMatchRecapData(data, "me")!;
    expect(recap.kills).toBe(0);
    expect(recap.deaths).toBe(0);
    expect(recap.assists).toBe(0);
  });
});
