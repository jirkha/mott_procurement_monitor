import { describe, expect, it } from "vitest";
import {
  parseDeadlineFromEzakDetailHtml,
  parsePublicationFromEzakDetailHtml,
} from "./ezak_fetcher";

describe("parsePublicationFromEzakDetailHtml", () => {
  it("parses datum zahájení with tags (JMK / E-ZAK)", () => {
    const html = `
      Datum zahájení:
    <b>
      02.04.2026
    </b><br />
      Nabídku podat do:
    <b>21.04.2026 23:59</b>`;
    const d = parsePublicationFromEzakDetailHtml(html);
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(2026);
    expect(d!.getUTCMonth()).toBe(3);
    expect(d!.getUTCDate()).toBe(2);
  });
});

describe("parseDeadlineFromEzakDetailHtml", () => {
  it("parses Nabídku podat do with bold on next line", () => {
    const html = `
      Nabídku podat do:
    <b>21.04.2026 23:59</b>`;
    const d = parseDeadlineFromEzakDetailHtml(html);
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(3);
    expect(d!.getDate()).toBe(21);
    expect(d!.getHours()).toBe(23);
    expect(d!.getMinutes()).toBe(59);
  });

  it("parses Nabídku with HTML entities (E-ZAK)", () => {
    const html = `Nab&iacute;dku podat do: 23.03.2026 10:00`;
    const d = parseDeadlineFromEzakDetailHtml(html);
    expect(d).not.toBeNull();
    expect(d!.getMonth()).toBe(2);
    expect(d!.getDate()).toBe(23);
  });

  it("parses žádost o účast when nabídka label missing", () => {
    const html = `Lhůta pro doručení žádosti o účast: 05. 03. 2026 10:00:00`;
    const d = parseDeadlineFromEzakDetailHtml(html);
    expect(d).not.toBeNull();
    expect(d!.getDate()).toBe(5);
  });
});
