import { apiRequest, queryClient } from "@/lib/queryClient";

export interface ParsedClassRow {
  classCode: string;
  className: string;
  locationId: string;
  maxStudents?: number;
  learningFormat?: "online" | "offline";
  onlineLink?: string;
  startDate?: string;
  endDate?: string;
  endSessions?: number;
  weekday?: number;
  shiftId?: string;
  teacherIds?: string[];
  studentIds?: string[];
  courseId?: string;
  feePackageId?: string;
}

export interface BulkSubmitResult {
  total: number;
  success: number;
  failed: number;
  failedCodes: string[];
}

export function groupRowsByClassCode(rows: ParsedClassRow[]) {
  const groups = new Map<string, {
    name: string;
    locationId: string;
    maxStudents?: number;
    learningFormat?: string;
    onlineLink?: string;
    startDate?: string;
    endDate?: string;
    endSessions?: number;
    courseId?: string;
    feePackageId?: string;
    studentIds: string[];
    scheduleRows: { weekday: number; shiftId: string; teacherIds: string[]; studentIds: string[] }[];
  }>();

  for (const r of rows) {
    if (!r.classCode || !r.className || !r.locationId) continue;
    if (!groups.has(r.classCode)) {
      groups.set(r.classCode, {
        name: r.className,
        locationId: r.locationId,
        maxStudents: r.maxStudents,
        learningFormat: r.learningFormat,
        onlineLink: r.onlineLink,
        startDate: r.startDate,
        endDate: r.endDate,
        endSessions: r.endSessions,
        courseId: r.courseId,
        feePackageId: r.feePackageId,
        studentIds: [],
        scheduleRows: [],
      });
    } else {
      const g = groups.get(r.classCode)!;
      if (!g.startDate && r.startDate) g.startDate = r.startDate;
      if (!g.endDate && r.endDate) g.endDate = r.endDate;
      if (g.endSessions == null && r.endSessions != null) g.endSessions = r.endSessions;
      if (g.maxStudents == null && r.maxStudents != null) g.maxStudents = r.maxStudents;
      if (!g.onlineLink && r.onlineLink) g.onlineLink = r.onlineLink;
      if (!g.courseId && r.courseId) g.courseId = r.courseId;
      if (!g.feePackageId && r.feePackageId) g.feePackageId = r.feePackageId;
    }
    const g = groups.get(r.classCode)!;
    // Merge studentIds (deduplicated) across all rows of the same class
    if (r.studentIds && r.studentIds.length > 0) {
      for (const sid of r.studentIds) {
        if (!g.studentIds.includes(sid)) g.studentIds.push(sid);
      }
    }
    if (r.weekday !== undefined && r.shiftId) {
      g.scheduleRows.push({
        weekday: r.weekday,
        shiftId: r.shiftId,
        teacherIds: r.teacherIds ?? [],
        studentIds: r.studentIds ?? [],
      });
    }
  }
  return groups;
}

// Maximum number of classes processed in parallel against the backend.
// Tuned to balance throughput vs. DB connection pressure on the external Postgres.
const CLASS_CONCURRENCY = 5;

