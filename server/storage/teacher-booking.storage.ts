import {
  and,
  db,
  eq,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
  classes,
  classSessions,
  classSessionTeacherAssignments,
  courseFeePackages,
  courseLocations,
  courses,
  departments,
  invoiceItems,
  invoices,
  locations,
  shiftTemplates,
  staff,
  staffAssignments,
  studentClasses,
  studentLocations,
  students,
  studentSessions,
  studentWalletTransactions,
  systemSettings,
  teacherBookingBatches,
  teacherBookingClassSeries,
  teacherBookingSlots,
  teacherAvailability,
  teacherAvailabilityWindows,
  users,
} from "./base";
import { asc, like, ne } from "drizzle-orm";
import { getNextLocationCode } from "./finance.storage";
import { calculateAutoInvoiceDepositTotals } from "@shared/invoice-deposit-accounting";
import {
  DEFAULT_PERSONAL_SCHEDULE_REGISTRATION_POLICY,
  getPersonalScheduleCancellationCutoff,
  PERSONAL_SCHEDULE_REGISTRATION_SETTINGS_KEY,
  isPersonalScheduleRegistrationOpen,
  type PersonalScheduleRegistrationPolicy,
} from "@shared/personal-schedule-registration";
import { teacherBookingSchemaIsReady } from "./teacher-booking-schema";

const ZERO_ROOM_ID = "00000000-0000-0000-0000-000000000000";
const REGISTRATION_INVOICE_CATEGORY = "Học phí theo đăng ký";

export class TeacherBookingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeacherBookingValidationError";
  }
}

export class TeacherBookingSchemaNotReadyError extends Error {
  constructor() {
    super("Chức năng đặt lịch đang chờ đồng bộ các bảng dữ liệu mới.");
    this.name = "TeacherBookingSchemaNotReadyError";
  }
}

type BookingOptionsInput = {
  studentId: string;
  locationId: string;
};

type ConfirmTeacherBookingInput = {
  userId: string;
  studentId: string;
  teacherId: string;
  locationId: string;
  sessions: { sessionDate: string; shiftIds: string[] }[];
  packageId: string;
  packageSource: "existing" | "new";
  learningMode: "offline" | "online";
  requestKey: string;
};

type FeePackageRow = {
  id: string;
  name: string;
  type: string;
  fee: string | number;
  sessions: string | number;
  totalAmount: string | number;
  courseId: string;
  courseName: string;
};

function normalizeDate(value: unknown): string {
  return value == null ? "" : String(value).slice(0, 10);
}

function normalizeTime(value: unknown): string {
  return value == null ? "" : String(value).slice(0, 5);
}

function getBangkokDateAndTime() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date()).reduce<Record<string, string>>((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export async function getPersonalScheduleRegistrationPolicy(executor: any = db): Promise<PersonalScheduleRegistrationPolicy> {
  const [row] = await executor.select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, PERSONAL_SCHEDULE_REGISTRATION_SETTINGS_KEY))
    .limit(1);
  if (!row) return DEFAULT_PERSONAL_SCHEDULE_REGISTRATION_POLICY;

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.value);
  } catch {
    throw new Error("Cấu hình thời gian đăng ký lịch không hợp lệ.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Cấu hình thời gian đăng ký lịch không hợp lệ.");
  }
  const value = parsed as Partial<PersonalScheduleRegistrationPolicy>;
  if (
    !Number.isInteger(value.registrationAdvanceHours)
    || Number(value.registrationAdvanceHours) < 0
    || !Number.isInteger(value.cancellationAdvanceHours)
    || Number(value.cancellationAdvanceHours) < 0
  ) {
    throw new Error("Cấu hình thời gian đăng ký lịch không hợp lệ.");
  }
  return {
    registrationAdvanceHours: Number(value.registrationAdvanceHours),
    cancellationAdvanceHours: Number(value.cancellationAdvanceHours),
  };
}

function isValidDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function overlaps(startA: string, endA: string, startB: string, endB: string) {
  return startA < endB && endA > startB;
}

function configuredSessionCount(value: unknown): number {
  const count = Number(value);
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}

