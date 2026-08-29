export interface SessionContentItem {
  id: string;
  type: string;
  title: string;
  description: string | null;
  resourceUrl: string | null;
  availableAt?: string | null;
  maxAttempts?: number | null;
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
  rating?: number;
}

export interface TeacherReview {
  teacherName: string;
  criteria: ReviewCriteriaGroup[];
}

export interface OnlineRuleConfig {
  id: string;
  locationId: string;
  earlyEntryMinutes: number;
  lateEntryMinutes: number;
  earlyEndMinutes: number;
}

// Lightweight session — returned by the monthly calendar endpoint
export interface MyCalendarSessionLight {
  classSessionId: string;
  studentSessionId: string | null;
  sessionDate: string;
  weekday: number;
  className: string;
  classCode: string;
  classId?: string | null;
  classColor?: string | null;
  startTime: string;
  endTime: string;
  learningFormat: string;
  onlineLink: string | null;
  locationId: string | null;
  sessionStatus: string;
  attendanceStatus: string | null;
  studentName?: string | null;
  studentCode?: string | null;
  studentId?: string | null;
  checkInAt?: string | null;
  checkOutAt?: string | null;
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
  onlineClickedAt?: string | null;
  onlineEndedAt?: string | null;
}

export interface MyCalendarResponse {
  sessions: MyCalendarSessionLight[];
  datesWithSessions: string[];
  month: string;
  staffId?: string;
}
