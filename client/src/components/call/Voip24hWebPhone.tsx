import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowRightLeft, Loader2, Mic, MicOff, Pause, PhoneCall, PhoneOff, Play, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import {
  initVoip24hGateway,
  loadVoip24hWebRtc,
  subscribeVoip24hWebRtc,
  voip24hWebRtc,
} from "@/lib/voip24h-webrtc";

type Voip24hCallerLocation = {
  provider: "voip24h";
  locationId: string;
  locationName: string;
  extension: string;
  ready: boolean;
  webRtcReady: boolean;
};

type CallerResponse = {
  available: boolean;
  defaultLocationId: string | null;
  locations: Voip24hCallerLocation[];
};

type CredentialsResponse = {
  sipServerIp: string;
  extension: string;
  password: string;
};

type DirectCallRequest = {
  locationId: string;
  phone: string;
  displayName?: string;
};

type PhoneStatus = "idle" | "loading" | "registering" | "registered" | "calling" | "incoming" | "active" | "error";

function readIncomingNumber(data: unknown): string {
  if (typeof data === "string" || typeof data === "number") return String(data);
  if (!data || typeof data !== "object") return "Cuộc gọi đến";
  const record = data as Record<string, unknown>;
  for (const key of ["phoneNumber", "phone", "number", "caller", "callerNumber", "remoteNumber", "from", "caller_id"]) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  return "Cuộc gọi đến";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Không thể kết nối WebRTC VoIP24H.";
}

function normalizePhoneNumber(value: string): string {
  const stripped = value.replace(/[^\d+]/g, "");
  return stripped.startsWith("+")
    ? `+${stripped.slice(1).replace(/\+/g, "")}`
    : stripped.replace(/\+/g, "");
}

