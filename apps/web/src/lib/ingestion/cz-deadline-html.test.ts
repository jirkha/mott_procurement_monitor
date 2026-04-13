import { describe, expect, it } from "vitest";
import {
  extractSubmissionDeadlineFromCzPortalPlainText,
  htmlToCzPortalPlainText,
  parseCzDeadlineDateToken,
  parseDeadlineFromCzPortalHtml,
} from "./cz-deadline-html";

describe("parseCzDeadlineDateToken", () => {
  it("parsuje čas včetně vteřin a mezer u teček", () => {
    const d = parseCzDeadlineDateToken("05. 03. 2026 10:00:00");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(2);
    expect(d!.getDate()).toBe(5);
    expect(d!.getHours()).toBe(10);
  });
});

describe("parseDeadlineFromCzPortalHtml", () => {
  it("parsuje Nabídku s HTML entitami", () => {
    const html = `<p>Nab&iacute;dku podat do: 23.03.2026 10:00</p>`;
    const d = parseDeadlineFromCzPortalHtml(html);
    expect(d).not.toBeNull();
    expect(d!.getMonth()).toBe(2);
    expect(d!.getDate()).toBe(23);
  });

  it("fallback na lhůtu pro doručení žádosti o účast", () => {
    const html = `Lhůta pro doručení žádosti o účast: 05. 03. 2026 10:00:00`;
    const d = parseDeadlineFromCzPortalHtml(html);
    expect(d).not.toBeNull();
    expect(d!.getDate()).toBe(5);
  });

  it("parsuje i frázi Lhůta pro podání nabídek", () => {
    const html = `Lhůta pro podání nabídek: 17. 10. 2025 07:00:00`;
    const d = parseDeadlineFromCzPortalHtml(html);
    expect(d).not.toBeNull();
    expect(d!.getDate()).toBe(17);
    expect(d!.getHours()).toBe(7);
  });

  it("plain text: nabídka má přednost před žádostí", () => {
    const plain =
      "Lhůta pro doručení žádosti o účast: 01.01.2026 12:00 Nabídku podat do: 15.02.2026 14:00";
    const d = extractSubmissionDeadlineFromCzPortalPlainText(plain);
    expect(d!.getMonth()).toBe(1);
    expect(d!.getDate()).toBe(15);
  });
});

describe("htmlToCzPortalPlainText", () => {
  it("odstraní tagy a dekóduje entity", () => {
    const t = htmlToCzPortalPlainText("<b>Nab&iacute;dku</b> podat do:");
    expect(t).toContain("Nabídku");
    expect(t).toContain("podat do");
  });
});
