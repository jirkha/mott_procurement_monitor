import { describe, expect, it } from "vitest";
import { tryDeadlineFromVvzPlainText } from "./vvz-deadline-heuristic";

describe("tryDeadlineFromVvzPlainText", () => {
  it("najde datum u fráze o podání nabídky", () => {
    const d = tryDeadlineFromVvzPlainText(
      "Lhůta pro podání nabídek do 15.06.2027 14:30.",
    );
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2027);
    expect(d!.getMonth()).toBe(5);
    expect(d!.getDate()).toBe(15);
  });

  it("nevrací datum bez klíčových slov", () => {
    expect(tryDeadlineFromVvzPlainText("Otevřeno do 15.06.2027.")).toBeNull();
  });
});
