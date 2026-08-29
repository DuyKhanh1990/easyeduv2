export interface ChannelPayload {
  logId: string;
  studentId: string;
  centerId: string;
  type: string;
  data: Record<string, unknown>;
}

export interface INotificationChannel {
  send(payload: ChannelPayload): Promise<void>;
}
