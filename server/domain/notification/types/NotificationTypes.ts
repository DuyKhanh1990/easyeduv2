export const NotificationTypes = {
  ATTENDANCE_REMINDER: "attendance_reminder",
  CLASS_CHANGED: "class_changed",
  TUITION_DUE: "tuition_due",
  ATTENDANCE_RESULT: "attendance_result",
  SCHEDULE_UPDATE_SESSION: "schedule_update_session",
  SCHEDULE_CANCEL_SESSION: "schedule_cancel_session",
  SCHEDULE_UPDATE_CYCLE: "schedule_update_cycle",
  SCHEDULE_EXCLUDE_DATES: "schedule_exclude_dates",
  INVOICE_CREATED: "invoice_created",
  INVOICE_PAID: "invoice_paid",
  TEACHER_FEEDBACK: "teacher_feedback",
  SCORE_SHEET: "score_sheet",
} as const;

export type NotificationTypeValue = typeof NotificationTypes[keyof typeof NotificationTypes];
