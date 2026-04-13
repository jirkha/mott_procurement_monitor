import { describe, expect, it } from "vitest";
import {
  extractPublicationDateFromJosephineHtml,
  extractSubmissionDeadlineFromJosephineHtml,
} from "./josephine_fetcher";

describe("extractSubmissionDeadlineFromJosephineHtml", () => {
  it("parses Czech deadline label from JOSEPHINE summary", () => {
    const html = `
      <section>
        <h2>Termíny a lhůty</h2>
        <div><strong>Lhůta pro podání nabídek :</strong><br/>06.03.2026 10:00:00</div>
      </section>
    `;
    const dt = extractSubmissionDeadlineFromJosephineHtml(html);
    expect(dt?.getFullYear()).toBe(2026);
    expect(dt?.getMonth()).toBe(2);
    expect(dt?.getDate()).toBe(6);
    expect(dt?.getHours()).toBe(10);
  });

  it("parses dl/dt/dd layout (production JOSEPHINE)", () => {
    const html = `
        <h2>Termíny a lhůty</h2>
        <dl class="dl-horizontal">
          <dt title="Lhůta pro podání nabídek">Lhůta pro podání nabídek</dt>
          <dd><span title="za 12 dní">22.04.2026 10:00:00</span></dd>
        </dl>`;
    const dt = extractSubmissionDeadlineFromJosephineHtml(html);
    expect(dt?.getFullYear()).toBe(2026);
    expect(dt?.getMonth()).toBe(3);
    expect(dt?.getDate()).toBe(22);
    expect(dt?.getHours()).toBe(10);
  });

  it("parses profily.proebiz.com veřejná karta (stejné dt/dd jako JOSEPHINE)", () => {
    const html = `
            <dt title="Lhůta pro podání nabídek">
                Lhůta pro podání nabídek
            </dt>
            <dd>
                    <span title="">
                    27.04.2026 10:00:00
            </span>
            </dd>`;
    const dt = extractSubmissionDeadlineFromJosephineHtml(html);
    expect(dt?.getFullYear()).toBe(2026);
    expect(dt?.getMonth()).toBe(3);
    expect(dt?.getDate()).toBe(27);
    expect(dt?.getHours()).toBe(10);
  });

  it("parses Slovak label variant", () => {
    const html = `
      <section>
        <h2>Termíny a lehoty</h2>
        <div>Lehota na predkladanie ponúk: 17.04.2026 09:30</div>
      </section>
    `;
    const dt = extractSubmissionDeadlineFromJosephineHtml(html);
    expect(dt?.getFullYear()).toBe(2026);
    expect(dt?.getMonth()).toBe(3);
    expect(dt?.getDate()).toBe(17);
    expect(dt?.getMinutes()).toBe(30);
  });

  it("parses žádost o účast label variant", () => {
    const html = `
      <dl>
        <dt>Lhůta pro doručení žádosti o účast</dt>
        <dd>05.03.2026 10:00:00</dd>
      </dl>
    `;
    const dt = extractSubmissionDeadlineFromJosephineHtml(html);
    expect(dt?.getFullYear()).toBe(2026);
    expect(dt?.getMonth()).toBe(2);
    expect(dt?.getDate()).toBe(5);
    expect(dt?.getHours()).toBe(10);
  });

  it("returns null when no submission deadline is present", () => {
    const html = `<div><h2>Informace</h2><p>Bez lhůty podání.</p></div>`;
    expect(extractSubmissionDeadlineFromJosephineHtml(html)).toBeNull();
  });
});

describe("extractPublicationDateFromJosephineHtml", () => {
  it("parses Datum zveřejnění", () => {
    const html = `<div><strong>Datum zveřejnění:</strong> 01.02.2026</div>`;
    const d = extractPublicationDateFromJosephineHtml(html);
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(1);
    expect(d!.getDate()).toBe(1);
  });

  it("returns null when publication label missing", () => {
    expect(extractPublicationDateFromJosephineHtml("<p>x</p>")).toBeNull();
  });
});
