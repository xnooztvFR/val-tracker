import { describe, expect, it } from "vitest";

import {
  computeGoalProgress,
  formatDateTimeShort,
  formatDurationMs,
  formatKda,
  formatKdRatio,
  formatPercent,
  formatSessionHeader,
  groupMatchesIntoSessions,
  rankGlowColor,
  rankInfo,
  splitRiotId,
} from "./format";
import type { MatchEntry } from "./tauriApi";

function makeMatch(matchId: string, startedAt: string, won: boolean): MatchEntry {
  return {
    metadata: {
      match_id: matchId,
      map: null,
      queue: null,
      started_at: startedAt,
      game_length_in_ms: null,
    },
    players: [
      {
        puuid: "me",
        name: "Me",
        tag: "1234",
        team_id: "Red",
        agent: null,
        stats: null,
      },
    ],
    teams: [{ team_id: "Red", won, rounds: null }],
  };
}

describe("rankInfo", () => {
  it("maps boundary tiers to the right rank name", () => {
    expect(rankInfo(0).name).toBe("Non classé");
    expect(rankInfo(2).name).toBe("Non classé");
    expect(rankInfo(3).name).toBe("Fer");
    expect(rankInfo(27).name).toBe("Radiant");
  });

  it("falls back to Non classé for null/undefined tier", () => {
    expect(rankInfo(null).name).toBe("Non classé");
    expect(rankInfo(undefined).name).toBe("Non classé");
  });

  it("clamps an out-of-range tier to the highest bucket instead of crashing", () => {
    expect(rankInfo(999).name).toBe("Radiant");
  });
});

describe("rankGlowColor", () => {
  it("returns a hex color for a known tier and stays in sync with rankInfo's buckets", () => {
    expect(rankGlowColor(27)).toBe("#f4e285");
    expect(rankGlowColor(0)).toBe("#737373");
  });
});

describe("formatKda", () => {
  it("joins kills/deaths/assists with slashes", () => {
    expect(formatKda(20, 10, 5)).toBe("20/10/5");
  });
});

describe("formatKdRatio", () => {
  it("divides kills by deaths with two decimals", () => {
    expect(formatKdRatio(20, 10)).toBe("2.00");
  });

  it("does not divide by zero when deaths is 0", () => {
    expect(formatKdRatio(15, 0)).toBe("15.00");
  });
});

describe("formatPercent", () => {
  it("appends a percent sign with the requested precision", () => {
    expect(formatPercent(53.456, 1)).toBe("53.5%");
    expect(formatPercent(53.456)).toBe("53%");
  });
});

describe("formatDurationMs", () => {
  it("formats milliseconds as minutes and seconds", () => {
    expect(formatDurationMs(125_000)).toBe("2min 05s");
  });

  it("returns a placeholder for missing/zero/negative durations", () => {
    expect(formatDurationMs(null)).toBe("—");
    expect(formatDurationMs(undefined)).toBe("—");
    expect(formatDurationMs(0)).toBe("—");
    expect(formatDurationMs(-100)).toBe("—");
  });
});

describe("formatDateTimeShort", () => {
  it("returns a placeholder when the timestamp is missing", () => {
    expect(formatDateTimeShort(null)).toBe("date inconnue");
    expect(formatDateTimeShort(undefined)).toBe("date inconnue");
  });

  it("formats a unix timestamp as DD/MM à HH:MM", () => {
    // 2024-03-05T14:32:00Z
    const formatted = formatDateTimeShort(1709649120);
    expect(formatted).toMatch(/^\d{2}\/\d{2} à \d{2}:\d{2}$/);
  });
});

describe("splitRiotId", () => {
  it("splits a well-formed pseudo#tag", () => {
    expect(splitRiotId("Player#EUW")).toEqual({ name: "Player", tag: "EUW" });
  });

  it("trims surrounding whitespace", () => {
    expect(splitRiotId("  Player#EUW  ")).toEqual({ name: "Player", tag: "EUW" });
  });

  it("rejects input without a tag, with a leading #, or with a trailing #", () => {
    expect(splitRiotId("PlayerOnly")).toBeNull();
    expect(splitRiotId("#EUW")).toBeNull();
    expect(splitRiotId("Player#")).toBeNull();
  });

  it("uses the last # so names containing # still split correctly", () => {
    expect(splitRiotId("Weird#Name#EUW")).toEqual({ name: "Weird#Name", tag: "EUW" });
  });
});

describe("groupMatchesIntoSessions", () => {
  it("keeps matches less than 30min apart in the same session", () => {
    const matches = [
      makeMatch("m3", "2024-03-05T15:00:00Z", true),
      makeMatch("m2", "2024-03-05T14:40:00Z", false),
      makeMatch("m1", "2024-03-05T14:20:00Z", true),
    ];
    const sessions = groupMatchesIntoSessions(matches, "me");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].matches).toHaveLength(3);
    expect(sessions[0].wins).toBe(2);
    expect(sessions[0].losses).toBe(1);
  });

  it("starts a new session after a gap of more than 30min", () => {
    const matches = [
      makeMatch("m2", "2024-03-05T18:00:00Z", true),
      makeMatch("m1", "2024-03-05T14:00:00Z", false),
    ];
    const sessions = groupMatchesIntoSessions(matches, "me");
    expect(sessions).toHaveLength(2);
    expect(sessions[0].matches[0].metadata.match_id).toBe("m2");
    expect(sessions[1].matches[0].metadata.match_id).toBe("m1");
  });

  it("treats a match with no timestamp as its own session boundary-safe entry", () => {
    const matches = [makeMatch("m1", "", true)];
    matches[0].metadata.started_at = null;
    const sessions = groupMatchesIntoSessions(matches, "me");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].wins).toBe(1);
  });
});

describe("formatSessionHeader", () => {
  it("formats an ISO date as 'Session du JJ/MM'", () => {
    // Heure médiane UTC pour éviter tout risque de décalage de date selon le fuseau
    // horaire local de la machine qui exécute les tests.
    expect(formatSessionHeader("2024-03-05T14:00:00Z")).toMatch(/^Session du \d{2}\/\d{2}$/);
  });

  it("falls back to a generic label when the date is missing/invalid", () => {
    expect(formatSessionHeader(null)).toBe("Session");
    expect(formatSessionHeader("not-a-date")).toBe("Session");
  });
});

describe("computeGoalProgress", () => {
  it("reports 100% reached once the current tier exceeds the target", () => {
    expect(computeGoalProgress(20, 0, 18, 0)).toEqual({ percent: 100, reached: true });
  });

  it("uses RR vs target RR when tiers match", () => {
    expect(computeGoalProgress(19, 25, 19, 50)).toEqual({ percent: 50, reached: false });
  });

  it("reports reached when tiers match and RR meets the target", () => {
    expect(computeGoalProgress(19, 50, 19, 50)).toEqual({ percent: 100, reached: true });
  });

  it("uses relative tier position when below the target tier", () => {
    expect(computeGoalProgress(9, 0, 18, 0)).toEqual({ percent: 50, reached: false });
  });

  it("clamps percent to [0, 100]", () => {
    expect(computeGoalProgress(19, 999, 19, 50).percent).toBe(100);
  });
});
