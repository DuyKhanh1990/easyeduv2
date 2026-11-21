export type Voip24hWebRtcEvent = {
  event: string;
  data: unknown;
};

type Voip24hGateway = {
  initGateWay: (callback?: (event: string, data: unknown) => void) => void;
  registerSip: (ipAddressSIP: string, numberSIP: string, password: string) => unknown;
  isRegistered: () => boolean;
  incomingcall: () => unknown;
  call: (phoneNumber: string) => unknown;
  hangUp: () => unknown;
  answer: () => unknown;
  reject: () => unknown;
  toggleMute: () => unknown;
  isMute: () => boolean;
  toggleHold: () => unknown;
  isHold: () => boolean;
  transfer: (phoneNumber: string) => unknown;
  sendDtmf: (value: string) => unknown;
};

declare global {
  interface Window {
    initGateWay?: Voip24hGateway["initGateWay"];
    registerSip?: Voip24hGateway["registerSip"];
    isRegistered?: Voip24hGateway["isRegistered"];
    incomingcall?: Voip24hGateway["incomingcall"];
    call?: Voip24hGateway["call"];
    hangUp?: Voip24hGateway["hangUp"];
    answer?: Voip24hGateway["answer"];
    reject?: Voip24hGateway["reject"];
    toggleMute?: Voip24hGateway["toggleMute"];
    isMute?: Voip24hGateway["isMute"];
    toggleHold?: Voip24hGateway["toggleHold"];
    isHold?: Voip24hGateway["isHold"];
    transfer?: Voip24hGateway["transfer"];
    sendDtmf?: Voip24hGateway["sendDtmf"];
  }
}

const scripts = [
  "https://cdnjs.cloudflare.com/ajax/libs/jquery/1.9.1/jquery.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/adapterjs/0.15.5/adapter.min.js",
  "https://sipgetway.voip24h.vn/public/js/voip24hlibrary.min.js",
  "https://sipgetway.voip24h.vn/public/js/voip24hgateway.min.js",
];

const scriptLoads = new Map<string, Promise<void>>();
const listeners = new Set<(event: Voip24hWebRtcEvent) => void>();
let initialization: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  const existing = scriptLoads.get(src);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    const loaded = document.querySelector<HTMLScriptElement>(`script[data-voip24h-src="${src}"]`);
    if (loaded?.dataset.loaded === "true") {
      resolve();
      return;
    }
    const script = loaded || document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset.voip24hSrc = src;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => {
      scriptLoads.delete(src);
      script.remove();
      reject(new Error("Không tải được thư viện WebRTC của VoIP24H."));
    };
    if (!loaded) document.head.appendChild(script);
  });
  scriptLoads.set(src, promise);
  return promise;
}

export async function loadVoip24hWebRtc(): Promise<void> {
  if (typeof window === "undefined") throw new Error("WebRTC chỉ chạy trong trình duyệt.");
  for (const src of scripts) await loadScript(src);
  if (!window.initGateWay || !window.registerSip || !window.isRegistered) {
    throw new Error("Thư viện VoIP24H tải xong nhưng thiếu hàm đăng ký máy nhánh.");
  }
}

export function subscribeVoip24hWebRtc(listener: (event: Voip24hWebRtcEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function initVoip24hGateway(): Promise<void> {
  if (initialization) return initialization;
  const initGateWay = window.initGateWay;
  if (!initGateWay) throw new Error("Thư viện WebRTC VoIP24H chưa được tải.");
  initialization = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("VoIP24H chưa phát sự kiện khởi tạo WebRTC.")), 15_000);
    try {
      initGateWay((event, data) => {
        const normalizedEvent = String(event || "").toLowerCase();
        for (const listener of listeners) listener({ event: normalizedEvent, data });
        if (normalizedEvent === "init") {
          clearTimeout(timeout);
          resolve();
        } else if (["initerror", "init_error"].includes(normalizedEvent)) {
          clearTimeout(timeout);
          reject(new Error("VoIP24H không khởi tạo được thư viện WebRTC."));
        }
      });
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  }).catch((error) => {
    initialization = null;
    throw error;
  });
  return initialization;
}

function requiredFunction<T extends (...args: any[]) => any>(
  value: T | undefined,
  label: string,
): T {
  if (!value) throw new Error(`Thư viện VoIP24H chưa sẵn sàng cho thao tác ${label}.`);
  return value;
}

export const voip24hWebRtc = {
  isRegistered: () => Boolean(window.isRegistered?.()),
  incomingCall: () => window.incomingcall?.(),
  register: (ip: string, extension: string, password: string) =>
    requiredFunction(window.registerSip, "đăng ký máy nhánh")(ip, extension, password),
  call: (phone: string) => requiredFunction(window.call, "gọi đi")(phone),
  hangUp: () => requiredFunction(window.hangUp, "kết thúc cuộc gọi")(),
  answer: () => requiredFunction(window.answer, "nhận cuộc gọi")(),
  reject: () => requiredFunction(window.reject, "từ chối cuộc gọi")(),
  toggleMute: () => requiredFunction(window.toggleMute, "tắt/mở micro")(),
  isMute: () => Boolean(window.isMute?.()),
  toggleHold: () => requiredFunction(window.toggleHold, "giữ cuộc gọi")(),
  isHold: () => Boolean(window.isHold?.()),
  transfer: (phone: string) => requiredFunction(window.transfer, "chuyển cuộc gọi")(phone),
  sendDtmf: (value: string) => requiredFunction(window.sendDtmf, "gửi phím bấm")(value),
};
