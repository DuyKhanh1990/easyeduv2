import { describe, expect, it } from "vitest";
import { uniqueUuidStrings } from "../server/lib/uuid-list";

describe("uniqueUuidStrings", () => {
  it("keeps valid UUIDs, removes non-UUID markers, and deduplicates", () => {
    const validId = "6a498bd3-4e23-4821-9354-36217c10b0e3";
    expect(uniqueUuidStrings([validId, "__general__", validId, null, 42])).toEqual([validId]);
  });
});
