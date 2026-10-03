import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => {
  const tables = {
    classSessions: { name: "classSessions" },
    shiftTemplates: { name: "shiftTemplates" },
    classSessionTeacherAssignments: { name: "classSessionTeacherAssignments" },
    classes: { name: "classes" },
    studentSessions: { name: "studentSessions" },
    studentClasses: { name: "studentClasses" },
  };
  const state: {
    tables: typeof tables;
    queues: Map<object, any[]>;
    writes: Array<{ kind: string; table: object; values?: any; condition?: any }>;
    tx: any;
  } = {
    tables,
    queues: new Map(),
    writes: [],
    tx: null,
  };

  const makeSelectBuilder = () => {
    let table: object | null = null;
    const builder: any = {
      from(value: object) {
        table = value;
        return builder;
      },
      where() {
        return builder;
      },
      orderBy() {
        return builder;
      },
      limit() {
        return builder;
      },
      for() {
        return builder;
      },
      then(resolve: (value: any) => any, reject: (reason: unknown) => any) {
        const rows = table ? state.queues.get(table)?.shift() ?? [] : [];
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
    return builder;
  };

  state.tx = {
    select: () => makeSelectBuilder(),
    update: (table: object) => ({
      set: (values: any) => ({
        where: async (condition: any) => {
          state.writes.push({ kind: "update", table, values, condition });
          return [];
        },
      }),
    }),
    delete: (table: object) => ({
      where: async (condition: any) => {
        state.writes.push({ kind: "delete", table, condition });
        return [];
      },
    }),
    insert: (table: object) => ({
      values: async (values: any) => {
        state.writes.push({ kind: "insert", table, values });
        return [];
      },
    }),
    execute: async () => undefined,
  };
  return state;
});

vi.mock("../server/storage/base", () => ({
  db: {
    transaction: (callback: (tx: any) => Promise<any>) => callback(mockState.tx),
  },
  eq: (column: object, value: unknown) => ({ op: "eq", column, value }),
  and: (...conditions: unknown[]) => ({ op: "and", conditions }),
  or: (...conditions: unknown[]) => ({ op: "or", conditions }),
  inArray: (column: object, values: unknown[]) => ({ op: "inArray", column, values }),
  asc: (column: object) => ({ op: "asc", column }),
  desc: (column: object) => ({ op: "desc", column }),
  gte: (column: object, value: unknown) => ({ op: "gte", column, value }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ op: "sql", strings, values }),
    { raw: (text: string) => ({ op: "raw", text }) },
  ),
  classSessions: mockState.tables.classSessions,
  shiftTemplates: mockState.tables.shiftTemplates,
  classSessionTeacherAssignments: mockState.tables.classSessionTeacherAssignments,
  classes: mockState.tables.classes,
  studentSessions: mockState.tables.studentSessions,
  studentClasses: mockState.tables.studentClasses,
  classSessionExclusions: {},
  sessionContents: {},
  students: {},
  invoices: {},
  invoiceItems: {},
  invoiceSessionAllocations: {},
  tuitionPackageSessionAdjustments: {},
  courseFeePackages: {},
  financePromotions: {},
  format: () => "",
  parseISO: () => new Date(),
  getDayName: () => "",
}));

vi.mock("@shared/schema", () => ({
  attendanceFeeRules: {},
  studentWalletTransactions: {},
}));
vi.mock("../server/storage/class.storage", () => ({ getClass: vi.fn() }));
vi.mock("../server/storage/finance.storage", () => ({ getNextLocationCode: vi.fn() }));
vi.mock("../server/lib/invoice-notification", () => ({ sendInvoiceCreatedNotification: vi.fn() }));

import { updateClassSession } from "../server/storage/session.storage";

const {
  classSessions,
  shiftTemplates,
  classSessionTeacherAssignments,
  classes,
  studentSessions,
  studentClasses,
} = mockState.tables;

const shiftA = { id: "shift-a", startTime: "08:00", endTime: "10:00" };
const shiftB = { id: "shift-b", startTime: "14:00", endTime: "16:00" };

const firstSlot = {
  id: "session-1",
  classId: "class-1",
  sessionIndex: 1,
  sessionDate: "2026-01-05",
  weekday: 1,
  shiftTemplateId: shiftA.id,
  roomId: "room-1",
  teacherIds: ["teacher-a"],
  teacherRoleIds: { "teacher-a": "role-a-old" },
  learningFormat: "in_person",
};

