import { NotificationChannel } from "../../../domain/notification/types/NotificationChannel";

export class ChannelResolver {
  async resolve(opts?: {
    zaloUserId?: string | null;
    isFollowed?: boolean;
    hasInteracted?: boolean;
    channelPriority?: string;
  }): Promise<NotificationChannel> {
    const priority = opts?.channelPriority ?? "AUTO";

    if (priority === "ZNS") return NotificationChannel.ZNS;
    if (priority === "OA") return NotificationChannel.OA;

    // AUTO: ưu tiên OA nếu student đã follow, fallback ZNS
    if (opts?.zaloUserId && opts?.isFollowed) {
      return NotificationChannel.OA;
    }

    return NotificationChannel.ZNS;
  }
}

export const channelResolver = new ChannelResolver();
