import { describe, it, expect } from "vitest";
import { formatMassPortLabel, parseTrailingDecimalDigitRun } from "./massPortLabel";

describe("parseTrailingDecimalDigitRun", () => {
  it("returns null when there is no trailing digit run", () => {
    expect(parseTrailingDecimalDigitRun("Wash")).toBeNull();
    expect(parseTrailingDecimalDigitRun("")).toBeNull();
    expect(parseTrailingDecimalDigitRun("Mac-")).toBeNull();
  });

  it("splits space-prefixed counters like MA dot2 examples", () => {
    expect(parseTrailingDecimalDigitRun("Mac700 1")).toEqual({
      prefix: "Mac700 ",
      digitRun: "1",
    });
  });

  it("captures multi-digit suffix and optional non-digit prefix", () => {
    expect(parseTrailingDecimalDigitRun("P12")).toEqual({ prefix: "P", digitRun: "12" });
    expect(parseTrailingDecimalDigitRun("12")).toEqual({ prefix: "", digitRun: "12" });
  });
});

describe("formatMassPortLabel", () => {
  it("leaves names without trailing digits unchanged for every index", () => {
    expect(formatMassPortLabel("Wash", 0)).toBe("Wash");
    expect(formatMassPortLabel("Wash", 5)).toBe("Wash");
  });

  it("increments the trailing counter across MA-style names", () => {
    expect(formatMassPortLabel("Mac700 1", 0)).toBe("Mac700 1");
    expect(formatMassPortLabel("Mac700 1", 1)).toBe("Mac700 2");
    expect(formatMassPortLabel("Mac700 1", 9)).toBe("Mac700 10");
  });

  it("preserves zero padding until the value outgrows the width", () => {
    expect(formatMassPortLabel("foo09", 0)).toBe("foo09");
    expect(formatMassPortLabel("foo09", 1)).toBe("foo10");
    expect(formatMassPortLabel("foo99", 1)).toBe("foo100");
  });

  it("handles digit-only templates", () => {
    expect(formatMassPortLabel("1", 0)).toBe("1");
    expect(formatMassPortLabel("1", 1)).toBe("2");
    expect(formatMassPortLabel("08", 1)).toBe("09");
    expect(formatMassPortLabel("08", 2)).toBe("10");
  });
});