const secondSlot = {
  id: "session-2",
  classId: "class-1",
  sessionIndex: 2,
  sessionDate: "2026-01-08",
  weekday: 4,
  shiftTemplateId: shiftB.id,
  roomId: "room-2",
  teacherIds: ["teacher-b"],
  teacherRoleIds: { "teacher-b": "role-b" },
  learningFormat: "online",
};

const firstAssignment = {
  classSessionId: firstSlot.id,
  teacherId: "teacher-a",
  startTime: "08:00",
  endTime: "10:00",
  scheduleKey: "schedule-a",
};

const secondAssignment = {
  classSessionId: secondSlot.id,
  teacherId: "teacher-b",
  startTime: "14:00",
  endTime: "15:30",
  scheduleKey: "schedule-b",
};

function queueRows(table: object, ...rows: any[][]) {
  mockState.queues.set(table, rows);
}

function queueBaseSessionReads(options: { assignments?: any[][]; classSessionReads?: any[][] } = {}) {
  queueRows(classSessions,
    [firstSlot],
    [],
    [
      { id: firstSlot.id, sessionIndex: firstSlot.sessionIndex },
      { id: secondSlot.id, sessionIndex: secondSlot.sessionIndex },
    ],
    [firstSlot, secondSlot],
    ...(options.classSessionReads ?? []),
  );
  queueRows(shiftTemplates, [shiftA], [shiftA, shiftB]);
  queueRows(classSessionTeacherAssignments,
    [firstAssignment],
    options.assignments ?? [[firstAssignment, secondAssignment]],
  );
  queueRows(classes, []);
  queueRows(studentSessions, []);
  queueRows(studentClasses, []);
}

describe("updateClassSession teacher-time persistence", () => {
  beforeEach(() => {
    mockState.queues.clear();
    mockState.writes.length = 0;
  });

  it("moves each teacher's interval with its schedule when preserving numbered slots", async () => {
    queueBaseSessionReads({
      classSessionReads: [[{
        ...secondSlot,
        teacherIds: ["teacher-a"],
        teacherRoleIds: { "teacher-a": "role-a-new" },
      }]],
    });

    await updateClassSession(firstSlot.id, {
      sessionDate: "2026-01-15",
      shiftTemplateId: shiftA.id,
      roomId: "room-1",
      teacherIds: ["teacher-a"],
      teacherRoleIds: { "teacher-a": "role-a-new" },
      teacherTimeAssignments: [{
        teacherId: "teacher-a",
        startTime: "08:30",
        endTime: "09:15",
      }],
      changeReason: "Đổi lịch",
      changedBy: "staff-1",
      indexChangeMode: "preserve_slots",
    });

    const sessionWrites = mockState.writes.filter(
      (write) => write.kind === "update" && write.table === classSessions,
    );
    expect(sessionWrites.map((write) => ({
      targetSessionId: write.condition?.value,
      teacherIds: write.values.teacherIds,
      teacherRoleIds: write.values.teacherRoleIds,
    }))).toEqual([
      {
        targetSessionId: firstSlot.id,
        teacherIds: ["teacher-b"],
        teacherRoleIds: { "teacher-b": "role-b" },
      },
      {
        targetSessionId: secondSlot.id,
        teacherIds: ["teacher-a"],
        teacherRoleIds: { "teacher-a": "role-a-new" },
      },
    ]);

    const assignmentInserts = mockState.writes
      .filter((write) => write.kind === "insert" && write.table === classSessionTeacherAssignments)
      .flatMap((write) => write.values);
    expect(assignmentInserts).toEqual([
      {
        classSessionId: firstSlot.id,
        teacherId: "teacher-b",
        startTime: "14:00",
        endTime: "15:30",
        scheduleKey: "schedule-b",
      },
      {
        classSessionId: secondSlot.id,
        teacherId: "teacher-a",
        startTime: "08:30",
        endTime: "09:15",
        scheduleKey: "schedule-a",
      },
    ]);
  });

  it("rejects an out-of-shift interval before writing any session, role, or time changes", async () => {
    queueRows(classSessions, [firstSlot]);
    queueRows(shiftTemplates, [shiftA]);
    queueRows(classSessionTeacherAssignments, [firstAssignment]);

    await expect(updateClassSession(firstSlot.id, {
      sessionDate: "2026-01-15",
      shiftTemplateId: shiftA.id,
      teacherIds: ["teacher-a"],
      teacherRoleIds: { "teacher-a": "role-a-new" },
      teacherTimeAssignments: [{
        teacherId: "teacher-a",
        startTime: "07:30",
        endTime: "09:15",
      }],
      changeReason: "Đổi lịch",
      changedBy: "staff-1",
    })).rejects.toThrow("phải nằm trong ca chung");

    expect(mockState.writes).toEqual([]);
  });
});