function money(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

async function getPurchasedPackages(executor: any, studentId: string, locationId: string) {
  const [purchases, usedRows, depositRows, reservedRows] = await Promise.all([
    executor
      .select({
        packageId: invoiceItems.packageId,
        packageName: invoiceItems.packageName,
        packageType: invoiceItems.packageType,
        quantity: invoiceItems.quantity,
        subtotal: invoiceItems.subtotal,
      })
      .from(invoiceItems)
      .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
      .where(and(
        eq(invoices.studentId, studentId),
        eq(invoices.locationId, locationId),
        eq(invoices.type, "Thu"),
        eq(invoices.category, REGISTRATION_INVOICE_CATEGORY),
        inArray(invoices.status, ["paid", "confirmed"]),
        isNotNull(invoiceItems.packageId),
      )),
    executor
      .select({
        packageId: studentSessions.packageId,
        usedCount: sql<number>`COUNT(DISTINCT ${studentSessions.id})::int`,
      })
      .from(studentSessions)
      .innerJoin(classSessions, eq(classSessions.id, studentSessions.classSessionId))
      .innerJoin(classes, eq(classes.id, classSessions.classId))
      .where(and(
        eq(studentSessions.studentId, studentId),
        eq(classes.locationId, locationId),
        like(classes.classCode, "SR-%"),
        isNotNull(studentSessions.packageId),
        sql`LOWER(COALESCE(${studentSessions.status}, '')) NOT IN ('cancelled', 'canceled')`,
        sql`LOWER(COALESCE(${classSessions.status}, '')) NOT IN ('cancelled', 'canceled')`,
      ))
      .groupBy(studentSessions.packageId),
    executor
      .select({
        packageId: teacherBookingBatches.packageId,
        sessionCount: sql<number>`COUNT(${teacherBookingSlots.id})::int`,
        purchasedAmount: sql<string>`COALESCE(SUM(${teacherBookingSlots.sessionPrice}), 0)::text`,
      })
      .from(teacherBookingSlots)
      .innerJoin(teacherBookingBatches, eq(teacherBookingBatches.id, teacherBookingSlots.batchId))
      .where(and(
        eq(teacherBookingBatches.studentId, studentId),
        eq(teacherBookingBatches.locationId, locationId),
        eq(teacherBookingBatches.packageSource, "new"),
        eq(teacherBookingSlots.status, "finalized"),
      ))
      .groupBy(teacherBookingBatches.packageId),
    executor
      .select({
        packageId: teacherBookingBatches.packageId,
        reservedCount: sql<number>`COUNT(${teacherBookingSlots.id})::int`,
      })
      .from(teacherBookingSlots)
      .innerJoin(teacherBookingBatches, eq(teacherBookingBatches.id, teacherBookingSlots.batchId))
      .where(and(
        eq(teacherBookingBatches.studentId, studentId),
        eq(teacherBookingBatches.locationId, locationId),
        eq(teacherBookingBatches.packageSource, "existing"),
        eq(teacherBookingSlots.status, "pending"),
      ))
      .groupBy(teacherBookingBatches.packageId),
  ]);

  const usedByPackage = new Map<string, number>(
    usedRows.map((row: any) => [String(row.packageId), Number(row.usedCount) || 0]),
  );
  const packageMap = new Map<string, {
    id: string;
    name: string;
    type: string;
    totalSessions: number;
    purchasedAmount: number;
  }>();

  for (const row of purchases) {
    if (!row.packageId) continue;
    const current = packageMap.get(row.packageId) ?? {
      id: row.packageId,
      name: row.packageName,
      type: row.packageType ?? "",
      totalSessions: 0,
      purchasedAmount: 0,
    };
    current.name = row.packageName || current.name;
    current.type = row.packageType || current.type;
    current.totalSessions += Math.max(0, Number(row.quantity) || 0);
    current.purchasedAmount += Number(row.subtotal) || 0;
    packageMap.set(row.packageId, current);
  }

  for (const row of depositRows) {
    const current = packageMap.get(row.packageId);
    if (!current) continue;
    current.totalSessions += Math.max(0, Number(row.sessionCount) || 0);
    current.purchasedAmount += Number(row.purchasedAmount) || 0;
  }

  const reservedByPackage = new Map<string, number>(
    reservedRows.map((row: any) => [String(row.packageId), Number(row.reservedCount) || 0]),
  );

  return [...packageMap.values()]
    .map((item) => {
      const usedSessions = usedByPackage.get(item.id) ?? 0;
      const reservedSessions = reservedByPackage.get(item.id) ?? 0;
      return {
        ...item,
        usedSessions,
        remainingSessions: Math.max(0, item.totalSessions - usedSessions - reservedSessions),
      };
    })
    .filter((item) => item.remainingSessions > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

async function getNewPackages(executor: any, locationId: string): Promise<FeePackageRow[]> {
  return executor
    .selectDistinct({
      id: courseFeePackages.id,
      name: courseFeePackages.name,
      type: courseFeePackages.type,
      fee: courseFeePackages.fee,
      sessions: courseFeePackages.sessions,
      totalAmount: courseFeePackages.totalAmount,
      courseId: courses.id,
      courseName: courses.name,
    })
    .from(courseFeePackages)
    .innerJoin(courses, eq(courses.id, courseFeePackages.courseId))
    .leftJoin(courseLocations, eq(courseLocations.courseId, courses.id))
    .where(and(
      eq(courseFeePackages.isActive, true),
      eq(courses.isActive, true),
      or(
        eq(courses.locationId, locationId),
        eq(courseLocations.locationId, locationId),
      ),
    ))
    .orderBy(courses.name, courseFeePackages.name);
}

async function getDepositBalance(
  executor: any,
  studentId: string,
  excludedPendingSlotIds: string[] = [],
): Promise<number> {
  const [rows, pendingReservations] = await Promise.all([
    executor
      .select({
        type: studentWalletTransactions.type,
        amount: studentWalletTransactions.amount,
      })
      .from(studentWalletTransactions)
      .where(and(
        eq(studentWalletTransactions.studentId, studentId),
        eq(studentWalletTransactions.category, "Đặt cọc"),
      )),
    executor
      .select({
        id: teacherBookingSlots.id,
        amount: teacherBookingSlots.sessionPrice,
      })
      .from(teacherBookingSlots)
      .innerJoin(teacherBookingBatches, eq(teacherBookingBatches.id, teacherBookingSlots.batchId))
      .where(and(
        eq(teacherBookingBatches.studentId, studentId),
        eq(teacherBookingBatches.packageSource, "new"),
        eq(teacherBookingSlots.status, "pending"),
      )),
  ]);

  const walletBalance = rows.reduce((balance: number, row: any) => {
    const amount = Number(row.amount) || 0;
    return balance + (row.type === "credit" ? amount : -amount);
  }, 0);
  const reservedBalance = pendingReservations.reduce((sum: number, row: any) =>
    excludedPendingSlotIds.includes(String(row.id)) ? sum : sum + (Number(row.amount) || 0), 0);
  return money(Math.max(0, walletBalance - reservedBalance));
}

export async function getTeacherBookingOptions(input: BookingOptionsInput) {
  if (!(await teacherBookingSchemaIsReady())) throw new TeacherBookingSchemaNotReadyError();
  const [purchasedPackages, packages, depositBalance] = await Promise.all([
    getPurchasedPackages(db, input.studentId, input.locationId),
    getNewPackages(db, input.locationId),
    getDepositBalance(db, input.studentId),
  ]);
  return {
    purchasedPackages,
    newPackages: packages.map((item) => ({
      ...item,
      fee: Number(item.fee),
      sessions: Number(item.sessions),
      totalAmount: Number(item.totalAmount),
    })),
    depositBalance,
  };
}

async function assertTeacherAndStudentShareLocation(
  tx: any,
  input: ConfirmTeacherBookingInput,
) {
  const [studentLocation] = await tx
    .select({ id: studentLocations.locationId })
    .from(studentLocations)
    .where(and(
      eq(studentLocations.studentId, input.studentId),
      eq(studentLocations.locationId, input.locationId),
    ))
    .limit(1);
  if (!studentLocation) throw new TeacherBookingValidationError("Học viên không thuộc cơ sở đã chọn.");

  const [teacherAssignment] = await tx
    .select({ locationId: staffAssignments.locationId })
    .from(staffAssignments)
    .innerJoin(staff, eq(staff.id, staffAssignments.staffId))
    .innerJoin(users, eq(users.id, staff.userId))
    .innerJoin(departments, eq(departments.id, staffAssignments.departmentId))
    .where(and(
      eq(staff.id, input.teacherId),
      eq(staff.status, "Hoạt động"),
      eq(users.isActive, true),
      ne(users.username, "admin"),
      eq(departments.name, "Phòng Đào tạo"),
      eq(departments.isSystem, true),
      eq(staffAssignments.locationId, input.locationId),
    ))
    .limit(1);
  if (!teacherAssignment) throw new TeacherBookingValidationError("Giáo viên không được phân công tại cơ sở đã chọn.");

  const [location] = await tx
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(eq(locations.id, input.locationId))
    .limit(1);
  if (!location) throw new TeacherBookingValidationError("Không tìm thấy cơ sở.");
  return location;
}

async function getPackageForBooking(
  tx: any,
  input: ConfirmTeacherBookingInput,
): Promise<FeePackageRow> {
  const [row] = await tx
    .select({
      id: courseFeePackages.id,
      name: courseFeePackages.name,
      type: courseFeePackages.type,
      fee: courseFeePackages.fee,
      sessions: courseFeePackages.sessions,
      totalAmount: courseFeePackages.totalAmount,
      courseId: courses.id,
      courseName: courses.name,
      isActive: courseFeePackages.isActive,
      courseLocationId: courses.locationId,
      mappedLocationId: courseLocations.locationId,
      courseIsActive: courses.isActive,
    })
    .from(courseFeePackages)
    .innerJoin(courses, eq(courses.id, courseFeePackages.courseId))
    .leftJoin(courseLocations, eq(courseLocations.courseId, courses.id))
    .where(and(
      eq(courseFeePackages.id, input.packageId),
      or(
        eq(courses.locationId, input.locationId),
        eq(courseLocations.locationId, input.locationId),
      ),
    ))
    .limit(10);

  const packageInLocation = row
    && (row.courseLocationId === input.locationId || row.mappedLocationId === input.locationId)
    ? row
    : undefined;
  if (!packageInLocation) throw new TeacherBookingValidationError("Gói học phí không áp dụng tại cơ sở đã chọn.");
  if (input.packageSource === "new" && (!packageInLocation.isActive || !packageInLocation.courseIsActive)) {
    throw new TeacherBookingValidationError("Gói học phí này hiện không còn hoạt động.");
  }
  return packageInLocation;
}

async function assertPackageCapacity(
  tx: any,
  input: ConfirmTeacherBookingInput,
  feePackage: FeePackageRow,
) {
  const selectedSessionCount = input.sessions.reduce((total, session) => total + session.shiftIds.length, 0);

  if (input.packageSource === "existing") {
    const purchasedPackages = await getPurchasedPackages(tx, input.studentId, input.locationId);
    const purchased = purchasedPackages.find((item) => item.id === feePackage.id);
    if (!purchased) throw new TeacherBookingValidationError("Học viên chưa có gói học phí đã thanh toán còn buổi.");
    if (purchased.totalSessions <= 0) {
      throw new TeacherBookingValidationError("Gói đã thanh toán không có số buổi hợp lệ.");
    }
    if (selectedSessionCount > purchased.remainingSessions) {
      throw new TeacherBookingValidationError(`Gói này chỉ còn ${purchased.remainingSessions} buổi chưa xếp.`);
    }
    return {
      packageSessions: purchased.totalSessions,
      purchased,
      totalAmount: 0,
      depositBalance: 0,
      perSessionPrice: money(purchased.purchasedAmount / purchased.totalSessions),
    };
  }

  const packageSessions = configuredSessionCount(feePackage.sessions);
  if (!packageSessions) throw new TeacherBookingValidationError("Số buổi của gói học phí chưa được cấu hình hợp lệ.");
  if (feePackage.type !== "buổi" && selectedSessionCount > packageSessions) {
    throw new TeacherBookingValidationError(`Gói này có ${packageSessions} buổi, không thể đăng ký ${selectedSessionCount} ca cùng lúc.`);
  }

  const perSessionPrice = money(feePackage.type === "buổi"
    ? feePackage.fee
    : Number(feePackage.totalAmount) / packageSessions);
  const totalAmount = money(perSessionPrice * selectedSessionCount);
  if (totalAmount <= 0) throw new TeacherBookingValidationError("Giá gói học phí chưa được cấu hình hợp lệ.");
  const depositBalance = await getDepositBalance(tx, input.studentId);
  if (depositBalance < totalAmount) {
    throw new TeacherBookingValidationError("Số dư Ví Đặt Cọc không đủ cho các buổi đã chọn.");
  }
  return { packageSessions, purchased: null, totalAmount, depositBalance, perSessionPrice };
}

async function assertAvailability(
  tx: any,
  input: ConfirmTeacherBookingInput,
  selection: ConfirmTeacherBookingInput["sessions"][number],
  registrationPolicy: PersonalScheduleRegistrationPolicy,
) {
  const todayAndTime = getBangkokDateAndTime();
  if (!isValidDateKey(selection.sessionDate) || selection.sessionDate < todayAndTime.date) {
    throw new TeacherBookingValidationError("Ngày học đã chọn không hợp lệ hoặc đã qua.");
  }

  const shifts = await tx
    .select({
      id: shiftTemplates.id,
      name: shiftTemplates.name,
      locationId: shiftTemplates.locationId,
      startTime: shiftTemplates.startTime,
      endTime: shiftTemplates.endTime,
      status: shiftTemplates.status,
    })
    .from(shiftTemplates)
    .where(and(
      inArray(shiftTemplates.id, selection.shiftIds),
      eq(shiftTemplates.locationId, input.locationId),
      eq(shiftTemplates.type, "class"),
    ));
  if (shifts.length !== selection.shiftIds.length || shifts.some((shift: any) => shift.status !== "active")) {
    throw new TeacherBookingValidationError("Một hoặc nhiều ca học không còn hoạt động tại cơ sở đã chọn.");
  }
  shifts.sort((a: any, b: any) =>
    normalizeTime(a.startTime).localeCompare(normalizeTime(b.startTime)) || a.name.localeCompare(b.name, "vi"),
  );

  for (let index = 0; index < shifts.length; index += 1) {
    const start = normalizeTime(shifts[index].startTime);
    const end = normalizeTime(shifts[index].endTime);
    if (!isPersonalScheduleRegistrationOpen(
      selection.sessionDate,
      start,
      registrationPolicy.registrationAdvanceHours,
    )) {
      throw new TeacherBookingValidationError(
        registrationPolicy.registrationAdvanceHours > 0
          ? `Ca học cần được đăng ký trước ít nhất ${registrationPolicy.registrationAdvanceHours} giờ.`
          : "Ca học đã bắt đầu hoặc đã qua giờ bắt đầu.",
      );
    }
    for (let other = index + 1; other < shifts.length; other += 1) {
      if (overlaps(start, end, normalizeTime(shifts[other].startTime), normalizeTime(shifts[other].endTime))) {
        throw new TeacherBookingValidationError("Các ca được chọn bị trùng giờ với nhau.");
      }
    }
  }

  const weekday = new Date(`${selection.sessionDate}T00:00:00.000Z`).getUTCDay();
  const [legacyAvailability, timeWindows] = await Promise.all([
    tx.select({
      shiftTemplateId: teacherAvailability.shiftTemplateId,
      effectiveFrom: teacherAvailability.effectiveFrom,
      effectiveTo: teacherAvailability.effectiveTo,
    }).from(teacherAvailability).where(and(
      eq(teacherAvailability.teacherId, input.teacherId),
      eq(teacherAvailability.locationId, input.locationId),
      eq(teacherAvailability.weekday, weekday),
    )),
    tx.select({
      startTime: teacherAvailabilityWindows.startTime,
      endTime: teacherAvailabilityWindows.endTime,
      effectiveFrom: teacherAvailabilityWindows.effectiveFrom,
      effectiveTo: teacherAvailabilityWindows.effectiveTo,
    }).from(teacherAvailabilityWindows).where(and(
      eq(teacherAvailabilityWindows.teacherId, input.teacherId),
      eq(teacherAvailabilityWindows.locationId, input.locationId),
      eq(teacherAvailabilityWindows.weekday, weekday),
    )),
  ]);
  const activeLegacy = legacyAvailability.filter((row: any) =>
    (!normalizeDate(row.effectiveFrom) || selection.sessionDate >= normalizeDate(row.effectiveFrom))
    && (!normalizeDate(row.effectiveTo) || selection.sessionDate <= normalizeDate(row.effectiveTo)));
  const activeWindows = timeWindows.filter((row: any) =>
    (!normalizeDate(row.effectiveFrom) || selection.sessionDate >= normalizeDate(row.effectiveFrom))
    && (!normalizeDate(row.effectiveTo) || selection.sessionDate <= normalizeDate(row.effectiveTo)));
  const hasAvailabilityRules = activeLegacy.length > 0 || activeWindows.length > 0;
  if (hasAvailabilityRules && shifts.some((shift: any) =>
    !activeLegacy.some((row: any) => row.shiftTemplateId === shift.id)
    && !activeWindows.some((row: any) =>
      normalizeTime(row.startTime) <= normalizeTime(shift.startTime)
      && normalizeTime(row.endTime) >= normalizeTime(shift.endTime)),
  )) {
    throw new TeacherBookingValidationError("Giáo viên không đăng ký rảnh trong một hoặc nhiều ca đã chọn.");
  }

  const existingSessions = await tx
    .select({
      id: classSessions.id,
      teacherIds: classSessions.teacherIds,
      startTime: shiftTemplates.startTime,
      endTime: shiftTemplates.endTime,
    })
    .from(classSessions)
    .innerJoin(shiftTemplates, eq(shiftTemplates.id, classSessions.shiftTemplateId))
    .where(and(
      eq(classSessions.sessionDate, selection.sessionDate),
      sql`LOWER(COALESCE(${classSessions.status}, '')) NOT IN ('cancelled', 'canceled')`,
      or(
        sql`${classSessions.teacherIds} @> ARRAY[${input.teacherId}]::uuid[]`,
        sql`EXISTS (
          SELECT 1 FROM class_session_teacher_assignments csta
          WHERE csta.class_session_id = ${classSessions.id}
            AND csta.teacher_id = ${input.teacherId}
        )`,
      ),
    ));
  const pendingHolds = await tx
    .select({
      startTime: teacherBookingSlots.startTime,
      endTime: teacherBookingSlots.endTime,
    })
    .from(teacherBookingSlots)
    .innerJoin(teacherBookingBatches, eq(teacherBookingBatches.id, teacherBookingSlots.batchId))
    .where(and(
      eq(teacherBookingSlots.teacherId, input.teacherId),
      eq(teacherBookingSlots.sessionDate, selection.sessionDate),
      eq(teacherBookingSlots.status, "pending"),
      eq(teacherBookingBatches.locationId, input.locationId),
    ));
  const busySessionIds = existingSessions.map((session: any) => session.id);
  const teacherTimeRows = busySessionIds.length > 0
    ? await tx.select({
        classSessionId: classSessionTeacherAssignments.classSessionId,
        startTime: classSessionTeacherAssignments.startTime,
        endTime: classSessionTeacherAssignments.endTime,
      }).from(classSessionTeacherAssignments).where(and(
        inArray(classSessionTeacherAssignments.classSessionId, busySessionIds),
        eq(classSessionTeacherAssignments.teacherId, input.teacherId),
      ))
    : [];
  const timeBySession = new Map(teacherTimeRows.map((row: any) => [row.classSessionId, row]));

  for (const shift of shifts) {
    const isBusy = pendingHolds.some((hold: any) => overlaps(
      normalizeTime(hold.startTime),
      normalizeTime(hold.endTime),
      normalizeTime(shift.startTime),
      normalizeTime(shift.endTime),
    )) || existingSessions.some((session: any) => {
      const specific: any = timeBySession.get(session.id);
      return overlaps(
        specific ? normalizeTime(specific.startTime) : normalizeTime(session.startTime),
        specific ? normalizeTime(specific.endTime) : normalizeTime(session.endTime),
        normalizeTime(shift.startTime),
        normalizeTime(shift.endTime),
      );
    });
    if (isBusy) throw new TeacherBookingValidationError(`Ca ${shift.name} vừa được đăng ký hoặc không còn trống.`);
  }

  return { shifts, weekday };
}

type BookingSlotRecord = {
  id: string;
  batchId: string;
  teacherId: string;
  sessionDate: string;
  shiftTemplateId: string;
  startTime: string;
  endTime: string;
  cancellationCutoffAt: Date;
  sessionPrice: string | number;
  status: string;
  packageId: string;
  packageSource: "existing" | "new";
  packageName: string;
  packageType: string;
  learningMode: "offline" | "online";
  studentId: string;
  userId: string;
  locationId: string;
};

async function getBookingSlot(tx: any, slotId: string): Promise<BookingSlotRecord | null> {
  const [row] = await tx
    .select({
      id: teacherBookingSlots.id,
      batchId: teacherBookingSlots.batchId,
      teacherId: teacherBookingSlots.teacherId,
      sessionDate: teacherBookingSlots.sessionDate,
      shiftTemplateId: teacherBookingSlots.shiftTemplateId,
      startTime: teacherBookingSlots.startTime,
      endTime: teacherBookingSlots.endTime,
      cancellationCutoffAt: teacherBookingSlots.cancellationCutoffAt,
      sessionPrice: teacherBookingSlots.sessionPrice,
      status: teacherBookingSlots.status,
      packageId: teacherBookingBatches.packageId,
      packageSource: teacherBookingBatches.packageSource,
      packageName: teacherBookingBatches.packageName,
      packageType: teacherBookingBatches.packageType,
      learningMode: teacherBookingBatches.learningMode,
      studentId: teacherBookingBatches.studentId,
      userId: teacherBookingBatches.userId,
      locationId: teacherBookingBatches.locationId,
    })
    .from(teacherBookingSlots)
    .innerJoin(teacherBookingBatches, eq(teacherBookingBatches.id, teacherBookingSlots.batchId))
    .where(eq(teacherBookingSlots.id, slotId))
    .limit(1);
  return row ? { ...row, sessionDate: normalizeDate(row.sessionDate) } as BookingSlotRecord : null;
}

async function getOrCreateTutorClass(
  tx: any,
  booking: BookingSlotRecord,
  classCodeFallback: string,
) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`teacher-booking-series:${booking.studentId}:${booking.locationId}:${booking.packageId}`}))`);

  let [series] = await tx
    .select({ id: teacherBookingClassSeries.id, classId: teacherBookingClassSeries.classId })
    .from(teacherBookingClassSeries)
    .where(and(
      eq(teacherBookingClassSeries.studentId, booking.studentId),
      eq(teacherBookingClassSeries.locationId, booking.locationId),
      eq(teacherBookingClassSeries.packageId, booking.packageId),
    ))
    .limit(1);
  if (series) return series.classId;

  const [legacyClass] = await tx
    .select({ id: classes.id })
    .from(classes)
    .innerJoin(studentClasses, eq(studentClasses.classId, classes.id))
    .where(and(
      eq(classes.locationId, booking.locationId),
      eq(classes.feePackageId, booking.packageId),
      eq(classes.classType, "tutor"),
      like(classes.classCode, "SR-%"),
      eq(studentClasses.studentId, booking.studentId),
    ))
    .orderBy(asc(classes.createdAt))
    .limit(1);
  if (legacyClass) {
    [series] = await tx
      .insert(teacherBookingClassSeries)
      .values({
        studentId: booking.studentId,
        locationId: booking.locationId,
        packageId: booking.packageId,
        classId: legacyClass.id,
      })
      .onConflictDoNothing()
      .returning({ id: teacherBookingClassSeries.id, classId: teacherBookingClassSeries.classId });
    if (series) return series.classId;
    const [racedSeries] = await tx
      .select({ classId: teacherBookingClassSeries.classId })
      .from(teacherBookingClassSeries)
      .where(and(
        eq(teacherBookingClassSeries.studentId, booking.studentId),
        eq(teacherBookingClassSeries.locationId, booking.locationId),
        eq(teacherBookingClassSeries.packageId, booking.packageId),
      ))
      .limit(1);
    if (racedSeries) return racedSeries.classId;
  }

  const [student] = await tx
    .select({ fullName: students.fullName, code: students.code })
    .from(students)
    .where(eq(students.id, booking.studentId))
    .limit(1);
  const [feePackage] = await tx
    .select({ courseId: courses.id, courseName: courses.name })
    .from(courseFeePackages)
    .innerJoin(courses, eq(courses.id, courseFeePackages.courseId))
    .where(eq(courseFeePackages.id, booking.packageId))
    .limit(1);
  if (!student || !feePackage) {
    throw new TeacherBookingValidationError("Không tìm thấy thông tin học viên hoặc gói học phí.");
  }
  const displayName = student.fullName || student.code || "Học viên";
  const className = `Gia sư 1-1 · ${displayName} · ${booking.packageName}`.slice(0, 255);
  const [createdClass] = await tx
    .insert(classes)
    .values({
      classCode: classCodeFallback,
      name: className,
      locationId: booking.locationId,
      createdBy: booking.userId,
      programId: null,
      courseId: feePackage.courseId,
      managerIds: [],
      teacherIds: [booking.teacherId],
      shiftTemplateIds: [booking.shiftTemplateId],
      feePackageId: booking.packageId,
      weekdays: [new Date(`${booking.sessionDate}T00:00:00.000Z`).getUTCDay()],
      scheduleConfig: null,
      teachersConfig: null,
      startDate: booking.sessionDate,
      endDate: booking.sessionDate,
      maxStudents: 1,
      learningFormat: booking.learningMode,
      status: "active",
      scheduleGenerated: true,
      classType: "tutor",
    } as any)
    .returning({ id: classes.id });
  await tx.insert(teacherBookingClassSeries).values({
    studentId: booking.studentId,
    locationId: booking.locationId,
    packageId: booking.packageId,
    classId: createdClass.id,
  });
  return createdClass.id;
}

async function finalizeBookingSlotInTransaction(
  tx: any,
  slotId: string,
  options: { force?: boolean } = {},
) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`teacher-booking-finalize:${slotId}`}))`);
  const booking = await getBookingSlot(tx, slotId);
  if (!booking || booking.status !== "pending") return booking ? { status: booking.status } : null;
  const now = new Date();
  const cutoff = new Date(booking.cancellationCutoffAt);
  if (!options.force && now < cutoff) return { status: "pending" };

  const [shift] = await tx
    .select({ name: shiftTemplates.name, status: shiftTemplates.status })
    .from(shiftTemplates)
    .where(and(
      eq(shiftTemplates.id, booking.shiftTemplateId),
      eq(shiftTemplates.locationId, booking.locationId),
    ))
    .limit(1);
  if (!shift || shift.status !== "active") {
    throw new TeacherBookingValidationError("Ca học không còn hoạt động; cần kiểm tra đăng ký này.");
  }

  if (booking.packageSource === "new") {
    const depositBalance = await getDepositBalance(tx, booking.studentId, [booking.id]);
    if (depositBalance < money(booking.sessionPrice)) {
      throw new TeacherBookingValidationError("Ví Đặt Cọc không còn đủ cho buổi này. Vui lòng nạp thêm để hoàn tất.");
    }
  }

  const classId = await getOrCreateTutorClass(tx, booking, `SR-${booking.batchId}`);
  const [classRow] = await tx
    .select({
      name: classes.name,
      teacherIds: classes.teacherIds,
      shiftTemplateIds: classes.shiftTemplateIds,
      weekdays: classes.weekdays,
      startDate: classes.startDate,
      endDate: classes.endDate,
    })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);
  if (!classRow) throw new TeacherBookingValidationError("Không tìm thấy lớp 1-1 cần nối buổi.");

  const weekday = new Date(`${booking.sessionDate}T00:00:00.000Z`).getUTCDay();
  const sessionIndexRows = await tx
    .select({ value: sql<number>`COALESCE(MAX(${classSessions.sessionIndex}), 0)::int` })
    .from(classSessions)
    .where(eq(classSessions.classId, classId));
  const sessionIndex = Number(sessionIndexRows[0]?.value ?? 0) + 1;
  const [classSession] = await tx
    .insert(classSessions)
    .values({
      classId,
      sessionDate: booking.sessionDate,
      weekday,
      shiftTemplateId: booking.shiftTemplateId,
      roomId: ZERO_ROOM_ID,
      teacherIds: [booking.teacherId],
      learningFormat: booking.learningMode,
      status: "scheduled",
      sessionIndex,
    })
    .returning({ id: classSessions.id });

  const [studentClass] = await tx
    .select({
      id: studentClasses.id,
      totalSessions: studentClasses.totalSessions,
      attendedSessions: studentClasses.attendedSessions,
      remainingSessions: studentClasses.remainingSessions,
      startDate: studentClasses.startDate,
      endDate: studentClasses.endDate,
      scheduledWeekdays: studentClasses.scheduledWeekdays,
    })
    .from(studentClasses)
    .where(and(
      eq(studentClasses.classId, classId),
      eq(studentClasses.studentId, booking.studentId),
    ))
    .limit(1);
  let studentClassId = studentClass?.id;
  if (!studentClass) {
    const [createdEnrollment] = await tx
      .insert(studentClasses)
      .values({
        studentId: booking.studentId,
        classId,
        status: "active",
        startDate: booking.sessionDate,
        endDate: booking.sessionDate,
        totalSessions: 1,
        attendedSessions: 0,
        remainingSessions: 1,
        scheduledWeekdays: [weekday],
        createdBy: booking.userId,
      } as any)
      .returning({ id: studentClasses.id });
    studentClassId = createdEnrollment.id;
  } else {
    const currentWeekdays = studentClass.scheduledWeekdays ?? [];
    const startDate = normalizeDate(studentClass.startDate);
    const endDate = normalizeDate(studentClass.endDate);
    await tx.update(studentClasses).set({
      totalSessions: (Number(studentClass.totalSessions) || 0) + 1,
      remainingSessions: (Number(studentClass.remainingSessions) || 0) + 1,
      startDate: !startDate || booking.sessionDate < startDate ? booking.sessionDate : startDate,
      endDate: !endDate || booking.sessionDate > endDate ? booking.sessionDate : endDate,
      scheduledWeekdays: [...new Set([...currentWeekdays, weekday])].sort((a, b) => a - b),
      updatedAt: now,
    }).where(eq(studentClasses.id, studentClass.id));
  }

  const [studentSession] = await tx
    .insert(studentSessions)
    .values({
      studentId: booking.studentId,
      classId,
      studentClassId,
      classSessionId: classSession.id,
      status: "scheduled",
      attendanceStatus: "pending",
      packageId: booking.packageId,
      packageType: booking.packageType,
      sessionPrice: money(booking.sessionPrice).toFixed(2),
      sessionSource: "normal",
      isPaid: true,
      sessionOrder: sessionIndex,
    } as any)
    .returning({ id: studentSessions.id });

  const existingTeachers = classRow.teacherIds ?? [];
  const existingShiftIds = classRow.shiftTemplateIds ?? [];
  const existingWeekdays = classRow.weekdays ?? [];
  const startDate = normalizeDate(classRow.startDate);
  const endDate = normalizeDate(classRow.endDate);
  await tx.update(classes).set({
    teacherIds: [...new Set([...existingTeachers, booking.teacherId])],
    shiftTemplateIds: [...new Set([...existingShiftIds, booking.shiftTemplateId])],
    weekdays: [...new Set([...existingWeekdays, weekday])].sort((a, b) => a - b),
    startDate: !startDate || booking.sessionDate < startDate ? booking.sessionDate : startDate,
    endDate: !endDate || booking.sessionDate > endDate ? booking.sessionDate : endDate,
    updatedAt: now,
  }).where(eq(classes.id, classId));

  if (booking.packageSource === "new") {
    const amount = money(booking.sessionPrice);
    const formattedAmount = amount.toLocaleString("vi-VN");
    await tx.insert(studentWalletTransactions).values([
      {
        studentId: booking.studentId,
        type: "debit",
        amount: amount.toFixed(2),
        category: "Đặt cọc",
        action: `Trừ Ví Đặt Cọc cho buổi đăng ký ${booking.sessionDate} · ${shift.name}: ${formattedAmount} đ`,
        classId,
        className: classRow.name,
        createdBy: booking.userId,
      },
      {
        studentId: booking.studentId,
        type: "credit",
        amount: amount.toFixed(2),
        category: "Học phí",
        action: `Chuyển từ Ví Đặt Cọc sang Ví Học Phí cho buổi ${booking.sessionDate} · ${shift.name}: ${formattedAmount} đ`,
        classId,
        className: classRow.name,
        createdBy: booking.userId,
      },
    ] as any);
  }

  await tx.update(teacherBookingSlots).set({
    status: "finalized",
    classId,
    classSessionId: classSession.id,
    studentSessionId: studentSession.id,
    finalizedAt: now,
    failureReason: null,
    updatedAt: now,
  }).where(and(
    eq(teacherBookingSlots.id, booking.id),
    eq(teacherBookingSlots.status, "pending"),
  ));
  return { status: "finalized", classId, classSessionId: classSession.id };
}

