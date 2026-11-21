import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticateVoip24h } from "./voip24h.service";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authenticateVoip24h", () => {
  it("sends API credentials and a boolean lifetime flag, then parses the documented response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: "Success",
      status: 1000,
      data: {
        token: "test-access-token",
        createAt: "2026-11-21 10:00:00",
        expried: "2026-11-28 10:00:00",
        isLonglive: true,
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await authenticateVoip24h({
      apiKey: "test-api-key",
      apiSecret: "test-api-secret",
      isLonglive: true,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.voip24h.vn/v3/authentication");
    expect(request.method).toBe("POST");
    expect(JSON.parse(String(request.body))).toEqual({
      apiKey: "test-api-key",
      apiSecret: "test-api-secret",
      isLonglive: true,
    });
    expect(result).toEqual({
      token: "test-access-token",
      createAt: "2026-11-21 10:00:00",
      expiresAt: "2026-11-28 10:00:00",
      isLonglive: true,
    });
  });

  it("rejects responses that do not contain a successful status and token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: "Invalid API credentials",
      status: 4001,
      data: {},
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(authenticateVoip24h({
      apiKey: "invalid",
      apiSecret: "invalid",
      isLonglive: false,
    })).rejects.toThrow("Invalid API credentials");
  });
});
