import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authenticateVoip24h,
  fetchVoip24hCallHistory,
  fetchVoip24hExtensionList,
  fetchVoip24hRecordingMetadata,
  dialVoip24h,
} from "./voip24h.service";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authenticateVoip24h", () => {
  it("accepts provider status 200 and the current response field casing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: "Success",
      status: 200,
      data: {
        token: "test-access-token",
        createAt: "2026-11-21 10:00:00",
        expired: "2026-11-28 10:00:00",
        isLongLive: true,
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

  it("accepts legacy status and response field casing without the optional flag", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: "Success",
      status: 1000,
      data: {
        token: "test-access-token",
        expried: "2026-11-28 10:00:00",
        isLonglive: false,
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await authenticateVoip24h(
      { apiKey: "test-api-key", apiSecret: "test-api-secret", isLonglive: true },
      undefined,
      { omitIsLonglive: true },
    );

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toEqual({
      apiKey: "test-api-key",
      apiSecret: "test-api-secret",
    });
    expect(result).toEqual({
      token: "test-access-token",
      createAt: null,
      expiresAt: "2026-11-28 10:00:00",
      isLonglive: false,
    });
  });

  it("rejects responses that do not contain a successful status and token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: "Invalid API credentials",
      status: 4001,
      data: {},
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    let authError: unknown;
    try {
      await authenticateVoip24h({
        apiKey: "invalid",
        apiSecret: "invalid",
        isLonglive: false,
      });
    } catch (error) {
      authError = error;
    }

    expect(authError).toBeInstanceOf(Error);
    expect((authError as Error).message).toContain(
      "provider status is neither 200 nor 1000; provider status=4001; "
      + "top-level fields=[message, status, data]; data fields=[none]",
    );
  });

  it("reports safe response-field diagnostics without exposing token values", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: "Success",
      status: 1000,
      data: {
        access_token: "must-not-appear-in-error",
        token_type: "Bearer",
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    let authError: unknown;
    try {
      await authenticateVoip24h({
        apiKey: "test-api-key",
        apiSecret: "test-api-secret",
        isLonglive: true,
      });
    } catch (error) {
      authError = error;
    }

    expect(authError).toBeInstanceOf(Error);
    const errorMessage = (authError as Error).message;
    expect(errorMessage).toContain(
      "expected string token at data.token is missing; provider status=1000; "
      + "top-level fields=[message, status, data]; data fields=[access_token, token_type]",
    );
    expect(errorMessage).not.toContain("must-not-appear-in-error");
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

describe("VoIP24H extension list and click-to-call", () => {
  it("loads machine extensions with a server-side bearer token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 1000,
        data: { token: "extensions-access-token" },
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 200,
        data: ["201", { extension: "202" }, { ext: "203" }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchVoip24hExtensionList({
      apiKey: "extensions-api-key",
      apiSecret: "extensions-api-secret",
      isLonglive: true,
    }, "voip-extension-list-test-location");

    expect(result).toEqual(["201", "202", "203"]);
    const [url, request] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("https://api.voip24h.vn/v3/extension/list");
    expect((request.headers as Record<string, string>).Authorization)
      .toBe("Bearer extensions-access-token");
  });

  it("posts extension and phone to the documented dial endpoint without exposing the token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 1000,
        data: { token: "dial-access-token" },
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 200,
        data: {
          status: 1000,
          message: "success",
          data: { callid: "call-456", state: "ringing", phone: "0900000000", extension: "201" },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await dialVoip24h({
      apiKey: "dial-api-key",
      apiSecret: "dial-api-secret",
      isLonglive: true,
    }, "voip-dial-test-location", { extension: "201", phone: "0900000000" });

    expect(result).toEqual({
      callId: "call-456",
      state: "ringing",
      phone: "0900000000",
      extension: "201",
    });
    const [url, request] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("https://api.voip24h.vn/v3/call/dial");
    expect(request.method).toBe("POST");
    expect((request.headers as Record<string, string>).Authorization).toBe("Bearer dial-access-token");
    expect((request.headers as Record<string, string>)["Content-Type"])
      .toBe("application/x-www-form-urlencoded");
    expect(String(request.body)).toBe("extension=201&phone=0900000000");
  });

  it("rejects a dial response that omits the provider call id or state", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 1000,
        data: { token: "dial-access-token" },
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 200,
        message: "success",
        data: {
          status: 1000,
          message: "Success",
          data: { callid: "", state: "", phone: "0900000000", extension: "201" },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(dialVoip24h({
      apiKey: "dial-api-key",
      apiSecret: "dial-api-secret",
      isLonglive: true,
    }, "voip-dial-empty-response-test-location", { extension: "201", phone: "0900000000" }))
      .rejects.toThrow("VOIP24H chưa xác nhận cuộc gọi: phản hồi thiếu mã cuộc gọi hoặc trạng thái");
  });

  it("includes provider status codes when the dial API returns a generic error", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 1000,
        data: { token: "dial-access-token" },
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 200,
        message: "success",
        data: { status: 2000, message: "Error", data: "" },
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(dialVoip24h({
      apiKey: "dial-api-key",
      apiSecret: "dial-api-secret",
      isLonglive: true,
    }, "voip-dial-provider-error-test-location", { extension: "201", phone: "0900000000" }))
      .rejects.toThrow("VoIP24H từ chối lệnh gọi (HTTP 200; status=200; data.status=2000)");
  });
});
