import { describe, expect, it } from "vitest";
import { extractSubmissionDeadlineFromZpc } from "./xml-profile-deadline";

describe("extractSubmissionDeadlineFromZpc", () => {
  it("vybere lhůtu podání nabídky mezi více lhůtami", () => {
    const zpc = {
      lhuty_zadavaciho_postupu: [
        {
          lhuta: [
            {
              druh_lhuty: ["lhůta podání žádosti"],
              datum_konce_lhuty: ["2024-10-31T14:00:00"],
            },
            {
              druh_lhuty: ["lhůta podání nabídky"],
              datum_konce_lhuty: ["2026-07-10T16:00:00"],
            },
          ],
        },
      ],
    };
    const d = extractSubmissionDeadlineFromZpc(zpc);
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(6);
    expect(d?.getDate()).toBe(10);
  });

  it("rozpozná genitiv „nabídek“ (po ASCII ne `nabidky`)", () => {
    const zpc = {
      lhuty_zadavaciho_postupu: [
        {
          lhuta: [
            {
              druh_lhuty: ["Lhůta podání nabídek"],
              datum_konce_lhuty: ["2026-03-15T10:00:00"],
            },
          ],
        },
      ],
    };
    const d = extractSubmissionDeadlineFromZpc(zpc);
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(2);
    expect(d?.getDate()).toBe(15);
  });

  it("vrací null bez bloku lhůt", () => {
    expect(extractSubmissionDeadlineFromZpc(undefined)).toBeNull();
    expect(extractSubmissionDeadlineFromZpc({})).toBeNull();
  });

  it("fallback na lhůtu žádosti o účast, pokud chybí nabídka", () => {
    const zpc = {
      lhuty_zadavaciho_postupu: [
        {
          lhuta: [
            {
              druh_lhuty: ["Lhůta pro doručení žádosti o účast"],
              datum_konce_lhuty: ["2026-03-05T10:00:00"],
            },
          ],
        },
      ],
    };
    const d = extractSubmissionDeadlineFromZpc(zpc);
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(2);
    expect(d?.getDate()).toBe(5);
  });

  it("projde více bloků lhuty_zadavaciho_postupu, ne jen první", () => {
    const zpc = {
      lhuty_zadavaciho_postupu: [
        {
          lhuta: [
            {
              druh_lhuty: ["Lhůta pro doručení žádosti o účast"],
              datum_konce_lhuty: ["2026-03-05T10:00:00"],
            },
          ],
        },
        {
          lhuta: [
            {
              druh_lhuty: ["Lhůta podání nabídek"],
              datum_konce_lhuty: ["2026-03-17T07:00:00"],
            },
          ],
        },
      ],
    };
    const d = extractSubmissionDeadlineFromZpc(zpc);
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(2);
    expect(d?.getDate()).toBe(17);
    expect(d?.getHours()).toBe(7);
  });
});
