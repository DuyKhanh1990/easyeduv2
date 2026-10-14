import { afterEach, describe, expect, it, vi } from "vitest";
import { zbsTemplateChannel } from "../server/infrastructure/notification/channels/ZBSTemplateChannel";

describe("ZBS template channel foundation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is disabled by default", () => {
    expect(zbsTemplateChannel.enabled).toBe(false);
  });

  it("rejects sending even with a fake token and never makes a network request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("Network access blocked in test"),
    );

    await expect(zbsTemplateChannel.send({
      accessToken: "fake-zalo-access-token",
      userId: "fake-user-id",
      templateId: "fake-template-id",
      templateData: { sample: "test" },
    })).rejects.toThrow("ZBS_TEMPLATE_SEND_DISABLED");

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