async function findExistingBookingBatch(tx: any, input: ConfirmTeacherBookingInput) {
  const [batch] = await tx
    .select({
      id: teacherBookingBatches.id,
      studentId: teacherBookingBatches.studentId,
    })
    .from(teacherBookingBatches)
    .where(eq(teacherBookingBatches.requestKey, input.requestKey))
    .limit(1);
  if (!batch) return null;
  if (batch.studentId !== input.studentId) throw new TeacherBookingValidationError("Mã đăng ký không hợp lệ.");
  const slots = await tx
    .select({
      status: teacherBookingSlots.status,
      classId: teacherBookingSlots.classId,
    })
    .from(teacherBookingSlots)
    .where(eq(teacherBookingSlots.batchId, batch.id));
  const bookedSessions = slots.filter((slot: any) => slot.status === "finalized").length;
  const pendingSessions = slots.filter((slot: any) => slot.status === "pending").length;
  const cancelledSessions = slots.filter((slot: any) => slot.status === "cancelled").length;
  return {
    batchId: batch.id,
    classId: slots.find((slot: any) => slot.classId)?.classId ?? null,
    duplicate: true,
    status: pendingSessions > 0 ? (bookedSessions > 0 ? "partial" : "pending") : cancelledSessions > 0 ? "cancelled" : "finalized",
    bookedSessions,
    pendingSessions,
    cancelledSessions,
    invoiceId: null,
    invoiceCode: null,
  };
}

