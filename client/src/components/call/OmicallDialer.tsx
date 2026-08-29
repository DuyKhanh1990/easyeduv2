import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2, Delete, Loader2, Phone, PhoneCall, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type OmicallSdk = {
  init: (config: Record<string, unknown>) => Promise<boolean>;
  register: (config: {
    sipRealm: string;
    sipUser: string;
    sipPassword: string;
  }) => Promise<{ status: boolean; message?: string; error?: string }>;
  makeCall?: (
    remoteNumber: string,
    options?: {
      isVideo?: boolean;
      sipNumber?: { number: string };
      remoteContact?: {
        name: string;
        avatar?: string;
        gender?: "male" | "female" | "other";
      };
      userData?: string;
    } | null,
  ) => void;
  remoteCall: (remoteNumber: string, sipNumber?: string) => void;
  on?: {
    (eventName: "register", callback: (data: OmicallRegisterData) => void): void;
    (eventName: OmicallCallEventName, callback: (data: OmicallCallData) => void): void;
  };
  off?: {
    (eventName: "register", callback: (data: OmicallRegisterData) => void): void;
    (eventName: OmicallCallEventName, callback: (data: OmicallCallData) => void): void;
  };
};

type OmicallRegisterData = {
  status: "connecting" | "connected" | "disconnect";
  name?: string;
};

type OmicallCallEventName =
  | "connecting"
  | "ringing"
  | "on_ringing"
  | "accepted"
  | "on_calling"
  | "ended";

type OmicallCallData = {
  uid?: string;
  state: "connecting" | "ringing" | "accepted" | "ended";
  remoteNumber?: string;
  displayNumber?: string;
  ringingDuration?: { text?: string };
  callingDuration?: { text?: string };
  end?: () => void;
  minimize?: () => void;
};

type OmicallCredentials = {
  sipRealm: string;
  sipUser: string;
  sipPassword: string;
  sipNumber: string;
};

declare global {
  interface Window {
    OMICallSDK?: OmicallSdk;
  }
}

type CallerLocation = {
  locationId: string;
  locationName: string;
  extension: string;
  hotline?: string;
  ready: boolean;
};

type CallerResponse = {
  available: boolean;
  locations: CallerLocation[];
  defaultLocationId: string | null;
};

type PhoneOwnerResponse = {
  customers: Array<{ id: string; name: string; code: string; phone: string | null; locationId: string | null }>;
  staff: Array<{ id: string; name: string; code: string; phone: string | null; locationId: string | null; extension: string | null }>;
};

type DirectCallRequest = {
  phoneNumber?: string;
  locationId?: string;
  displayName?: string;
};

const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "0", "#"];
const OMICALL_WEB_SDK_SRC = "https://cdn.omicrm.com/sdk/web/3.0.46/core.min.js";
let omicallSdkPromise: Promise<OmicallSdk> | null = null;
let omicallSdkInitPromise: Promise<OmicallSdk> | null = null;
let omicallRegisteredKey: string | null = null;
let omicallRegistrationPromise: Promise<void> | null = null;
const omicallContactNames = new Map<string, string>();

function normalizeOmicallPhone(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length > 9) return `0${digits.slice(2)}`;
  return digits;
}

function getRemoteNumberFromOmicallCallData(callData: unknown) {
  if (!callData || typeof callData !== "object") return "";
  const data = callData as Record<string, unknown>;
  const remote = data.remoteContact && typeof data.remoteContact === "object"
    ? data.remoteContact as Record<string, unknown>
    : null;
  return String(
    data.remoteNumber ||
      data.phone ||
      data.number ||
      remote?.phone ||
      remote?.number ||
      "",
  );
}

