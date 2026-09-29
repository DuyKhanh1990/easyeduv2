import { describe, expect, it } from "vitest";
import { mySpaceTranslations } from "../client/src/i18n/my-space";

describe("My Space translations", () => {
  it("has matching Vietnamese and English keys", () => {
    expect(Object.keys(mySpaceTranslations.en).sort()).toEqual(
      Object.keys(mySpaceTranslations.vi).sort(),
    );
  });

  it("contains non-empty text for every translation key", () => {
    for (const locale of ["vi", "en"] as const) {
      for (const [key, value] of Object.entries(mySpaceTranslations[locale])) {
        expect(value.trim(), `${locale}:${key}`).not.toBe("");
      }
    }
  });
});