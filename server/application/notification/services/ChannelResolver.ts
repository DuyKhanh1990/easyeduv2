import { NotificationChannel } from "../../../domain/notification/types/NotificationChannel";

export class ChannelResolver {
  async resolve(opts?: {
    zaloUserId?: string | null;
    isFollowed?: boolean;
    hasInteracted?: boolean;
  }): Promise<NotificationChannel> {
    // OAChannel remains the single outbound channel and safely skips recipients
    // who are not eligible (for example, a student who has not followed the OA).
    void opts;
    return NotificationChannel.OA;
  }
}

export const channelResolver = new ChannelResolver();