async function findExistingRequest(tx: any, input: ConfirmTeacherBookingInput) {
  const classCode = `SR-${input.requestKey}`;
  const [existing] = await tx
    .select({ classId: classes.id, studentId: studentClasses.studentId })
    .from(classes)
    .innerJoin(studentClasses, eq(studentClasses.classId, classes.id))
    .where(eq(classes.classCode, classCode))
    .limit(1);
  if (!existing) return null;
  if (existing.studentId !== input.studentId) throw new TeacherBookingValidationError("Mã đăng ký không hợp lệ.");
  const [invoice] = await tx
    .select({ id: invoices.id, code: invoices.code })
    .from(invoices)
    .where(eq(invoices.classId, existing.classId))
    .limit(1);
  return { classId: existing.classId, invoiceId: invoice?.id ?? null, invoiceCode: invoice?.code ?? null, duplicate: true };
}

async function confirmTeacherBookingLegacy(input: ConfirmTeacherBookingInput) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestKey)) {
    throw new TeacherBookingValidationError("Mã đăng ký không hợp lệ.");
  }
  const totalSelected = input.sessions.reduce((total, session) => total + session.shiftIds.length, 0);
  const selectedKeys = input.sessions.flatMap((session) => session.shiftIds.map((shiftId) => `${session.sessionDate}:${shiftId}`));
  if (
    totalSelected === 0
    || input.sessions.some((session) =>
      !isValidDateKey(session.sessionDate)
      || session.shiftIds.length === 0
      || new Set(session.shiftIds).size !== session.shiftIds.length,
    )
    || new Set(input.sessions.map((session) => session.sessionDate)).size !== input.sessions.length
    || new Set(selectedKeys).size !== selectedKeys.length
  ) {
    throw new TeacherBookingValidationError("Vui lòng chọn các ca học hợp lệ, không trùng nhau.");
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.studentId}))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`teacher-booking-student:${input.studentId}`}))`);
    const selectedDates = [...new Set(input.sessions.map((session) => session.sessionDate))].sort();
    for (const sessionDate of selectedDates) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`teacher-booking-slot:${input.teacherId}:${sessionDate}`}))`);
    }

    const previous = await findExistingRequest(tx, input);
    if (previous) return previous;

    const location = await assertTeacherAndStudentShareLocation(tx, input);
    const feePackage = await getPackageForBooking(tx, input);
    const packageState = await assertPackageCapacity(tx, input, feePackage);
    const registrationPolicy = await getPersonalScheduleRegistrationPolicy(tx);
    const scheduledSlots = (await Promise.all(input.sessions.map(async (selection) => {
      const { shifts, weekday } = await assertAvailability(tx, input, selection, registrationPolicy);
      return shifts.map((shift: any) => ({ sessionDate: selection.sessionDate, weekday, shift }));
    }))).flat().sort((a, b) =>
      a.sessionDate.localeCompare(b.sessionDate)
      || normalizeTime(a.shift.startTime).localeCompare(normalizeTime(b.shift.startTime))
      || a.shift.name.localeCompare(b.shift.name, "vi"),
    );
    const uniqueShiftIds = [...new Set(scheduledSlots.map((slot) => slot.shift.id))];
    const scheduledWeekdays = [...new Set(scheduledSlots.map((slot) => slot.weekday))].sort((a, b) => a - b);
    const startDate = scheduledSlots[0].sessionDate;
    const endDate = scheduledSlots[scheduledSlots.length - 1].sessionDate;

    const [student] = await tx
      .select({ fullName: students.fullName, code: students.code })
      .from(students)
      .where(eq(students.id, input.studentId))
      .limit(1);
    const [teacher] = await tx
      .select({ fullName: staff.fullName })
      .from(staff)
      .where(eq(staff.id, input.teacherId))
      .limit(1);
    if (!student || !teacher) throw new TeacherBookingValidationError("Không tìm thấy thông tin học viên hoặc giáo viên.");

    const classCode = `SR-${input.requestKey}`;
    const className = `Gia sư 1-1 · ${student.fullName || student.code} · ${teacher.fullName}`;
    const [createdClass] = await tx
      .insert(classes)
      .values({
        classCode,
        name: className.slice(0, 255),
        locationId: input.locationId,
        createdBy: input.userId,
        programId: null,
        courseId: feePackage.courseId,
        managerIds: [],
        teacherIds: [input.teacherId],
        shiftTemplateIds: uniqueShiftIds,
        feePackageId: feePackage.id,
        weekdays: scheduledWeekdays,
        scheduleConfig: null,
        teachersConfig: null,
        startDate,
        endDate,
        maxStudents: 1,
        learningFormat: input.learningMode,
        status: "active",
        scheduleGenerated: true,
        classType: "tutor",
      } as any)
      .returning({ id: classes.id });

    const classSessionRows = await tx
      .insert(classSessions)
      .values(scheduledSlots.map(({ shift, sessionDate, weekday }, index) => ({
        classId: createdClass.id,
        sessionDate,
        weekday,
        shiftTemplateId: shift.id,
        roomId: ZERO_ROOM_ID,
        teacherIds: [input.teacherId],
        learningFormat: input.learningMode,
        status: "scheduled",
        sessionIndex: index + 1,
      })))
      .returning({ id: classSessions.id, sessionIndex: classSessions.sessionIndex });

    const [studentClass] = await tx
      .insert(studentClasses)
      .values({
        studentId: input.studentId,
        classId: createdClass.id,
        status: "active",
        startDate,
        endDate,
        totalSessions: classSessionRows.length,
        attendedSessions: 0,
        remainingSessions: classSessionRows.length,
        scheduledWeekdays,
        createdBy: input.userId,
      } as any)
      .returning({ id: studentClasses.id });

    const configuredCount = packageState.packageSessions;
    const previouslyPaidPerSession = packageState.purchased
      && packageState.purchased.totalSessions > 0
      ? packageState.purchased.purchasedAmount / packageState.purchased.totalSessions
      : null;
    const perSessionPrice = money(previouslyPaidPerSession ?? (
      feePackage.type === "khoá"
        ? Number(feePackage.fee) / configuredCount
        : feePackage.fee
    ));
    await tx.insert(studentSessions).values(classSessionRows.map((session: any) => ({
      studentId: input.studentId,
      classId: createdClass.id,
      studentClassId: studentClass.id,
      classSessionId: session.id,
      status: "scheduled",
      attendanceStatus: "pending",
      packageId: feePackage.id,
      packageType: feePackage.type,
      sessionPrice: perSessionPrice.toFixed(2),
      sessionSource: "normal",
      isPaid: true,
      sessionOrder: session.sessionIndex,
    })) as any);

    let invoiceId: string | null = null;
    let invoiceCode: string | null = null;
    if (input.packageSource === "new") {
      const invoiceCodeValue = await getNextLocationCode(input.locationId, "PT", tx);
      const description = [
        `Gói học phí theo đăng ký: ${feePackage.name}`,
        `${configuredCount} buổi trong gói`,
        `Đã xếp ${classSessionRows.length} buổi; còn ${Math.max(0, configuredCount - classSessionRows.length)} buổi chưa xếp`,
        `Lớp ${className}`,
      ].join(", ");
      const totals = calculateAutoInvoiceDepositTotals(packageState.totalAmount, packageState.depositBalance);
      const [invoice] = await tx
        .insert(invoices)
        .values({
          code: invoiceCodeValue,
          type: "Thu",
          studentId: input.studentId,
          classId: createdClass.id,
          locationId: input.locationId,
          category: REGISTRATION_INVOICE_CATEGORY,
          paymentMethod: "deposit_wallet",
          totalAmount: packageState.totalAmount.toFixed(2),
          totalPromotion: "0.00",
          totalSurcharge: "0.00",
          grandTotal: totals.grandTotal.toFixed(2),
          deduction: totals.deduction.toFixed(2),
          paidAmount: totals.paidAmount.toFixed(2),
          remainingAmount: totals.remainingAmount.toFixed(2),
          status: totals.status,
          dueDate: getBangkokDateAndTime().date,
          paidBy: input.userId,
          paidAt: new Date(),
          description,
          createdBy: input.userId,
        } as any)
        .returning({ id: invoices.id, code: invoices.code });

      const itemUnitPrice = feePackage.type === "buổi"
        ? money(feePackage.fee)
        : money(feePackage.totalAmount);
      await tx.insert(invoiceItems).values({
        invoiceId: invoice.id,
        packageId: feePackage.id,
        packageName: feePackage.name,
        packageType: feePackage.type,
        unitPrice: itemUnitPrice.toFixed(2),
        quantity: configuredCount,
        subtotal: packageState.totalAmount.toFixed(2),
        vatRate: 0,
        vatAmount: "0.00",
        sortOrder: 0,
        category: "Học phí",
      } as any);

      const formattedAmount = packageState.totalAmount.toLocaleString("vi-VN");
      await tx.insert(studentWalletTransactions).values([
        {
          studentId: input.studentId,
          invoiceId: invoice.id,
          type: "debit",
          amount: packageState.totalAmount.toFixed(2),
          category: "Đặt cọc",
          action: `Trừ Ví Đặt Cọc cho đăng ký gói ${feePackage.name}: ${formattedAmount} đ`,
          classId: createdClass.id,
          className,
          invoiceCode: invoice.code,
          invoiceDescription: description,
          createdBy: input.userId,
        },
        {
          studentId: input.studentId,
          invoiceId: invoice.id,
          type: "credit",
          amount: packageState.totalAmount.toFixed(2),
          category: "Học phí",
          action: `Chuyển từ Ví Đặt Cọc sang Ví Học Phí cho gói ${feePackage.name}: ${formattedAmount} đ`,
          classId: createdClass.id,
          className,
          invoiceCode: invoice.code,
          invoiceDescription: description,
          createdBy: input.userId,
        },
      ] as any);
      invoiceId = invoice.id;
      invoiceCode = invoice.code;
    }

    return {
      classId: createdClass.id,
      invoiceId,
      invoiceCode,
      duplicate: false,
      packageId: feePackage.id,
      packageName: feePackage.name,
      totalSessions: packageState.packageSessions,
      bookedSessions: classSessionRows.length,
      remainingSessions: packageState.purchased
        ? Math.max(0, packageState.purchased.remainingSessions - classSessionRows.length)
        : Math.max(0, packageState.packageSessions - classSessionRows.length),
      locationName: location.name,
    };
  });
}

