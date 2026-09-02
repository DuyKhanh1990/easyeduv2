import { pgTable, text, varchar, timestamp, boolean, uuid, decimal, date, integer, jsonb, json, numeric, index, uniqueIndex, unique, serial, primaryKey } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ==========================================
// STUDENT CLASSES (Enrollment)
// ==========================================
export const studentClasses = pgTable("student_classes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: uuid("student_id").notNull().references(() => students.id),
  classId: uuid("class_id").notNull().references(() => classes.id),
  status: varchar("status", { length: 50 }).notNull().default("waiting"), // waiting, active, paused, completed, dropped
  startDate: date("start_date"),
  endDate: date("end_date"),
  studentStatus: varchar("student_status", { length: 50 }).default("Không xác định"),
  totalSessions: integer("total_sessions").default(0),
  attendedSessions: integer("attended_sessions").default(0),
  remainingSessions: integer("remaining_sessions").default(0),
  scheduledWeekdays: integer("scheduled_weekdays").array(),
  cycleHistory: jsonb("cycle_history"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("student_classes_status_idx").on(table.status),
  classStatusIdx: index("student_classes_class_status_idx").on(table.classId, table.status),
  studentStatusIdx: index("student_classes_student_status_idx").on(table.studentId, table.status),
  createdAtIdx: index("student_classes_created_at_idx").on(table.createdAt),
}));

// ==========================================
// STUDENT SESSIONS (Attendance/Individual Schedule)
// ==========================================
export const studentSessions = pgTable("student_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: uuid("student_id").notNull().references(() => students.id),
  classId: uuid("class_id").notNull().references(() => classes.id),
  studentClassId: uuid("student_class_id").references(() => studentClasses.id),
  classSessionId: uuid("class_session_id").notNull().references(() => classSessions.id),
  status: varchar("status", { length: 50 }).notNull().default("scheduled"), // scheduled, attended, absent, cancelled
  attendanceStatus: varchar("attendance_status", { length: 20 }).notNull().default("pending"),
  attendanceAt: timestamp("attendance_at"),
  attendanceNote: text("attendance_note"),
  note: text("note"),
  // Fee management columns
  packageId: uuid("package_id").references(() => courseFeePackages.id),
  packageType: varchar("package_type", { length: 20 }), // course or session
  sessionPrice: decimal("session_price", { precision: 10, scale: 2 }), // Price at the time of session
  sessionSource: varchar("session_source", { length: 20 }), // normal, makeup, transfer, extra
  makeupFromSessionId: uuid("makeup_from_session_id").references(() => classSessions.id), // Traces which session this makeup is for
  isPaid: boolean("is_paid"), // Whether counted in tuition
  sessionOrder: integer("session_order"), // Order within the course
  reviewData: jsonb("review_data"), // [{ criteriaId, criteriaName, comment }]
  reviewPublished: boolean("review_published").default(false),
  onlineClickedAt: timestamp("online_clicked_at"),
  onlineEndedAt: timestamp("online_ended_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("student_sessions_status_idx").on(table.status),
  attendanceStatusIdx: index("student_sessions_attendance_status_idx").on(table.attendanceStatus),
  classSessionStatusIdx: index("student_sessions_class_session_status_idx").on(table.classSessionId, table.attendanceStatus),
  studentIdIdx: index("student_sessions_student_id_idx").on(table.studentId),
  studentClassIdIdx: index("student_sessions_student_class_id_idx").on(table.studentClassId),
  studentClassSessionIdx: index("student_sessions_student_class_session_idx").on(table.studentClassId, table.classSessionId),
  createdAtIdx: index("student_sessions_created_at_idx").on(table.createdAt),
}));

// ==========================================
// STUDENT COMMENTS (Discussion/Notes)
// ==========================================
export const studentComments = pgTable("student_comments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==========================================
// INVOICES (Full version for finance management)
// ==========================================
export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  // Mã hoá đơn & kết toán
  code: varchar("code", { length: 50 }),                            // HD0001
  settleCode: varchar("settle_code", { length: 50 }),               // KT0001
  // Loại phiếu
  type: varchar("type", { length: 10 }).notNull().default("Thu"),   // Thu | Chi
  // Liên kết
  locationId: uuid("location_id").references(() => locations.id),   // Cơ sở
  studentId: uuid("student_id").references(() => students.id),      // Học viên (nullable)
  subjectName: varchar("subject_name", { length: 255 }),            // Tên đối tượng (nếu không phải học viên)
  classId: uuid("class_id").references(() => classes.id),           // Lớp
  salaryTableId: uuid("salary_table_id"),                            // Bảng lương (nullable, chỉ dùng cho phiếu chi lương)
  // Danh mục & tài khoản
  category: varchar("category", { length: 100 }),                   // Học phí, Chi Lương...
  account: varchar("account", { length: 20 }),                      // 111 - Tiền mặt
  counterAccount: varchar("counter_account", { length: 20 }),       // 511 - Doanh thu
  // Số tiền (giữ nguyên các cột cũ, bổ sung mới)
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),    // Tổng trước KM/PT
  totalPromotion: decimal("total_promotion", { precision: 15, scale: 2 }).notNull().default("0"), // Tổng khuyến mãi
  totalSurcharge: decimal("total_surcharge", { precision: 15, scale: 2 }).notNull().default("0"), // Tổng phụ thu
  grandTotal: decimal("grand_total", { precision: 15, scale: 2 }).notNull().default("0"),     // Thành tiền (trước khấu trừ)
  deduction: decimal("deduction", { precision: 15, scale: 2 }).notNull().default("0"),        // Khấu trừ
  paidAmount: decimal("paid_amount", { precision: 15, scale: 2 }).notNull().default("0"),     // Đã thu
  remainingAmount: decimal("remaining_amount", { precision: 15, scale: 2 }).notNull().default("0"), // Còn lại
  commission: decimal("commission", { precision: 15, scale: 2 }).default("0"),                // Hoa hồng
  // Thông tin thêm
  description: text("description"),                                 // Mô tả
  note: text("note"),                                               // Ghi chú
  paymentNote: text("payment_note"),                                // Ghi chú tự động từ cổng thanh toán (BIDV, VNPay...)
  dueDate: date("due_date"),                                        // Hạn thanh toán
  // Hình thức thanh toán (khi không chia đợt)
  paymentMethod: varchar("payment_method", { length: 20 }),         // cash | transfer
  appliedBankAccount: jsonb("applied_bank_account"),                // { bankName, bankAccount, accountHolder }
  // Trạng thái
  status: varchar("status", { length: 50 }).notNull().default("unpaid"), // unpaid | partial | paid | debt | cancelled
  // KM / Phụ thu áp dụng cho TOÀN hoá đơn (ngoài phần đã gắn theo từng item)
  invoicePromotionKeys: text("invoice_promotion_keys").array().default(sql`'{}'::text[]`),
  invoiceSurchargeKeys: text("invoice_surcharge_keys").array().default(sql`'{}'::text[]`),
  invoicePromotionAmount: decimal("invoice_promotion_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  invoiceSurchargeAmount: decimal("invoice_surcharge_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  // Hoá đơn điện tử (Mắt Bão)
  einvoiceStatus: varchar("einvoice_status", { length: 20 }),       // null|"draft"|"published" → Chưa ký số / Chờ ký số / Đã ký số
  einvoiceFkey: varchar("einvoice_fkey", { length: 200 }),          // MaSoHDon từ Mắt Bão
  einvoiceMaTraCuu: varchar("einvoice_ma_tra_cuu", { length: 100 }), // MaTraCuu (mã tham chiếu) từ Mắt Bão
  einvoiceMessage: text("einvoice_message"),                         // Thông báo / lỗi gần nhất
  einvoiceUpdatedAt: timestamp("einvoice_updated_at"),               // Lần đổi trạng thái HĐĐT gần nhất
  // Audit
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  // Thanh toán
  paidBy: uuid("paid_by").references(() => users.id),
  paidAt: timestamp("paid_at"),
  // Liên kết phiếu kho
  storeReceiptId: uuid("store_receipt_id"),
  storeIssueReceiptId: uuid("store_issue_receipt_id"),
  storeTransferId: uuid("store_transfer_id"),
}, (table) => ({
  statusIdx: index("invoices_status_idx").on(table.status),
  createdAtIdx: index("invoices_created_at_idx").on(table.createdAt),
  studentStatusIdx: index("invoices_student_status_idx").on(table.studentId, table.status),
  locationCreatedAtIdx: index("invoices_location_created_at_idx").on(table.locationId, table.createdAt),
  typeStatusIdx: index("invoices_type_status_idx").on(table.type, table.status),
}));

// ==========================================
// INVOICE ITEMS (Danh sách sản phẩm/gói)
// ==========================================
export const invoiceItems = pgTable("invoice_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  packageId: uuid("package_id").references(() => courseFeePackages.id, { onDelete: "set null" }),
  packageName: varchar("package_name", { length: 255 }).notNull(),  // Tên gói
  packageType: varchar("package_type", { length: 20 }),             // "buổi" | "khoá"
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).notNull().default("0"),
  quantity: integer("quantity").notNull().default(1),
  promotionKeys: text("promotion_keys").array().default(sql`'{}'::text[]`), // Khuyến mãi đã chọn
  surchargeKeys: text("surcharge_keys").array().default(sql`'{}'::text[]`), // Phụ thu đã chọn
  promotionAmount: decimal("promotion_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  surchargeAmount: decimal("surcharge_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").default(0),
  category: varchar("category", { length: 100 }),               // Danh mục (per item)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ==========================================
// INVOICE PAYMENT SCHEDULE (Lịch thanh toán)
// ==========================================
export const invoicePaymentSchedule = pgTable("invoice_payment_schedule", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 50 }).notNull(),          // ĐỢT 1, ĐỢT 2...
  code: varchar("code", { length: 100 }),                     // PT202603001-1
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  dueDate: date("due_date"),                                  // Hạn thanh toán đợt này
  status: varchar("status", { length: 20 }).notNull().default("unpaid"), // unpaid | paid
  paidAt: timestamp("paid_at"),
  sortOrder: integer("sort_order").default(0),
  settleCode: varchar("settle_code", { length: 50 }),              // KT0001 khi đợt được thanh toán
  paymentMethod: varchar("payment_method", { length: 20 }),         // cash | transfer
  appliedBankAccount: jsonb("applied_bank_account"),                // { bankName, bankAccount, accountHolder }
  // Hoá đơn điện tử cho từng đợt (Mắt Bão)
  einvoiceStatus: varchar("einvoice_status", { length: 20 }),
  einvoiceFkey: varchar("einvoice_fkey", { length: 200 }),
  einvoiceMaTraCuu: varchar("einvoice_ma_tra_cuu", { length: 100 }),
  einvoiceMessage: text("einvoice_message"),
  einvoiceUpdatedAt: timestamp("einvoice_updated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ==========================================
// INVOICE SESSION ALLOCATIONS (Phân bổ học phí vào buổi học)
// ==========================================
export const invoiceSessionAllocations = pgTable("invoice_session_allocations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  invoiceItemId: uuid("invoice_item_id").notNull().references(() => invoiceItems.id, { onDelete: "cascade" }),
  studentSessionId: uuid("student_session_id").notNull().references(() => studentSessions.id, { onDelete: "cascade" }),
  allocatedAmount: decimal("allocated_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ==========================================
// INVOICE COMMISSIONS (Hoa hồng nhân viên)
// ==========================================
export const invoiceCommissions = pgTable("invoice_commissions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  percentage: decimal("percentage", { precision: 5, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ==========================================
// COMMISSION CONFIGURATIONS (Cấu hình hoa hồng)
// ==========================================
export const commissionConfigs = pgTable("commission_configs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  locationIds: uuid("location_ids").array().notNull().default(sql`'{}'::uuid[]`),
  invoiceTypes: text("invoice_types").array().notNull().default(sql`'{}'::text[]`),
  invoiceStatuses: text("invoice_statuses").array().notNull().default(sql`'{}'::text[]`),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  description: text("description"),
  roleConfigs: jsonb("role_configs").notNull().default(sql`'{}'::jsonb`),
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  effectiveFromIdx: index("commission_configs_effective_from_idx").on(table.effectiveFrom),
}));

export const insertCommissionConfigSchema = createInsertSchema(commissionConfigs).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type CommissionConfig = typeof commissionConfigs.$inferSelect;

// Relations
export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  location: one(locations, { fields: [invoices.locationId], references: [locations.id] }),
  student: one(students, { fields: [invoices.studentId], references: [students.id] }),
  class: one(classes, { fields: [invoices.classId], references: [classes.id] }),
  createdByUser: one(users, { fields: [invoices.createdBy], references: [users.id] }),
  updatedByUser: one(users, { fields: [invoices.updatedBy], references: [users.id] }),
  items: many(invoiceItems),
  paymentSchedule: many(invoicePaymentSchedule),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceItems.invoiceId], references: [invoices.id] }),
}));

export const invoicePaymentScheduleRelations = relations(invoicePaymentSchedule, ({ one }) => ({
  invoice: one(invoices, { fields: [invoicePaymentSchedule.invoiceId], references: [invoices.id] }),
}));

export const invoiceSessionAllocationsRelations = relations(invoiceSessionAllocations, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceSessionAllocations.invoiceId], references: [invoices.id] }),
  invoiceItem: one(invoiceItems, { fields: [invoiceSessionAllocations.invoiceItemId], references: [invoiceItems.id] }),
  studentSession: one(studentSessions, { fields: [invoiceSessionAllocations.studentSessionId], references: [studentSessions.id] }),
}));

export const insertInvoiceSessionAllocationSchema = createInsertSchema(invoiceSessionAllocations).omit({ id: true, createdAt: true });
export type InvoiceSessionAllocation = typeof invoiceSessionAllocations.$inferSelect;
export type InsertInvoiceSessionAllocation = z.infer<typeof insertInvoiceSessionAllocationSchema>;

export const studentClassesRelations = relations(studentClasses, ({ one }) => ({
  student: one(students, { fields: [studentClasses.studentId], references: [students.id] }),
  class: one(classes, { fields: [studentClasses.classId], references: [classes.id] }),
}));

export const studentSessionsRelations = relations(studentSessions, ({ one }) => ({
  student: one(students, { fields: [studentSessions.studentId], references: [students.id] }),
  classSession: one(classSessions, { fields: [studentSessions.classSessionId], references: [classSessions.id] }),
  feePackage: one(courseFeePackages, { fields: [studentSessions.packageId], references: [courseFeePackages.id] }),
}));