function loadOmicallSdk(): Promise<OmicallSdk> {
  if (window.OMICallSDK) return Promise.resolve(window.OMICallSDK);
  if (omicallSdkPromise) return omicallSdkPromise;

  omicallSdkPromise = new Promise<OmicallSdk>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${OMICALL_WEB_SDK_SRC}"]`,
    );
    const script = existingScript || document.createElement("script");
    const finish = () => {
      if (window.OMICallSDK) resolve(window.OMICallSDK);
      else reject(new Error("Không tải được Web SDK Omicall"));
    };

    script.addEventListener("load", finish, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Không thể tải Web SDK Omicall")),
      { once: true },
    );
    if (!existingScript) {
      script.src = OMICALL_WEB_SDK_SRC;
      script.async = true;
      script.setAttribute("omi-call-sdk", "");
      document.head.appendChild(script);
    }
  }).catch((error) => {
    omicallSdkPromise = null;
    throw error;
  });

  return omicallSdkPromise;
}

async function getInitializedOmicallSdk(minimizeNewCall = false): Promise<OmicallSdk> {
  if (omicallSdkInitPromise) return omicallSdkInitPromise;

  omicallSdkInitPromise = loadOmicallSdk()
    .then(async (sdk) => {
      const initialized = await sdk.init({
        lng: "vi",
        ui: {
          toggleDial: "hide",
          ...(minimizeNewCall ? { minimizeNewCall: true } : {}),
        },
        searchRemoteContact: async (callData: unknown) => {
          const remoteNumber = normalizeOmicallPhone(getRemoteNumberFromOmicallCallData(callData));
          const name = remoteNumber ? omicallContactNames.get(remoteNumber) : undefined;
          return name ? { name } : null;
        },
      });
      if (!initialized) throw new Error("Không khởi tạo được Web SDK Omicall");
      return sdk;
    })
    .catch((error) => {
      omicallSdkInitPromise = null;
      throw error;
    });

  return omicallSdkInitPromise;
}

function getOmicallRegistrationKey(credentials: OmicallCredentials) {
  return `${credentials.sipRealm}:${credentials.sipUser}`;
}

function waitForOmicallConnection(sdk: OmicallSdk) {
  let resolveWaiter: () => void = () => {};
  let rejectWaiter: (error: Error) => void = () => {};
  let settled = false;
  const promise = new Promise<void>((resolve, reject) => {
    resolveWaiter = resolve;
    rejectWaiter = reject;
  });

  if (!sdk.on || !sdk.off) {
    return { promise: Promise.resolve(), cancel: () => {} };
  }

  const finish = (error?: Error) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeoutId);
    sdk.off?.("register", handleRegister);
    if (error) rejectWaiter(error);
    else resolveWaiter();
  };
  const handleRegister = (data: OmicallRegisterData) => {
    if (data?.status === "connected") finish();
    if (data?.status === "disconnect") {
      finish(new Error("Chưa kết nối được với tổng đài Omicall"));
    }
  };
  const timeoutId = window.setTimeout(() => {
    finish(new Error("Kết nối tới tổng đài Omicall quá thời gian chờ"));
  }, 10_000);

  sdk.on("register", handleRegister);
  return { promise, cancel: () => finish() };
}

async function ensureOmicallRegistered(
  sdk: OmicallSdk,
  credentials: OmicallCredentials,
) {
  const registrationKey = getOmicallRegistrationKey(credentials);

  if (omicallRegisteredKey === registrationKey) return;
  if (omicallRegisteredKey && omicallRegisteredKey !== registrationKey) {
    throw new Error(
      "Web SDK Omicall đang đăng ký một máy lẻ khác. Vui lòng tải lại trang trước khi đổi cơ sở gọi.",
    );
  }

  if (!omicallRegistrationPromise) {
    omicallRegistrationPromise = (async () => {
      const connectionWaiter = waitForOmicallConnection(sdk);
      const registration = await sdk.register({
        sipRealm: credentials.sipRealm,
        sipUser: credentials.sipUser,
        sipPassword: credentials.sipPassword,
      });
      const registrationError = `${registration.error || ""} ${registration.message || ""}`.toUpperCase();

      // The SDK keeps the SIP registration alive after a call ends. This can
      // also happen after a hot reload, so an already-registered response is
      // safe to reuse for the same credentials instead of registering again.
      if (!registration.status && !registrationError.includes("ALREADY_REGISTERED")) {
        connectionWaiter.cancel();
        throw new Error(
          registration.error ||
            registration.message ||
            "Không đăng ký được máy lẻ Omicall",
        );
      }

      if (registration.status) {
        await connectionWaiter.promise;
      } else {
        connectionWaiter.cancel();
      }

      omicallRegisteredKey = registrationKey;
    })();
  }

  try {
    await omicallRegistrationPromise;
  } finally {
    omicallRegistrationPromise = null;
  }
}