export function Voip24hWebPhone() {
  const [pathname] = useLocation();
  const { data: caller } = useQuery<CallerResponse>({
    queryKey: ["/api/call-center/voip24h/caller"],
    enabled: pathname !== "/login" && pathname !== "/dang-ky",
    retry: false,
    staleTime: 30_000,
  });
  const locations = useMemo(() => (caller?.locations || []).filter((item) => item.webRtcReady), [caller?.locations]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [status, setStatus] = useState<PhoneStatus>("idle");
  const [error, setError] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [contactName, setContactName] = useState("");
  const [incomingNumber, setIncomingNumber] = useState("");
  const [mute, setMute] = useState(false);
  const [hold, setHold] = useState(false);
  const [transferNumber, setTransferNumber] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const pendingCallRef = useRef<DirectCallRequest | null>(null);
  const currentLocationRef = useRef("");
  const registrationPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!selectedLocationId && locations.length) {
      setSelectedLocationId(caller?.defaultLocationId && locations.some((item) => item.locationId === caller.defaultLocationId)
        ? caller.defaultLocationId
        : locations[0].locationId);
    }
  }, [caller?.defaultLocationId, locations, selectedLocationId]);

  const placeQueuedCall = useCallback(() => {
    const queued = pendingCallRef.current;
    if (!queued || !voip24hWebRtc.isRegistered()) return;
    pendingCallRef.current = null;
    const normalizedPhone = normalizePhoneNumber(queued.phone);
    if (!/^\+?\d{6,20}$/.test(normalizedPhone)) {
      setStatus("error");
      setError("Số điện thoại không hợp lệ.");
      return;
    }
    setPhoneNumber(normalizedPhone);
    setContactName(queued.displayName || "");
    try {
      voip24hWebRtc.call(normalizedPhone);
      setStatus("calling");
      setError("");
    } catch (callError) {
      setStatus("error");
      setError(getErrorMessage(callError));
    }
  }, []);

  useEffect(() => {
    return subscribeVoip24hWebRtc(({ event, data }) => {
      if (event === "register") {
        if (voip24hWebRtc.isRegistered()) {
          setStatus("registered");
          setError("");
          if (registrationPollRef.current) clearInterval(registrationPollRef.current);
          registrationPollRef.current = null;
          placeQueuedCall();
        }
        return;
      }
      if (event === "incomingcall") {
        let details = data;
        try {
          details = voip24hWebRtc.incomingCall() ?? data;
        } catch {
          // The event payload remains the fallback if this optional helper is unavailable.
        }
        setIncomingNumber(readIncomingNumber(details));
        setPanelOpen(true);
        setStatus("incoming");
        setError("");
        return;
      }
      if (event === "progress") {
        setStatus("calling");
        return;
      }
      if (event === "accepted") {
        setStatus("active");
        setMute(voip24hWebRtc.isMute());
        setHold(voip24hWebRtc.isHold());
        return;
      }
      if (["hangup", "ended", "rejected", "failed"].includes(event)) {
        setStatus(voip24hWebRtc.isRegistered() ? "registered" : "idle");
        setIncomingNumber("");
        setPhoneNumber("");
      }
    });
  }, [placeQueuedCall]);

  useEffect(() => {
    const onDirectCall = (event: Event) => {
      const detail = (event as CustomEvent<DirectCallRequest>).detail;
      if (!detail?.locationId || !detail.phone) return;
      pendingCallRef.current = detail;
      setSelectedLocationId(detail.locationId);
      setPhoneNumber(detail.phone);
      setContactName(detail.displayName || "");
      setPanelOpen(true);
      setError("");
      if (currentLocationRef.current === detail.locationId && voip24hWebRtc.isRegistered()) {
        placeQueuedCall();
      }
    };
    window.addEventListener("voip24h:browser-call", onDirectCall);
    return () => window.removeEventListener("voip24h:browser-call", onDirectCall);
  }, [placeQueuedCall]);

  useEffect(() => () => {
    if (registrationPollRef.current) clearInterval(registrationPollRef.current);
  }, []);

  const startRegistration = async () => {
    if (!selectedLocationId) {
      setError("Chọn cơ sở đã cấu hình máy nhánh WebRTC.");
      return;
    }
    setStatus("loading");
    setError("");
    try {
      const response = await apiRequest("POST", "/api/call-center/voip24h/webrtc-credentials", {
        locationId: selectedLocationId,
      });
      const credentials = await response.json() as CredentialsResponse;
      await loadVoip24hWebRtc();
      await initVoip24hGateway();
      currentLocationRef.current = selectedLocationId;
      setStatus("registering");
      voip24hWebRtc.register(credentials.sipServerIp, credentials.extension, credentials.password);

      if (registrationPollRef.current) clearInterval(registrationPollRef.current);
      const startedAt = Date.now();
      registrationPollRef.current = setInterval(() => {
        try {
          if (voip24hWebRtc.isRegistered()) {
            setStatus("registered");
            setError("");
            if (registrationPollRef.current) clearInterval(registrationPollRef.current);
            registrationPollRef.current = null;
            placeQueuedCall();
          } else if (Date.now() - startedAt > 30_000) {
            if (registrationPollRef.current) clearInterval(registrationPollRef.current);
            registrationPollRef.current = null;
            setStatus("error");
            setError("Chưa đăng ký được máy nhánh sau 30 giây. Kiểm tra IP SIP, mật khẩu và quyền microphone.");
          }
        } catch (pollError) {
          if (registrationPollRef.current) clearInterval(registrationPollRef.current);
          registrationPollRef.current = null;
          setStatus("error");
          setError(getErrorMessage(pollError));
        }
      }, 500);
    } catch (connectionError) {
      setStatus("error");
      setError(getErrorMessage(connectionError));
    }
  };

  const startCall = () => {
    const inputPhone = phoneNumber.trim();
    const phone = normalizePhoneNumber(inputPhone);
    if (inputPhone && !/^\+?\d{6,20}$/.test(phone)) {
      setError("Số điện thoại không hợp lệ.");
      return;
    }
    setError("");
    if (voip24hWebRtc.isRegistered() && currentLocationRef.current === selectedLocationId) {
      if (!phone) {
        setStatus("registered");
        return;
      }
      try {
        voip24hWebRtc.call(phone);
        setStatus("calling");
      } catch (callError) {
        setStatus("error");
        setError(getErrorMessage(callError));
      }
      return;
    }
    pendingCallRef.current = phone
      ? { locationId: selectedLocationId, phone, displayName: contactName }
      : null;
    void startRegistration();
  };

  const hangUp = () => {
    try {
      voip24hWebRtc.hangUp();
      setStatus(voip24hWebRtc.isRegistered() ? "registered" : "idle");
      setIncomingNumber("");
      setPhoneNumber("");
      setMute(false);
      setHold(false);
    } catch (callError) {
      setError(getErrorMessage(callError));
    }
  };

  const answerCall = () => {
    try {
      voip24hWebRtc.answer();
      setStatus("active");
      setError("");
    } catch (callError) {
      setError(getErrorMessage(callError));
    }
  };

  const rejectCall = () => {
    try {
      voip24hWebRtc.reject();
      setIncomingNumber("");
      setStatus(voip24hWebRtc.isRegistered() ? "registered" : "idle");
    } catch (callError) {
      setError(getErrorMessage(callError));
    }
  };

  const toggleMicrophone = () => {
    try {
      voip24hWebRtc.toggleMute();
      setMute(voip24hWebRtc.isMute());
    } catch (callError) {
      setError(getErrorMessage(callError));
    }
  };

  const toggleCallHold = () => {
    try {
      voip24hWebRtc.toggleHold();
      setHold(voip24hWebRtc.isHold());
    } catch (callError) {
      setError(getErrorMessage(callError));
    }
  };

  const transferCall = () => {
    const target = transferNumber.trim();
    if (!target) {
      setError("Nhập số cần chuyển cuộc gọi tới.");
      return;
    }
    try {
      voip24hWebRtc.transfer(target);
      setIsTransferring(false);
      setTransferNumber("");
      setError("");
    } catch (callError) {
      setError(getErrorMessage(callError));
    }
  };

  const sendDtmf = (digit: string) => {
    try {
      voip24hWebRtc.sendDtmf(digit);
    } catch (callError) {
      setError(getErrorMessage(callError));
    }
  };

  if (pathname === "/login" || pathname === "/dang-ky" || !locations.length) return null;

  const selectedLocation = locations.find((location) => location.locationId === selectedLocationId);
  const statusLabel: Record<PhoneStatus, string> = {
    idle: "Chưa kết nối",
    loading: "Đang tải cấu hình…",
    registering: "Đang đăng ký máy nhánh…",
    registered: "Đã kết nối, sẵn sàng gọi",
    calling: "Đang gọi…",
    incoming: "Có cuộc gọi đến",
    active: "Đang trong cuộc gọi",
    error: "Không kết nối được",
  };
  const busy = status === "loading" || status === "registering";
  const inCall = status === "calling" || status === "active";

  return (
    <div className="fixed bottom-4 right-4 z-[10020] font-sans">
      {!panelOpen ? (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-indigo-700"
          aria-label="Mở điện thoại VoIP24H"
          data-testid="button-open-voip24h-webphone"
        >
          <PhoneCall className="h-4 w-4" />
          Webphone VoIP24H
          {status === "incoming" && <span className="h-2 w-2 animate-pulse rounded-full bg-amber-300" />}
        </button>
      ) : (
        <section className="w-[min(370px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <header className="flex items-start justify-between gap-3 bg-indigo-700 px-4 py-3 text-white">
            <div>
              <p className="text-sm font-bold">Điện thoại VoIP24H</p>
              <p className="mt-0.5 text-xs text-indigo-100">{statusLabel[status]}</p>
            </div>
            <button
              type="button"
              className="rounded-md p-1 text-indigo-100 hover:bg-indigo-600 hover:text-white"
              onClick={() => setPanelOpen(false)}
              aria-label="Thu nhỏ điện thoại"
              data-testid="button-minimize-voip24h-webphone"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="space-y-3 p-4">
            <label className="block text-xs font-medium text-slate-600">
              Cơ sở / máy nhánh
              <select
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 disabled:bg-slate-100"
                value={selectedLocationId}
                onChange={(event) => {
                  setSelectedLocationId(event.target.value);
                  setError("");
                }}
                disabled={busy || inCall}
                data-testid="select-voip24h-webphone-location"
              >
                {locations.map((location) => (
                  <option key={location.locationId} value={location.locationId}>
                    {location.locationName} · {location.extension}
                  </option>
                ))}
              </select>
            </label>

            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {selectedLocation ? `${selectedLocation.locationName} · máy lẻ ${selectedLocation.extension}` : "Chọn máy nhánh"}
              {" · "}Cho phép microphone trên trình duyệt khi được hỏi.
            </p>

            {status === "incoming" ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-900">Cuộc gọi đến</p>
                <p className="mt-1 text-lg font-semibold text-slate-800">{incomingNumber}</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={answerCall} className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700" data-testid="button-answer-voip24h-call">Nghe máy</button>
                  <button type="button" onClick={rejectCall} className="flex-1 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700" data-testid="button-reject-voip24h-call">Từ chối</button>
                </div>
              </div>
            ) : (
              <>
                <label className="block text-xs font-medium text-slate-600">
                  Số điện thoại
                  <input
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    value={phoneNumber}
                    onChange={(event) => setPhoneNumber(event.target.value)}
                    placeholder="Nhập số điện thoại"
                    disabled={inCall}
                    data-testid="input-voip24h-webphone-number"
                  />
                </label>
                {contactName && <p className="-mt-2 text-xs text-slate-500">{contactName}</p>}

                {inCall ? (
                  <div className="space-y-3 rounded-xl bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{phoneNumber || incomingNumber || "Cuộc gọi"}</p>
                        <p className="text-xs text-slate-500">{statusLabel[status]}</p>
                      </div>
                      <button type="button" onClick={hangUp} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white hover:bg-rose-700" aria-label="Kết thúc cuộc gọi" data-testid="button-hangup-voip24h-call">
                        <PhoneOff className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <button type="button" onClick={toggleMicrophone} className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100" data-testid="button-toggle-voip24h-mute">
                        {mute ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}{mute ? "Mở mic" : "Tắt mic"}
                      </button>
                      <button type="button" onClick={toggleCallHold} className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100" data-testid="button-toggle-voip24h-hold">
                        {hold ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{hold ? "Nghe lại" : "Giữ"}
                      </button>
                      <button type="button" onClick={() => setIsTransferring((value) => !value)} className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100" data-testid="button-open-voip24h-transfer">
                        <ArrowRightLeft className="h-4 w-4" />Chuyển
                      </button>
                    </div>
                    {isTransferring && (
                      <div className="flex gap-2">
                        <input className="h-9 min-w-0 flex-1 rounded-lg border border-slate-300 px-2 text-sm" value={transferNumber} onChange={(event) => setTransferNumber(event.target.value)} placeholder="Số nhận chuyển" data-testid="input-voip24h-transfer-number" />
                        <button type="button" onClick={transferCall} className="rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700" data-testid="button-confirm-voip24h-transfer">Chuyển</button>
                      </div>
                    )}
                    <div className="grid grid-cols-4 gap-1.5">
                      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((digit) => (
                        <button key={digit} type="button" onClick={() => sendDtmf(digit)} className="rounded-md border border-slate-200 bg-white py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100" aria-label={`Gửi phím ${digit}`} data-testid={`button-voip24h-dtmf-${digit}`}>{digit}</button>
                      ))}
                    </div>
                  </div>
                ) : status === "registered" ? (
                  <button type="button" onClick={startCall} className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700" data-testid="button-call-from-voip24h-webphone">
                    <PhoneCall className="h-4 w-4" />Gọi
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startCall}
                    disabled={busy}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60"
                    data-testid="button-connect-voip24h-webphone"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
                    {busy ? statusLabel[status] : (pendingCallRef.current || phoneNumber.trim()) ? "Kết nối và gọi" : "Kết nối máy nhánh"}
                  </button>
                )}
              </>
            )}

            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">{error}</p>}
            {status === "error" && (
              <button type="button" onClick={startRegistration} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" data-testid="button-retry-voip24h-webphone">Thử kết nối lại</button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
