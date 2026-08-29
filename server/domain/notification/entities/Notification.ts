import type { NotificationTypeValue } from "../types/NotificationTypes";

export interface Notification {
  id: string;
  centerId: string;
  studentId: string;
  type: NotificationTypeValue;
  channel: string;
  data: Record<string, unknown>;
  sentAt: Date;
}
