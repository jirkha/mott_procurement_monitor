import { describe, expect, it } from "vitest";
import { decodeHtmlEntities } from "./html-decode";

describe("decodeHtmlEntities", () => {
  it("dekóduje &iacute; a číselné entity", () => {
    expect(decodeHtmlEntities("Nab&iacute;dku")).toBe("Nabídku");
    expect(decodeHtmlEntities("&#237;")).toBe("í");
    expect(decodeHtmlEntities("&#xED;")).toBe("í");
  });

  it("dekóduje &amp; jako poslední krok", () => {
    expect(decodeHtmlEntities("a &amp; b")).toBe("a & b");
  });
});
