import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authenticateVoip24h,
  fetchVoip24hCallHistory,
  fetchVoip24hRecordingMetadata,
} from "./voip24h.service";

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

describe("VoIP24H call history and recording", () => {
  it("authenticates server-side and sends documented history filters with a bearer token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 1000,
        data: { token: "history-access-token" },
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 200,
        data: [{ callid: "call-123", caller: "0900000000" }],
        totalData: 1,
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchVoip24hCallHistory({
      apiKey: "history-api-key",
      apiSecret: "history-api-secret",
      isLonglive: true,
    }, "voip-history-test-location", {
      dateStart: "2026-11-01",
      dateEnd: "2026-11-30",
      type: "inbound",
      offset: 0,
      limit: 50,
    });

    expect(result).toEqual({
      items: [{ callid: "call-123", caller: "0900000000" }],
      totalItems: 1,
    });
    const [historyUrl, historyRequest] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(new URL(String(historyUrl)).origin + new URL(String(historyUrl)).pathname)
      .toBe("https://api.voip24h.vn/v3/call/history");
    expect(new URL(String(historyUrl)).searchParams.get("dateStart")).toBe("2026-11-01");
    expect(new URL(String(historyUrl)).searchParams.get("type")).toBe("inbound");
    expect(new URL(String(historyUrl)).searchParams.get("limit")).toBe("50");
    expect((historyRequest.headers as Record<string, string>).Authorization)
      .toBe("Bearer history-access-token");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("requests recording metadata using the provider call ID and reuses the cached token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 1000,
        data: { token: "recording-access-token" },
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 200,
        data: { media: { wav: "https://media.telesales.voip24h.vn/example.wav" } },
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const media = await fetchVoip24hRecordingMetadata({
      apiKey: "recording-api-key",
      apiSecret: "recording-api-secret",
      isLonglive: true,
    }, "voip-recording-test-location", "call/123");

    expect(media.wav).toBe("https://media.telesales.voip24h.vn/example.wav");
    const [recordingUrl, recordingRequest] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(new URL(String(recordingUrl)).searchParams.get("callId")).toBe("call/123");
    expect((recordingRequest.headers as Record<string, string>).Authorization)
      .toBe("Bearer recording-access-token");
  });

  it("shares one token request across concurrent history requests for the same location", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 1000,
        data: { token: "shared-access-token" },
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockImplementation(async () => new Response(JSON.stringify({
        status: 200,
        data: [],
        totalData: 0,
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const credentials = {
      apiKey: "shared-api-key",
      apiSecret: "shared-api-secret",
      isLonglive: true,
    };
    await Promise.all([
      fetchVoip24hCallHistory(credentials, "voip-concurrent-test-location", { offset: 0, limit: 10 }),
      fetchVoip24hCallHistory(credentials, "voip-concurrent-test-location", { offset: 10, limit: 10 }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