export async function confirmTeacherBooking(input: ConfirmTeacherBookingInput) {
  if (!(await teacherBookingSchemaIsReady())) throw new TeacherBookingSchemaNotReadyError();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestKey)) {
    throw new TeacherBookingValidationError("Mã đăng ký không hợp lệ.");
  }
  const totalSelected = input.sessions.reduce((total, session) => total + session.shiftIds.length, 0);
  const selectedKeys = input.sessions.flatMap((session) =>
    session.shiftIds.map((shiftId) => `${session.sessionDate}:${shiftId}`));
  if (
    totalSelected === 0
    || input.sessions.some((session) =>
      !isValidDateKey(session.sessionDate)
      || session.shiftIds.length === 0
      || new Set(session.shiftIds).size !== session.shiftIds.length)
    || new Set(input.sessions.map((session) => session.sessionDate)).size !== input.sessions.length
    || new Set(selectedKeys).size !== selectedKeys.length
  ) {
    throw new TeacherBookingValidationError("Vui lòng chọn các ca học hợp lệ, không trùng nhau.");
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`teacher-booking-student:${input.studentId}`}))`);
    const selectedDates = [...new Set(input.sessions.map((session) => session.sessionDate))].sort();
    for (const sessionDate of selectedDates) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`teacher-booking-slot:${input.teacherId}:${sessionDate}`}))`);
    }

    const previous = await findExistingBookingBatch(tx, input);
    if (previous) return previous;

    const location = await assertTeacherAndStudentShareLocation(tx, input);
    const feePackage = await getPackageForBooking(tx, input);
    const packageState = await assertPackageCapacity(tx, input, feePackage);
    const registrationPolicy = await getPersonalScheduleRegistrationPolicy(tx);
    const scheduledSlots = (await Promise.all(input.sessions.map(async (selection) => {
      const { shifts, weekday } = await assertAvailability(tx, input, selection, registrationPolicy);
      return shifts.map((shift: any) => ({ sessionDate: selection.sessionDate, weekday, shift }));
    }))).flat().sort((a, b) =>
      a.sessionDate.localeCompare(b.sessionDate)
      || normalizeTime(a.shift.startTime).localeCompare(normalizeTime(b.shift.startTime))
      || a.shift.name.localeCompare(b.shift.name, "vi"),
    );

    const [batch] = await tx
      .insert(teacherBookingBatches)
      .values({
        requestKey: input.requestKey,
        userId: input.userId,
        studentId: input.studentId,
        locationId: input.locationId,
        packageId: feePackage.id,
        packageSource: input.packageSource,
        packageName: feePackage.name,
        packageType: feePackage.type,
        learningMode: input.learningMode,
      })
      .returning({ id: teacherBookingBatches.id });

    const now = new Date();
    const slotRows = scheduledSlots.map(({ shift, sessionDate }) => {
      const cancellationCutoffAt = getPersonalScheduleCancellationCutoff(
        sessionDate,
        normalizeTime(shift.startTime),
        registrationPolicy.cancellationAdvanceHours,
      );
      if (!cancellationCutoffAt) {
        throw new TeacherBookingValidationError("Không tính được hạn hủy của ca đã chọn.");
      }
      return {
        batchId: batch.id,
        teacherId: input.teacherId,
        sessionDate,
        shiftTemplateId: shift.id,
        startTime: normalizeTime(shift.startTime),
        endTime: normalizeTime(shift.endTime),
        cancellationCutoffAt,
        sessionPrice: packageState.perSessionPrice.toFixed(2),
      };
    });
    const createdSlots = await tx
      .insert(teacherBookingSlots)
      .values(slotRows)
      .returning({ id: teacherBookingSlots.id, cancellationCutoffAt: teacherBookingSlots.cancellationCutoffAt });

    const shouldFinalizeImmediately = registrationPolicy.cancellationAdvanceHours === 0;
    const finalizedSlotIds: string[] = [];
    for (const slot of createdSlots) {
      if (shouldFinalizeImmediately || new Date(slot.cancellationCutoffAt) <= now) {
        await finalizeBookingSlotInTransaction(tx, slot.id, { force: shouldFinalizeImmediately });
        finalizedSlotIds.push(slot.id);
      }
    }

    const finalized = await tx
      .select({
        id: teacherBookingSlots.id,
        status: teacherBookingSlots.status,
        classId: teacherBookingSlots.classId,
      })
      .from(teacherBookingSlots)
      .where(eq(teacherBookingSlots.batchId, batch.id));
    const bookedSessions = finalized.filter((slot: any) => slot.status === "finalized").length;
    const pendingSessions = finalized.filter((slot: any) => slot.status === "pending").length;
    const classId = finalized.find((slot: any) => slot.classId)?.classId ?? null;
    return {
      batchId: batch.id,
      classId,
      invoiceId: null,
      invoiceCode: null,
      duplicate: false,
      status: pendingSessions > 0 ? (bookedSessions > 0 ? "partial" : "pending") : "finalized",
      packageId: feePackage.id,
      packageName: feePackage.name,
      totalSessions: packageState.packageSessions,
      bookedSessions,
      pendingSessions,
      remainingSessions: packageState.purchased
        ? Math.max(0, packageState.purchased.remainingSessions - totalSelected)
        : Math.max(0, packageState.packageSessions - bookedSessions),
      locationName: location.name,
    };
  });
}