export async function submitClassGroups(
  groups: ReturnType<typeof groupRowsByClassCode>,
  onProgress?: (done: number, total: number) => void,
): Promise<BulkSubmitResult> {
  const total = groups.size;
  let success = 0;
  let failed = 0;
  let done = 0;
  const failedCodes: string[] = [];

  const entries = Array.from(groups.entries());

  const processOne = async ([classCode, grp]: typeof entries[number]) => {
    try {
      const scheduleByWeekday = new Map<number, string[]>();
      const teacherShiftKeys = new Map<string, string[]>();
      void classCode;

      for (const row of grp.scheduleRows) {
        if (!scheduleByWeekday.has(row.weekday)) scheduleByWeekday.set(row.weekday, []);
        scheduleByWeekday.get(row.weekday)!.push(row.shiftId);

        const shiftKey = `${row.weekday}_shift0`;
        for (const id of row.teacherIds) {
          if (!teacherShiftKeys.has(id)) teacherShiftKeys.set(id, []);
          if (!teacherShiftKeys.get(id)!.includes(shiftKey)) {
            teacherShiftKeys.get(id)!.push(shiftKey);
          }
        }
      }

      const totalScheduleRows = grp.scheduleRows.length;
      const schedule_config = Array.from(scheduleByWeekday.entries()).map(([weekday, shiftIds]) => ({
        weekday,
        shifts: Array.from(new Set(shiftIds)).map(id => ({ shift_template_id: id })),
      }));
      const allTeacherIds = Array.from(teacherShiftKeys.keys());
      const teachers_config = allTeacherIds.map(id => {
        const keys = teacherShiftKeys.get(id)!;
        const isAll = keys.length >= totalScheduleRows;
        return { teacher_id: id, mode: isAll ? "all" : "specific", shift_keys: isAll ? [] : keys };
      });
      void classCode;

      const useSessions = grp.endSessions != null && grp.endSessions > 0;

      const createRes = await apiRequest("POST", "/api/classes", {
        classCode,
        name: grp.name,
        locationId: grp.locationId,
        maxStudents: grp.maxStudents,
        learningFormat: grp.learningFormat,
        onlineLink: grp.onlineLink || null,
        courseId: grp.courseId || null,
        feePackageId: grp.feePackageId || null,
        startDate: grp.startDate,
        endDate: useSessions ? undefined : grp.endDate,
        endType: useSessions ? "sessions" : "date",
        sessionCount: useSessions ? grp.endSessions : undefined,
        teacherIds: allTeacherIds,
        weekdays: Array.from(scheduleByWeekday.keys()),
        schedule_config,
        teachers_config,
      });

      // Add students after the class is created (best-effort)
      if (grp.studentIds.length > 0) {
        try {
          const created = await createRes.json();
          if (created?.id) {
            // Step 1: enroll students into the class (waiting list + Tinode topic sync)
            await apiRequest("POST", `/api/classes/${created.id}/add-students`, {
              studentIds: grp.studentIds,
            });

            // Step 2: schedule students into the generated class sessions so they
            // actually appear on each session — not just the waiting list.
            // Each student is scheduled ONLY into the (weekday, shift) cycles
            // of the rows where they were listed, not all cycles of the class.
            const scheduleStart = grp.startDate || created.startDate;
            const scheduleEnd = created.endDate || grp.endDate;
            if (scheduleStart) {
              const configs = grp.studentIds.map((sid) => {
                const shiftKeySet = new Set<string>();
                const shiftIdSet = new Set<string>();
                for (const row of grp.scheduleRows) {
                  if (row.studentIds.includes(sid)) {
                    shiftKeySet.add(`${row.weekday}_${row.shiftId}`);
                    shiftIdSet.add(row.shiftId);
                  }
                }
                const useSpecific = shiftKeySet.size > 0 && shiftKeySet.size < grp.scheduleRows.length;
                return {
                  studentId: sid,
                  startDate: scheduleStart,
                  shiftType: useSpecific ? "specific" : "all",
                  selectedShifts: useSpecific ? Array.from(shiftIdSet) : [],
                  selectedShiftKeys: useSpecific ? Array.from(shiftKeySet) : [],
                  endType: useSessions ? "sessions" : "date",
                  endDate: scheduleEnd,
                  totalSessions: useSessions ? grp.endSessions : undefined,
                  packageId: grp.feePackageId || null,
                  autoInvoice: false,
                  promotionKeys: [],
                  surchargeKeys: [],
                  useDeposit: false,
                };
              });
              try {
                await apiRequest(
                  "POST",
                  `/api/classes/${created.id}/schedule-students`,
                  { configs },
                );
              } catch (schedErr) {
                console.error(`[bulk-submit] Failed to schedule students for class ${classCode}:`, schedErr);
                failedCodes.push(`${classCode} (lớp đã tạo, đã thêm học viên nhưng chưa xếp được lịch)`);
              }
            }
          }
        } catch (e) {
          // Class was created; flag as partial failure so user knows to check
          console.error(`[bulk-submit] Failed to add students for class ${classCode}:`, e);
          failedCodes.push(`${classCode} (lớp đã tạo nhưng chưa thêm được học viên)`);
        }
      }

      success++;
    } catch {
      failed++;
      failedCodes.push(classCode);
    }
    done++;
    onProgress?.(done, total);
  };

  // Process classes in parallel batches to keep network round-trips overlapping
  // while avoiding overwhelming the external Postgres connection pool.
  for (let i = 0; i < entries.length; i += CLASS_CONCURRENCY) {
    const batch = entries.slice(i, i + CLASS_CONCURRENCY);
    await Promise.all(batch.map(processOne));
  }

  queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
  return { total, success, failed, failedCodes };
}
