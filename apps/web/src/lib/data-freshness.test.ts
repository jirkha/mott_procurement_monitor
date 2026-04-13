import { describe, expect, it } from "vitest";
import {
  classifyDataFreshness,
  FRESHNESS_CURRENT_MAX_HOURS,
  FRESHNESS_OLDER_MAX_HOURS,
} from "./data-freshness";

describe("classifyDataFreshness", () => {
  const now = new Date("2026-04-13T12:00:00.000Z");

  it("returns current when younger than 24h", () => {
    const fetched = new Date("2026-04-13T00:00:00.000Z");
    expect(classifyDataFreshness(fetched, now)).toBe("current");
  });

  it("returns older between 24h and 72h", () => {
    const fetched = new Date(
      now.getTime() - (FRESHNESS_CURRENT_MAX_HOURS + 1) * 3_600_000,
    );
    expect(classifyDataFreshness(fetched, now)).toBe("older");
  });

  it("returns stale at 72h or more", () => {
    const fetched = new Date(
      now.getTime() - FRESHNESS_OLDER_MAX_HOURS * 3_600_000,
    );
    expect(classifyDataFreshness(fetched, now)).toBe("stale");
  });
});
