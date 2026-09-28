import { describe, expect, it, vi } from "vitest";
import { applyBulkAttendance } from "../client/src/lib/attendance-bulk";

describe("applyBulkAttendance", () => {
  it("batches regular records by session and keeps free-class writes separate", async () => {
    const submitRegular = vi.fn().mockResolvedValue({ success: true });
    const submitFree = vi.fn().mockResolvedValue({ success: true });

    const result = await applyBulkAttendance(
      [
        { id: "regular-1", classSessionId: "session-a" },
        { id: "free-1", recordType: "free", freeRegistrationId: "registration-1" },
        { id: "regular-2", classSessionId: "session-a" },
        { id: "regular-3", classSessionId: "session-b" },
      ],
      "present",
      submitRegular,
      submitFree,
    );

    expect(submitRegular).toHaveBeenCalledTimes(2);
    expect(submitRegular).toHaveBeenNthCalledWith(1, "session-a", [
      { studentSessionId: "regular-1", attendanceStatus: "present" },
      { studentSessionId: "regular-2", attendanceStatus: "present" },
    ]);
    expect(submitFree).toHaveBeenCalledTimes(1);
    expect(submitFree).toHaveBeenCalledWith("registration-1", "present");
    expect(result.updatedIds).toEqual(["regular-1", "regular-2", "free-1", "regular-3"]);
    expect(result.failures).toEqual([]);
  });

  it("keeps failed rows retryable and continues with other groups", async () => {
    const submitRegular = vi.fn(async (sessionId: string) => {
      if (sessionId === "session-a") throw new Error("Database busy");
      return { success: true };
    });
    const submitFree = vi.fn().mockResolvedValue({ success: true });

    const result = await applyBulkAttendance(
      [
        { id: "regular-1", classSessionId: "session-a" },
        { id: "regular-2", classSessionId: "session-a" },
        { id: "free-1", recordType: "free" },
        { id: "regular-3", classSessionId: "session-b" },
      ],
      "present",
      submitRegular,
      submitFree,
    );

    expect(result.updatedIds).toEqual(["free-1", "regular-3"]);
    expect(result.failures).toEqual([
      { id: "regular-1", message: "Database busy" },
      { id: "regular-2", message: "Database busy" },
    ]);
    expect(submitRegular).toHaveBeenCalledTimes(2);
    expect(submitFree).toHaveBeenCalledTimes(1);
  });
});