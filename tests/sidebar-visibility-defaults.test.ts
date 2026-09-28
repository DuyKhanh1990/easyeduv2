import { describe, expect, it } from "vitest";
import {
  buildDefaultVisibility,
  mergeWithDefaults,
} from "../client/src/hooks/use-sidebar-visibility";

describe("sidebar visibility defaults", () => {
  it("hides score conversion by default while keeping other items visible", () => {
    const defaults = buildDefaultVisibility();

    expect(defaults["item:/score-conversion"]).toBe(false);
    expect(defaults["item:/classes"]).toBe(true);
  });

  it("still honors a saved choice to turn score conversion back on", () => {
    expect(mergeWithDefaults({
      "item:/score-conversion": true,
    })["item:/score-conversion"]).toBe(true);
  });
});