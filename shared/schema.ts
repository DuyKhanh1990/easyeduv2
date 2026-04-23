import { pgTable, text, varchar, timestamp, boolean, uuid, decimal, date, integer, jsonb } from "drizzle-orm/pg-core";
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
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
});

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
});

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
});

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
  createdAt: timestamp("created_at").defaultNow(),
});

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
  note: text("note"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
});

// ==========================================
// CRM CONFIGURATION TABLES
// ==========================================
export const crmRelationships = pgTable("crm_relationships", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  color: varchar("color", { length: 50 }).notNull().default("#3b82f6"),
  position: varchar("position", { length: 100 }),
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
  tinodeTopicId: varchar("tinode_topic_id", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    locationIdx: sql`INDEX ON ${table.locationId}`,
    statusIdx: sql`INDEX ON ${table.status}`,
    dateCheck: sql`CHECK (end_date > start_date)`,
    weekdaysCheck: sql`CHECK (array_length(weekdays, 1) > 0)`,
  };
});

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
}, (table) => {
  return {
    classDateIdx: sql`INDEX ON ${table.classId}, ${table.sessionDate}`,
    roomConflictIdx: sql`INDEX ON ${table.roomId}, ${table.sessionDate}, ${table.shiftTemplateId}`,
  };
});

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
  name: varchar("name", { length: 100 }).notNull(),
  startTime: text("start_time").notNull(), // Using text for simplicity in JS, maps to TIME in DB
  endTime: text("end_time").notNull(),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  status: varchar("status", { length: 20 }).default("active"),
  note: text("note"),
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

export const insertCrmRelationshipSchema = createInsertSchema(crmRelationships).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCrmRejectReasonSchema = createInsertSchema(crmRejectReasons).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCrmCustomerSourceSchema = createInsertSchema(crmCustomerSources).omit({ id: true, createdAt: true, updatedAt: true });
export type CrmRelationship = typeof crmRelationships.$inferSelect;
export type CrmRejectReason = typeof crmRejectReasons.$inferSelect;
export type CrmCustomerSource = typeof crmCustomerSources.$inferSelect;
export type InsertCrmRelationship = z.infer<typeof insertCrmRelationshipSchema>;
export type InsertCrmRejectReason = z.infer<typeof insertCrmRejectReasonSchema>;
export type InsertCrmCustomerSource = z.infer<typeof insertCrmCustomerSourceSchema>;

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

export type StudentResponse = Student & {
  location?: Location;
  user?: User;
  locations?: { locationId: string; location: Location }[];
  classDetails?: ClassDetail[];
  classNames?: string[];
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
});

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

export const insertExamSchema = createInsertSchema(exams).omit({ id: true, createdAt: true, updatedAt: true });
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
    suggestedScore: number;
    maxScore: number;
    feedback: string;
    strengths: string;
    weaknesses: string;
    status: "pending" | "accepted" | "adjusted";
    gradedAt: string;
  }>>(),
  timeTakenSeconds: integer("time_taken_seconds"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertExamSubmissionSchema = createInsertSchema(examSubmissions).omit({ id: true, createdAt: true, updatedAt: true });
export type ExamSubmission = typeof examSubmissions.$inferSelect;
export type InsertExamSubmission = z.infer<typeof insertExamSubmissionSchema>;

// ==========================================
// AI SETTINGS (Cấu hình tài khoản AI)
// ==========================================
export const aiSettings = pgTable("ai_settings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: varchar("provider", { length: 20 }).notNull(), // "openai" | "gemini"
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
});

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
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });

// ==========================================
// CHAT GROUPS (Nhóm chat tuỳ chỉnh)
// ==========================================
export const chatGroups = pgTable("chat_groups", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 200 }).notNull(),
  tinodeTopicId: varchar("tinode_topic_id", { length: 100 }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
