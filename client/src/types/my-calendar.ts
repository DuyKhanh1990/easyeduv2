export interface SessionContentItem {
  id: string;
  type: string;
  title: string;
  description: string | null;
  resourceUrl: string | null;
}

export interface PersonalContentItem extends SessionContentItem {
  customTitle: string | null;
  customDescription: string | null;
}

export interface ReviewSubItem {
  subCriteriaName: string;
  comment: string;
}

export interface ReviewCriteriaGroup {
  criteriaName: string;
  items: ReviewSubItem[];
}

export interface TeacherReview {
  teacherName: string;
  criteria: ReviewCriteriaGroup[];
}

// Lightweight session — returned by the monthly calendar endpoint
export interface MyCalendarSessionLight {
  classSessionId: string;
  studentSessionId: string | null;
  sessionDate: string;
  weekday: number;
  className: string;
  classCode: string;
  startTime: string;
  endTime: string;
  learningFormat: string;
  sessionStatus: string;
  attendanceStatus: string | null;
  studentName?: string | null;
  studentCode?: string | null;
  studentId?: string | null;
}

// Full session detail — fetched on demand per session
export interface MyCalendarSession extends MyCalendarSessionLight {
  classId?: string;
  sessionIndex?: number | null;
  totalSessions?: number | null;
  locationName?: string | null;
  teachers?: { id: string; fullName: string; code: string | null }[];
  teacherNames: string[];
  evaluationCriteriaIds?: string[];
  attendanceNote: string | null;
  reviewData: TeacherReview[];
  reviewPublished: boolean;
  generalContents: SessionContentItem[];
  personalContents: PersonalContentItem[];
  userType: "student" | "staff";
  enrolledCount?: number;
  attendancePendingCount?: number;
  reviewedCount?: number;
  studentName?: string | null;
  studentCode?: string | null;
}

export interface MyCalendarResponse {
  sessions: MyCalendarSessionLight[];
  datesWithSessions: string[];
  month: string;
}
