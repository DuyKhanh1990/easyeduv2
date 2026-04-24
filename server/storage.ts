import {
  users,
  type User, type InsertUser,
  type Location, type InsertLocation,
  type Staff, type InsertStaff,
  type Student, type InsertStudent, type StudentResponse,
  type Department, type InsertDepartment, type Role, type InsertRole, type DepartmentWithRoles,
  type CrmRelationship, type InsertCrmRelationship,
  type CrmRejectReason, type InsertCrmRejectReason,
  type CrmCustomerSource, type InsertCrmCustomerSource,
  type CrmCustomField, type InsertCrmCustomField,
  type Course, type InsertCourse,
  type CourseFeePackage, type InsertCourseFeePackage,
  type CourseProgram, type CourseProgramContent,
  type ShiftTemplate, type InsertShiftTemplate,
  type TeacherAvailability, type InsertTeacherAvailability,
  type Class, type ClassSession,
  type SessionContent, type InsertSessionContent,
  type StudentSessionContent, type InsertStudentSessionContent,
  type StudentComment, type InsertStudentComment,
  type FinanceTransactionCategory, type InsertFinanceTransactionCategory,
  type FinancePromotion, type InsertFinancePromotion,
  type Invoice, type InvoiceItem, type InvoicePaymentSchedule,
  type RolePermission,
  type Question, type InsertQuestion,
  type InvoicePrintTemplateRow, type InsertInvoicePrintTemplate,
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import * as staffStorage from "./storage/staff.storage";
import * as studentStorage from "./storage/student.storage";
import type { InvoiceSubjectResult } from "./storage/student.storage";
import * as financeStorage from "./storage/finance.storage";
import * as courseStorage from "./storage/course.storage";
import * as classStorage from "./storage/class.storage";
import * as sessionStorage from "./storage/session.storage";
import * as attendanceStorage from "./storage/attendance.storage";
import * as shiftStorage from "./storage/shift.storage";
import * as permissionsStorage from "./storage/permissions.storage";
import * as questionStorage from "./storage/question.storage";


export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getLocations(): Promise<Location[]>;
  getLocation(id: string): Promise<Location | undefined>;
  createLocation(location: InsertLocation): Promise<Location>;
  updateLocation(id: string, updates: Partial<InsertLocation>): Promise<Location>;
  deleteLocation(id: string): Promise<void>;

  getDepartments(allowedLocationIds: string[], isSuperAdmin: boolean): Promise<DepartmentWithRoles[]>;
  getDepartmentByName(name: string): Promise<Department | undefined>;
  createDepartment(dept: InsertDepartment): Promise<Department>;
  deleteDepartment(id: string): Promise<void>;

  getRoleByNameInDepartment(name: string, departmentId: string): Promise<Role | undefined>;
  createRole(role: InsertRole): Promise<Role>;
  deleteRole(id: string): Promise<void>;
  
  getStaff(allowedLocationIds: string[], isSuperAdmin: boolean, locationId?: string): Promise<Staff[]>;
  createStaff(staff: any): Promise<Staff>;
  
  getStudents(params: { 
    allowedLocationIds: string[];
    isSuperAdmin: boolean;
    locationId?: string; 
    offset?: number; 
    limit?: number; 
    searchTerm?: string; 
    type?: string; 
    pipelineStage?: string;
    sources?: string[];
    rejectReasons?: string[];
    salesIds?: string[];
    managerIds?: string[];
    teacherIds?: string[];
    classIds?: string[];
    startDate?: string;
    endDate?: string;
    viewScope?: 'all' | 'own';
    viewerStaffId?: string;
  }): Promise<{ students: StudentResponse[]; total: number }>;
  getStudentsMinimal(params: { allowedLocationIds: string[]; isSuperAdmin: boolean; locationId?: string; limit?: number }): Promise<{ id: string; fullName: string; type: string | null; locations: { locationId: string }[] }[]>;
  getStudent(id: string, allowedLocationIds: string[], isSuperAdmin: boolean): Promise<StudentResponse | undefined>;
  createStudent(student: any): Promise<StudentResponse>;
  updateStudent(id: string, updates: any, allowedLocationIds: string[], isSuperAdmin: boolean): Promise<StudentResponse>;
  deleteStudent(id: string, allowedLocationIds: string[], isSuperAdmin: boolean): Promise<void>;
  searchInvoiceSubjects(params: { locationId?: string; searchTerm?: string; limit?: number; allowedLocationIds?: string[] | null }): Promise<InvoiceSubjectResult[]>;

  getDashboardStats(allowedLocationIds: string[], isSuperAdmin: boolean): Promise<{ totalStudents: number; totalStaff: number; totalLocations: number }>;

  // CRM Configuration
  getCrmRelationships(allowedLocationIds: string[], isSuperAdmin: boolean): Promise<CrmRelationship[]>;
  createCrmRelationship(data: InsertCrmRelationship): Promise<CrmRelationship>;
  updateCrmRelationship(id: string, data: Partial<InsertCrmRelationship>): Promise<CrmRelationship>;
  deleteCrmRelationship(id: string): Promise<void>;

  getCrmRejectReasons(allowedLocationIds: string[], isSuperAdmin: boolean): Promise<CrmRejectReason[]>;
  createCrmRejectReason(data: InsertCrmRejectReason): Promise<CrmRejectReason>;
  updateCrmRejectReason(id: string, data: Partial<InsertCrmRejectReason>): Promise<CrmRejectReason>;
  deleteCrmRejectReason(id: string): Promise<void>;

  getCrmCustomerSources(allowedLocationIds: string[], isSuperAdmin: boolean): Promise<CrmCustomerSource[]>;
  createCrmCustomerSource(data: InsertCrmCustomerSource): Promise<CrmCustomerSource>;
  updateCrmCustomerSource(id: string, data: Partial<InsertCrmCustomerSource>): Promise<CrmCustomerSource>;
  deleteCrmCustomerSource(id: string): Promise<void>;

  getCrmRequiredFields(): Promise<{ fieldKey: string; isRequired: boolean }[]>;
  upsertCrmRequiredField(fieldKey: string, isRequired: boolean): Promise<{ fieldKey: string; isRequired: boolean }>;

  getCrmCustomFields(): Promise<CrmCustomField[]>;
  createCrmCustomField(data: InsertCrmCustomField): Promise<CrmCustomField>;
  updateCrmCustomField(id: string, data: Partial<InsertCrmCustomField>): Promise<CrmCustomField>;
  deleteCrmCustomField(id: string): Promise<void>;

  // Courses & Fee Packages
  getCourses(): Promise<Course[]>;
  createCourse(course: InsertCourse): Promise<Course>;
  getCourseFeePackages(courseId: string): Promise<CourseFeePackage[]>;
  getAllFeePackages(locationId?: string): Promise<any[]>;
  getNextInvoiceCode(type: string): Promise<string>;
  createCourseFeePackage(pkg: InsertCourseFeePackage): Promise<CourseFeePackage>;
  updateCourseFeePackage(id: string, data: Partial<InsertCourseFeePackage>): Promise<CourseFeePackage>;
  deleteCourseFeePackage(id: string): Promise<void>;

  // Course Programs
  getCoursePrograms(): Promise<CourseProgram[]>;
  createCourseProgram(program: any): Promise<CourseProgram>;
  getCourseProgramContents(programId: string): Promise<CourseProgramContent[]>;
  getAllCourseProgramContents(): Promise<any[]>;
  createCourseProgramContent(content: any): Promise<CourseProgramContent>;
  updateCourseProgramContent(id: string, updates: any): Promise<CourseProgramContent>;
  deleteCourseProgramContent(id: string): Promise<void>;

  // Shift Templates
  getShiftTemplates(locationId?: string): Promise<ShiftTemplate[]>;
  createShiftTemplate(shift: InsertShiftTemplate): Promise<ShiftTemplate>;
  updateShiftTemplate(id: string, updates: Partial<InsertShiftTemplate>): Promise<ShiftTemplate>;
  deleteShiftTemplate(id: string): Promise<void>;
  checkShiftOverlap(locationId: string, startTime: string, endTime: string, excludeId?: string): Promise<boolean>;

  // Role Permissions
  getRolePermissions(roleId: string): Promise<RolePermission[]>;
  upsertRolePermission(roleId: string, resource: string, permissions: { canView: boolean; canViewAll: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }): Promise<RolePermission>;
  getEffectivePermissions(roleIds: string[], resource: string): Promise<{ canView: boolean; canViewAll: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }>;
  getAllPermissionsForRoles(roleIds: string[]): Promise<RolePermission[]>;

  // Teacher Availability
  getTeacherAvailabilities(filters: { locationId?: string; teacherId?: string; weekday?: number }): Promise<any[]>;
  createTeacherAvailability(data: InsertTeacherAvailability): Promise<TeacherAvailability>;
  updateTeacherAvailability(id: string, data: Partial<InsertTeacherAvailability>): Promise<TeacherAvailability>;
  deleteTeacherAvailability(id: string): Promise<void>;
  checkTeacherAtLocation(teacherId: string, locationId: string): Promise<boolean>;
  // Classes & Sessions
  getClasses(locationId?: string, allowedLocationIds?: string[] | null): Promise<Class[]>;
  getClassesList(locationId?: string, allowedLocationIds?: string[] | null): Promise<any[]>;
  getClassesMinimal(locationId?: string, allowedLocationIds?: string[] | null): Promise<{ id: string; name: string; classCode: string; locationId: string }[]>;
  getClass(id: string): Promise<any>;
  getClassAssignInfo(id: string): Promise<any>;
  updateClass(id: string, data: any): Promise<Class>;
  deleteClass(id: string): Promise<void>;
  deleteClasses(ids: string[]): Promise<void>;
  countClassInvoices(ids: string[]): Promise<number>;
  createClass(data: any): Promise<Class>;
  findClassByCode(classCode: string): Promise<{ id: string; classCode: string; name: string } | null>;
  createMinimalClass(data: { classCode: string; name: string; locationId: string }): Promise<{ id: string; classCode: string; name: string }>;
  getClassSessions(classId: string): Promise<ClassSession[]>;
  getClassStudents(classId: string, status: string): Promise<any[]>;
  getAvailableStudentsForClass(classId: string, searchTerm?: string): Promise<any[]>;
  addClassStudents(classId: string, studentIds: string[], userId: string): Promise<void>;
  scheduleClassStudents(classId: string, configs: any[], userId?: string): Promise<void>;
  getStudentSessionsForClass(classId: string, studentId: string): Promise<any[]>;
  getStudentSessionsByClassSession(classSessionId: string): Promise<any[]>;
  updateAttendanceStatus(id: string, status: string, note?: string): Promise<void>;
  updateStudentAttendance(id: string, status: string, note?: string, userId?: string | null, userFullName?: string | null): Promise<void>;
  bulkUpdateAttendance(sessionId: string, students: { studentSessionId: string; attendanceStatus: string }[], userId?: string | null, userFullName?: string | null): Promise<void>;
  updateStudentTuitionPackage(studentClassIds: string[], packageId: string, fromSessionOrder: number, toSessionOrder: number): Promise<{ warning?: string }>;
  makeupClassStudents(classId: string, data: any, userId: string): Promise<void>;
  cancelClassSessions(params: { classId: string, fromSessionId: string, toSessionId: string, reason: string, userId: string }): Promise<void>;
  updateClassSession(id: string, updates: any): Promise<ClassSession>;
  updateClassCycle(classId: string, data: {
    fromSessionId: string;
    toSessionId: string;
    weekdays: number[];
    weekdayConfigs: Record<number, { shiftTemplateId: string; teacherIds: string[] }>;
    reason: string;
    userId: string;
  }): Promise<void>;
  checkSessionsAttendance(sessionIds: string[]): Promise<boolean>;
  deleteClassSessions(classId: string, sessionId: string, deleteType: string, mode: string): Promise<void>;
  excludeClassSessions(params: { classId: string; fromSessionId: string; toSessionId: string; reason: string; userId: string }): Promise<void>;
  getClassExclusions(classId: string): Promise<any[]>;
  getClassSession(id: string): Promise<ClassSession | undefined>;
  transferStudentClass(data: {
    studentId: string;
    fromClassId: string;
    toClassId: string;
    fromSessionIndex: number;
    toSessionIndex: number;
    transferCount: number;
    userId: string;
  }): Promise<void>;
  recalculateStudentClass(studentClassId: string): Promise<void>;
  extendStudentSessions(data: {
    classId: string;
    studentIds: string[];
    mode: "class" | "student";
    numSessions?: number;
    endDate?: string;
    cycleMode: "all" | "specific";
    specificShiftIds?: string[];
    extensionName?: string;
    autoInvoice: boolean;
    userId: string;
  }): Promise<void>;
  removeStudentFromSessions(data: {
    studentIds: string[];
    studentClassId: string;
    fromSessionOrder: number;
    toSessionOrder: number;
  }): Promise<{ hasAttendedSessions: boolean }>;
  removeStudentFromSessionsConfirm(data: {
    studentIds: string[];
    studentClassId: string;
    fromSessionOrder: number;
    toSessionOrder: number;
    deleteOnlyUnattended: boolean;
  }): Promise<void>;
  changeStudentCycle(data: {
    studentClassId: string;
    fromSessionOrder: number;
    weekdays: number[];
    mode: "all" | "unattended_only";
  }): Promise<{ deleted: number; created: number; warning?: string }>;

  // Session Contents
  getSessionContents(classSessionId: string): Promise<SessionContent[]>;
  createSessionContent(content: InsertSessionContent): Promise<SessionContent>;
  updateSessionContent(id: string, updates: Partial<InsertSessionContent>): Promise<SessionContent>;
  deleteSessionContent(id: string): Promise<void>;

  // Student Session Contents
  getStudentSessionContents(studentId: string, sessionIds?: string[]): Promise<StudentSessionContent[]>;
  
  getStudentComments(studentId: string): Promise<(StudentComment & { user: User })[]>;
  createStudentComment(comment: InsertStudentComment): Promise<StudentComment>;
  
  getStudentClasses(studentId: string): Promise<any[]>;
  createStudentSessionContent(content: InsertStudentSessionContent): Promise<StudentSessionContent>;
  updateStudentSessionContent(id: string, updates: Partial<InsertStudentSessionContent>): Promise<StudentSessionContent>;
  deleteStudentSessionContent(id: string): Promise<void>;

  // Finance - Transaction Categories
  getFinanceTransactionCategories(type?: string): Promise<FinanceTransactionCategory[]>;
  createFinanceTransactionCategory(data: InsertFinanceTransactionCategory): Promise<FinanceTransactionCategory>;
  updateFinanceTransactionCategory(id: string, data: Partial<InsertFinanceTransactionCategory>): Promise<FinanceTransactionCategory>;
  deleteFinanceTransactionCategory(id: string): Promise<void>;

  // Finance - Promotions & Surcharges
  getFinancePromotions(type?: string): Promise<FinancePromotion[]>;
  createFinancePromotion(data: InsertFinancePromotion): Promise<FinancePromotion>;
  updateFinancePromotion(id: string, data: Partial<InsertFinancePromotion>): Promise<FinancePromotion>;
  deleteFinancePromotion(id: string): Promise<void>;

  // Finance - Invoices
  getInvoices(filters?: { status?: string; type?: string; locationId?: string; search?: string; dateFrom?: string; dateTo?: string; allowedLocationIds?: string[] | null; isSuperAdmin?: boolean }): Promise<any[]>;
  getInvoice(id: string): Promise<any | undefined>;
  getInvoicePaymentSchedules(invoiceId: string): Promise<any[]>;
  splitInvoiceSchedule(scheduleId: string, splitAmount: number): Promise<{ updated: any; created: any }>;
  updateInvoiceSchedule(scheduleId: string, data: { amount?: number; dueDate?: string | null }): Promise<any>;
  updateInvoiceScheduleStatus(scheduleId: string, status: string): Promise<any>;
  updateInvoiceStatus(invoiceId: string, status: string): Promise<any>;
  createInvoice(data: any): Promise<any>;
  updateInvoice(id: string, data: any): Promise<any>;
  deleteInvoice(id: string): Promise<void>;
  deleteInvoiceSchedule(id: string): Promise<void>;
  appendSalaryPayment(invoiceId: string, amountPaid: number): Promise<any>;
  getInvoicePrintTemplates(): Promise<InvoicePrintTemplateRow[]>;
  getInvoicePrintTemplate(id: string): Promise<InvoicePrintTemplateRow | null>;
  createInvoicePrintTemplate(data: InsertInvoicePrintTemplate): Promise<InvoicePrintTemplateRow>;
  updateInvoicePrintTemplate(id: string, data: Partial<InsertInvoicePrintTemplate>): Promise<InvoicePrintTemplateRow>;
  deleteInvoicePrintTemplate(id: string): Promise<void>;
  getDefaultInvoicePrintTemplate(invoiceType: string): Promise<InvoicePrintTemplateRow | null>;
  setDefaultInvoicePrintTemplate(id: string, invoiceType: string): Promise<InvoicePrintTemplateRow>;
  unsetDefaultInvoicePrintTemplate(id: string): Promise<InvoicePrintTemplateRow>;
  migratePipelineStageToRelationshipIds(): Promise<void>;
  migrateContentLibrarySchema(): Promise<void>;

  // Questions (Ngân hàng câu hỏi)
  migrateQuestionsTable(): Promise<void>;
  getQuestions(): Promise<Question[]>;
  getQuestion(id: string): Promise<Question | undefined>;
  createQuestion(data: InsertQuestion): Promise<Question>;
  updateQuestion(id: string, data: Partial<InsertQuestion>): Promise<Question>;
  deleteQuestion(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getClassSession(id: string): Promise<ClassSession | undefined> {
    return sessionStorage.getClassSession(id);
  }

  async getClassExclusions(classId: string): Promise<any[]> {
    return sessionStorage.getClassExclusions(classId);
  }

  async checkSessionsAttendance(sessionIds: string[]): Promise<boolean> {
    return sessionStorage.checkSessionsAttendance(sessionIds);
  }

  async deleteClassSessions(classId: string, sessionId: string, deleteType: string, mode: string): Promise<void> {
    return sessionStorage.deleteClassSessions(classId, sessionId, deleteType, mode);
  }

  async transferStudentClass(data: {
    studentId: string;
    fromClassId: string;
    toClassId: string;
    fromSessionIndex: number;
    toSessionIndex: number;
    transferCount: number;
    userId: string;
  }): Promise<void> {
    return sessionStorage.transferStudentClass(data);
  }

  async recalculateStudentClass(studentClassId: string): Promise<void> {
    return sessionStorage.recalculateStudentClass(studentClassId);
  }

  async extendStudentSessions(data: {
    classId: string;
    studentIds: string[];
    mode: "class" | "student";
    numSessions?: number;
    endDate?: string;
    cycleMode: "all" | "specific";
    specificShiftIds?: string[];
    extensionName?: string;
    autoInvoice: boolean;
    userId: string;
  }): Promise<void> {
    return sessionStorage.extendStudentSessions(data);
  }

  async makeupClassStudents(classId: string, data: any, userId: string): Promise<void> {
    return sessionStorage.makeupClassStudents(classId, data, userId);
  }

  async getShiftTemplates(locationId?: string): Promise<ShiftTemplate[]> {
    return shiftStorage.getShiftTemplates(locationId);
  }

  async createShiftTemplate(shift: InsertShiftTemplate): Promise<ShiftTemplate> {
    return shiftStorage.createShiftTemplate(shift);
  }

  async updateShiftTemplate(id: string, updates: Partial<InsertShiftTemplate>): Promise<ShiftTemplate> {
    return shiftStorage.updateShiftTemplate(id, updates);
  }

  async deleteShiftTemplate(id: string): Promise<void> {
    return shiftStorage.deleteShiftTemplate(id);
  }

  async checkShiftOverlap(locationId: string, startTime: string, endTime: string, excludeId?: string): Promise<boolean> {
    return shiftStorage.checkShiftOverlap(locationId, startTime, endTime, excludeId);
  }

  async getRolePermissions(roleId: string): Promise<RolePermission[]> {
    return permissionsStorage.getRolePermissions(roleId);
  }

  async upsertRolePermission(roleId: string, resource: string, permissions: { canView: boolean; canViewAll: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }): Promise<RolePermission> {
    return permissionsStorage.upsertRolePermission(roleId, resource, permissions);
  }

  async getEffectivePermissions(roleIds: string[], resource: string): Promise<{ canView: boolean; canViewAll: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }> {
    return permissionsStorage.getEffectivePermissions(roleIds, resource);
  }

  async getAllPermissionsForRoles(roleIds: string[]): Promise<RolePermission[]> {
    return permissionsStorage.getAllPermissionsForRoles(roleIds);
  }

  async getTeacherAvailabilities(filters: { locationId?: string; teacherId?: string; weekday?: number }): Promise<any[]> {
    return shiftStorage.getTeacherAvailabilities(filters);
  }

  async createTeacherAvailability(data: InsertTeacherAvailability): Promise<TeacherAvailability> {
    return shiftStorage.createTeacherAvailability(data);
  }

  async updateTeacherAvailability(id: string, data: Partial<InsertTeacherAvailability>): Promise<TeacherAvailability> {
    return shiftStorage.updateTeacherAvailability(id, data);
  }

  async deleteTeacherAvailability(id: string): Promise<void> {
    return shiftStorage.deleteTeacherAvailability(id);
  }

  async checkTeacherAtLocation(teacherId: string, locationId: string): Promise<boolean> {
    return shiftStorage.checkTeacherAtLocation(teacherId, locationId);
  }

  async checkAvailabilityDuplicate(data: InsertTeacherAvailability): Promise<boolean> {
    return shiftStorage.checkAvailabilityDuplicate(data);
  }

  async getCoursePrograms(): Promise<CourseProgram[]> {
    return courseStorage.getCoursePrograms();
  }

  async createCourseProgram(program: any): Promise<CourseProgram> {
    return courseStorage.createCourseProgram(program);
  }

  async getCourseProgramContents(programId: string): Promise<CourseProgramContent[]> {
    return courseStorage.getCourseProgramContents(programId);
  }

  async getAllCourseProgramContents(): Promise<any[]> {
    return courseStorage.getAllCourseProgramContents();
  }

  async createCourseProgramContent(content: any): Promise<CourseProgramContent> {
    return courseStorage.createCourseProgramContent(content);
  }

  async updateCourseProgramContent(id: string, updates: any): Promise<CourseProgramContent> {
    return courseStorage.updateCourseProgramContent(id, updates);
  }

  async deleteCourseProgramContent(id: string): Promise<void> {
    return courseStorage.deleteCourseProgramContent(id);
  }

  async getClasses(locationId?: string, allowedLocationIds?: string[] | null): Promise<any[]> {
    return classStorage.getClasses(locationId, allowedLocationIds);
  }

  async getClassesList(locationId?: string, allowedLocationIds?: string[] | null): Promise<any[]> {
    return classStorage.getClassesList(locationId, allowedLocationIds);
  }

  async getClassesMinimal(locationId?: string, allowedLocationIds?: string[] | null): Promise<{ id: string; name: string; classCode: string; locationId: string }[]> {
    return classStorage.getClassesMinimal(locationId, allowedLocationIds);
  }

  async getClass(id: string): Promise<any> {
    return classStorage.getClass(id);
  }

  async getClassAssignInfo(id: string): Promise<any> {
    return classStorage.getClassAssignInfo(id);
  }

  async updateClass(id: string, data: any): Promise<Class> {
    return classStorage.updateClass(id, data);
  }

  async deleteClass(id: string): Promise<void> {
    return classStorage.deleteClass(id);
  }

  async deleteClasses(ids: string[]): Promise<void> {
    return classStorage.deleteClasses(ids);
  }

  async countClassInvoices(ids: string[]): Promise<number> {
    return classStorage.countClassInvoices(ids);
  }

  async getClassStudents(classId: string, status: string): Promise<any[]> {
    return classStorage.getClassStudents(classId, status);
  }

  async getAvailableStudentsForClass(classId: string, searchTerm?: string): Promise<any[]> {
    return classStorage.getAvailableStudentsForClass(classId, searchTerm);
  }

  async findClassByCode(classCode: string): Promise<{ id: string; classCode: string; name: string } | null> {
    return classStorage.findClassByCode(classCode);
  }

  async createMinimalClass(data: { classCode: string; name: string; locationId: string }): Promise<{ id: string; classCode: string; name: string }> {
    return classStorage.createMinimalClass(data);
  }

  async addClassStudents(classId: string, studentIds: string[], userId: string): Promise<void> {
    return classStorage.addClassStudents(classId, studentIds, userId);
  }

  async scheduleClassStudents(classId: string, configs: any[], userId?: string): Promise<void> {
    return classStorage.scheduleClassStudents(classId, configs, userId);
  }

  async getStudentSessionsForClass(classId: string, studentId: string): Promise<any[]> {
    return sessionStorage.getStudentSessionsForClass(classId, studentId);
  }

  async getStudentSessionsByClassSession(classSessionId: string): Promise<any[]> {
    return sessionStorage.getStudentSessionsByClassSession(classSessionId);
  }

  async updateAttendanceStatus(id: string, status: string, note?: string): Promise<void> {
    return attendanceStorage.updateAttendanceStatus(id, status, note);
  }

  async updateStudentAttendance(id: string, status: string, note?: string, userId?: string | null, userFullName?: string | null): Promise<void> {
    return attendanceStorage.updateStudentAttendance(id, status, note, userId, userFullName);
  }

  async updateStudentTuitionPackage(studentClassIds: string[], packageId: string, fromSessionOrder: number, toSessionOrder: number): Promise<{ warning?: string }> {
    return courseStorage.updateStudentTuitionPackage(studentClassIds, packageId, fromSessionOrder, toSessionOrder);
  }

  async bulkUpdateAttendance(sessionId: string, students: { studentSessionId: string; attendanceStatus: string }[], userId?: string | null, userFullName?: string | null): Promise<void> {
    return attendanceStorage.bulkUpdateAttendance(sessionId, students, userId, userFullName);
  }

  async cancelClassSessions(params: { classId: string, fromSessionId: string, toSessionId: string, reason: string, userId: string }): Promise<void> {
    return sessionStorage.cancelClassSessions(params);
  }

  async excludeClassSessions(params: { classId: string; fromSessionId: string; toSessionId: string; reason: string; userId: string }): Promise<void> {
    return sessionStorage.excludeClassSessions(params);
  }

  async updateClassSession(id: string, updates: any): Promise<ClassSession> {
    return sessionStorage.updateClassSession(id, updates);
  }

  async updateClassCycle(classId: string, data: {
    fromSessionId: string;
    toSessionId: string;
    weekdays: number[];
    weekdayConfigs: Record<number, { shiftTemplateId: string; teacherIds: string[] }>;
    reason: string;
    userId: string;
  }): Promise<void> {
    return sessionStorage.updateClassCycle(classId, data);
  }

  async changeTeacher(params: {
    classId: string;
    newTeacherId: string;
    fromSessionId: string;
    toSessionId: string;
  }): Promise<void> {
    return sessionStorage.changeTeacher(params);
  }

  async createClass(data: any): Promise<Class> {
    return classStorage.createClass(data);
  }

  async getClassSessions(classId: string): Promise<any[]> {
    return classStorage.getClassSessions(classId);
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getLocations(): Promise<Location[]> {
    return staffStorage.getLocations();
  }

  async getLocation(id: string): Promise<Location | undefined> {
    return staffStorage.getLocation(id);
  }

  async createLocation(location: InsertLocation): Promise<Location> {
    return staffStorage.createLocation(location);
  }

  async updateLocation(id: string, updates: Partial<InsertLocation>): Promise<Location> {
    return staffStorage.updateLocation(id, updates);
  }

  async deleteLocation(id: string): Promise<void> {
    return staffStorage.deleteLocation(id);
  }

  async getDepartments(allowedLocationIds: string[], isSuperAdmin: boolean): Promise<DepartmentWithRoles[]> {
    return staffStorage.getDepartments(allowedLocationIds, isSuperAdmin);
  }

  async getDepartmentByName(name: string): Promise<Department | undefined> {
    return staffStorage.getDepartmentByName(name);
  }

  async createDepartment(dept: InsertDepartment): Promise<Department> {
    return staffStorage.createDepartment(dept);
  }

  async updateDepartment(id: string, updates: Partial<InsertDepartment>): Promise<Department> {
    return staffStorage.updateDepartment(id, updates);
  }

  async deleteDepartment(id: string): Promise<void> {
    return staffStorage.deleteDepartment(id);
  }

  async getRoleByNameInDepartment(name: string, departmentId: string): Promise<Role | undefined> {
    return staffStorage.getRoleByNameInDepartment(name, departmentId);
  }

  async createRole(role: InsertRole): Promise<Role> {
    return staffStorage.createRole(role);
  }

  async updateRole(id: string, updates: Partial<InsertRole>): Promise<Role> {
    return staffStorage.updateRole(id, updates);
  }

  async deleteRole(id: string): Promise<void> {
    return staffStorage.deleteRole(id);
  }

  async getStaff(allowedLocationIds: string[], isSuperAdmin: boolean, locationId?: string, minimal?: boolean): Promise<any[]> {
    return staffStorage.getStaff(allowedLocationIds, isSuperAdmin, locationId, minimal);
  }

  async createStaff(insertData: any): Promise<Staff> {
    return staffStorage.createStaff(insertData);
  }

  async updateStaff(id: string, updates: any, allowedLocationIds: string[], isSuperAdmin: boolean): Promise<Staff> {
    return staffStorage.updateStaff(id, updates, allowedLocationIds, isSuperAdmin);
  }

  async deleteStaff(id: string, allowedLocationIds: string[], isSuperAdmin: boolean): Promise<void> {
    return staffStorage.deleteStaff(id, allowedLocationIds, isSuperAdmin);
  }

  async getStudents(params: { 
    allowedLocationIds: string[];
    isSuperAdmin: boolean;
    locationId?: string; 
    offset?: number; 
    limit?: number; 
    searchTerm?: string; 
    type?: string; 
    pipelineStage?: string;
    sources?: string[];
    rejectReasons?: string[];
    salesIds?: string[];
    managerIds?: string[];
    teacherIds?: string[];
    classIds?: string[];
    startDate?: string;
    endDate?: string;
  }): Promise<{ students: StudentResponse[]; total: number }> {
    return studentStorage.getStudents(params);
  }

  async getStudentsMinimal(params: { allowedLocationIds: string[]; isSuperAdmin: boolean; locationId?: string; limit?: number }) {
    return studentStorage.getStudentsMinimal(params);
  }

  async getStudent(id: string, allowedLocationIds: string[], isSuperAdmin: boolean): Promise<StudentResponse | undefined> {
    return studentStorage.getStudent(id, allowedLocationIds, isSuperAdmin);
  }

  async createStudent(student: any): Promise<StudentResponse> {
    return studentStorage.createStudent(student);
  }

  async updateStudent(id: string, updates: any, allowedLocationIds: string[], isSuperAdmin: boolean): Promise<StudentResponse> {
    return studentStorage.updateStudent(id, updates, allowedLocationIds, isSuperAdmin);
  }

  async deleteStudent(id: string, allowedLocationIds: string[], isSuperAdmin: boolean): Promise<void> {
    return studentStorage.deleteStudent(id, allowedLocationIds, isSuperAdmin);
  }

  async searchInvoiceSubjects(params: { locationId?: string; searchTerm?: string; limit?: number; allowedLocationIds?: string[] | null }): Promise<InvoiceSubjectResult[]> {
    return studentStorage.searchInvoiceSubjects(params);
  }

  async getDashboardStats(allowedLocationIds: string[], isSuperAdmin: boolean): Promise<{ totalStudents: number; totalStaff: number; totalLocations: number }> {
    return studentStorage.getDashboardStats(allowedLocationIds, isSuperAdmin);
  }

  // CRM Configuration implementations
  async getCrmRelationships(allowedLocationIds: string[], isSuperAdmin: boolean): Promise<CrmRelationship[]> {
    return studentStorage.getCrmRelationships(allowedLocationIds, isSuperAdmin);
  }

  async createCrmRelationship(data: InsertCrmRelationship): Promise<CrmRelationship> {
    return studentStorage.createCrmRelationship(data);
  }

  async updateCrmRelationship(id: string, data: Partial<InsertCrmRelationship>): Promise<CrmRelationship> {
    return studentStorage.updateCrmRelationship(id, data);
  }

  async deleteCrmRelationship(id: string): Promise<void> {
    return studentStorage.deleteCrmRelationship(id);
  }

  async getCrmRejectReasons(allowedLocationIds: string[], isSuperAdmin: boolean): Promise<CrmRejectReason[]> {
    return studentStorage.getCrmRejectReasons(allowedLocationIds, isSuperAdmin);
  }

  async createCrmRejectReason(data: InsertCrmRejectReason): Promise<CrmRejectReason> {
    return studentStorage.createCrmRejectReason(data);
  }

  async updateCrmRejectReason(id: string, data: Partial<InsertCrmRejectReason>): Promise<CrmRejectReason> {
    return studentStorage.updateCrmRejectReason(id, data);
  }

  async deleteCrmRejectReason(id: string): Promise<void> {
    return studentStorage.deleteCrmRejectReason(id);
  }

  async getCrmCustomerSources(allowedLocationIds: string[], isSuperAdmin: boolean): Promise<CrmCustomerSource[]> {
    return studentStorage.getCrmCustomerSources(allowedLocationIds, isSuperAdmin);
  }

  async createCrmCustomerSource(data: InsertCrmCustomerSource): Promise<CrmCustomerSource> {
    return studentStorage.createCrmCustomerSource(data);
  }

  async updateCrmCustomerSource(id: string, data: Partial<InsertCrmCustomerSource>): Promise<CrmCustomerSource> {
    return studentStorage.updateCrmCustomerSource(id, data);
  }

  async deleteCrmCustomerSource(id: string): Promise<void> {
    return studentStorage.deleteCrmCustomerSource(id);
  }

  async getCrmRequiredFields(): Promise<{ fieldKey: string; isRequired: boolean }[]> {
    return studentStorage.getCrmRequiredFields();
  }

  async upsertCrmRequiredField(fieldKey: string, isRequired: boolean): Promise<{ fieldKey: string; isRequired: boolean }> {
    return studentStorage.upsertCrmRequiredField(fieldKey, isRequired);
  }

  async getCrmCustomFields(): Promise<CrmCustomField[]> {
    return studentStorage.getCrmCustomFields();
  }
  async createCrmCustomField(data: InsertCrmCustomField): Promise<CrmCustomField> {
    return studentStorage.createCrmCustomField(data);
  }
  async updateCrmCustomField(id: string, data: Partial<InsertCrmCustomField>): Promise<CrmCustomField> {
    return studentStorage.updateCrmCustomField(id, data);
  }
  async deleteCrmCustomField(id: string): Promise<void> {
    return studentStorage.deleteCrmCustomField(id);
  }

  // Courses & Fee Packages
  async getCourses(): Promise<Course[]> {
    return courseStorage.getCourses();
  }

  async createCourse(course: InsertCourse): Promise<Course> {
    return courseStorage.createCourse(course);
  }

  async getCourseFeePackages(courseId: string): Promise<CourseFeePackage[]> {
    return courseStorage.getCourseFeePackages(courseId);
  }

  async getAllFeePackages(locationId?: string): Promise<any[]> {
    return courseStorage.getAllFeePackages(locationId);
  }

  async getNextInvoiceCode(type: string): Promise<string> {
    return financeStorage.getNextInvoiceCode(type);
  }

  async createCourseFeePackage(pkg: InsertCourseFeePackage): Promise<CourseFeePackage> {
    return courseStorage.createCourseFeePackage(pkg);
  }

  async updateCourseFeePackage(id: string, data: Partial<InsertCourseFeePackage>): Promise<CourseFeePackage> {
    return courseStorage.updateCourseFeePackage(id, data);
  }

  async deleteCourseFeePackage(id: string): Promise<void> {
    return courseStorage.deleteCourseFeePackage(id);
  }

  async removeStudentFromSessions(data: {
    studentIds: string[];
    studentClassId: string;
    fromSessionOrder: number;
    toSessionOrder: number;
  }): Promise<{ hasAttendedSessions: boolean }> {
    return sessionStorage.removeStudentFromSessions(data);
  }

  async removeStudentFromSessionsConfirm(data: {
    studentIds: string[];
    studentClassId: string;
    fromSessionOrder: number;
    toSessionOrder: number;
    deleteOnlyUnattended: boolean;
  }): Promise<void> {
    return sessionStorage.removeStudentFromSessionsConfirm(data);
  }

  async changeStudentCycle(data: {
    studentClassId: string;
    fromSessionOrder: number;
    weekdays: number[];
    mode: "all" | "unattended_only";
  }): Promise<{ deleted: number; created: number; warning?: string }> {
    return sessionStorage.changeStudentCycle(data);
  }

  // Session Contents
  async getSessionContents(classSessionId: string): Promise<SessionContent[]> {
    return sessionStorage.getSessionContents(classSessionId);
  }

  async createSessionContent(content: InsertSessionContent): Promise<SessionContent> {
    return sessionStorage.createSessionContent(content);
  }

  async updateSessionContent(id: string, updates: Partial<InsertSessionContent>): Promise<SessionContent> {
    return sessionStorage.updateSessionContent(id, updates);
  }

  async deleteSessionContent(id: string): Promise<void> {
    return sessionStorage.deleteSessionContent(id);
  }

  // Student Session Contents
  async getStudentSessionContents(studentId: string, sessionIds?: string[]): Promise<StudentSessionContent[]> {
    return sessionStorage.getStudentSessionContents(studentId, sessionIds);
  }

  async createStudentSessionContent(content: InsertStudentSessionContent): Promise<StudentSessionContent> {
    return sessionStorage.createStudentSessionContent(content);
  }

  async updateStudentSessionContent(id: string, updates: Partial<InsertStudentSessionContent>): Promise<StudentSessionContent> {
    return sessionStorage.updateStudentSessionContent(id, updates);
  }

  async deleteStudentSessionContent(id: string): Promise<void> {
    return sessionStorage.deleteStudentSessionContent(id);
  }

  async getStudentComments(studentId: string): Promise<(StudentComment & { user: User })[]> {
    return studentStorage.getStudentComments(studentId);
  }

  async createStudentComment(comment: InsertStudentComment): Promise<StudentComment> {
    return studentStorage.createStudentComment(comment);
  }

  async getStudentClasses(studentId: string): Promise<any[]> {
    return studentStorage.getStudentClasses(studentId);
  }

  // ==========================================
  // FINANCE - TRANSACTION CATEGORIES
  // ==========================================
  async getFinanceTransactionCategories(type?: string): Promise<FinanceTransactionCategory[]> {
    return financeStorage.getFinanceTransactionCategories(type);
  }

  async createFinanceTransactionCategory(data: InsertFinanceTransactionCategory): Promise<FinanceTransactionCategory> {
    return financeStorage.createFinanceTransactionCategory(data);
  }

  async updateFinanceTransactionCategory(id: string, data: Partial<InsertFinanceTransactionCategory>): Promise<FinanceTransactionCategory> {
    return financeStorage.updateFinanceTransactionCategory(id, data);
  }

  async deleteFinanceTransactionCategory(id: string): Promise<void> {
    return financeStorage.deleteFinanceTransactionCategory(id);
  }

  // ==========================================
  // FINANCE - PROMOTIONS & SURCHARGES
  // ==========================================
  async getFinancePromotions(type?: string): Promise<FinancePromotion[]> {
    return financeStorage.getFinancePromotions(type);
  }

  async createFinancePromotion(data: InsertFinancePromotion): Promise<FinancePromotion> {
    return financeStorage.createFinancePromotion(data);
  }

  async updateFinancePromotion(id: string, data: Partial<InsertFinancePromotion>): Promise<FinancePromotion> {
    return financeStorage.updateFinancePromotion(id, data);
  }

  async deleteFinancePromotion(id: string): Promise<void> {
    return financeStorage.deleteFinancePromotion(id);
  }

  // ==========================================
  // FINANCE - INVOICES
  // ==========================================
  async getInvoices(filters: { status?: string; type?: string; locationId?: string; search?: string; dateFrom?: string; dateTo?: string; allowedLocationIds?: string[] | null; isSuperAdmin?: boolean } = {}): Promise<any[]> {
    return financeStorage.getInvoices(filters);
  }

  async getInvoice(id: string): Promise<any | undefined> {
    return financeStorage.getInvoice(id);
  }

  async createInvoice(data: any): Promise<any> {
    return financeStorage.createInvoice(data);
  }

  async updateInvoice(id: string, data: any): Promise<any> {
    return financeStorage.updateInvoice(id, data);
  }

  async getInvoicePaymentSchedules(invoiceId: string): Promise<any[]> {
    return financeStorage.getInvoicePaymentSchedules(invoiceId);
  }

  async splitInvoiceSchedule(scheduleId: string, splitAmount: number): Promise<{ updated: any; created: any }> {
    return financeStorage.splitInvoiceSchedule(scheduleId, splitAmount);
  }

  async updateInvoiceSchedule(scheduleId: string, data: { amount?: number; dueDate?: string | null }): Promise<any> {
    return financeStorage.updateInvoiceSchedule(scheduleId, data);
  }

  async updateInvoiceScheduleStatus(scheduleId: string, status: string): Promise<any> {
    return financeStorage.updateInvoiceScheduleStatus(scheduleId, status);
  }

  async updateInvoiceStatus(invoiceId: string, status: string): Promise<any> {
    return financeStorage.updateInvoiceStatus(invoiceId, status);
  }

  async deleteInvoice(id: string): Promise<void> {
    return financeStorage.deleteInvoice(id);
  }

  async deleteInvoiceSchedule(id: string): Promise<void> {
    return financeStorage.deleteInvoiceSchedule(id);
  }

  async appendSalaryPayment(invoiceId: string, amountPaid: number): Promise<any> {
    return financeStorage.appendSalaryPayment(invoiceId, amountPaid);
  }

  async migratePipelineStageToRelationshipIds(): Promise<void> {
    return financeStorage.migratePipelineStageToRelationshipIds();
  }

  async migrateContentLibrarySchema(): Promise<void> {
    return courseStorage.migrateContentLibrarySchema();
  }

  async migrateQuestionsTable(): Promise<void> {
    return questionStorage.migrateQuestionsTable();
  }

  async getQuestions(): Promise<Question[]> {
    return questionStorage.getQuestions();
  }

  async getQuestion(id: string): Promise<Question | undefined> {
    return questionStorage.getQuestion(id);
  }

  async createQuestion(data: InsertQuestion): Promise<Question> {
    return questionStorage.createQuestion(data);
  }

  async updateQuestion(id: string, data: Partial<InsertQuestion>): Promise<Question> {
    return questionStorage.updateQuestion(id, data);
  }

  async deleteQuestion(id: string): Promise<void> {
    return questionStorage.deleteQuestion(id);
  }

  async getInvoicePrintTemplates(): Promise<InvoicePrintTemplateRow[]> {
    return financeStorage.getInvoicePrintTemplates();
  }

  async getInvoicePrintTemplate(id: string): Promise<InvoicePrintTemplateRow | null> {
    return financeStorage.getInvoicePrintTemplate(id);
  }

  async createInvoicePrintTemplate(data: InsertInvoicePrintTemplate): Promise<InvoicePrintTemplateRow> {
    return financeStorage.createInvoicePrintTemplate(data);
  }

  async updateInvoicePrintTemplate(id: string, data: Partial<InsertInvoicePrintTemplate>): Promise<InvoicePrintTemplateRow> {
    return financeStorage.updateInvoicePrintTemplate(id, data);
  }

  async deleteInvoicePrintTemplate(id: string): Promise<void> {
    return financeStorage.deleteInvoicePrintTemplate(id);
  }

  async getDefaultInvoicePrintTemplate(invoiceType: string): Promise<InvoicePrintTemplateRow | null> {
    return financeStorage.getDefaultInvoicePrintTemplate(invoiceType);
  }

  async setDefaultInvoicePrintTemplate(id: string, invoiceType: string): Promise<InvoicePrintTemplateRow> {
    return financeStorage.setDefaultInvoicePrintTemplate(id, invoiceType);
  }

  async unsetDefaultInvoicePrintTemplate(id: string): Promise<InvoicePrintTemplateRow> {
    return financeStorage.unsetDefaultInvoicePrintTemplate(id);
  }
}

export const storage = new DatabaseStorage();

