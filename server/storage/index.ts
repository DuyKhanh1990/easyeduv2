// Storage module index
// Mỗi module quản lý một domain riêng biệt:
//   staff.storage.ts      — Locations, Departments, Roles, Staff
//   student.storage.ts    — Students, CRM Configuration, Comments, StudentClasses
//   finance.storage.ts    — Invoices, Transaction Categories, Promotions
//   course.storage.ts     — Courses, Fee Packages, Course Programs, Tuition
//   class.storage.ts      — Classes & Class Sessions CRUD
//   session.storage.ts    — Session lifecycle, Student Sessions, Session Contents
//   attendance.storage.ts — Attendance updates (updateAttendanceStatus, bulkUpdateAttendance)
//   shift.storage.ts      — Shift Templates, Teacher Availability
//
// storage.ts (DatabaseStorage) delegate toàn bộ sang các module này.

export * from "./staff.storage";
export * from "./student.storage";
export * from "./finance.storage";
export * from "./course.storage";
export * from "./class.storage";
export * from "./session.storage";
export * from "./session-content.storage";
export * from "./attendance.storage";
export * from "./shift.storage";
export * from "./teacher-salary.storage";
export * from "./permissions.storage";
export * from "./invoice-session-allocation.storage";
export * from "./attendance-fee-rule.storage";
export * from "./activity-log.storage";
