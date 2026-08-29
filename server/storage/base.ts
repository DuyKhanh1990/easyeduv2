export { db } from "../db";

export {
  eq, sql, and, inArray, asc, desc, or, ilike, gte, lte, isNull, isNotNull,
} from "drizzle-orm";

export { format, parseISO } from "date-fns";

export {
  users, locations, staff, students, departments, roles,
  departmentsRelations, rolesRelations,
  crmPipelineGroups, crmRelationships, crmRejectReasons, crmCustomerSources, crmSchools,
  crmRequiredFields, crmCustomFields, crmRegistrationFormFields,
  courses, courseFeePackages,
  coursePrograms,
  courseProgramContents,
  staffAssignments, studentLocations,
  shiftTemplates, teacherAvailability,
  classes, classSessions, studentClasses, studentSessions,
  classSessionExclusions,
  sessionContents, studentSessionContents,
  invoices, invoiceItems, invoicePaymentSchedule, invoiceSessionAllocations, invoiceCommissions, studentComments,
  invoicePrintTemplates,
  financeTransactionCategories, financePromotions, financeVouchers, financeVoucherUsages,
  rolePermissions,
  questions,
  exams,
  examSections,
  examSectionQuestions,
  examSubmissions,
  assessmentAuditLogs,
  studentRelationshipHistory,
  studentNotificationChannels,
} from "@shared/schema";

export type {
  User,
  Location,
  Staff, InsertStaff,
  Student, InsertStudent, StudentResponse,
  Department, InsertDepartment, Role, InsertRole, DepartmentWithRoles,
  CrmPipelineGroup, InsertCrmPipelineGroup,
  CrmRelationship, InsertCrmRelationship,
  CrmRejectReason, InsertCrmRejectReason,
  CrmCustomerSource, InsertCrmCustomerSource,
  CrmSchool, InsertCrmSchool,
  CrmCustomField, InsertCrmCustomField,
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
  FinanceVoucher, InsertFinanceVoucher,
  Invoice, InvoiceItem, InvoicePaymentSchedule,
  RolePermission,
  Question, InsertQuestion,
  InvoicePrintTemplateRow, InsertInvoicePrintTemplate,
  Exam, InsertExam,
  ExamSection, InsertExamSection,
  ExamSectionQuestion, InsertExamSectionQuestion,
  AssessmentAuditLog, InsertAssessmentAuditLog,
} from "@shared/schema";

export const getDayName = (dateStr: string): string => {
  const days = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  return days[new Date(dateStr).getDay()];
};