export async function getStudentTeacherBookingRegistrations(studentIds: string[]) {
  if (studentIds.length === 0) return [];
  if (!(await teacherBookingSchemaIsReady())) throw new TeacherBookingSchemaNotReadyError();
  const rows = await db
    .select({
      id: teacherBookingSlots.id,
      batchId: teacherBookingBatches.id,
      studentId: teacherBookingBatches.studentId,
      studentName: students.fullName,
      studentCode: students.code,
      teacherId: teacherBookingSlots.teacherId,
      teacherName: staff.fullName,
      sessionDate: teacherBookingSlots.sessionDate,
      shiftId: teacherBookingSlots.shiftTemplateId,
      shiftName: shiftTemplates.name,
      startTime: teacherBookingSlots.startTime,
      endTime: teacherBookingSlots.endTime,
      status: teacherBookingSlots.status,
      cancellationCutoffAt: teacherBookingSlots.cancellationCutoffAt,
      packageId: teacherBookingBatches.packageId,
      packageName: teacherBookingBatches.packageName,
      packageSource: teacherBookingBatches.packageSource,
      classId: teacherBookingSlots.classId,
      classCode: classes.classCode,
      className: classes.name,
      createdAt: teacherBookingSlots.createdAt,
      failureReason: teacherBookingSlots.failureReason,
    })
    .from(teacherBookingSlots)
    .innerJoin(teacherBookingBatches, eq(teacherBookingBatches.id, teacherBookingSlots.batchId))
    .innerJoin(students, eq(students.id, teacherBookingBatches.studentId))
    .innerJoin(staff, eq(staff.id, teacherBookingSlots.teacherId))
    .innerJoin(shiftTemplates, eq(shiftTemplates.id, teacherBookingSlots.shiftTemplateId))
    .leftJoin(classes, eq(classes.id, teacherBookingSlots.classId))
    .where(inArray(teacherBookingBatches.studentId, studentIds))
    .orderBy(asc(teacherBookingSlots.sessionDate), asc(teacherBookingSlots.startTime), asc(teacherBookingSlots.createdAt));
  const now = Date.now();
  return rows.map((row: any) => ({
    ...row,
    sessionDate: normalizeDate(row.sessionDate),
    startTime: normalizeTime(row.startTime),
    endTime: normalizeTime(row.endTime),
    cancellationCutoffAt: new Date(row.cancellationCutoffAt).toISOString(),
    canCancel: row.status === "pending" && new Date(row.cancellationCutoffAt).getTime() > now,
  }));
}