// Schemas
export const insertStudentClassSchema = createInsertSchema(studentClasses).omit({ id: true, createdAt: true, updatedAt: true });
export const insertStudentSessionSchema = createInsertSchema(studentSessions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertStudentCommentSchema = createInsertSchema(studentComments).omit({ id: true, createdAt: true, updatedAt: true });

export type StudentClass = typeof studentClasses.$inferSelect;
export type StudentSession = typeof studentSessions.$inferSelect;
export type StudentComment = typeof studentComments.$inferSelect;
export type InsertStudentComment = z.infer<typeof insertStudentCommentSchema>;

// Invoice schemas & types
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInvoiceItemSchema = createInsertSchema(invoiceItems).omit({ id: true, createdAt: true });
export const insertInvoicePaymentScheduleSchema = createInsertSchema(invoicePaymentSchedule).omit({ id: true, createdAt: true });

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;
export type InvoicePaymentSchedule = typeof invoicePaymentSchedule.$inferSelect;
export type InsertInvoicePaymentSchedule = z.infer<typeof insertInvoicePaymentScheduleSchema>;

// ==========================================
// COURSE PROGRAMS & CONTENTS
// ==========================================
export const coursePrograms = pgTable("course_programs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  locationIds: uuid("location_ids").array().notNull(),
  sessions: decimal("sessions", { precision: 10, scale: 2 }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const courseProgramContents = pgTable("course_program_contents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  programId: uuid("program_id").references(() => coursePrograms.id, { onDelete: "cascade" }),
  sessionNumber: decimal("session_number", { precision: 10, scale: 2 }),
  title: varchar("title", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // 'Bài học', 'Bài tập về nhà', 'Giáo trình'
  content: text("content"),
  attachments: text("attachments").array(), // Array of file URLs/names
  allowDownload: boolean("allow_download"), // null = use role default, true/false = override
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations
export const courseProgramsRelations = relations(coursePrograms, ({ many }) => ({
  contents: many(courseProgramContents),
}));

export const courseProgramContentsRelations = relations(courseProgramContents, ({ one }) => ({
  program: one(coursePrograms, {
    fields: [courseProgramContents.programId],
    references: [coursePrograms.id],
  }),
}));

// Schemas & Types
export const insertCourseProgramSchema = createInsertSchema(coursePrograms, {
  sessions: z.coerce.number(),
}).omit({ id: true, createdAt: true, updatedAt: true });
export type CourseProgram = typeof coursePrograms.$inferSelect;

export const insertCourseProgramContentSchema = createInsertSchema(courseProgramContents, {
  sessionNumber: z.coerce.number().optional().nullable(),
  programId: z.string().uuid().optional().nullable(),
  createdBy: z.string().uuid().optional().nullable(),
}).omit({ id: true, createdAt: true, updatedAt: true });
export type CourseProgramContent = typeof courseProgramContents.$inferSelect;

// ==========================================
// LOCATIONS TABLE
// ==========================================
export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  address: text("address"),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  logoUrl: text("logo_url"),
  paymentQrUrl: text("payment_qr_url"),
  bankName: varchar("bank_name", { length: 100 }),
  bankAccount: varchar("bank_account", { length: 50 }),
  accountHolder: varchar("account_holder", { length: 255 }),
  useCenterBank: boolean("use_center_bank").default(true),
  bankAccounts: text("bank_accounts"),
  isMain: boolean("is_main").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==========================================
// DEPARTMENTS TABLE
// ==========================================
export const departments = pgTable("departments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isSystem: boolean("is_system").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==========================================
// ROLES TABLE
// ==========================================
export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  departmentId: uuid("department_id").notNull().references(() => departments.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isSystem: boolean("is_system").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==========================================
// USERS TABLE
// ==========================================
export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").default(true),
  tinodeUserId: varchar("tinode_user_id", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("users_tinode_user_id_uidx").on(t.tinodeUserId),
]);

// ==========================================
// STAFF TABLE
// ==========================================
export const staff = pgTable("staff", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id),
  code: varchar("code", { length: 50 }).notNull().unique(),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  dateOfBirth: date("date_of_birth"),
  address: text("address"),
  status: varchar("status", { length: 50 }).default("Hoạt động"), // Hoạt động/ Không hoạt động
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index("staff_user_id_idx").on(table.userId),
}));

// ==========================================
// STAFF ASSIGNMENTS TABLE
// ==========================================
export const staffAssignments = pgTable("staff_assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  staffId: uuid("staff_id")
    .references(() => staff.id, { onDelete: "cascade" })
    .notNull(),
  locationId: uuid("location_id")
    .references(() => locations.id, { onDelete: "cascade" })
    .notNull(),
  departmentId: uuid("department_id")
    .references(() => departments.id),
  roleId: uuid("role_id")
    .references(() => roles.id),
  omicallExtension: varchar("omicall_extension", { length: 50 }),
  // Omicall internal-phone password, encrypted at rest and never returned to the client.
  omicallPasswordEncrypted: text("omicall_password_encrypted"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  staffIdIdx: index("staff_assignments_staff_id_idx").on(table.staffId),
}));

export const staffRelations = relations(staff, ({ one, many }) => ({
  user: one(users, {
    fields: [staff.userId],
    references: [users.id],
  }),
  assignments: many(staffAssignments),
  availabilities: many(teacherAvailability, {
    relationName: "teacher_avail_staff",
  }),
}));

export const departmentsRelations = relations(departments, ({ many }) => ({
  roles: many(roles),
}));

export const rolesRelations = relations(roles, ({ one }) => ({
  department: one(departments, {
    fields: [roles.departmentId],
    references: [departments.id],
  }),
}));

export const staffAssignmentsRelations = relations(staffAssignments, ({ one }) => ({
  staff: one(staff, {
    fields: [staffAssignments.staffId],
    references: [staff.id],
  }),
  location: one(locations, {
    fields: [staffAssignments.locationId],
    references: [locations.id],
  }),
  department: one(departments, {
    fields: [staffAssignments.departmentId],
    references: [departments.id],
  }),
  role: one(roles, {
    fields: [staffAssignments.roleId],
    references: [roles.id],
  }),
}));

// ==========================================
// STUDENTS TABLE
// ==========================================
export const students = pgTable("students", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id), // Link to user account
  code: varchar("code", { length: 50 }).notNull().unique(),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull().default("Học viên"), // Học viên, Phụ huynh
  phone: varchar("phone", { length: 50 }),
  dateOfBirth: date("date_of_birth"),
  gender: varchar("gender", { length: 20 }), // Nam, Nữ
  email: varchar("email", { length: 255 }),
  pipelineStage: text("pipeline_stage").array().notNull().default(sql`'{}'::text[]`), // Changed to array for multiple relationships
  status: varchar("status", { length: 50 }).default("active"), // Hoạt động, ...
  accountStatus: varchar("account_status", { length: 50 }).default("Hoạt động"), // Hoạt động, Không hoạt động
  relationship: varchar("relationship", { length: 100 }), // Mối quan hệ
  parentName: varchar("parent_name", { length: 255 }),
  parentPhone: varchar("parent_phone", { length: 50 }),
  parentName2: varchar("parent_name2", { length: 255 }),
  parentPhone2: varchar("parent_phone2", { length: 50 }),
  parentName3: varchar("parent_name3", { length: 255 }),
  parentPhone3: varchar("parent_phone3", { length: 50 }),
  address: text("address"),
  source: varchar("source", { length: 255 }),
  rejectReason: text("reject_reason"),
  socialLink: varchar("social_link", { length: 255 }),
  academicLevel: varchar("academic_level", { length: 255 }),
  salesByIds: uuid("sales_by_ids").array(),
  managedByIds: uuid("managed_by_ids").array(),
  teacherIds: uuid("teacher_ids").array(),
  parentIds: uuid("parent_ids").array(),
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
  classIds: uuid("class_ids").array(), // Array of classes for multi-class enrollment
  relationshipIds: uuid("relationship_ids").array(),
  customerSourceIds: uuid("customer_source_ids").array(),
  schoolIds: uuid("school_ids").array(),
  note: text("note"),
  avatarUrl: text("avatar_url"),
  customFields: jsonb("custom_fields").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  createdAtIdx: index("students_created_at_idx").on(table.createdAt),
  statusIdx: index("students_status_idx").on(table.status),
  accountStatusIdx: index("students_account_status_idx").on(table.accountStatus),
  userIdIdx: index("students_user_id_idx").on(table.userId),
  salesByIdsGinIdx: index("students_sales_by_ids_gin_idx").using("gin", table.salesByIds),
  managedByIdsGinIdx: index("students_managed_by_ids_gin_idx").using("gin", table.managedByIds),
  teacherIdsGinIdx: index("students_teacher_ids_gin_idx").using("gin", table.teacherIds),
  schoolIdsGinIdx: index("students_school_ids_gin_idx").using("gin", table.schoolIds),
}));

// ==========================================
// STUDENT LOCATIONS TABLE
// ==========================================
export const studentLocations = pgTable("student_locations", {
  id: uuid("id").defaultRandom().primaryKey(),
  studentId: uuid("student_id")
    .references(() => students.id, { onDelete: "cascade" })
    .notNull(),
  locationId: uuid("location_id")
    .references(() => locations.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  studentIdIdx: index("student_locations_student_id_idx").on(table.studentId),
  locationIdIdx: index("student_locations_location_id_idx").on(table.locationId),
}));

// ==========================================
// STUDENT LEAVE REQUESTS (Đơn xin nghỉ học)
// ==========================================
export const studentLeaveRequests = pgTable("student_leave_requests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  scheduleIds: uuid("schedule_ids").array().notNull().default(sql`'{}'::uuid[]`),
  scheduleSnapshot: jsonb("schedule_snapshot").notNull().default(sql`'[]'::jsonb`),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  description: text("description"),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | approved | rejected
  attendanceApprovalMode: varchar("attendance_approval_mode", { length: 20 }), // unchanged | applied; only meaningful when approved
  rejectionReason: text("rejection_reason"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  studentCreatedAtIdx: index("student_leave_requests_student_created_at_idx").on(table.studentId, table.createdAt),
  locationStatusIdx: index("student_leave_requests_location_status_idx").on(table.locationId, table.status),
  statusIdx: index("student_leave_requests_status_idx").on(table.status),
}));

