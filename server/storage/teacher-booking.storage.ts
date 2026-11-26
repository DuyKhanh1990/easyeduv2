import {
  and,
  db,
  eq,
  inArray,
  isNotNull,
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
  teacherAvailability,
  teacherAvailabilityWindows,
  users,
} from "./base";
import { like, ne } from "drizzle-orm";
import { getNextLocationCode } from "./finance.storage";
import { calculateAutoInvoiceDepositTotals } from "@shared/invoice-deposit-accounting";

const ZERO_ROOM_ID = "00000000-0000-0000-0000-000000000000";
const REGISTRATION_INVOICE_CATEGORY = "Học phí theo đăng ký";

export class TeacherBookingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeacherBookingValidationError";
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
  const [purchases, usedRows] = await Promise.all([
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

  return [...packageMap.values()]
    .map((item) => {
      const usedSessions = usedByPackage.get(item.id) ?? 0;
      return {
        ...item,
        usedSessions,
        remainingSessions: Math.max(0, item.totalSessions - usedSessions),
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

async function getDepositBalance(executor: any, studentId: string): Promise<number> {
  const rows = await executor
    .select({
      type: studentWalletTransactions.type,
      amount: studentWalletTransactions.amount,
    })
    .from(studentWalletTransactions)
    .where(and(
      eq(studentWalletTransactions.studentId, studentId),
      eq(studentWalletTransactions.category, "Đặt cọc"),
    ));

  return money(rows.reduce((balance: number, row: any) => {
    const amount = Number(row.amount) || 0;
    return balance + (row.type === "credit" ? amount : -amount);
  }, 0));
}

export async function getTeacherBookingOptions(input: BookingOptionsInput) {
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
    return { packageSessions: purchased.totalSessions, purchased, totalAmount: 0, depositBalance: 0 };
  }

  const packageSessions = configuredSessionCount(feePackage.sessions);
  if (!packageSessions) throw new TeacherBookingValidationError("Số buổi của gói học phí chưa được cấu hình hợp lệ.");
  if (selectedSessionCount > packageSessions) {
    throw new TeacherBookingValidationError(`Gói này có ${packageSessions} buổi, không thể đăng ký ${selectedSessionCount} ca cùng lúc.`);
  }

  const totalAmount = money(
    feePackage.type === "buổi"
      ? Number(feePackage.fee) * packageSessions
      : feePackage.totalAmount,
  );
  if (totalAmount <= 0) throw new TeacherBookingValidationError("Giá gói học phí chưa được cấu hình hợp lệ.");
  const depositBalance = await getDepositBalance(tx, input.studentId);
  if (depositBalance < totalAmount) {
    throw new TeacherBookingValidationError("Số dư Ví Đặt Cọc không đủ để thanh toán toàn bộ gói học phí.");
  }
  return { packageSessions, purchased: null, totalAmount, depositBalance };
}

async function assertAvailability(
  tx: any,
  input: ConfirmTeacherBookingInput,
  selection: ConfirmTeacherBookingInput["sessions"][number],
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
    if (selection.sessionDate === todayAndTime.date && start <= todayAndTime.time) {
      throw new TeacherBookingValidationError("Ca học đã bắt đầu hoặc đã qua giờ bắt đầu.");
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
    const isBusy = existingSessions.some((session: any) => {
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

export async function confirmTeacherBooking(input: ConfirmTeacherBookingInput) {
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
    const scheduledSlots = (await Promise.all(input.sessions.map(async (selection) => {
      const { shifts, weekday } = await assertAvailability(tx, input, selection);
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
