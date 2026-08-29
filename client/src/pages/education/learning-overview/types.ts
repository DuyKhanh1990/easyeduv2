export type StudentClassData = {
  id: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  studentPhone: string | null;
  studentEmail: string | null;
  classCode: string;
  className: string;
  classId?: string;
  startDate: string;
  endDate: string;
  totalSessions: number;
  attendedSessions: number;
  remainingSessions: number;
  status: string;
  accountStatus?: string | null;
  tuitionPackages?: StudentClassTuitionPackage[];
  invoiceSummary?: StudentClassInvoiceSummary | null;
};

export type StudentClassInvoiceSummary = {
  grandTotal: number;
  paidAmount: number;
  remainingAmount: number;
  count: number;
  status: string;
  invoiceCodes: string[];
};

export type StudentClassTuitionPackage = {
  packageId: string;
  name: string;
  registeredSessions: number | null;
  invoiceTotal: number;
  paidAmount: number;
  paymentRate: number;
  invoiceCount: number;
  invoiceCodes: string[];
  scheduledSessions: number;
  remainingUnscheduled: number | null;
  scheduleRate: number | null;
};

export type GroupedStudent = {
  studentId: string;
  studentCode: string;
  studentName: string;
  accountStatus?: string | null;
  classes: StudentClassData[];
};

export type TabKey = "overview" | "students-ending" | "classes-ending" | "cho-bu-bao-luu" | "bang-diem" | "bai-tap-ve-nha" | "nhan-xet-hoc-vien" | "cham-cong-giao-vien" | "xin-nghi";

// ── Grade Book Tab ────────────────────────────────────────
export interface GradeBookRow {
  id: string;
  classId: string;
  title: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  scoreSheetId: string | null;
  sessionId: string | null;
  className: string;
  locationName: string;
  scoreSheetName: string;
  createdByName: string;
  updatedByName: string;
}

export interface GradeBookListResponse {
  data: GradeBookRow[];
  total: number;
  page: number;
  pageSize: number;
  locations: { id: string; name: string }[];
}

export interface GradeBookFilters {
  search: string;
  locationId: string;
  published: "" | "true" | "false";
}
