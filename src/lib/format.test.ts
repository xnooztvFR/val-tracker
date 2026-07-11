import { describe, expect, it } from "vitest";

import {
  formatDateTimeShort,
  formatDurationMs,
  formatKda,
  formatKdRatio,
  formatPercent,
  rankGlowColor,
  rankInfo,
  splitRiotId,
} from "./format";

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
