import { describe, expect, it } from "vitest";
import { ChannelResolver } from "../server/application/notification/services/ChannelResolver";
import { NotificationChannel } from "../server/domain/notification/types/NotificationChannel";

describe("ChannelResolver after ZNS retirement", () => {
  it("routes followed students through the existing OA channel", async () => {
    const resolver = new ChannelResolver();
    await expect(resolver.resolve({ zaloUserId: "oa-user", isFollowed: true }))
      .resolves.toBe(NotificationChannel.OA);
  });

  it("keeps non-followers on the OA path so OAChannel can safely skip them", async () => {
    const resolver = new ChannelResolver();
    await expect(resolver.resolve({ zaloUserId: "oa-user", isFollowed: false }))
      .resolves.toBe(NotificationChannel.OA);
    await expect(resolver.resolve({ zaloUserId: null, isFollowed: false }))
      .resolves.toBe(NotificationChannel.OA);
  });
});