export function OmicallDialer() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [locationId, setLocationId] = useState("");
  const [callContactName, setCallContactName] = useState("");
  const requestedOmicallMethod = new URLSearchParams(window.location.search).get(
    "omicallMethod",
  );
  const useMakeCall = requestedOmicallMethod !== "remoteCall";
  const [sdkCall, setSdkCall] = useState<OmicallCallData | null>(null);

  useEffect(() => {
    if (!useMakeCall) return;

    let disposed = false;
    let sdk: OmicallSdk | null = null;
    const events: OmicallCallEventName[] = [
      "connecting",
      "ringing",
      "on_ringing",
      "accepted",
      "on_calling",
      "ended",
    ];
    const handleCallEvent = (data: OmicallCallData) => {
      if (disposed || !data) return;
      setSdkCall(data);
      if (data.state !== "ended") {
        setOpen(false);
      }
    };

    getInitializedOmicallSdk(true)
      .then((initializedSdk) => {
        if (disposed || !initializedSdk.on) return;
        sdk = initializedSdk;
        events.forEach((eventName) => initializedSdk.on?.(eventName, handleCallEvent));
      })
      .catch(() => {
        // The mutation will surface initialization errors when the user calls.
      });

    return () => {
      disposed = true;
      if (sdk?.off) {
        events.forEach((eventName) => sdk?.off?.(eventName, handleCallEvent));
      }
    };
  }, [useMakeCall]);

  const { data: caller } = useQuery<CallerResponse>({
    queryKey: ["/api/call-center/omicall/caller"],
    staleTime: 30_000,
    retry: false,
  });

  const lookupPhone = normalizeOmicallPhone(phoneNumber);
  const { data: phoneOwner, isFetching: isLookingUpPhone } = useQuery<PhoneOwnerResponse>({
    queryKey: ["/api/call-center/omicall/phone-owner", lookupPhone],
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/call-center/omicall/phone-owner?phone=${encodeURIComponent(lookupPhone)}`,
      );
      return response.json();
    },
    enabled: open && lookupPhone.length >= 9,
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => {
    if (!locationId && caller?.defaultLocationId) {
      setLocationId(caller.defaultLocationId);
    }
    if (locationId && caller?.locations && !caller.locations.some((item) => item.locationId === locationId)) {
      setLocationId(caller.defaultLocationId || "");
    }
  }, [caller, locationId]);

  const callMutation = useMutation<
    { message?: string },
    Error,
    DirectCallRequest | undefined
  >({
    mutationFn: async (request?: DirectCallRequest) => {
      const targetLocationId = request?.locationId || locationId;
      const targetPhoneNumber = request?.phoneNumber || phoneNumber;
      const targetDisplayName = request?.displayName?.trim() || "";
      if (!targetLocationId) throw new Error("Chưa chọn cơ sở gọi");
      if (!targetPhoneNumber.trim()) throw new Error("Vui lòng nhập số điện thoại cần gọi");
      setCallContactName(targetDisplayName);
      if (targetDisplayName) {
        omicallContactNames.set(normalizeOmicallPhone(targetPhoneNumber), targetDisplayName);
      }
      const credentialsResponse = await apiRequest(
        "GET",
        `/api/call-center/omicall/sdk-credentials?locationId=${encodeURIComponent(targetLocationId)}`,
      );
      const credentials = (await credentialsResponse.json()) as OmicallCredentials;
      const sdk = await getInitializedOmicallSdk(useMakeCall);
      await ensureOmicallRegistered(sdk, credentials);
      if (useMakeCall) {
        if (!sdk.makeCall) {
          throw new Error("Web SDK hiện tại chưa hỗ trợ makeCall()");
        }
        setSdkCall(null);
        sdk.makeCall(targetPhoneNumber, {
          sipNumber: { number: credentials.sipNumber },
          ...(targetDisplayName
            ? { remoteContact: { name: targetDisplayName } }
            : {}),
          userData: "Edu click-to-call",
        });
        return { message: "Đã khởi tạo cuộc gọi bằng makeCall()" };
      }

      sdk.remoteCall(targetPhoneNumber, credentials.sipNumber);
      return { message: `Đã khởi tạo cuộc gọi qua máy lẻ ${credentials.sipUser}` };
    },
    onSuccess: (data: { message?: string }) => {
      toast({ title: "Đã yêu cầu gọi", description: data.message || "Omicall đang thực hiện cuộc gọi." });
      setPhoneNumber("");
    },
    onError: (error: any) => {
      toast({
        title: "Không thể gọi",
        description: error?.message || "Không thể thực hiện cuộc gọi qua Omicall.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    const handleDirectCall = (event: Event) => {
      const detail = (event as CustomEvent<DirectCallRequest & { autoCall?: boolean }>).detail;
      if (!detail?.phoneNumber) return;

      const targetLocationId = detail.locationId || locationId;
      setPhoneNumber(detail.phoneNumber);
      if (targetLocationId) setLocationId(targetLocationId);
      setOpen(true);

      if (detail.autoCall) {
        callMutation.mutate({
          phoneNumber: detail.phoneNumber,
          locationId: targetLocationId,
          displayName: detail.displayName,
        });
      }
    };

    window.addEventListener("omicall:direct-call", handleDirectCall);
    return () => window.removeEventListener("omicall:direct-call", handleDirectCall);
  }, [callMutation, locationId]);

  if (!caller?.available || caller.locations.length === 0) return null;

  const activeSdkCall = sdkCall && sdkCall.state !== "ended" ? sdkCall : null;
  const callStatusLabel =
    sdkCall?.state === "connecting"
      ? "Đang kết nối..."
      : sdkCall?.state === "ringing"
        ? "Đang đổ chuông..."
        : sdkCall?.state === "accepted"
          ? "Đã kết nối"
          : sdkCall?.state === "ended"
            ? "Cuộc gọi đã kết thúc"
            : "";
  const callDuration =
    sdkCall?.state === "accepted"
      ? sdkCall.callingDuration?.text
      : sdkCall?.ringingDuration?.text;

  const appendDigit = (digit: string) => {
    setPhoneNumber((current) => (current.length >= 15 ? current : `${current}${digit}`));
  };

  const dialer = (
    <>
      <button
        type="button"
        aria-label={activeSdkCall ? "Mở cuộc gọi Omicall đang diễn ra" : "Mở bàn phím gọi Omicall"}
        data-testid="button-open-omicall-dialer"
        onClick={() => setOpen((value) => !value)}
        className={`fixed bottom-5 right-5 z-[9997] flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl shadow-emerald-900/25 transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 ${
          activeSdkCall
            ? "bg-emerald-500 ring-4 ring-emerald-200/80 hover:bg-emerald-600 dark:ring-emerald-900"
            : "bg-emerald-600 hover:bg-emerald-700"
        }`}
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : activeSdkCall ? (
          <PhoneCall className="h-6 w-6 animate-pulse" />
        ) : (
          <Phone className="h-6 w-6" />
        )}
      </button>

      {open && (
        <section
          aria-label="Bàn phím gọi Omicall"
          data-testid="omicall-dialer"
          className="fixed bottom-24 right-5 z-[9997] w-[min( calc(100vw-2rem),340px)] overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-2xl dark:border-emerald-900 dark:bg-slate-950"
        >
          <div className="flex items-center justify-between bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 text-white">
            <div>
              <p className="text-sm font-semibold">Gọi qua Omicall</p>
               <p className="text-[11px] text-emerald-50">
                 {useMakeCall ? "Gọi nhanh bằng Web SDK" : "Nhập số điện thoại để gọi đi"}
               </p>
            </div>
            <PhoneCall className="h-5 w-5" />
          </div>

          <div className="space-y-3 p-4">
            {caller.locations.length > 1 ? (
              <label className="block">
                <span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" /> Cơ sở gọi
                </span>
                <select
                  value={locationId}
                  onChange={(event) => setLocationId(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30"
                >
                  {caller.locations.map((item) => (
                    <option key={item.locationId} value={item.locationId}>
                      {item.locationName} · máy lẻ {item.extension}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                <span>{caller.locations[0].locationName}</span>
                <span className="font-semibold">Máy lẻ {caller.locations[0].extension}</span>
              </div>
            )}

            {useMakeCall && sdkCall && (
              <div
                className={`rounded-lg border px-3 py-2 ${
                  activeSdkCall
                    ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                    : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                }`}
                data-testid="omicall-call-status"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{callStatusLabel}</span>
                  {callDuration && <span className="text-xs tabular-nums">{callDuration}</span>}
                </div>
                <p className="mt-1 text-sm font-medium">
                  {callContactName || sdkCall.displayNumber || sdkCall.remoteNumber || "Số đang gọi"}
                </p>
              </div>
            )}

            <div className="relative">
              <Input
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value.replace(/[^\d+#*+]/g, "").slice(0, 15))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") callMutation.mutate(undefined);
                }}
                placeholder="090 123 4567"
                inputMode="tel"
                autoFocus
                className="h-11 pr-10 text-center text-lg font-semibold tracking-wider"
                data-testid="input-omicall-phone-number"
              />
              {phoneNumber && (
                <button
                  type="button"
                  aria-label="Xóa số điện thoại"
                  onClick={() => setPhoneNumber("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Delete className="h-4 w-4" />
                </button>
              )}
            </div>

            {phoneNumber && lookupPhone.length >= 9 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900">
                {isLookingUpPhone ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Đang tìm trên Khách hàng và Nhân viên...</span>
                  </div>
                ) : phoneOwner?.customers.length || phoneOwner?.staff.length ? (
                  <div className="space-y-1.5">
                    {phoneOwner.customers.map((owner) => (
                      <div key={`customer-${owner.id}`} className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-800 dark:text-slate-100">Khách hàng: {owner.name}</span>
                        <span className="text-[10px] text-muted-foreground">{owner.code}</span>
                      </div>
                    ))}
                    {phoneOwner.staff.map((owner) => (
                      <div key={`staff-${owner.id}`} className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-800 dark:text-slate-100">Nhân viên: {owner.name}</span>
                        <span className="text-[10px] text-muted-foreground">{owner.code}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">Chưa tìm thấy số này trong Khách hàng hoặc Nhân viên.</span>
                )}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              {KEYPAD.map((digit) => (
                <button
                  type="button"
                  key={digit}
                  onClick={() => appendDigit(digit)}
                  className="h-10 rounded-lg border border-border bg-background text-base font-semibold text-foreground transition hover:bg-emerald-50 hover:text-emerald-700 active:scale-95 dark:hover:bg-emerald-950"
                >
                  {digit}
                </button>
              ))}
            </div>

            <Button
              type="button"
              onClick={() => {
                if (activeSdkCall) {
                  activeSdkCall.end?.();
                } else {
                  callMutation.mutate(undefined);
                }
              }}
              disabled={
                callMutation.isPending ||
                (!activeSdkCall && (!phoneNumber.trim() || !locationId))
              }
              className={`h-10 w-full ${
                activeSdkCall
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-emerald-600 hover:bg-emerald-700"
              }`}
              data-testid="button-omicall-call"
            >
              {callMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : activeSdkCall ? (
                <Phone className="h-4 w-4" />
              ) : (
                <PhoneCall className="h-4 w-4" />
              )}
              {callMutation.isPending
                ? "Đang kết nối..."
                : activeSdkCall
                  ? "Kết thúc cuộc gọi"
                  : "Gọi đi"}
            </Button>
          </div>
        </section>
      )}
    </>
  );

  return createPortal(dialer, document.body);
}