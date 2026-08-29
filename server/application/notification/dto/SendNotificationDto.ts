export interface SendNotificationDto {
  centerId: string;
  studentId: string;
  type: string;
  data: Record<string, unknown>;
}
