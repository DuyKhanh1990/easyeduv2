export { db } from "../db";

export {
  eq, sql, and, inArray, asc, desc, or, ilike, gte, lte, isNull,
} from "drizzle-orm";

export { format, parseISO } from "date-fns";

export {
  users, locations, staff, students, departments, roles,
  departmentsRelations, rolesRelations,
  crmRelationships, crmRejectReasons, crmCustomerSources,
  courses, courseFeePackages,
  coursePrograms,
  courseProgramContents,
  staffAssignments, studentLocations,
  shiftTemplates, teacherAvailability,
  classes, classSessions, studentClasses, studentSessions,
  classSessionExclusions,
  sessionContents, studentSessionContents,
  invoices, invoiceItems, invoicePaymentSchedule, invoiceSessionAllocations, studentComments,
  invoicePrintTemplates,
  financeTransactionCategories, financePromotions,
  rolePermissions,
  questions,
  exams,
  examSections,
  examSectionQuestions,
  examSubmissions,
  studentRelationshipHistory,
} from "@shared/schema";

export type {
  User,
  Location,
  Staff, InsertStaff,
  Student, InsertStudent, StudentResponse,
  Department, InsertDepartment, Role, InsertRole, DepartmentWithRoles,
  CrmRelationship, InsertCrmRelationship,
  CrmRejectReason, InsertCrmRejectReason,
  CrmCustomerSource, InsertCrmCustomerSource,
  Course, InsertCourse, CourseFeePackage, InsertCourseFeePackage,
  CourseProgram, CourseProgramContent,
  ShiftTemplate, InsertShiftTemplate,
  TeacherAvailability, InsertTeacherAvailability,
  Class, ClassSession,
  SessionContent, InsertSessionContent,
  StudentSessionContent, InsertStudentSessionContent,
  StudentComment, InsertStudentComment,
  FinanceTransactionCategory, InsertFinanceTransactionCategory,
  FinancePromotion, InsertFinancePromotion,
  Invoice, InvoiceItem, InvoicePaymentSchedule,
  RolePermission,
  Question, InsertQuestion,
  InvoicePrintTemplateRow, InsertInvoicePrintTemplate,
  Exam, InsertExam,
  ExamSection, InsertExamSection,
  ExamSectionQuestion, InsertExamSectionQuestion,
} from "@shared/schema";

export const getDayName = (dateStr: string): string => {
  const days = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  return days[new Date(dateStr).getDay()];
};
