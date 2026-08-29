export interface AssignmentAttachment {
  name: string;
  url: string;
}

export interface AssignmentRow {
  classSessionId: string;
  classId?: string;
  className: string;
  classCode: string;
  sessionDate: string;
  weekday: number;
  startTime: string;
  endTime: string;
  sessionIndex: number | null;
  studentId: string;
  studentName: string;
  studentCode?: string | null;
  itemType: "BTVN" | "Bài kiểm tra";
  homeworkId: string;
  homeworkTitle: string;
  homeworkDescription: string | null;
  homeworkAttachments: AssignmentAttachment[];
  isPersonalized: boolean;
  submissionStatus: "submitted" | "pending";
  submissionContent: string | null;
  submissionAttachments: AssignmentAttachment[];
  studentSessionContentId: string | null;
  score: string | null;
  comment: string | null;
  examId: string | null;
  submissionId?: string | null;
  maxAttempts?: number | null;
  attemptsUsed?: number | null;
  dueDate?: string | null;
}

export interface MyAssignmentsResponse {
  rows: AssignmentRow[];
  month: string;
}