async function processTeacherBookingSlot(slotId: string, cancelIfEligible: boolean) {
  return db.transaction(async (tx) => {
    const booking = await getBookingSlot(tx, slotId);
    if (!booking) throw new TeacherBookingValidationError("Không tìm thấy buổi đăng ký.");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${booking.studentId}))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`teacher-booking-student:${booking.studentId}`}))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`teacher-booking-slot:${booking.teacherId}:${booking.sessionDate}`}))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`teacher-booking-finalize:${slotId}`}))`);
    const current = await getBookingSlot(tx, slotId);
    if (!current) throw new TeacherBookingValidationError("Không tìm thấy buổi đăng ký.");
    if (current.status !== "pending") return { id: current.id, status: current.status };
    const now = new Date();
    const cutoff = new Date(current.cancellationCutoffAt);
    if (cancelIfEligible && now < cutoff) {
      await tx.update(teacherBookingSlots).set({
        status: "cancelled",
        cancelledAt: now,
        failureReason: null,
        updatedAt: now,
      }).where(and(
        eq(teacherBookingSlots.id, slotId),
        eq(teacherBookingSlots.status, "pending"),
      ));
      return { id: current.id, status: "cancelled" };
    }
    const result = await finalizeBookingSlotInTransaction(tx, slotId, { force: false });
    return { id: current.id, status: result?.status ?? "pending" };
  });
}

export async function cancelStudentTeacherBookingSlots(studentIds: string[], slotIds: string[]) {
  if (!(await teacherBookingSchemaIsReady())) throw new TeacherBookingSchemaNotReadyError();
  const uniqueSlotIds = [...new Set(slotIds)];
  if (uniqueSlotIds.length === 0) throw new TeacherBookingValidationError("Chọn ít nhất một buổi cần hủy.");
  const results = [];
  for (const slotId of uniqueSlotIds) {
    const [owner] = await db
      .select({ studentId: teacherBookingBatches.studentId })
      .from(teacherBookingSlots)
      .innerJoin(teacherBookingBatches, eq(teacherBookingBatches.id, teacherBookingSlots.batchId))
      .where(eq(teacherBookingSlots.id, slotId))
      .limit(1);
    if (!owner || !studentIds.includes(owner.studentId)) {
      throw new TeacherBookingValidationError("Không có quyền hủy một hoặc nhiều buổi đã chọn.");
    }
    try {
      results.push(await processTeacherBookingSlot(slotId, true));
    } catch (error: any) {
      const message = error?.message || "Không thể chốt buổi đăng ký.";
      await db.update(teacherBookingSlots).set({
        failureReason: message,
        updatedAt: new Date(),
      }).where(and(
        eq(teacherBookingSlots.id, slotId),
        eq(teacherBookingSlots.status, "pending"),
      ));
      results.push({ id: slotId, status: "pending", failureReason: message });
    }
  }
  return results;
}

export async function finalizeDueStudentTeacherBookings(limit = 100) {
  if (!(await teacherBookingSchemaIsReady())) return { due: 0, finalized: 0 };
  const due = await db
    .select({ id: teacherBookingSlots.id })
    .from(teacherBookingSlots)
    .where(and(
      eq(teacherBookingSlots.status, "pending"),
      lte(teacherBookingSlots.cancellationCutoffAt, new Date()),
    ))
    .orderBy(asc(teacherBookingSlots.cancellationCutoffAt), asc(teacherBookingSlots.createdAt))
    .limit(Math.max(1, Math.min(500, Math.trunc(limit))));

  let finalized = 0;
  for (const item of due) {
    try {
      const result = await processTeacherBookingSlot(item.id, false);
      if (result.status === "finalized") finalized += 1;
    } catch (error: any) {
      console.error("[TeacherBooking] Finalization failed:", error?.message ?? error);
      await db.update(teacherBookingSlots).set({
        failureReason: error?.message || "Không thể chốt buổi đăng ký.",
        updatedAt: new Date(),
      }).where(and(
        eq(teacherBookingSlots.id, item.id),
        eq(teacherBookingSlots.status, "pending"),
      )).catch((updateError: any) => {
        console.error("[TeacherBooking] Could not store finalization error:", updateError?.message ?? updateError);
      });
    }
  }
  return { due: due.length, finalized };
}
