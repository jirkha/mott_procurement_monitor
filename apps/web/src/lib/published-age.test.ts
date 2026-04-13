import { describe, expect, it } from "vitest";
import {
  calendarDaysSincePublication,
  publicationAgeAccentClass,
  publicationAgePhraseCs,
} from "./published-age";

describe("calendarDaysSincePublication", () => {
  it("počítá celé kalendářní dny v místním čase", () => {
    const now = new Date(2026, 3, 10, 15, 0, 0);
    const pub = new Date(2026, 3, 8, 9, 0, 0);
    expect(calendarDaysSincePublication(pub, now)).toBe(2);
  });
});

describe("publicationAgePhraseCs", () => {
  it("vrací přirozené tvary pro 0–2 dny a pak „před N dny“", () => {
    expect(publicationAgePhraseCs(0)).toBe("dnes");
    expect(publicationAgePhraseCs(1)).toBe("včera");
    expect(publicationAgePhraseCs(2)).toBe("před 2 dny");
    expect(publicationAgePhraseCs(30)).toBe("před 30 dny");
  });
});

describe("publicationAgeAccentClass", () => {
  it("oddělí barvu podle 30denního prahu", () => {
    expect(publicationAgeAccentClass(29)).toContain("emerald");
    expect(publicationAgeAccentClass(30)).toContain("amber");
  });
});
