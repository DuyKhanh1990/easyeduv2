export type StudentClassData = {
  id: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  studentPhone: string | null;
  studentEmail: string | null;
  classCode: string;
  className: string;
  startDate: string;
  endDate: string;
  totalSessions: number;
  attendedSessions: number;
  remainingSessions: number;
  status: string;
};

export type GroupedStudent = {
  studentId: string;
  studentCode: string;
  studentName: string;
  classes: StudentClassData[];
};

export type TabKey = "overview" | "students-ending" | "classes-ending" | "cho-bu-bao-luu" | "bang-diem" | "bai-tap-ve-nha" | "nhan-xet-hoc-vien";

// ── Grade Book Tab ────────────────────────────────────────
export interface GradeBookRow {
  id: string;
  classId: string;
  title: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
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