export const insertStudentLeaveRequestSchema = createInsertSchema(studentLeaveRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type StudentLeaveRequest = typeof studentLeaveRequests.$inferSelect;
export type InsertStudentLeaveRequest = typeof studentLeaveRequests.$inferInsert;

// ==========================================
// CRM CONFIGURATION TABLES
// ==========================================
export const crmPipelineGroups = pgTable("crm_pipeline_groups", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  color: varchar("color", { length: 50 }).notNull().default("#8b5cf6"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const crmRelationships = pgTable("crm_relationships", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  color: varchar("color", { length: 50 }).notNull().default("#3b82f6"),
  position: varchar("position", { length: 100 }),
  groupId: uuid("group_id").references(() => crmPipelineGroups.id, { onDelete: "set null" }),
  isParentGroup: boolean("is_parent_group").notNull().default(false),
  parentId: uuid("parent_id"),
  isSystemDefault: boolean("is_system_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const crmRejectReasons = pgTable("crm_reject_reasons", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const crmCustomerSources = pgTable("crm_customer_sources", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const crmSchools = pgTable("crm_schools", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Stores per-field "required" flag for the customer form (Học viên / Phụ huynh).
// Only fields that are NOT system-required (locationIds, type, code, fullName)
// are configurable here.
export const crmRequiredFields = pgTable("crm_required_fields", {
  fieldKey: varchar("field_key", { length: 100 }).primaryKey(),
  isRequired: boolean("is_required").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Center-defined custom fields appended to the customer form.
// Values are stored on students.customFields (jsonb) keyed by this row's id.
export const crmCustomFields = pgTable("crm_custom_fields", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  label: varchar("label", { length: 255 }).notNull(),
  fieldType: varchar("field_type", { length: 20 }).notNull().default("text"), // text | number | date | textarea | select
  options: text("options").array(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCrmCustomFieldSchema = createInsertSchema(crmCustomFields).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCrmCustomField = z.infer<typeof insertCrmCustomFieldSchema>;
export type CrmCustomField = typeof crmCustomFields.$inferSelect;

// Stores per-field "visible" flag for the public registration form.
export const crmRegistrationFormFields = pgTable("crm_registration_form_fields", {
  fieldKey: varchar("field_key", { length: 100 }).primaryKey(),
  isVisible: boolean("is_visible").notNull().default(false),
  isRequired: boolean("is_required").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type CrmRegistrationFormField = typeof crmRegistrationFormFields.$inferSelect;

// ==========================================
// STUDENT RELATIONSHIP HISTORY (Lịch sử chuyển đổi mối quan hệ)
// ==========================================
export const studentRelationshipHistory = pgTable("student_relationship_history", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  fromRelationshipId: uuid("from_relationship_id").references(() => crmRelationships.id, { onDelete: "set null" }),
  fromRelationshipName: varchar("from_relationship_name", { length: 255 }),
  toRelationshipId: uuid("to_relationship_id").references(() => crmRelationships.id, { onDelete: "set null" }),
  toRelationshipName: varchar("to_relationship_name", { length: 255 }),
  changedByUserId: uuid("changed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  changedByName: varchar("changed_by_name", { length: 255 }),
  note: text("note"),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
});

// ==========================================
// COURSES TABLE
// ==========================================
export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  locationId: uuid("location_id").references(() => locations.id),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==========================================
// COURSE FEE PACKAGES TABLE
// ==========================================
export const courseFeePackages = pgTable("course_fee_packages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // 'buổi' or 'khoá'
  fee: decimal("fee", { precision: 15, scale: 2 }).notNull(),
  sessions: decimal("sessions", { precision: 10, scale: 2 }).notNull(),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==========================================
// CLASSES & SESSIONS
// ==========================================
export const classes = pgTable("classes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  classCode: varchar("class_code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  programId: uuid("program_id").references(() => coursePrograms.id),
  courseId: uuid("course_id").references(() => courses.id),
  managerIds: uuid("manager_ids").array().notNull(),
  teacherIds: uuid("teacher_ids").array(),
  shiftTemplateIds: uuid("shift_template_ids").array(),
  feePackageId: uuid("fee_package_id").references(() => courseFeePackages.id),
  weekdays: integer("weekdays").array(),
  scheduleConfig: jsonb("schedule_config_json"),
  teachersConfig: jsonb("teachers_config_json"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  maxStudents: integer("max_students"),
  learningFormat: varchar("learning_format", { length: 50 }).notNull().default("offline"), // online, offline
  onlineLink: text("online_link"),
  status: varchar("status", { length: 50 }).notNull().default("planning"), // planning, recruiting, active, closed
  color: varchar("color", { length: 20 }),
  description: text("description"),
  subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "set null" }),
  evaluationCriteriaIds: uuid("evaluation_criteria_ids").array(),
  scoreSheetId: uuid("score_sheet_id").references(() => scoreSheets.id, { onDelete: "set null" }),
  scheduleGenerated: boolean("schedule_generated").notNull().default(false),
  classType: varchar("class_type", { length: 20 }).default("group"), // group, tutor
  tinodeTopicId: varchar("tinode_topic_id", { length: 100 }),
  cycleHistory: jsonb("cycle_history"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("classes_status_idx").on(table.status),
  locationIdx: index("classes_location_idx").on(table.locationId),
  locationStatusIdx: index("classes_location_status_idx").on(table.locationId, table.status),
  createdAtIdx: index("classes_created_at_idx").on(table.createdAt),
  tinodeTopicIdUniq: uniqueIndex("classes_tinode_topic_id_uidx").on(table.tinodeTopicId),
}));

export const classSessions = pgTable("class_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  classId: uuid("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  sessionDate: date("session_date").notNull(),
  weekday: integer("weekday").notNull(), // 1-7
  shiftTemplateId: uuid("shift_template_id").notNull().references(() => shiftTemplates.id),
  roomId: uuid("room_id").notNull(), // Assuming room_id is handled as UUID, potentially references a rooms table if exists
  teacherIds: uuid("teacher_ids").array(),
  learningFormat: varchar("learning_format", { length: 50 }).notNull().default("offline"), // online, offline
  status: varchar("status", { length: 50 }).notNull().default("scheduled"), // scheduled, cancelled, completed
  cancelReason: text("cancel_reason"),
  cancelledAt: timestamp("cancelled_at"),
  cancelledBy: uuid("cancelled_by").references(() => users.id),
  sessionIndex: integer("session_index"),
  changeReason: text("change_reason"),
  changedAt: timestamp("changed_at"),
  changedBy: uuid("changed_by").references(() => users.id),
  subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "set null" }),
  evaluationCriteriaIds: uuid("evaluation_criteria_ids").array(),
  programId: uuid("program_id").references(() => coursePrograms.id, { onDelete: "set null" }),
  scoreSheetId: uuid("score_sheet_id").references(() => scoreSheets.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  sessionDateIdx: index("class_sessions_session_date_idx").on(table.sessionDate),
  statusIdx: index("class_sessions_status_idx").on(table.status),
  classDateIdx: index("class_sessions_class_date_idx").on(table.classId, table.sessionDate),
  roomConflictIdx: index("class_sessions_room_conflict_idx").on(table.roomId, table.sessionDate, table.shiftTemplateId),
}));

// Relations
export const classesRelations = relations(classes, ({ one, many }) => ({
  location: one(locations, { fields: [classes.locationId], references: [locations.id] }),
  program: one(coursePrograms, { fields: [classes.programId], references: [coursePrograms.id] }),
  course: one(courses, { fields: [classes.courseId], references: [courses.id] }),
  sessions: many(classSessions),
  studentClasses: many(studentClasses),
}));

export const classSessionsRelations = relations(classSessions, ({ one }) => ({
  class: one(classes, { fields: [classSessions.classId], references: [classes.id] }),
  shiftTemplate: one(shiftTemplates, { fields: [classSessions.shiftTemplateId], references: [shiftTemplates.id] }),
}));

// Schemas & Types
export const insertClassSchema = createInsertSchema(classes).omit({ id: true, createdAt: true, updatedAt: true });
export type Class = typeof classes.$inferSelect;
export type InsertClass = z.infer<typeof insertClassSchema>;

export const insertClassSessionSchema = createInsertSchema(classSessions).omit({ id: true, createdAt: true, updatedAt: true });
export type ClassSession = typeof classSessions.$inferSelect;
export type InsertClassSession = z.infer<typeof insertClassSessionSchema>;

// ==========================================
// CLASS SESSION EXCLUSIONS
// ==========================================
export const classSessionExclusions = pgTable("class_session_exclusions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  classId: uuid("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  fromSessionId: uuid("from_session_id").notNull(),
  toSessionId: uuid("to_session_id").notNull(),
  fromSessionOrder: integer("from_session_order").notNull(),
  toSessionOrder: integer("to_session_order").notNull(),
  fromSessionDate: date("from_session_date").notNull(),
  toSessionDate: date("to_session_date").notNull(),
  reason: text("reason"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const classSessionExclusionsRelations = relations(classSessionExclusions, ({ one }) => ({
  class: one(classes, { fields: [classSessionExclusions.classId], references: [classes.id] }),
}));

export const insertClassSessionExclusionSchema = createInsertSchema(classSessionExclusions).omit({ id: true, createdAt: true });
export type ClassSessionExclusion = typeof classSessionExclusions.$inferSelect;
export type InsertClassSessionExclusion = z.infer<typeof insertClassSessionExclusionSchema>;

// Relations
export const locationsRelations = relations(locations, ({ many }) => ({
  users: many(users),
  staff: many(staff),
  students: many(students),
  courses: many(courses),
  classes: many(classes),
  availabilities: many(teacherAvailability, {
    relationName: "teacher_avail_loc",
  }),
}));

export const coursesRelations = relations(courses, ({ one, many }) => ({
  location: one(locations, {
    fields: [courses.locationId],
    references: [locations.id],
  }),
  feePackages: many(courseFeePackages),
}));

export const courseFeePackagesRelations = relations(courseFeePackages, ({ one }) => ({
  course: one(courses, {
    fields: [courseFeePackages.courseId],
    references: [courses.id],
  }),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  user: one(users, {
    fields: [students.userId],
    references: [users.id]
  }),
  locations: many(studentLocations),
}));

export const studentLocationsRelations = relations(studentLocations, ({ one }) => ({
  student: one(students, {
    fields: [studentLocations.studentId],
    references: [students.id],
  }),
  location: one(locations, {
    fields: [studentLocations.locationId],
    references: [locations.id],
  }),
}));

// ==========================================
// SHIFT TEMPLATES TABLE
// ==========================================
export const shiftTemplates = pgTable("shift_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 50 }),
  name: varchar("name", { length: 100 }).notNull(),
  startTime: text("start_time").notNull(), // Using text for simplicity in JS, maps to TIME in DB
  endTime: text("end_time").notNull(),
  lunchBreakMinutes: integer("lunch_break_minutes").default(0).notNull(),
  lateMinutes: integer("late_minutes").default(0).notNull(),
  earlyLeaveMinutes: integer("early_leave_minutes").default(0).notNull(),
  workUnits: numeric("work_units", { precision: 10, scale: 4 }).default("1").notNull(),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  status: varchar("status", { length: 20 }).default("active"),
  note: text("note"),
  type: varchar("type", { length: 20 }).default("class").notNull(), // 'class' = ca học, 'work' = ca làm việc nhân sự
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==========================================
// TEACHER AVAILABILITY TABLE
// ==========================================
export const teacherAvailability = pgTable("teacher_availability", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  teacherId: uuid("teacher_id").notNull().references(() => staff.id),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  shiftTemplateId: uuid("shift_template_id").notNull().references(() => shiftTemplates.id),
  weekday: integer("weekday").notNull(), // 0=Sunday, 1=Monday...6=Saturday
  effectiveFrom: date("effective_from"),
  effectiveTo: date("effective_to"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    unq: sql`UNIQUE (${table.teacherId}, ${table.locationId}, ${table.shiftTemplateId}, ${table.weekday}, ${table.effectiveFrom})`
  };
});

export const teacherAvailabilityRelations = relations(teacherAvailability, ({ one }) => ({
  teacher: one(staff, {
    fields: [teacherAvailability.teacherId],
    references: [staff.id],
    relationName: "teacher_avail_staff",
  }),
  location: one(locations, {
    fields: [teacherAvailability.locationId],
    references: [locations.id],
    relationName: "teacher_avail_loc",
  }),
  shiftTemplate: one(shiftTemplates, {
    fields: [teacherAvailability.shiftTemplateId],
    references: [shiftTemplates.id],
    relationName: "teacher_avail_shift",
  }),
}));

export const shiftTemplatesRelations = relations(shiftTemplates, ({ one, many }) => ({
  location: one(locations, {
    fields: [shiftTemplates.locationId],
    references: [locations.id],
    relationName: "shift_template_location",
  }),
  availabilities: many(teacherAvailability, {
    relationName: "teacher_avail_shift",
  }),
}));

// Schemas & Types
export const insertTeacherAvailabilitySchema = createInsertSchema(teacherAvailability).omit({ id: true, createdAt: true, updatedAt: true });
export type TeacherAvailability = typeof teacherAvailability.$inferSelect;
export type InsertTeacherAvailability = z.infer<typeof insertTeacherAvailabilitySchema>;

export const insertShiftTemplateSchema = createInsertSchema(shiftTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type ShiftTemplate = typeof shiftTemplates.$inferSelect;
export type InsertShiftTemplate = z.infer<typeof insertShiftTemplateSchema>;

// ==========================================
// SHIFT ASSIGNMENTS TABLE (Phân ca làm việc)
// ==========================================
export const shiftAssignments = pgTable("shift_assignments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  targetType: varchar("target_type", { length: 20 }).notNull(), // 'department' | 'role' | 'staff'
  targetId: uuid("target_id").notNull(),
  byWeekday: boolean("by_weekday").default(true).notNull(),
  shiftTemplateId: uuid("shift_template_id").references(() => shiftTemplates.id),
  weekdaySchedule: jsonb("weekday_schedule"), // { "1": ["shiftId"], "2": [...] } 0=Sun..6=Sat
  effectiveFrom: date("effective_from"),
  effectiveTo: date("effective_to"),
  status: varchar("status", { length: 20 }).default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertShiftAssignmentSchema = createInsertSchema(shiftAssignments).omit({ id: true, createdAt: true, updatedAt: true });
export type ShiftAssignment = typeof shiftAssignments.$inferSelect;
export type InsertShiftAssignment = z.infer<typeof insertShiftAssignmentSchema>;

// Schemas & Types (Existing ones below...)
export const insertLocationSchema = createInsertSchema(locations).omit({ id: true, createdAt: true, updatedAt: true });
export type Location = typeof locations.$inferSelect;

export const insertCourseSchema = createInsertSchema(courses).omit({ id: true, createdAt: true, updatedAt: true });
export type Course = typeof courses.$inferSelect;
export type InsertCourse = z.infer<typeof insertCourseSchema>;

export const insertCourseFeePackageSchema = createInsertSchema(courseFeePackages, {
  fee: z.coerce.string(),
  sessions: z.coerce.string(),
  totalAmount: z.coerce.string(),
}).omit({ id: true, createdAt: true, updatedAt: true });
export type CourseFeePackage = typeof courseFeePackages.$inferSelect;
export type InsertCourseFeePackage = z.infer<typeof insertCourseFeePackageSchema>;

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export type User = typeof users.$inferSelect;

export const insertStudentSchema = createInsertSchema(students).omit({ id: true, createdAt: true, updatedAt: true });
export type Student = typeof students.$inferSelect;
export type InsertStudent = z.infer<typeof insertStudentSchema>;

export const insertCrmPipelineGroupSchema = createInsertSchema(crmPipelineGroups).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCrmRelationshipSchema = createInsertSchema(crmRelationships).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCrmRejectReasonSchema = createInsertSchema(crmRejectReasons).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCrmCustomerSourceSchema = createInsertSchema(crmCustomerSources).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCrmSchoolSchema = createInsertSchema(crmSchools).omit({ id: true, createdAt: true, updatedAt: true });
export type CrmPipelineGroup = typeof crmPipelineGroups.$inferSelect;
export type CrmRelationship = typeof crmRelationships.$inferSelect;
export type CrmRejectReason = typeof crmRejectReasons.$inferSelect;
export type CrmCustomerSource = typeof crmCustomerSources.$inferSelect;
export type CrmSchool = typeof crmSchools.$inferSelect;
export type InsertCrmPipelineGroup = z.infer<typeof insertCrmPipelineGroupSchema>;
export type InsertCrmRelationship = z.infer<typeof insertCrmRelationshipSchema>;
export type InsertCrmRejectReason = z.infer<typeof insertCrmRejectReasonSchema>;
export type InsertCrmCustomerSource = z.infer<typeof insertCrmCustomerSourceSchema>;
export type InsertCrmSchool = z.infer<typeof insertCrmSchoolSchema>;

export const insertDepartmentSchema = createInsertSchema(departments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertRoleSchema = createInsertSchema(roles).omit({ id: true, createdAt: true, updatedAt: true });
export type Department = typeof departments.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type DepartmentWithRoles = Department & { roles: Role[] };

export const insertStaffSchema = createInsertSchema(staff).omit({ id: true, createdAt: true, updatedAt: true });
export type Staff = typeof staff.$inferSelect;
export type InsertStaff = z.infer<typeof insertStaffSchema>;

export type ClassDetail = {
  className: string;
  classCode: string;
  studentStatus: string;
  totalSessions: number;
  attendedSessions: number;
  remainingSessions: number;
};

export type ZaloChannelInfo = {
  zaloUserId: string;
  isFollowed: boolean;
  hasInteracted: boolean;
};

export type StudentResponse = Student & {
  location?: Location;
  user?: User;
  locations?: { locationId: string; location: Location }[];
  classDetails?: ClassDetail[];
  classNames?: string[];
  schoolList?: CrmSchool[];
  zaloChannel?: ZaloChannelInfo | null;
  lastComment?: { content: string; createdAt: string; authorName: string } | null;
};

// ==========================================
// SESSION CONTENTS (Common session content)
// ==========================================
export const sessionContents = pgTable("session_contents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  classSessionId: uuid("class_session_id").notNull().references(() => classSessions.id, { onDelete: "cascade" }),
  contentType: varchar("content_type", { length: 50 }).notNull(), // curriculum, lesson, homework, test
  title: text("title").notNull(),
  description: text("description"),
  resourceUrl: text("resource_url"),
  displayOrder: integer("display_order").default(0),
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ==========================================
// STUDENT SESSION CONTENTS (Personalized content)
// ==========================================
export const studentSessionContents = pgTable("student_session_contents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionContentId: uuid("session_content_id").notNull().references(() => sessionContents.id, { onDelete: "cascade" }),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  customTitle: text("custom_title"),
  customDescription: text("custom_description"),
  status: varchar("status", { length: 50 }),
  submissionContent: text("submission_content"),
  submissionAttachments: jsonb("submission_attachments").$type<string[]>(),
  score: varchar("score", { length: 20 }),
  gradingComment: text("grading_comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations are handled by foreign keys, no need for explicit Drizzle relations
// to avoid circular dependency issues

// Schemas & Types
export const insertSessionContentSchema = createInsertSchema(sessionContents).omit({ id: true, createdAt: true });
export type SessionContent = typeof sessionContents.$inferSelect;
export type InsertSessionContent = z.infer<typeof insertSessionContentSchema>;

export const insertStudentSessionContentSchema = createInsertSchema(studentSessionContents).omit({ id: true, createdAt: true });
export type StudentSessionContent = typeof studentSessionContents.$inferSelect;
export type InsertStudentSessionContent = z.infer<typeof insertStudentSessionContentSchema>;

// ==========================================
// FINANCE - TRANSACTION CATEGORIES (Danh mục Thu Chi)
// ==========================================
export const financeTransactionCategories = pgTable("finance_transaction_categories", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(), // 'income' | 'expense'
  isDefault: boolean("is_default").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFinanceTransactionCategorySchema = createInsertSchema(financeTransactionCategories).omit({ id: true, createdAt: true, updatedAt: true });
export type FinanceTransactionCategory = typeof financeTransactionCategories.$inferSelect;
export type InsertFinanceTransactionCategory = z.infer<typeof insertFinanceTransactionCategorySchema>;

// ==========================================
// FINANCE - PROMOTIONS & SURCHARGES (Khuyến mãi / Phụ thu)
// ==========================================
export const financePromotions = pgTable("finance_promotions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(), // 'promotion' | 'surcharge'
  valueAmount: decimal("value_amount", { precision: 12, scale: 2 }),
  valueType: varchar("value_type", { length: 10 }).default("percent"), // 'percent' | 'vnd'
  quantity: integer("quantity"),
  fromDate: date("from_date"),
  toDate: date("to_date"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFinancePromotionSchema = createInsertSchema(financePromotions).omit({ id: true, createdAt: true, updatedAt: true });
export type FinancePromotion = typeof financePromotions.$inferSelect;
export type InsertFinancePromotion = z.infer<typeof insertFinancePromotionSchema>;

// ==========================================
// FINANCE - VOUCHERS
// ==========================================
export const financeVouchers = pgTable("finance_vouchers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 80 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  audience: varchar("audience", { length: 20 }).notNull().default("all"), // all | specific | birthday
  birthdayMode: varchar("birthday_mode", { length: 20 }).default("exact"), // exact | month
  audienceStudentIds: uuid("audience_student_ids").array(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  valueAmount: decimal("value_amount", { precision: 12, scale: 2 }).notNull(),
  valueType: varchar("value_type", { length: 10 }).notNull().default("percent"), // percent | vnd
  quantity: integer("quantity"),
  usageLimit: varchar("usage_limit", { length: 20 }).notNull().default("once"), // once | multiple
  usedCount: integer("used_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  codeIdx: uniqueIndex("finance_vouchers_code_idx").on(table.code),
  activeDateIdx: index("finance_vouchers_active_date_idx").on(table.isActive, table.startDate, table.endDate),
}));

export const insertFinanceVoucherSchema = createInsertSchema(financeVouchers).omit({
  id: true,
  usedCount: true,
  createdAt: true,
  updatedAt: true,
});
export type FinanceVoucher = typeof financeVouchers.$inferSelect;
export type InsertFinanceVoucher = z.infer<typeof insertFinanceVoucherSchema>;

// Lịch sử sử dụng Voucher theo từng học viên và hoá đơn.
// Một Voucher có usageLimit = "multiple" có thể có nhiều dòng cho cùng học viên.
export const financeVoucherUsages = pgTable("finance_voucher_usages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  voucherId: uuid("voucher_id").notNull().references(() => financeVouchers.id, { onDelete: "cascade" }),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  usedAt: timestamp("used_at").defaultNow().notNull(),
}, (table) => ({
  voucherStudentIdx: index("finance_voucher_usages_voucher_student_idx").on(table.voucherId, table.studentId),
  invoiceIdx: index("finance_voucher_usages_invoice_idx").on(table.invoiceId),
  invoiceVoucherIdx: uniqueIndex("finance_voucher_usages_invoice_voucher_idx").on(table.invoiceId, table.voucherId),
}));

export const insertFinanceVoucherUsageSchema = createInsertSchema(financeVoucherUsages).omit({
  id: true,
  usedAt: true,
});
export type FinanceVoucherUsage = typeof financeVoucherUsages.$inferSelect;
export type InsertFinanceVoucherUsage = z.infer<typeof insertFinanceVoucherUsageSchema>;

// ==========================================
// CLASSROOMS (Phòng học)
// ==========================================
export const classrooms = pgTable("classrooms", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  capacity: integer("capacity"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertClassroomSchema = createInsertSchema(classrooms).omit({ id: true, createdAt: true, updatedAt: true });
export type Classroom = typeof classrooms.$inferSelect;
export type InsertClassroom = z.infer<typeof insertClassroomSchema>;

// ==========================================
// EVALUATION CRITERIA (Tiêu chí đánh giá)
// ==========================================
export const evaluationCriteria = pgTable("evaluation_criteria", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const evaluationSubCriteria = pgTable("evaluation_sub_criteria", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  criteriaId: uuid("criteria_id").notNull().references(() => evaluationCriteria.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertEvaluationCriteriaSchema = createInsertSchema(evaluationCriteria).omit({ id: true, createdAt: true, updatedAt: true });
export type EvaluationCriteria = typeof evaluationCriteria.$inferSelect;
export type InsertEvaluationCriteria = z.infer<typeof insertEvaluationCriteriaSchema>;

export const insertEvaluationSubCriteriaSchema = createInsertSchema(evaluationSubCriteria).omit({ id: true, createdAt: true, updatedAt: true });
export type EvaluationSubCriteria = typeof evaluationSubCriteria.$inferSelect;
export type InsertEvaluationSubCriteria = z.infer<typeof insertEvaluationSubCriteriaSchema>;

// ==========================================
// SUBJECTS (Bộ môn)
// ==========================================
export const subjects = pgTable("subjects", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSubjectSchema = createInsertSchema(subjects).omit({ id: true, createdAt: true, updatedAt: true });
export type Subject = typeof subjects.$inferSelect;
export type InsertSubject = z.infer<typeof insertSubjectSchema>;

// ==========================================
// TEACHER SALARY PACKAGES (Gói lương đứng lớp)
// ==========================================
export const teacherSalaryPackages = pgTable("teacher_salary_packages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // theo-gio, theo-buoi, theo-so-hv, tong-so-gio, tong-so-buoi
  role: varchar("role", { length: 100 }).notNull().default("Giáo viên"),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }),
  ranges: jsonb("ranges"), // for theo-so-hv, tong-so-gio, tong-so-buoi: [{from, to, price}]
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTeacherSalaryPackageSchema = createInsertSchema(teacherSalaryPackages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type TeacherSalaryPackage = typeof teacherSalaryPackages.$inferSelect;
export type InsertTeacherSalaryPackage = z.infer<typeof insertTeacherSalaryPackageSchema>;

// ==========================================
// TEACHER SALARY TABLES (Bảng lương giáo viên)
// ==========================================
export const teacherSalaryTables = pgTable("teacher_salary_tables", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const teacherSalaryTablesRelations = relations(teacherSalaryTables, ({ one }) => ({
  location: one(locations, { fields: [teacherSalaryTables.locationId], references: [locations.id] }),
  creator: one(users, { fields: [teacherSalaryTables.createdBy], references: [users.id] }),
}));

export const insertTeacherSalaryTableSchema = createInsertSchema(teacherSalaryTables).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type TeacherSalaryTable = typeof teacherSalaryTables.$inferSelect;
export type InsertTeacherSalaryTable = z.infer<typeof insertTeacherSalaryTableSchema>;

// ==========================================
// STAFF SALARY CONFIGS TABLE
// ==========================================
export const staffSalaryConfigs = pgTable("staff_salary_configs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  salaryPackageId: uuid("salary_package_id").notNull().references(() => teacherSalaryPackages.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStaffSalaryConfigSchema = createInsertSchema(staffSalaryConfigs).omit({ id: true, createdAt: true });
export type StaffSalaryConfig = typeof staffSalaryConfigs.$inferSelect;
export type InsertStaffSalaryConfig = z.infer<typeof insertStaffSalaryConfigSchema>;

// ==========================================
// ATTENDANCE FEE RULES
// ==========================================
export const attendanceFeeRules = pgTable("attendance_fee_rules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  attendanceStatus: varchar("attendance_status", { length: 100 }).notNull().unique(),
  deductsFee: boolean("deducts_fee").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAttendanceFeeRuleSchema = createInsertSchema(attendanceFeeRules).omit({ id: true, createdAt: true });
export type AttendanceFeeRule = typeof attendanceFeeRules.$inferSelect;
export type InsertAttendanceFeeRule = z.infer<typeof insertAttendanceFeeRuleSchema>;

// ==========================================
// SYSTEM SETTINGS
// ==========================================
export const systemSettings = pgTable("system_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==========================================
// BIDV LOCATION CONFIGS
// ==========================================
export const bidvLocationConfigs = pgTable("bidv_location_configs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: uuid("location_id").notNull().unique(),
  serviceId: varchar("service_id", { length: 100 }),
  merchantId: text("merchant_id"),
  secretCode: text("secret_code"),
  receiveAccount: varchar("receive_account", { length: 50 }),
  accountName: varchar("account_name", { length: 200 }),
  vaPrefix: varchar("va_prefix", { length: 10 }),
  isEnabled: boolean("is_enabled").default(false).notNull(),
  isQrEnabled: boolean("is_qr_enabled").default(true).notNull(),
  autoReconcile: boolean("auto_reconcile").default(false).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type BidvLocationConfig = typeof bidvLocationConfigs.$inferSelect;
export type InsertBidvLocationConfig = typeof bidvLocationConfigs.$inferInsert;

// ==========================================
// OMICALL LOCATION CONFIGS
// ==========================================
// Mỗi cơ sở/khách hàng có thể được Omicall cấp một bộ thông tin khác nhau.
// Auth key luôn được lưu ở dạng đã mã hóa, không lưu plaintext.
export const omicallLocationConfigs = pgTable("omicall_location_configs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: uuid("location_id").notNull().unique().references(() => locations.id, { onDelete: "cascade" }),
  serviceName: varchar("service_name", { length: 100 }).notNull().default("omicall"),
  authUser: varchar("auth_user", { length: 255 }),
  sipRealm: varchar("sip_realm", { length: 255 }),
  authKeyEncrypted: text("auth_key_encrypted"),
  hotline: varchar("hotline", { length: 50 }),
  callHistoryUrl: text("call_history_url"),
  autoCallUrl: text("auto_call_url"),
  isEnabled: boolean("is_enabled").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type OmicallLocationConfig = typeof omicallLocationConfigs.$inferSelect;
export type InsertOmicallLocationConfig = typeof omicallLocationConfigs.$inferInsert;

// ==========================================
// BIDV VIRTUAL ACCOUNTS
// ==========================================
export const bidvVirtualAccounts = pgTable("bidv_virtual_accounts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: uuid("student_id").references(() => students.id, { onDelete: "cascade" }),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
  scheduleId: uuid("schedule_id").references(() => invoicePaymentSchedule.id, { onDelete: "set null" }),
  locationId: uuid("location_id").notNull(),
  vaCode: varchar("va_code", { length: 50 }).notNull().unique(),
  type: varchar("type", { length: 20 }).notNull().default("student"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type BidvVirtualAccount = typeof bidvVirtualAccounts.$inferSelect;
export type InsertBidvVirtualAccount = typeof bidvVirtualAccounts.$inferInsert;

// ==========================================
// BIDV TRANSACTIONS (idempotency log)
// ==========================================
export const bidvTransactions = pgTable("bidv_transactions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  transactionId: varchar("transaction_id", { length: 200 }).notNull().unique(),
  vaCode: varchar("va_code", { length: 50 }).notNull(),
  invoiceId: uuid("invoice_id"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("processed"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BidvTransaction = typeof bidvTransactions.$inferSelect;
export type InsertBidvTransaction = typeof bidvTransactions.$inferInsert;

// ==========================================
// BIDV RECONCILIATION
// ==========================================
export const bidvReconciliationSessions = pgTable("bidv_reconciliation_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id", { length: 3 }).notNull(),
  serviceId: varchar("service_id", { length: 6 }),
  locationId: uuid("location_id"),
  reconcileDate: date("reconcile_date").notNull(),
  fileType: varchar("file_type", { length: 100 }).notNull().default("1"),
  requestType: varchar("request_type", { length: 2 }).notNull().default("1"),
  status: varchar("status", { length: 20 }).notNull().default("queued"),
  requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  recordCount: integer("record_count").notNull().default(0),
  totalAmount: decimal("total_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  errorCode: varchar("error_code", { length: 100 }),
  errorMessage: text("error_message"),
  requestId: varchar("request_id", { length: 100 }),
  signatureVerified: boolean("signature_verified").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  lookupIdx: index("bidv_recon_sessions_lookup_idx").on(table.providerId, table.reconcileDate, table.fileType),
  statusIdx: index("bidv_recon_sessions_status_idx").on(table.status),
  uniqueRequest: uniqueIndex("bidv_recon_sessions_unique_request_idx").on(
    table.providerId,
    table.reconcileDate,
    table.fileType,
  ),
}));

export const bidvReconciliationFiles = pgTable("bidv_reconciliation_files", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: uuid("session_id").notNull().references(() => bidvReconciliationSessions.id, { onDelete: "cascade" }).unique(),
  fileName: varchar("file_name", { length: 500 }),
  mimeType: varchar("mime_type", { length: 100 }).notNull().default("text/plain"),
  size: integer("size").notNull().default(0),
  checksum: varchar("checksum", { length: 128 }).notNull(),
  rawContent: text("raw_content").notNull(),
  rawResponseMetadata: jsonb("raw_response_metadata"),
  signatureVerified: boolean("signature_verified").notNull().default(false),
  encrypted: boolean("encrypted").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bidvReconciliationRecords = pgTable("bidv_reconciliation_records", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: uuid("session_id").notNull().references(() => bidvReconciliationSessions.id, { onDelete: "cascade" }),
  externalTransactionId: varchar("external_transaction_id", { length: 200 }),
  traceNumber: varchar("trace_number", { length: 100 }),
  vaCode: varchar("va_code", { length: 100 }),
  billId: varchar("bill_id", { length: 200 }),
  transactionDate: timestamp("transaction_date"),
  valueDate: timestamp("value_date"),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull().default("0"),
  transactionType: varchar("transaction_type", { length: 20 }),
  bankStatus: varchar("bank_status", { length: 20 }),
  bankDescription: text("bank_description"),
  currency: varchar("currency", { length: 3 }).notNull().default("VND"),
  channelCode: varchar("channel_code", { length: 20 }),
  serviceId: varchar("service_id", { length: 20 }),
  rawData: jsonb("raw_data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  sessionIdx: index("bidv_recon_records_session_idx").on(table.sessionId),
  externalIdx: index("bidv_recon_records_external_idx").on(table.externalTransactionId),
}));

export type BidvReconciliationSession = typeof bidvReconciliationSessions.$inferSelect;
export type InsertBidvReconciliationSession = typeof bidvReconciliationSessions.$inferInsert;
export type BidvReconciliationFile = typeof bidvReconciliationFiles.$inferSelect;
export type InsertBidvReconciliationFile = typeof bidvReconciliationFiles.$inferInsert;
export type BidvReconciliationRecord = typeof bidvReconciliationRecords.$inferSelect;
export type InsertBidvReconciliationRecord = typeof bidvReconciliationRecords.$inferInsert;

// ==========================================
// ROLE PERMISSIONS TABLE
// ==========================================
export const rolePermissions = pgTable("role_permissions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  resource: varchar("resource", { length: 500 }).notNull(),
  canView: boolean("can_view").default(false).notNull(),
  canViewAll: boolean("can_view_all").default(false).notNull(),
  canCreate: boolean("can_create").default(false).notNull(),
  canEdit: boolean("can_edit").default(false).notNull(),
  canDelete: boolean("can_delete").default(false).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  roleIdIdx: index("role_permissions_role_id_idx").on(table.roleId),
}));

export const insertRolePermissionSchema = createInsertSchema(rolePermissions).omit({ id: true, updatedAt: true });
export type RolePermission = typeof rolePermissions.$inferSelect;
export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;

// ==========================================
// SCORE CATEGORIES (Danh mục điểm)
// ==========================================
export const scoreCategories = pgTable("score_categories", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertScoreCategorySchema = createInsertSchema(scoreCategories).omit({ id: true, createdAt: true });
export type ScoreCategory = typeof scoreCategories.$inferSelect;
export type InsertScoreCategory = z.infer<typeof insertScoreCategorySchema>;

// ==========================================
// SCORE SHEETS (Bảng điểm)
// ==========================================
export const scoreSheets = pgTable("score_sheets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const scoreSheetsRelations = relations(scoreSheets, ({ many }) => ({
  items: many(scoreSheetItems),
}));

export const scoreSheetItems = pgTable("score_sheet_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  scoreSheetId: uuid("score_sheet_id").notNull().references(() => scoreSheets.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull().references(() => scoreCategories.id, { onDelete: "cascade" }),
  formula: varchar("formula", { length: 500 }).notNull().default(""),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const scoreSheetItemsRelations = relations(scoreSheetItems, ({ one }) => ({
  scoreSheet: one(scoreSheets, { fields: [scoreSheetItems.scoreSheetId], references: [scoreSheets.id] }),
  category: one(scoreCategories, { fields: [scoreSheetItems.categoryId], references: [scoreCategories.id] }),
}));

export const insertScoreSheetSchema = createInsertSchema(scoreSheets).omit({ id: true, createdAt: true });
export type ScoreSheet = typeof scoreSheets.$inferSelect;
export type InsertScoreSheet = z.infer<typeof insertScoreSheetSchema>;

export const insertScoreSheetItemSchema = createInsertSchema(scoreSheetItems).omit({ id: true, createdAt: true });
export type ScoreSheetItem = typeof scoreSheetItems.$inferSelect;
export type InsertScoreSheetItem = z.infer<typeof insertScoreSheetItemSchema>;

// ==========================================
// CLASS GRADE BOOKS (Sổ điểm lớp)
// ==========================================
export const classGradeBooks = pgTable("class_grade_books", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  classId: uuid("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  scoreSheetId: uuid("score_sheet_id").notNull().references(() => scoreSheets.id, { onDelete: "restrict" }),
  sessionId: uuid("session_id").references(() => classSessions.id, { onDelete: "set null" }),
  published: boolean("published").default(false).notNull(),
  excludedStudentIds: uuid("excluded_student_ids").array().notNull().default(sql`'{}'`),
  studentComments: jsonb("student_comments").default({}).notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const classGradeBookScores = pgTable("class_grade_book_scores", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  gradeBookId: uuid("grade_book_id").notNull().references(() => classGradeBooks.id, { onDelete: "cascade" }),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull().references(() => scoreCategories.id, { onDelete: "cascade" }),
  score: varchar("score", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const classGradeBookStudentComments = pgTable("class_grade_book_student_comments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  gradeBookId: uuid("grade_book_id").notNull().references(() => classGradeBooks.id, { onDelete: "cascade" }),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertClassGradeBookSchema = createInsertSchema(classGradeBooks).omit({ id: true, createdAt: true, updatedAt: true });
export type ClassGradeBook = typeof classGradeBooks.$inferSelect;
export type InsertClassGradeBook = z.infer<typeof insertClassGradeBookSchema>;

// ==========================================
// STUDENT WALLET TRANSACTIONS (Ví học phí)
// ==========================================
export const studentWalletTransactions = pgTable("student_wallet_transactions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
  type: varchar("type", { length: 10 }).notNull(), // 'credit' | 'debit'
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  category: varchar("category", { length: 100 }),
  action: varchar("action", { length: 255 }).notNull(),
  classId: uuid("class_id"),
  className: varchar("class_name", { length: 255 }),
  invoiceCode: varchar("invoice_code", { length: 50 }),
  invoiceDescription: text("invoice_description"),
  createdBy: uuid("created_by").references(() => users.id),
  createdByName: varchar("created_by_name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStudentWalletTransactionSchema = createInsertSchema(studentWalletTransactions).omit({ id: true, createdAt: true });
export type StudentWalletTransaction = typeof studentWalletTransactions.$inferSelect;
export type InsertStudentWalletTransaction = z.infer<typeof insertStudentWalletTransactionSchema>;

// ==========================================
// QUESTIONS (Ngân hàng câu hỏi)
// ==========================================
export const questions = pgTable("questions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  type: varchar("type", { length: 50 }).notNull(), // single_choice, multiple_choice, fill_blank, essay, matching
  title: text("title"),
  content: text("content").notNull(),
  mediaImageUrl: text("media_image_url"),
  mediaAudioUrl: text("media_audio_url"),
  options: jsonb("options"), // [{ id: "A", text: "..." }]
  correctAnswer: text("correct_answer"),
  score: decimal("score", { precision: 5, scale: 2 }).notNull().default("1"),
  difficulty: varchar("difficulty", { length: 20 }), // easy, medium, hard
  explanation: text("explanation"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertQuestionSchema = createInsertSchema(questions).omit({ id: true, createdAt: true, updatedAt: true });
export type Question = typeof questions.$inferSelect;
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;

export const insertClassGradeBookScoreSchema = createInsertSchema(classGradeBookScores).omit({ id: true, createdAt: true });
export type ClassGradeBookScore = typeof classGradeBookScores.$inferSelect;
export type InsertClassGradeBookScore = z.infer<typeof insertClassGradeBookScoreSchema>;

export const insertClassGradeBookStudentCommentSchema = createInsertSchema(classGradeBookStudentComments).omit({ id: true, createdAt: true, updatedAt: true });
export type ClassGradeBookStudentComment = typeof classGradeBookStudentComments.$inferSelect;

// ==========================================
// EXAMS (Danh sách bài kiểm tra)
// ==========================================
export const exams = pgTable("exams", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 50 }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 20 }).notNull().default("draft"), // draft | published
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
  timeLimitMinutes: integer("time_limit_minutes"),
  maxAttempts: integer("max_attempts").default(1),
  passingScore: decimal("passing_score", { precision: 5, scale: 2 }),
  showResult: boolean("show_result").default(false),
  openAt: timestamp("open_at"),
  closeAt: timestamp("close_at"),
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertExamSchema = createInsertSchema(exams).omit({ id: true, createdAt: true, updatedAt: true }).extend({
  openAt: z.coerce.date().optional().nullable(),
  closeAt: z.coerce.date().optional().nullable(),
});
export type Exam = typeof exams.$inferSelect;
export type InsertExam = z.infer<typeof insertExamSchema>;

// ==========================================
// EXAM SECTIONS (Phần / Session của bài kiểm tra)
// ==========================================
export const examSections = pgTable("exam_sections", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  examId: uuid("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // listening | speaking | reading | writing
  orderIndex: integer("order_index").notNull().default(0),
  readingPassageUrl: text("reading_passage_url"),
  readingPassageName: varchar("reading_passage_name", { length: 255 }),
  sessionAudioUrl: text("session_audio_url"),
  sessionAudioName: varchar("session_audio_name", { length: 255 }),
  aiGradingEnabled: boolean("ai_grading_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertExamSectionSchema = createInsertSchema(examSections).omit({ id: true, createdAt: true, updatedAt: true });
export type ExamSection = typeof examSections.$inferSelect;
export type InsertExamSection = z.infer<typeof insertExamSectionSchema>;

// ==========================================
// EXAM SECTION QUESTIONS (Câu hỏi trong section)
// ==========================================
export const examSectionQuestions = pgTable("exam_section_questions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sectionId: uuid("section_id").notNull().references(() => examSections.id, { onDelete: "cascade" }),
  questionId: uuid("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertExamSectionQuestionSchema = createInsertSchema(examSectionQuestions).omit({ id: true, createdAt: true });
export type ExamSectionQuestion = typeof examSectionQuestions.$inferSelect;
export type InsertExamSectionQuestion = z.infer<typeof insertExamSectionQuestionSchema>;

// ==========================================
// EXAM SUBMISSIONS (Bài làm của học viên)
// ==========================================
export const examSubmissions = pgTable("exam_submissions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  examId: uuid("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
  studentId: uuid("student_id").references(() => students.id, { onDelete: "set null" }),
  studentName: varchar("student_name", { length: 255 }),
  studentCode: varchar("student_code", { length: 50 }),
  classId: uuid("class_id").references(() => classes.id, { onDelete: "set null" }),
  answers: jsonb("answers").notNull().$type<Record<string, any>>(),
  score: decimal("score", { precision: 5, scale: 2 }),
  adjustedScore: decimal("adjusted_score", { precision: 5, scale: 2 }),
  comment: text("comment"),
  partScores: jsonb("part_scores").$type<Array<{ partName: string; correct: number; total: number; score: number }>>(),
  aiGradingResults: jsonb("ai_grading_results").$type<Record<string, {
    questionId: string;
    suggestedScore: number | null;
    maxScore: number;
    feedback: string;
    strengths: string;
    weaknesses: string;
    status: "pending" | "accepted" | "adjusted" | "error";
    gradedAt: string | null;
    startedAt?: string | null;
    durationMs?: number | null;
    provider?: "openai" | "gemini" | "groq" | string;
    errorReason?: string;
  }>>(),
  timeTakenSeconds: integer("time_taken_seconds"),
  startedAt: timestamp("started_at"),
  expiresAt: timestamp("expires_at"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertExamSubmissionSchema = createInsertSchema(examSubmissions).omit({ id: true, createdAt: true, updatedAt: true });
export type ExamSubmission = typeof examSubmissions.$inferSelect;
export type InsertExamSubmission = z.infer<typeof insertExamSubmissionSchema>;

// ==========================================
// EXAM SESSIONS (Kubernetes-safe session tracking)
// ==========================================
export const examSessions = pgTable("exam_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  examId: uuid("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at").notNull(),
  expiresAt: timestamp("expires_at"),
  status: varchar("status", { length: 20 }).notNull().default("active"), // active | submitted | expired
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userExamUnique: uniqueIndex("exam_sessions_user_exam_uidx").on(table.userId, table.examId),
  statusIdx: index("exam_sessions_status_idx").on(table.status),
  expiresAtIdx: index("exam_sessions_expires_at_idx").on(table.expiresAt),
}));

export type ExamSession = typeof examSessions.$inferSelect;

// ==========================================
// AI SETTINGS (Cấu hình tài khoản AI)
// ==========================================
export const aiSettings = pgTable("ai_settings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: varchar("provider", { length: 20 }).notNull(), // "openai" | "gemini" | "groq"
  apiKeyEncrypted: text("api_key_encrypted").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAiSettingsSchema = createInsertSchema(aiSettings).omit({ id: true, createdAt: true, updatedAt: true });
export type AiSettings = typeof aiSettings.$inferSelect;
export type InsertAiSettings = z.infer<typeof insertAiSettingsSchema>;

// ==========================================
// INVOICE PRINT TEMPLATES (Mẫu in hoá đơn)
// ==========================================
export const invoicePrintTemplates = pgTable("invoice_print_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  pageSize: varchar("page_size", { length: 20 }).notNull().default("A4"),
  orientation: varchar("orientation", { length: 20 }).notNull().default("portrait"),
  invoiceType: varchar("invoice_type", { length: 20 }).notNull().default("Thu"),
  scope: varchar("scope", { length: 20 }).notNull().default("general"),
  isDefault: boolean("is_default").notNull().default(false),
  html: text("html").notNull().default(""),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertInvoicePrintTemplateSchema = createInsertSchema(invoicePrintTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InvoicePrintTemplateRow = typeof invoicePrintTemplates.$inferSelect;
export type InsertInvoicePrintTemplate = z.infer<typeof insertInvoicePrintTemplateSchema>;

// ==========================================
// ZALO OA CONFIGS (Cấu hình Zalo Official Account)
// ==========================================
export const zaloOaConfigs = pgTable("zalo_oa_configs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "cascade" }),
  appId: varchar("app_id", { length: 100 }),
  appSecretEncrypted: text("app_secret_encrypted"),
  oaId: varchar("oa_id", { length: 100 }),
  oaName: varchar("oa_name", { length: 255 }),
  accessTokenEncrypted: text("access_token_encrypted"),
  refreshTokenEncrypted: text("refresh_token_encrypted"),
  tokenExpiredAt: timestamp("token_expired_at"),
  connectedAt: timestamp("connected_at"),
  isConnected: boolean("is_connected").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertZaloOaConfigSchema = createInsertSchema(zaloOaConfigs).omit({ id: true, createdAt: true, updatedAt: true });
export type ZaloOaConfig = typeof zaloOaConfigs.$inferSelect;
export type InsertZaloOaConfig = z.infer<typeof insertZaloOaConfigSchema>;

// ==========================================
// ZALO OA CONVERSATIONS (Hội thoại Zalo OA)
// ==========================================
export const zaloOaConversations = pgTable("zalo_oa_conversations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  zaloOaConfigId: uuid("zalo_oa_config_id").references(() => zaloOaConfigs.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "cascade" }),
  followerId: varchar("follower_id", { length: 100 }).notNull(),
  followerName: varchar("follower_name", { length: 255 }),
  followerAvatar: text("follower_avatar"),
  anonymousKey: text("anonymous_key"),
  isAnonymous: boolean("is_anonymous").notNull().default(false),
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at"),
  unreadCount: integer("unread_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ZaloOaConversation = typeof zaloOaConversations.$inferSelect;

// ==========================================
// ZALO OA MESSAGES (Tin nhắn Zalo OA)
// ==========================================
export const zaloOaMessages = pgTable("zalo_oa_messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: uuid("conversation_id").notNull().references(() => zaloOaConversations.id, { onDelete: "cascade" }),
  msgId: varchar("msg_id", { length: 200 }),
  direction: varchar("direction", { length: 10 }).notNull().default("inbound"), // inbound | outbound
  messageType: varchar("message_type", { length: 30 }).notNull().default("text"), // text | image | file | gif | sticker
  content: text("content"),
  attachments: jsonb("attachments"),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  msgIdUnique: uniqueIndex("zalo_oa_messages_msg_id_unique").on(t.msgId),
}));

export type ZaloOaMessage = typeof zaloOaMessages.$inferSelect;

// ==========================================
// PAYMENT GATEWAYS (Cổng thanh toán)
// ==========================================
export const paymentGateways = pgTable("payment_gateways", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: varchar("provider", { length: 50 }).notNull(), // "payos" | "momo" | "vnpay" | "zalopay" | ...
  displayName: varchar("display_name", { length: 100 }).notNull(),
  isActive: boolean("is_active").notNull().default(false),
  credentials: jsonb("credentials").notNull().default({}), // lưu các trường riêng theo từng provider
  locationId: uuid("location_id").references(() => locations.id), // cơ sở áp dụng
  appliedBankAccount: jsonb("applied_bank_account"), // ngân hàng nhận tiền: {bankName, bankAccount, accountHolder}
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPaymentGatewaySchema = createInsertSchema(paymentGateways).omit({ id: true, createdAt: true, updatedAt: true });
export type PaymentGateway = typeof paymentGateways.$inferSelect;
export type InsertPaymentGateway = z.infer<typeof insertPaymentGatewaySchema>;

// ==========================================
// TASK STATUSES (Trạng thái công việc)
// ==========================================
export const taskStatuses = pgTable("task_statuses", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 20 }).notNull().default("#6b7280"),
  isFixed: boolean("is_fixed").notNull().default(false),
  position: integer("position").notNull().default(0),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTaskStatusSchema = createInsertSchema(taskStatuses).omit({ id: true, createdAt: true, updatedAt: true });
export type TaskStatus = typeof taskStatuses.$inferSelect;
export type InsertTaskStatus = z.infer<typeof insertTaskStatusSchema>;

// ==========================================
// TASK LEVELS (Mức độ công việc)
// ==========================================
export const taskLevels = pgTable("task_levels", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 20 }).notNull().default("#6b7280"),
  position: integer("position").notNull().default(0),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTaskLevelSchema = createInsertSchema(taskLevels).omit({ id: true, createdAt: true, updatedAt: true });
export type TaskLevel = typeof taskLevels.$inferSelect;
export type InsertTaskLevel = z.infer<typeof insertTaskLevelSchema>;

// ==========================================
// TASKS (Công việc)
// ==========================================
export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content").default(""),
  locationIds: uuid("location_ids").array().notNull().default(sql`'{}'`),
  departmentId: uuid("department_id").references(() => departments.id),
  statusId: uuid("status_id").references(() => taskStatuses.id),
  levelId: uuid("level_id").references(() => taskLevels.id),
  dueDate: timestamp("due_date"),
  subjectIds: uuid("subject_ids").array().notNull().default(sql`'{}'`),
  managerIds: uuid("manager_ids").array().notNull().default(sql`'{}'`),
  assigneeIds: uuid("assignee_ids").array().notNull().default(sql`'{}'`),
  attachments: jsonb("attachments").default([]),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdIdx: index("tasks_status_id_idx").on(table.statusId),
  createdAtIdx: index("tasks_created_at_idx").on(table.createdAt),
  dueDateIdx: index("tasks_due_date_idx").on(table.dueDate),
  locationIdsGinIdx: index("tasks_location_ids_gin_idx").using("gin", table.locationIds),
  subjectIdsGinIdx: index("tasks_subject_ids_gin_idx").using("gin", table.subjectIds),
}));

export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true, updatedAt: true });
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

export const taskComments = pgTable("task_comments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => users.id),
  authorName: varchar("author_name", { length: 200 }).notNull().default(""),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TaskComment = typeof taskComments.$inferSelect;

// ==========================================
// NOTIFICATIONS (Thông báo)
// ==========================================
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull().default(""),
  content: text("content").notNull(),
  type: varchar("type", { length: 50 }).notNull().default("in-app"), // in-app, email, system
  category: varchar("category", { length: 100 }).default("general"), // general, task, invoice, assignment, class
  referenceId: uuid("reference_id"), // Optional: link to related entity
  referenceType: varchar("reference_type", { length: 50 }), // task, invoice, class, etc.
  referenceDate: varchar("reference_date", { length: 10 }), // YYYY-MM-DD of the related session/event
  // Đích điều hướng được khai rõ ngay lúc tạo notification — { screen, params }.
  // null = notification cũ (tạo trước khi có cột này) → mobile.routes.ts fallback sang resolveDeeplink() suy luận từ category/referenceType.
  deeplink: jsonb("deeplink").$type<{ screen: string; params?: Record<string, string> } | null>(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIsReadIdx: index("notifications_user_is_read_idx").on(table.userId, table.isRead),
  createdAtIdx: index("notifications_created_at_idx").on(table.createdAt),
}));

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });

// ==========================================
// CHAT GROUPS (Nhóm chat tuỳ chỉnh)
// ==========================================
export const chatGroups = pgTable("chat_groups", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 200 }).notNull(),
  tinodeTopicId: varchar("tinode_topic_id", { length: 100 }),
  classId: uuid("class_id").references(() => classes.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  /** true = chat riêng 1-1 (DM), false/null = nhóm thông thường */
  isDirectMessage: boolean("is_direct_message").default(false).notNull(),
}, (t) => [
  uniqueIndex("chat_groups_tinode_topic_id_uidx").on(t.tinodeTopicId),
]);

export const insertChatGroupSchema = createInsertSchema(chatGroups).omit({ id: true, createdAt: true });
export type InsertChatGroup = z.infer<typeof insertChatGroupSchema>;
export type ChatGroup = typeof chatGroups.$inferSelect;

export const chatGroupMembers = pgTable("chat_group_members", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid("group_id").notNull().references(() => chatGroups.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export type ChatGroupMember = typeof chatGroupMembers.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

// ==========================================
// ACTIVITY LOGS (Nhật ký hành động)
// ==========================================
export const activityLogs = pgTable("activity_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id),
  locationId: uuid("location_id").references(() => locations.id),
  classId: uuid("class_id").references(() => classes.id),
  action: varchar("action", { length: 255 }).notNull(),
  oldContent: text("old_content"),
  newContent: text("new_content"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  user: one(users, { fields: [activityLogs.userId], references: [users.id] }),
  location: one(locations, { fields: [activityLogs.locationId], references: [locations.id] }),
  class: one(classes, { fields: [activityLogs.classId], references: [classes.id] }),
}));

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({ id: true, createdAt: true });
export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

// ==========================================
// ONLINE LEARNING RULES (Cấu hình học online)
// ==========================================
export const onlineLearningRules = pgTable("online_learning_rules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  earlyEntryMinutes: integer("early_entry_minutes").notNull().default(0),
  lateEntryMinutes: integer("late_entry_minutes").notNull().default(0),
  earlyEndMinutes: integer("early_end_minutes").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type OnlineLearningRule = typeof onlineLearningRules.$inferSelect;
export type InsertOnlineLearningRule = typeof onlineLearningRules.$inferInsert;

// ==========================================
// TEACHER ATTENDANCE (Điểm danh giáo viên)
// ==========================================
export const teacherAttendance = pgTable("teacher_attendance", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  classSessionId: uuid("class_session_id").notNull().references(() => classSessions.id, { onDelete: "cascade" }),
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  checkInAt: timestamp("check_in_at"),
  checkOutAt: timestamp("check_out_at"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  sessionStaffUnique: uniqueIndex("teacher_attendance_session_staff_unique").on(t.classSessionId, t.staffId),
}));

export const teacherAttendanceRelations = relations(teacherAttendance, ({ one }) => ({
  classSession: one(classSessions, { fields: [teacherAttendance.classSessionId], references: [classSessions.id] }),
  staff: one(staff, { fields: [teacherAttendance.staffId], references: [staff.id] }),
}));

export type TeacherAttendance = typeof teacherAttendance.$inferSelect;
export type InsertTeacherAttendance = typeof teacherAttendance.$inferInsert;

// ==========================================
// CUSTOMER ACTIVITY LOGS (Nhật ký CRM)
// ==========================================
export const customerActivityLogs = pgTable("customer_activity_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: uuid("student_id").references(() => students.id, { onDelete: "set null" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  userName: varchar("user_name", { length: 255 }),
  action: varchar("action", { length: 50 }).notNull(),
  oldData: jsonb("old_data"),
  newData: jsonb("new_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const customerActivityLogsRelations = relations(customerActivityLogs, ({ one }) => ({
  student: one(students, { fields: [customerActivityLogs.studentId], references: [students.id] }),
  user: one(users, { fields: [customerActivityLogs.userId], references: [users.id] }),
}));

export type CustomerActivityLog = typeof customerActivityLogs.$inferSelect;
export type InsertCustomerActivityLog = typeof customerActivityLogs.$inferInsert;

// ─── Test Sessions ───────────────────────────────────────────────────────────
export const testSessions = pgTable("test_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 255 }).notNull(),
  locationId: uuid("location_id"),
  testDate: date("test_date").notNull(),
  timeStart: varchar("time_start", { length: 20 }).default(""),
  timeEnd: varchar("time_end", { length: 20 }).default(""),
  teacherIds: uuid("teacher_ids").array().default([]),
  examIds: uuid("exam_ids").array().default([]),
  assignmentIds: uuid("assignment_ids").array().default([]),
  studentIds: uuid("student_ids").array().default([]),
  studentCount: integer("student_count").default(0),
  studentResults: jsonb("student_results").default({}),
  contentSettings: jsonb("content_settings").$type<Record<string, { availableAt: string; maxAttempts: number }>>().default({}),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTestSessionSchema = createInsertSchema(testSessions).omit({ id: true, createdAt: true, updatedAt: true });
export type TestSession = typeof testSessions.$inferSelect;
export type InsertTestSession = typeof testSessions.$inferInsert;

// ─── Test Session Content Attempts ───────────────────────────────────────────
export const testSessionContentAttempts = pgTable("test_session_content_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  testSessionId: uuid("test_session_id").notNull(),
  studentId: uuid("student_id").notNull(),
  contentId: uuid("content_id").notNull(),
  contentType: varchar("content_type", { length: 50 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ==========================================
// STORE (KHO) MODULE
// ==========================================
export const storeWarehouses = pgTable("store_warehouses", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  locationId: uuid("location_id").references(() => locations.id),
  address: text("address"),
  minStock: integer("min_stock").default(0),
  maxStock: integer("max_stock"),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const storeSuppliers = pgTable("store_suppliers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  contactPerson: varchar("contact_person", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  taxCode: varchar("tax_code", { length: 50 }),
  note: text("note"),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const storeCategories = pgTable("store_categories", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const storeUnits = pgTable("store_units", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const storeColors = pgTable("store_colors", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  hex: varchar("hex", { length: 20 }).default("#ffffff"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const storeSizes = pgTable("store_sizes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const storeProducts = pgTable("store_products", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  categoryId: uuid("category_id").references(() => storeCategories.id, { onDelete: "set null" }),
  unitId: uuid("unit_id").references(() => storeUnits.id, { onDelete: "set null" }),
  supplierId: uuid("supplier_id").references(() => storeSuppliers.id, { onDelete: "set null" }),
  costPrice: decimal("cost_price", { precision: 15, scale: 2 }).default("0"),
  salePrice: decimal("sale_price", { precision: 15, scale: 2 }).default("0"),
  starPrice: integer("star_price"),
  description: text("description"),
  imageUrl: text("image_url"),
  hasVariants: boolean("has_variants").default(false),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type StoreProduct = typeof storeProducts.$inferSelect;

export const storeInventory = pgTable("store_inventory", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: uuid("product_id").notNull().references(() => storeProducts.id, { onDelete: "cascade" }),
  warehouseId: uuid("warehouse_id").notNull().references(() => storeWarehouses.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const storeReceipts = pgTable("store_receipts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
  warehouseId: uuid("warehouse_id").references(() => storeWarehouses.id, { onDelete: "set null" }),
  date: date("date").notNull(),
  supplierId: uuid("supplier_id").references(() => storeSuppliers.id, { onDelete: "set null" }),
  note: text("note"),
  discount: decimal("discount", { precision: 15, scale: 2 }).default("0"),
  discountType: varchar("discount_type", { length: 10 }).default("VND"),
  surcharge: decimal("surcharge", { precision: 15, scale: 2 }).default("0"),
  surchargeType: varchar("surcharge_type", { length: 10 }).default("VND"),
  hasInvoice: boolean("has_invoice").default(false),
  invoiceNote: text("invoice_note"),
  status: varchar("status", { length: 50 }).notNull().default("completed"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).default("0"),
  createdBy: uuid("created_by"),
  createdByName: varchar("created_by_name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const storeReceiptItems = pgTable("store_receipt_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  receiptId: uuid("receipt_id").notNull().references(() => storeReceipts.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => storeProducts.id, { onDelete: "set null" }),
  productCode: varchar("product_code", { length: 100 }).notNull(),
  productName: varchar("product_name", { length: 255 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  categoryId: uuid("category_id"),
  colorId: uuid("color_id"),
  sizeId: uuid("size_id"),
  unitId: uuid("unit_id"),
  costPrice: decimal("cost_price", { precision: 15, scale: 2 }).default("0"),
  salePrice: decimal("sale_price", { precision: 15, scale: 2 }).default("0"),
  starPrice: integer("star_price").default(0),
  totalStars: integer("total_stars").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type StoreReceipt = typeof storeReceipts.$inferSelect;
export type StoreReceiptItem = typeof storeReceiptItems.$inferSelect;

// ==========================================
// CENTER CONFIG (Định danh trung tâm - singleton)
// UUID sinh 1 lần duy nhất khi khởi tạo, không phụ thuộc domain/ENV
// ==========================================
// ==========================================
// NOTIFICATION TEMPLATES & SETTINGS
// ==========================================
export const notificationTemplates = pgTable("notification_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  channel: varchar("channel", { length: 50 }),
  variables: jsonb("variables"),
  enabled: boolean("enabled").default(true),
  znsTemplateId: varchar("zns_template_id", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type NotificationTemplate = typeof notificationTemplates.$inferSelect;

export const centerNotificationTemplates = pgTable(
  "center_notification_templates",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    centerId: uuid("center_id").notNull(),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
    templateCode: varchar("template_code", { length: 100 }).notNull(),
    znsTemplateId: varchar("zns_template_id", { length: 100 }),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    centerTemplatUniq: uniqueIndex("center_notification_templates_center_code_uniq").on(
      t.centerId,
      t.templateCode
    ),
  })
);

export type CenterNotificationTemplate = typeof centerNotificationTemplates.$inferSelect;

export const centerNotificationSettings = pgTable("center_notification_settings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  centerId: uuid("center_id").notNull().unique(),
  attendanceEnabled: boolean("attendance_enabled").default(true),
  classChangedEnabled: boolean("class_changed_enabled").default(true),
  tuitionEnabled: boolean("tuition_enabled").default(true),
  attendanceResultEnabled: boolean("attendance_result_enabled").default(true),
  zaloEnabled: boolean("zalo_enabled").default(false),
  smsEnabled: boolean("sms_enabled").default(false),
  emailEnabled: boolean("email_enabled").default(false),
  channelPriority: varchar("channel_priority", { length: 50 }).default("AUTO"),
  debtReminderConfig: jsonb("debt_reminder_config"),               // { before: DebtReminderRule, after: DebtReminderRule }
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CenterNotificationSettings = typeof centerNotificationSettings.$inferSelect;

export const studentNotificationChannels = pgTable("student_notification_channels", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: uuid("student_id").notNull(),
  centerId: uuid("center_id").notNull(),
  zaloUserId: text("zalo_user_id"),
  isFollowed: boolean("is_followed").default(false),
  hasInteracted: boolean("has_interacted").default(false),
  preferredChannel: varchar("preferred_channel", { length: 50 }).default("AUTO"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  studentCenterUniq: unique().on(t.studentId, t.centerId),
  studentIdIdx: index("student_notification_channels_student_id_idx").on(t.studentId),
}));

export type StudentNotificationChannel = typeof studentNotificationChannels.$inferSelect;

export const notificationLogs = pgTable("notification_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  centerId: uuid("center_id"),
  studentId: uuid("student_id"),
  type: varchar("type", { length: 100 }),
  channel: varchar("channel", { length: 50 }),
  status: varchar("status", { length: 50 }),
  payload: jsonb("payload"),
  errorMessage: text("error_message"),
  reason: varchar("reason", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type NotificationLog = typeof notificationLogs.$inferSelect;

export const shortLinks = pgTable("short_links", {
  code: text("code").primaryKey(),
  targetUrl: text("target_url").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
});

export type ShortLink = typeof shortLinks.$inferSelect;

export const centerConfig = pgTable("center_config", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  centerUrl: text("center_url").notNull().default(""),
  singletonKey: text("singleton_key").notNull().default("default"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  singletonKeyUnique: uniqueIndex("center_config_singleton_key_unique").on(t.singletonKey),
}));

export type CenterConfig = typeof centerConfig.$inferSelect;

// ==========================================
// SESSION (Express session store)
// ==========================================
export const session = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { mode: "date" }).notNull(),
});

// ==========================================
// STORE - INVENTORY RESERVATIONS
// ==========================================
export const storeInventoryReservations = pgTable("store_inventory_reservations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  productId: uuid("product_id").notNull(),
  warehouseId: uuid("warehouse_id").notNull(),
  quantity: integer("quantity").notNull().default(1),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type StoreInventoryReservation = typeof storeInventoryReservations.$inferSelect;
export type InsertStoreInventoryReservation = typeof storeInventoryReservations.$inferInsert;

// ==========================================
// STORE - ISSUE RECEIPTS (Phiếu xuất kho)
// ==========================================
export const storeIssueReceipts = pgTable("store_issue_receipts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code").notNull(),
  name: varchar("name").notNull(),
  locationId: uuid("location_id"),
  warehouseId: uuid("warehouse_id"),
  date: date("date").notNull(),
  recipientName: varchar("recipient_name"),
  note: text("note"),
  discount: numeric("discount").default("0"),
  discountType: varchar("discount_type").default("VND"),
  surcharge: numeric("surcharge").default("0"),
  surchargeType: varchar("surcharge_type").default("VND"),
  hasInvoice: boolean("has_invoice").default(false),
  invoiceNote: text("invoice_note"),
  paidAmount: numeric("paid_amount").default("0"),
  status: varchar("status").notNull().default("completed"),
  totalAmount: numeric("total_amount").default("0"),
  recipientId: uuid("recipient_id"),
  invoiceId: uuid("invoice_id"),
  createdBy: uuid("created_by"),
  createdByName: varchar("created_by_name"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export type StoreIssueReceipt = typeof storeIssueReceipts.$inferSelect;
export type InsertStoreIssueReceipt = typeof storeIssueReceipts.$inferInsert;

// ==========================================
// STORE - ISSUE RECEIPT ITEMS
// ==========================================
export const storeIssueReceiptItems = pgTable("store_issue_receipt_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  receiptId: uuid("receipt_id").notNull(),
  productId: uuid("product_id"),
  productCode: varchar("product_code").notNull(),
  productName: varchar("product_name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitId: uuid("unit_id"),
  unitName: varchar("unit_name"),
  salePrice: numeric("sale_price").default("0"),
  stockBefore: integer("stock_before").default(0),
  priceType: varchar("price_type", { length: 10 }).default("money"),
  starPrice: integer("star_price").default(0),
  totalStars: integer("total_stars").default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type StoreIssueReceiptItem = typeof storeIssueReceiptItems.$inferSelect;
export type InsertStoreIssueReceiptItem = typeof storeIssueReceiptItems.$inferInsert;

// ==========================================
// STORE - RESERVATION CONFIG
// ==========================================
export const storeReservationConfig = pgTable("store_reservation_config", {
  id: integer("id").primaryKey().default(1),
  sessionMinutes: integer("session_minutes").notNull().default(5),
  draftMinutes: integer("draft_minutes").notNull().default(1440),
});

export type StoreReservationConfig = typeof storeReservationConfig.$inferSelect;
export type InsertStoreReservationConfig = typeof storeReservationConfig.$inferInsert;

// ==========================================
// STORE - STOCK TRANSACTIONS
// ==========================================
export const storeStockTransactions = pgTable("store_stock_transactions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: uuid("product_id").notNull(),
  warehouseId: uuid("warehouse_id").notNull(),
  receiptId: uuid("receipt_id"),
  receiptCode: varchar("receipt_code"),
  type: varchar("type").notNull(),
  quantityDelta: integer("quantity_delta").notNull(),
  status: varchar("status").default("completed"),
  description: text("description"),
  createdBy: uuid("created_by"),
  createdByName: varchar("created_by_name"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type StoreStockTransaction = typeof storeStockTransactions.$inferSelect;
export type InsertStoreStockTransaction = typeof storeStockTransactions.$inferInsert;

// ==========================================
// STORE - TRANSFERS (Phiếu chuyển kho)
// ==========================================
export const storeTransfers = pgTable("store_transfers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code").notNull(),
  date: date("date").notNull(),
  fromWarehouseId: uuid("from_warehouse_id").notNull(),
  toWarehouseId: uuid("to_warehouse_id").notNull(),
  note: text("note"),
  status: varchar("status").notNull().default("draft"),
  createdBy: uuid("created_by"),
  createdByName: varchar("created_by_name"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  fromLocationId: uuid("from_location_id"),
  toLocationId: uuid("to_location_id"),
  hasReceiptIncome: boolean("has_receipt_income").notNull().default(false),
  hasReceiptExpense: boolean("has_receipt_expense").notNull().default(false),
});

export type StoreTransfer = typeof storeTransfers.$inferSelect;
export type InsertStoreTransfer = typeof storeTransfers.$inferInsert;

// ==========================================
// STORE - TRANSFER ITEMS
// ==========================================
export const storeTransferItems = pgTable("store_transfer_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  transferId: uuid("transfer_id").notNull(),
  productId: uuid("product_id").notNull(),
  productCode: varchar("product_code").notNull(),
  productName: varchar("product_name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price").notNull().default("0"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type StoreTransferItem = typeof storeTransferItems.$inferSelect;
export type InsertStoreTransferItem = typeof storeTransferItems.$inferInsert;

// ── Store Transfer Audit Logs (lịch sử phiếu chuyển kho) ────────────────────
// action: 'created' | 'edited' | 'confirmed' | 'deleted'
// old_content/new_content: snapshot các trường thay đổi hoặc full snapshot khi xóa
export const storeTransferAuditLogs = pgTable("store_transfer_audit_logs", {
  id:            uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  transferId:    text("transfer_id").notNull(),       // text vì phiếu có thể bị xóa vật lý
  transferCode:  varchar("transfer_code", { length: 50 }).notNull(),
  action:        varchar("action", { length: 20 }).notNull(),
  userId:        uuid("user_id"),
  userName:      varchar("user_name", { length: 255 }),
  fromLocationId: uuid("from_location_id").references(() => locations.id, { onDelete: "set null" }),
  oldContent:    jsonb("old_content"),
  newContent:    jsonb("new_content"),
  createdAt:     timestamp("created_at").defaultNow().notNull(),
});

export const insertStoreTransferAuditLogSchema = createInsertSchema(storeTransferAuditLogs).omit({ id: true, createdAt: true });
export type StoreTransferAuditLog = typeof storeTransferAuditLogs.$inferSelect;
export type InsertStoreTransferAuditLog = z.infer<typeof insertStoreTransferAuditLogSchema>;

// ==========================================
// STORE - STUDENT STAR TRANSACTIONS
// ==========================================
export const studentStarTransactions = pgTable("student_star_transactions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: uuid("student_id").notNull(),
  delta: integer("delta").notNull(),
  reason: text("reason"),
  receiptId: uuid("receipt_id"),
  receiptCode: varchar("receipt_code", { length: 50 }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type StudentStarTransaction = typeof studentStarTransactions.$inferSelect;
export type InsertStudentStarTransaction = typeof studentStarTransactions.$inferInsert;

// ==========================================
// TEACHER SALARY - PUBLISHED ROWS
// ==========================================
export const teacherSalaryPublishedRows = pgTable("teacher_salary_published_rows", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  salaryTableId: uuid("salary_table_id").notNull(),
  teacherId: uuid("teacher_id").notNull(),
  classId: uuid("class_id").notNull(),
  publishedAt: timestamp("published_at").notNull().default(sql`now()`),
}, (t) => ({
  uniqueSalaryTeacherClassPublished: unique().on(t.salaryTableId, t.teacherId, t.classId),
}));

export type TeacherSalaryPublishedRow = typeof teacherSalaryPublishedRows.$inferSelect;
export type InsertTeacherSalaryPublishedRow = typeof teacherSalaryPublishedRows.$inferInsert;

// ==========================================
// TEACHER SALARY - ROW PACKAGES
// ==========================================
export const teacherSalaryRowPackages = pgTable("teacher_salary_row_packages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  salaryTableId: uuid("salary_table_id").notNull(),
  teacherId: uuid("teacher_id").notNull(),
  classId: uuid("class_id").notNull(),
  packageId: uuid("package_id").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (t) => ({
  uniqueSalaryTeacherClass: unique().on(t.salaryTableId, t.teacherId, t.classId),
}));

export type TeacherSalaryRowPackage = typeof teacherSalaryRowPackages.$inferSelect;
export type InsertTeacherSalaryRowPackage = typeof teacherSalaryRowPackages.$inferInsert;

// ==========================================
// TEACHER SALARY - SESSION PACKAGES
// ==========================================
export const teacherSalarySessionPackages = pgTable("teacher_salary_session_packages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  salaryTableId: uuid("salary_table_id").notNull(),
  classSessionId: uuid("class_session_id").notNull(),
  teacherId: uuid("teacher_id").notNull(),
  packageId: uuid("package_id").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (t) => ({
  uniqueSalarySessionTeacher: unique().on(t.salaryTableId, t.classSessionId, t.teacherId),
}));

export type TeacherSalarySessionPackage = typeof teacherSalarySessionPackages.$inferSelect;
export type InsertTeacherSalarySessionPackage = typeof teacherSalarySessionPackages.$inferInsert;

// ==========================================
// ZALO - OAUTH STATES
// ==========================================
export const zaloOauthStates = pgTable("zalo_oauth_states", {
  id: varchar("id").primaryKey(),
  locationId: uuid("location_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
});

export type ZaloOauthState = typeof zaloOauthStates.$inferSelect;
export type InsertZaloOauthState = typeof zaloOauthStates.$inferInsert;

// ==========================================
// PUBLIC HOLIDAYS (Ngày nghỉ lễ)
// ==========================================
export const leaveRequests = pgTable("leave_requests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  staffId: uuid("staff_id").notNull(),
  locationId: uuid("location_id"),
  type: varchar("type", { length: 30 }).notNull(), // 'nghi_phep' | 'nghi_co_luong' | 'tang_ca'
  fromDate: date("from_date").notNull(),
  toDate: date("to_date").notNull(),
  hours: varchar("hours", { length: 20 }),
  overtimeFrom: varchar("overtime_from", { length: 5 }),
  overtimeTo: varchar("overtime_to", { length: 5 }),
  reason: text("reason"),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // 'pending' | 'approved' | 'rejected'
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLeaveRequestSchema = createInsertSchema(leaveRequests).omit({ id: true, createdAt: true, updatedAt: true });
export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type InsertLeaveRequest = typeof leaveRequests.$inferInsert;

export const staffRewards = pgTable("staff_rewards", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  staffId: uuid("staff_id").notNull(),
  type: varchar("type", { length: 10 }).notNull(), // 'reward' | 'penalty'
  date: date("date").notNull(),
  amount: integer("amount").notNull().default(0), // VND
  reason: text("reason"),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertStaffRewardSchema = createInsertSchema(staffRewards).omit({ id: true, createdAt: true, updatedAt: true });
export type StaffReward = typeof staffRewards.$inferSelect;
export type InsertStaffReward = typeof staffRewards.$inferInsert;

export const staffAdvances = pgTable("staff_advances", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  staffId: uuid("staff_id").notNull(),
  date: date("date").notNull(),
  documentDueDate: date("document_due_date"),
  amount: integer("amount").notNull().default(0),
  reason: text("reason"),
  items: jsonb("items").$type<Array<{ name: string; amount: number }>>().notNull().default([]),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertStaffAdvanceSchema = createInsertSchema(staffAdvances).omit({ id: true, createdAt: true, updatedAt: true });
export type StaffAdvance = typeof staffAdvances.$inferSelect;
export type InsertStaffAdvance = z.infer<typeof insertStaffAdvanceSchema>;

export const publicHolidays = pgTable("public_holidays", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PublicHoliday = typeof publicHolidays.$inferSelect;
export type InsertPublicHoliday = typeof publicHolidays.$inferInsert;

export const staffAttendances = pgTable("staff_attendances", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  staffId: uuid("staff_id").notNull(),
  workDate: date("work_date").notNull(),
  shiftTemplateId: uuid("shift_template_id"),
  timeIn: varchar("time_in", { length: 8 }),
  timeOut: varchar("time_out", { length: 8 }),
  workedHours: numeric("worked_hours").default("0"),
  tongCong: numeric("tong_cong").default("0"),
  note: text("note"),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, t => ({
  // Allow multiple rows per day (one per shift); unique per (staff, date, shift)
  staffDateShiftUniq: uniqueIndex("staff_attendances_staff_date_shift_uidx")
    .on(t.staffId, t.workDate, t.shiftTemplateId)
    .where(sql`shift_template_id IS NOT NULL`),
}));

export type StaffAttendance = typeof staffAttendances.$inferSelect;
export type InsertStaffAttendance = typeof staffAttendances.$inferInsert;


// ==========================================
// SALARY SHEETS (Bảng tổng lương)
// ==========================================
export const salarySheets = pgTable("salary_sheets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 20 }).notNull().unique(),
  locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  fromDate: date("from_date").notNull(),
  toDate: date("to_date").notNull(),
  note: text("note"),
  status: varchar("status", { length: 20 }).notNull().default("draft"), // draft | locked
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSalarySheetSchema = createInsertSchema(salarySheets).omit({ id: true, createdAt: true, updatedAt: true });
export type SalarySheet = typeof salarySheets.$inferSelect;
export type InsertSalarySheet = z.infer<typeof insertSalarySheetSchema>;

export const salarySheetEmployees = pgTable("salary_sheet_employees", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sheetId: uuid("sheet_id").notNull().references(() => salarySheets.id, { onDelete: "cascade" }),
  staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
  staffCode: varchar("staff_code", { length: 50 }),
  staffName: varchar("staff_name", { length: 255 }),
  locationName: varchar("location_name", { length: 255 }),
  roleName: varchar("role_name", { length: 255 }),
  soCong: numeric("so_cong").notNull().default("0"),
  luongCB: numeric("luong_cb", { precision: 15, scale: 2 }).notNull().default("0"),
  congThuc: numeric("cong_thuc").notNull().default("0"),
  luongTheoCong: numeric("luong_theo_cong", { precision: 15, scale: 2 }).notNull().default("0"),
  phuCap: numeric("phu_cap", { precision: 15, scale: 2 }).notNull().default("0"),
  thuong: numeric("thuong", { precision: 15, scale: 2 }).notNull().default("0"),
  phat: numeric("phat", { precision: 15, scale: 2 }).notNull().default("0"),
  luongDungLop: numeric("luong_dung_lop", { precision: 15, scale: 2 }).notNull().default("0"),
  tongLuong: numeric("tong_luong", { precision: 15, scale: 2 }).notNull().default("0"),
  bhxh: numeric("bhxh", { precision: 15, scale: 2 }).notNull().default("0"),
  bhyt: numeric("bhyt", { precision: 15, scale: 2 }).notNull().default("0"),
  bhtn: numeric("bhtn", { precision: 15, scale: 2 }).notNull().default("0"),
  thueTNCN: numeric("thue_tncn", { precision: 15, scale: 2 }).notNull().default("0"),
  tamUng: numeric("tam_ung", { precision: 15, scale: 2 }).notNull().default("0"),
  thucNhan: numeric("thuc_nhan", { precision: 15, scale: 2 }).notNull().default("0"),
  daChi: boolean("da_chi").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SalarySheetEmployee = typeof salarySheetEmployees.$inferSelect;

// ==========================================
// STAFF HR SALARY CONFIGS (Cấu hình lương nhân sự - HR)
// ==========================================
export const staffHrSalaryConfigs = pgTable("staff_hr_salary_configs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
  roleName: varchar("role_name", { length: 255 }),
  luongCB: numeric("luong_cb", { precision: 15, scale: 2 }).notNull().default("0"),
  phuCap: jsonb("phu_cap").notNull().default([]),          // [{name: string, amount: number}]
  bhxhBase: numeric("bhxh_base", { precision: 15, scale: 2 }).notNull().default("0"),
  bhxhPercent: numeric("bhxh_percent", { precision: 5, scale: 2 }).notNull().default("8"),
  bhytBase: numeric("bhyt_base", { precision: 15, scale: 2 }).notNull().default("0"),
  bhytPercent: numeric("bhyt_percent", { precision: 5, scale: 2 }).notNull().default("1.5"),
  bhtnPercent: numeric("bhtn_percent", { precision: 5, scale: 2 }).notNull().default("1"),
  thueTNCNMode: varchar("thue_tncn_mode", { length: 20 }).notNull().default("none"),  // 'none' | 'fixed'
  thueTNCNAmount: numeric("thue_tncn_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertStaffHrSalaryConfigSchema = createInsertSchema(staffHrSalaryConfigs).omit({ id: true, createdAt: true, updatedAt: true });
export type StaffHrSalaryConfig = typeof staffHrSalaryConfigs.$inferSelect;
export type InsertStaffHrSalaryConfig = z.infer<typeof insertStaffHrSalaryConfigSchema>;

// ==========================================
// SALARY DEFAULT CONFIG (Cấu hình mặc định - bảo hiểm & thuế TNCN)
// ==========================================
export const salaryDefaultConfigs = pgTable("salary_default_configs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  centerId: varchar("center_id", { length: 255 }).notNull().unique().default("default"),
  bhxhPercent: numeric("bhxh_percent", { precision: 5, scale: 2 }).notNull().default("8"),
  bhytPercent: numeric("bhyt_percent", { precision: 5, scale: 2 }).notNull().default("1.5"),
  bhtnPercent: numeric("bhtn_percent", { precision: 5, scale: 2 }).notNull().default("1"),
  giamTruBanThan: numeric("giam_tru_ban_than", { precision: 15, scale: 2 }).notNull().default("15500000"),
  giamTruNguoiPhuThuoc: numeric("giam_tru_nguoi_phu_thuoc", { precision: 15, scale: 2 }).notNull().default("6200000"),
  taxBrackets: jsonb("tax_brackets").notNull().default([
    { bac: 1, from: 0,         to: 10000000,  rate: "5"  },
    { bac: 2, from: 10000000,  to: 30000000,  rate: "10" },
    { bac: 3, from: 30000000,  to: 60000000,  rate: "20" },
    { bac: 4, from: 60000000,  to: 100000000, rate: "30" },
    { bac: 5, from: 100000000, to: null,      rate: "35" },
  ]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SalaryDefaultConfig = typeof salaryDefaultConfigs.$inferSelect;

// ==========================================
// SALARY ALLOWANCE TYPES (Danh mục Phụ thu mặc định)
// ==========================================
export const salaryAllowanceTypes = pgTable("salary_allowance_types", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  applyType: varchar("apply_type", { length: 20 }).notNull().default("fixed_month"), // 'fixed_month' | 'per_day'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SalaryAllowanceType = typeof salaryAllowanceTypes.$inferSelect;

// ==========================================
// CENTER REGISTRY (Multi-tenant routing)
// ==========================================
export const centerRegistry = pgTable("center_registry", {
  centerId: varchar("center_id", { length: 100 }).primaryKey(),
  centerUrl: text("center_url").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  registeredAt: timestamp("registered_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export type CenterRegistry = typeof centerRegistry.$inferSelect;
export type InsertCenterRegistry = typeof centerRegistry.$inferInsert;

// ==========================================
// FACEBOOK PAGE ROUTES (Multi-center routing)
// ==========================================
// Mỗi Facebook Page chỉ có 1 center chủ sở hữu tại một thời điểm.
// Gateway (main app tại center gốc) nhận webhook từ Facebook,
// tra bảng này theo pageId, rồi forward sang centerUrl tương ứng.
export const facebookPageRoutes = pgTable("facebook_page_routes", {
  pageId: varchar("page_id", { length: 100 }).primaryKey(),
  centerId: varchar("center_id", { length: 100 }).notNull(),
  centerUrl: text("center_url").notNull(),
  connectedAt: timestamp("connected_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  isActive: boolean("is_active").notNull().default(true),
});

export type FacebookPageRoute = typeof facebookPageRoutes.$inferSelect;
export type InsertFacebookPageRoute = typeof facebookPageRoutes.$inferInsert;

// ==========================================
// USER TENANT MAP (Zalo user → tenant mapping)
// ==========================================
export const userTenantMap = pgTable("user_tenant_map", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  zaloUserId: varchar("zalo_user_id", { length: 100 }).notNull().unique(),
  userId: varchar("user_id", { length: 100 }).notNull(),
  tenantId: varchar("tenant_id", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export type UserTenantMap = typeof userTenantMap.$inferSelect;
export type InsertUserTenantMap = typeof userTenantMap.$inferInsert;

// ==========================================
// ZALO ROUTING (OA → center routing)
// ==========================================
export const zaloRouting = pgTable("zalo_routing", {
  oaId: varchar("oa_id", { length: 100 }).primaryKey(),
  centerId: varchar("center_id", { length: 100 }).notNull(),
  centerUrl: text("center_url").notNull(),
  connectedAt: timestamp("connected_at").notNull().default(sql`now()`),
  isActive: boolean("is_active").notNull().default(true),
});

export type ZaloRouting = typeof zaloRouting.$inferSelect;
export type InsertZaloRouting = typeof zaloRouting.$inferInsert;

// ==========================================
// NEWS FEED
// ==========================================
export const newsFeedPosts = pgTable("news_feed_posts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  authorId: uuid("author_id").notNull().references(() => users.id),
  authorName: varchar("author_name", { length: 255 }).notNull(),
  authorRole: varchar("author_role", { length: 255 }),
  category: varchar("category", { length: 50 }).notNull().default("thong-bao"),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  imageUrls: jsonb("image_urls").$type<string[]>(),
  isPinned: boolean("is_pinned").default(false),
  locationId: uuid("location_id"),
  /** Danh sách cơ sở mà bài viết này hiển thị. NULL = hiển thị cho tất cả (legacy). */
  postLocationIds: jsonb("post_location_ids").$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("news_feed_posts_author_idx").on(t.authorId),
  index("news_feed_posts_created_at_idx").on(t.createdAt),
  index("news_feed_posts_location_idx").on(t.locationId),
]);

export type NewsFeedPost = typeof newsFeedPosts.$inferSelect;
export type InsertNewsFeedPost = typeof newsFeedPosts.$inferInsert;

export const newsFeedReactions = pgTable("news_feed_reactions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: uuid("post_id").notNull().references(() => newsFeedPosts.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reaction: varchar("reaction", { length: 10 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("news_feed_reactions_post_idx").on(t.postId),
  unique("news_feed_reactions_post_user_uniq").on(t.postId, t.userId),
]);

export type NewsFeedReaction = typeof newsFeedReactions.$inferSelect;
export type InsertNewsFeedReaction = typeof newsFeedReactions.$inferInsert;

// ── Push Tokens (Expo Push Notification) ─────────────────────────────────────
export const pushTokens = pgTable("push_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  pushToken: text("push_token").notNull().unique(),
  platform: varchar("platform", { length: 10 }).notNull(), // "android" | "ios"
  /**
   * Expo EAS projectId ghi nhận lúc thiết bị đăng ký token (Constants.expoConfig.extra.eas.projectId).
   * Dùng để nhận diện token "rác" thuộc project Expo cũ sau khi migrate sang project/tài khoản khác —
   * null = token đăng ký từ trước khi field này tồn tại (không rõ nguồn gốc, không tự động dọn).
   */
  expoProjectId: text("expo_project_id"),
  /** false = token đã bị logout, Expo thu hồi, hoặc thuộc project Expo cũ (soft delete) */
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("push_tokens_user_idx").on(t.userId),
]);

export type PushToken = typeof pushTokens.$inferSelect;
export type InsertPushToken = typeof pushTokens.$inferInsert;

// ==========================================
// AI CONVERSATIONS (OpenAI chat threads)
// ==========================================
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

// ==========================================
// GATEWAY REGISTRY
// ==========================================
// Bảng routing cho BIDV Gateway.
// provider + routing_key (service_id từ BIDV) → base_url của backend trung tâm.
// center_id tham chiếu center_config.id để xác định self-route — không phụ thuộc domain.
export const gatewayRegistry = pgTable("gateway_registry", {
  id:         uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  provider:   text("provider").notNull(),
  routingKey: text("routing_key").notNull(),
  centerId:   uuid("center_id"),
  name:       text("name").notNull(),
  baseUrl:    text("base_url").notNull(),
  isActive:   boolean("is_active").notNull().default(true),
  createdAt:  timestamp("created_at").defaultNow(),
  updatedAt:  timestamp("updated_at").defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("gateway_registry_provider_key_idx").on(t.provider, t.routingKey),
}));

export type GatewayRegistry = typeof gatewayRegistry.$inferSelect;
export type InsertGatewayRegistry = typeof gatewayRegistry.$inferInsert;

// ==========================================
// DEBT REMINDER ONCE-SENT LOG
// ==========================================
export const debtReminderOnceSent = pgTable("debt_reminder_once_sent", {
  centerId:    text("center_id").notNull(),
  scheduleId:  text("schedule_id").notNull(),
  ruleType:    text("rule_type").notNull(),   // 'before' | 'after'
  windowStart: text("window_start").notNull(), // 'YYYY-MM-DD'
  sentAt:      timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.centerId, t.scheduleId, t.ruleType, t.windowStart] }),
}));

export type DebtReminderOnceSent = typeof debtReminderOnceSent.$inferSelect;
export type InsertDebtReminderOnceSent = typeof debtReminderOnceSent.$inferInsert;

// ==========================================
// INVOICE AUDIT LOG (Lịch sử hoá đơn)
// ==========================================
export const invoiceAuditLogs = pgTable("invoice_audit_logs", {
  id:          uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId:   uuid("invoice_id"),                         // nullable: hoá đơn có thể đã bị xoá
  invoiceCode: varchar("invoice_code", { length: 50 }),
  invoiceType: varchar("invoice_type", { length: 20 }),    // 'Thu' | 'Chi'
  subjectName: text("subject_name"),
  grandTotal:  numeric("grand_total", { precision: 15, scale: 2 }),
  action:      varchar("action", { length: 100 }).notNull(), // 'Sửa hoá đơn' | 'Xoá hoá đơn' | 'Huỷ thanh toán hoá đơn'
  userId:      uuid("user_id").references(() => users.id),
  locationId:  uuid("location_id").references(() => locations.id),
  oldContent:  jsonb("old_content"),                       // snapshot trạng thái trước
  newContent:  jsonb("new_content"),                       // snapshot trạng thái sau
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});

export const invoiceAuditLogsRelations = relations(invoiceAuditLogs, ({ one }) => ({
  user:     one(users,     { fields: [invoiceAuditLogs.userId],     references: [users.id] }),
  location: one(locations, { fields: [invoiceAuditLogs.locationId], references: [locations.id] }),
}));

export const insertInvoiceAuditLogSchema = createInsertSchema(invoiceAuditLogs).omit({ id: true, createdAt: true });
export type InvoiceAuditLog = typeof invoiceAuditLogs.$inferSelect;
export type InsertInvoiceAuditLog = z.infer<typeof insertInvoiceAuditLogSchema>;

// ==========================================
// COURSE AUDIT LOG (Lịch sử thao tác khoá học)
// ==========================================
export const courseAuditLogs = pgTable("course_audit_logs", {
  id:          uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  scope:       varchar("scope", { length: 30 }).notNull(), // courses | programs | library
  entityType:  varchar("entity_type", { length: 50 }).notNull(), // course | fee_package | program | content
  entityId:    text("entity_id"),
  entityCode:  varchar("entity_code", { length: 100 }),
  entityName:  text("entity_name"),
  action:      varchar("action", { length: 30 }).notNull(), // created | updated | deleted
  userId:      uuid("user_id").references(() => users.id),
  locationId:  uuid("location_id").references(() => locations.id),
  oldContent:  jsonb("old_content"),
  newContent:  jsonb("new_content"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});

export const insertCourseAuditLogSchema = createInsertSchema(courseAuditLogs).omit({ id: true, createdAt: true });
export type CourseAuditLog = typeof courseAuditLogs.$inferSelect;
export type InsertCourseAuditLog = z.infer<typeof insertCourseAuditLogSchema>;

// ==========================================
// ASSESSMENT AUDIT LOG (Lịch sử kiểm tra & đánh giá)
// ==========================================
export const assessmentAuditLogs = pgTable("assessment_audit_logs", {
  id:          uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  scope:       varchar("scope", { length: 30 }).notNull(), // list | question-bank | results
  entityType:  varchar("entity_type", { length: 50 }).notNull(), // exam | question | submission
  entityId:    text("entity_id"),
  entityCode:  varchar("entity_code", { length: 100 }),
  entityName:  text("entity_name"),
  action:      varchar("action", { length: 30 }).notNull(), // created | updated | deleted
  userId:      uuid("user_id").references(() => users.id),
  locationId:  uuid("location_id").references(() => locations.id),
  oldContent:  jsonb("old_content"),
  newContent:  jsonb("new_content"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  createdAtIdx: index("assessment_audit_logs_created_at_idx").on(table.createdAt),
  scopeActionIdx: index("assessment_audit_logs_scope_action_idx").on(table.scope, table.action),
}));

export const insertAssessmentAuditLogSchema = createInsertSchema(assessmentAuditLogs).omit({ id: true, createdAt: true });
export type AssessmentAuditLog = typeof assessmentAuditLogs.$inferSelect;
export type InsertAssessmentAuditLog = z.infer<typeof insertAssessmentAuditLogSchema>;

// ─── Store Receipt Audit Logs ─────────────────────────────────────────────────
// Lưu lịch sử sửa/xóa phiếu nhập kho. Tương tự invoice_audit_logs.
// action: 'edited' | 'deleted'
// old_content/new_content: chỉ các trường thay đổi (edited) hoặc full snapshot (deleted)
export const storeReceiptAuditLogs = pgTable("store_receipt_audit_logs", {
  id:          uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  receiptId:   text("receipt_id"),                               // nullable: phiếu đã bị xóa vật lý
  receiptCode: varchar("receipt_code", { length: 50 }),
  action:      varchar("action", { length: 50 }).notNull(),      // 'edited' | 'deleted'
  userId:      uuid("user_id").references(() => users.id),
  userName:    varchar("user_name", { length: 255 }),
  locationId:  uuid("location_id").references(() => locations.id),
  oldContent:  jsonb("old_content"),
  newContent:  jsonb("new_content"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});
export const insertStoreReceiptAuditLogSchema = createInsertSchema(storeReceiptAuditLogs).omit({ id: true, createdAt: true });
export type StoreReceiptAuditLog = typeof storeReceiptAuditLogs.$inferSelect;
export type InsertStoreReceiptAuditLog = z.infer<typeof insertStoreReceiptAuditLogSchema>;

// ── Store Issue Receipt Audit Logs (lịch sử phiếu xuất kho) ─────────────────
export const storeIssueReceiptAuditLogs = pgTable("store_issue_receipt_audit_logs", {
  id:          uuid("id").primaryKey().defaultRandom(),
  receiptId:   text("receipt_id"),
  receiptCode: varchar("receipt_code", { length: 50 }),
  action:      varchar("action", { length: 50 }).notNull(),
  userId:      uuid("user_id").references(() => users.id),
  userName:    varchar("user_name", { length: 255 }),
  locationId:  uuid("location_id").references(() => locations.id),
  oldContent:  jsonb("old_content"),
  newContent:  jsonb("new_content"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});
export const insertStoreIssueReceiptAuditLogSchema = createInsertSchema(storeIssueReceiptAuditLogs).omit({ id: true, createdAt: true });
export type StoreIssueReceiptAuditLog = typeof storeIssueReceiptAuditLogs.$inferSelect;
export type InsertStoreIssueReceiptAuditLog = z.infer<typeof insertStoreIssueReceiptAuditLogSchema>;

// ─── S3 File Upload Log ───────────────────────────────────────────────────────
// Maps each uploaded S3 URL to its byte size so we can subtract on delete.
export const s3FileLogs = pgTable("s3_file_logs", {
  url:       text("url").primaryKey(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Facebook Fanpage Chat ────────────────────────────────────────────────────

export const facebookPageConfigs = pgTable("facebook_page_configs", {
  id:                       uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId:               uuid("location_id").references(() => locations.id, { onDelete: "cascade" }),
  pageId:                   varchar("page_id").notNull(),
  pageName:                 varchar("page_name"),
  pageAvatar:               text("page_avatar"),
  pageAccessTokenEncrypted: text("page_access_token_encrypted").notNull(),
  verifyToken:              varchar("verify_token").notNull(),
  isConnected:              boolean("is_connected").notNull().default(true),
  createdAt:                timestamp("created_at").defaultNow().notNull(),
  updatedAt:                timestamp("updated_at").defaultNow().notNull(),
});
export type FacebookPageConfig    = typeof facebookPageConfigs.$inferSelect;
export type InsertFacebookPageConfig = typeof facebookPageConfigs.$inferInsert;

export const facebookConversations = pgTable("facebook_conversations", {
  id:                   uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  facebookPageConfigId: uuid("facebook_page_config_id").references(() => facebookPageConfigs.id, { onDelete: "cascade" }),
  locationId:           uuid("location_id").references(() => locations.id, { onDelete: "cascade" }),
  psid:                 varchar("psid").notNull(),
  userName:             varchar("user_name"),
  userAvatar:           text("user_avatar"),
  lastMessage:          text("last_message"),
  lastMessageAt:        timestamp("last_message_at"),
  unreadCount:          integer("unread_count").notNull().default(0),
  studentId:            uuid("student_id").references(() => students.id, { onDelete: "set null" }),
  createdAt:            timestamp("created_at").defaultNow().notNull(),
  updatedAt:            timestamp("updated_at").defaultNow().notNull(),
});
export type FacebookConversation    = typeof facebookConversations.$inferSelect;
export type InsertFacebookConversation = typeof facebookConversations.$inferInsert;

export const facebookMessages = pgTable("facebook_messages", {
  id:             uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: uuid("conversation_id").notNull().references(() => facebookConversations.id, { onDelete: "cascade" }),
  mid:            varchar("mid"),
  direction:      varchar("direction").notNull().default("inbound"),
  messageType:    varchar("message_type").notNull().default("text"),
  content:        text("content"),
  attachments:    jsonb("attachments"),
  sentAt:         timestamp("sent_at").defaultNow().notNull(),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  midIdx: index("facebook_messages_mid_idx").on(table.mid),
}));
export type FacebookMessage    = typeof facebookMessages.$inferSelect;
export type InsertFacebookMessage = typeof facebookMessages.$inferInsert;

// ─── Invoice Code Sequences ───────────────────────────────────────────────────
// Per-location atomic counters for invoice code generation (PT/PC per location).
// key = e.g. "PT_<locationId>" or "PC_<locationId>"; current_value increments atomically.
export const invoiceCodeSequences = pgTable("invoice_code_sequences", {
  key:          text("key").primaryKey(),
  currentValue: integer("current_value").notNull().default(0),
});
