import { describe, expect, it } from "vitest";
import { userFacingIngestError } from "./user-facing-ingest-error";

describe("userFacingIngestError", () => {
  it("maps unknown lastFetchedAt to migrate/generate hint", () => {
    const raw = `Invalid prisma.zakazka.upsert() invocation:\nUnknown argument lastFetchedAt.`;
    const out = userFacingIngestError(raw);
    expect(out).toContain("db:migrate");
    expect(out).toContain("db:generate");
    expect(out.length).toBeLessThan(500);
    expect(out).not.toContain("Invalid prisma");
  });

  it("shortens long generic messages", () => {
    const long = "x".repeat(400);
    expect(userFacingIngestError(long).endsWith("…")).toBe(true);
  });
});
