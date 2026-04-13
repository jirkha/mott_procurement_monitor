import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchWithTimeout,
  getOutboundLimiterSnapshot,
  resetOutboundLimiterStatsForTests,
  shouldUseProxyPilot,
} from "./perf";

describe("outbound limiter", () => {
  beforeEach(() => {
    resetOutboundLimiterStatsForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tracks 429 responses per host", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response("too many", {
          status: 429,
          headers: { "retry-after": "0" },
        });
      }),
    );

    const res = await fetchWithTimeout(
      "https://www.tenderarena.cz/profily/DPP/XMLdataVZ",
      { cache: "no-store" },
      1000,
    );

    expect(res.status).toBe(429);
    const snap = getOutboundLimiterSnapshot();
    expect(snap.totals.requests).toBe(1);
    expect(snap.totals.status429).toBe(1);
    const host = snap.perHost.find((h) => h.host === "www.tenderarena.cz");
    expect(host?.status429).toBe(1);
  });

  it("tracks abort timeouts per host", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: string | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error("missing signal"));
            return;
          }
          signal.addEventListener("abort", () => {
            reject(new Error("This operation was aborted"));
          });
        });
      }),
    );

    await expect(
      fetchWithTimeout("https://nen.nipez.cz/profil/ZLK/XMLdataVZ", { cache: "no-store" }, 5),
    ).rejects.toBeInstanceOf(Error);

    const snap = getOutboundLimiterSnapshot();
    expect(snap.totals.requests).toBe(1);
    expect(snap.totals.timeouts).toBe(1);
    const host = snap.perHost.find((h) => h.host === "nen.nipez.cz");
    expect(host?.timeouts).toBe(1);
  });

  it("keeps proxy pilot disabled by default", () => {
    const decision = shouldUseProxyPilot("tenderarena.cz");
    expect(decision.useProxy).toBe(false);
    expect(decision.reason).toContain("vypnuty");
  });
});
