export type AttendanceBulkRecord = {
  id: string;
  recordType?: "regular" | "free";
  freeRegistrationId?: string;
  classSessionId?: string;
};

export type AttendanceBulkFailure = {
  id: string;
  message: string;
};

type RegularAttendanceInput = {
  studentSessionId: string;
  attendanceStatus: string;
};

type BulkOperation =
  | { kind: "regular"; classSessionId: string; records: AttendanceBulkRecord[] }
  | { kind: "free"; record: AttendanceBulkRecord };

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "").trim();
    if (message) return message;
  }
  return "Không thể cập nhật. Hãy thử lại.";
}

/**
 * Send one regular-class request per class session, while keeping free-class
 * writes isolated and sequential through their existing transactional route.
 */
export async function applyBulkAttendance(
  records: AttendanceBulkRecord[],
  attendanceStatus: string,
  submitRegular: (
    classSessionId: string,
    students: RegularAttendanceInput[],
  ) => Promise<unknown>,
  submitFree: (registrationId: string, attendanceStatus: string) => Promise<unknown>,
): Promise<{ updatedIds: string[]; failures: AttendanceBulkFailure[] }> {
  const operations: BulkOperation[] = [];
  const regularOperations = new Map<string, Extract<BulkOperation, { kind: "regular" }>>();
  const failures: AttendanceBulkFailure[] = [];
  const updatedIds: string[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    if (!record.id || seen.has(record.id)) continue;
    seen.add(record.id);

    if (record.recordType === "free") {
      operations.push({ kind: "free", record });
      continue;
    }

    if (!record.classSessionId) {
      failures.push({ id: record.id, message: "Thiếu thông tin buổi học." });
      continue;
    }

    let operation = regularOperations.get(record.classSessionId);
    if (!operation) {
      operation = { kind: "regular", classSessionId: record.classSessionId, records: [] };
      regularOperations.set(record.classSessionId, operation);
      operations.push(operation);
    }
    operation.records.push(record);
  }

  for (const operation of operations) {
    if (operation.kind === "regular") {
      try {
        await submitRegular(
          operation.classSessionId,
          operation.records.map((record) => ({
            studentSessionId: record.id,
            attendanceStatus,
          })),
        );
        updatedIds.push(...operation.records.map((record) => record.id));
      } catch (error) {
        const message = errorMessage(error);
        failures.push(...operation.records.map((record) => ({ id: record.id, message })));
      }
      continue;
    }

    const registrationId = operation.record.freeRegistrationId || operation.record.id;
    try {
      await submitFree(registrationId, attendanceStatus);
      updatedIds.push(operation.record.id);
    } catch (error) {
      failures.push({ id: operation.record.id, message: errorMessage(error) });
    }
  }

  return { updatedIds, failures };
}