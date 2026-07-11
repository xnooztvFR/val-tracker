import { describe, expect, it } from "vitest";

import { isCommandError } from "./tauriApi";

describe("isCommandError", () => {
  it("recognizes a well-formed CommandError", () => {
    expect(isCommandError({ kind: "not_found" })).toBe(true);
    expect(isCommandError({ kind: "rate_limited", retry_after_secs: 5 })).toBe(true);
  });

  it("rejects non-CommandError values (plain Error, primitives, null)", () => {
    expect(isCommandError(new Error("boom"))).toBe(false);
    expect(isCommandError("boom")).toBe(false);
    expect(isCommandError(42)).toBe(false);
    expect(isCommandError(null)).toBe(false);
    expect(isCommandError(undefined)).toBe(false);
    expect(isCommandError({})).toBe(false);
  });
});
