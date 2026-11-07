import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import type { Participant } from "livekit-client";
import { AlertTriangle, Camera, CameraOff, Loader2, LogOut, Mic, MicOff, Users, Wifi } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

type TokenResponse = {
  serverUrl: string;
  token: string;
  roomName: string;
  displayName: string;
};

type RoomStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

function describeMediaError(error: unknown, device: "microphone" | "camera") {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return `Trình duyệt chưa được cấp quyền sử dụng ${device === "microphone" ? "microphone" : "camera"}. Hãy cấp quyền rồi thử bật lại.`;
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return `Không tìm thấy ${device === "microphone" ? "microphone" : "camera"} trên thiết bị này.`;
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return `${device === "microphone" ? "Microphone" : "Camera"} đang được ứng dụng khác sử dụng hoặc không thể khởi động.`;
  }
  return `Không thể bật ${device === "microphone" ? "microphone" : "camera"}. Kiểm tra quyền trình duyệt và thiết bị.`;
}

function VideoTile({
  participant,
  isLocal,
}: {
  participant: Participant;
  isLocal: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const publication = participant.getTrackPublication(Track.Source.Camera);
  const track = publication?.track;
  const cameraOn = !!track && !track.isMuted;
  const label = participant.name || participant.identity;

  useEffect(() => {
    if (!track || !cameraOn || !containerRef.current) return;
    const element = track.attach();
    if (element instanceof HTMLVideoElement) {
      element.autoplay = true;
      element.playsInline = true;
      element.muted = isLocal;
      element.className = "h-full w-full object-cover";
    }
    containerRef.current.appendChild(element);
    return () => {
      track.detach(element);
      element.remove();
    };
  }, [track, cameraOn, isLocal]);

  return (
    <div className="relative flex aspect-video min-h-40 items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
      {cameraOn ? (
        <div ref={containerRef} className="absolute inset-0" />
      ) : (
        <div className="flex flex-col items-center gap-2 text-slate-300">
          <CameraOff className="h-8 w-8" />
          <span className="text-sm">Camera đang tắt</span>
        </div>
      )}
      <span className="absolute bottom-2 left-2 rounded bg-black/65 px-2 py-1 text-xs text-white">
        {label}{isLocal ? " (Bạn)" : ""}
      </span>
    </div>
  );
}

function RemoteAudio({ participant }: { participant: Participant }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const publication = participant.getTrackPublication(Track.Source.Microphone);
  const track = publication?.track;

  useEffect(() => {
    if (!track || track.isMuted || !containerRef.current) return;
    const element = track.attach();
    if (element instanceof HTMLAudioElement) {
      element.autoplay = true;
      element.muted = false;
    }
    containerRef.current.appendChild(element);
    return () => {
      track.detach(element);
      element.remove();
    };
  }, [track]);

  return <div ref={containerRef} className="sr-only" aria-label={`Âm thanh từ ${participant.name || participant.identity}`} />;
}

export default function LiveKitTest() {
  const roomRef = useRef<Room | null>(null);
  const manuallyLeavingRef = useRef(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [roomName, setRoomName] = useState("");
  const [status, setStatus] = useState<RoomStatus>("disconnected");
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [error, setError] = useState("");

  const refreshParticipants = useCallback((room: Room) => {
    setParticipants([room.localParticipant, ...room.remoteParticipants.values()]);
  }, []);

  const connectToRoom = async () => {
    if (roomRef.current || status === "connecting") return;
    setError("");
    setStatus("connecting");
    manuallyLeavingRef.current = false;

    let room: Room | null = null;
    try {
      const response = await fetch("/api/livekit-test/token", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.message || "Không thể lấy token LiveKit.");
      }

      const credentials = body as TokenResponse;
      room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      setRoomName(credentials.roomName);

      const refresh = () => refreshParticipants(room!);
      room
        .on(RoomEvent.ParticipantConnected, refresh)
        .on(RoomEvent.ParticipantDisconnected, refresh)
        .on(RoomEvent.TrackSubscribed, refresh)
        .on(RoomEvent.TrackUnsubscribed, refresh)
        .on(RoomEvent.LocalTrackPublished, refresh)
        .on(RoomEvent.LocalTrackUnpublished, refresh)
        .on(RoomEvent.TrackMuted, refresh)
        .on(RoomEvent.TrackUnmuted, refresh)
        .on(RoomEvent.Reconnecting, () => {
          setStatus("reconnecting");
          setError("Mất kết nối tạm thời. Đang thử kết nối lại…");
        })
        .on(RoomEvent.Reconnected, () => {
          setStatus("connected");
          setError("");
          refresh();
        })
        .on(RoomEvent.Disconnected, () => {
          roomRef.current = null;
          setStatus("disconnected");
          setMicrophoneEnabled(false);
          setCameraEnabled(false);
          setParticipants([]);
          if (!manuallyLeavingRef.current) {
            setError("Đã mất kết nối với phòng. Hãy kết nối lại.");
          }
        });

      await room.connect(credentials.serverUrl, credentials.token);
      setStatus("connected");
      refreshParticipants(room);

      // Attempt each device independently so denying one does not block the other.
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
        setMicrophoneEnabled(true);
      } catch (deviceError) {
        setError(describeMediaError(deviceError, "microphone"));
      }
      try {
        await room.localParticipant.setCameraEnabled(true);
        setCameraEnabled(true);
      } catch (deviceError) {
        setError((current) => [current, describeMediaError(deviceError, "camera")].filter(Boolean).join(" "));
      }
      refreshParticipants(room);
    } catch (connectionError) {
      room?.disconnect();
      roomRef.current = null;
      setStatus("disconnected");
      setParticipants([]);
      setError(connectionError instanceof Error ? connectionError.message : "Không thể kết nối phòng LiveKit.");
    }
  };

  const toggleMicrophone = async () => {
    const room = roomRef.current;
    if (!room) return;
    setError("");
    try {
      const enabled = !microphoneEnabled;
      await room.localParticipant.setMicrophoneEnabled(enabled);
      setMicrophoneEnabled(enabled);
      refreshParticipants(room);
    } catch (deviceError) {
      setError(describeMediaError(deviceError, "microphone"));
    }
  };

  const toggleCamera = async () => {
    const room = roomRef.current;
    if (!room) return;
    setError("");
    try {
      const enabled = !cameraEnabled;
      await room.localParticipant.setCameraEnabled(enabled);
      setCameraEnabled(enabled);
      refreshParticipants(room);
    } catch (deviceError) {
      setError(describeMediaError(deviceError, "camera"));
    }
  };

  const leaveRoom = async () => {
    const room = roomRef.current;
    if (!room) return;
    manuallyLeavingRef.current = true;
    try {
      await room.localParticipant.setMicrophoneEnabled(false);
      await room.localParticipant.setCameraEnabled(false);
    } catch {
      // Disconnect still needs to complete if a device was already unavailable.
    }
    room.disconnect();
    roomRef.current = null;
    setParticipants([]);
    setStatus("disconnected");
    setMicrophoneEnabled(false);
    setCameraEnabled(false);
    setError("");
  };

  useEffect(() => () => {
    manuallyLeavingRef.current = true;
    roomRef.current?.disconnect();
    roomRef.current = null;
  }, []);

  const isConnected = status === "connected" || status === "reconnecting";
  const statusText = {
    disconnected: "Chưa kết nối",
    connecting: "Đang kết nối…",
    connected: "Đã kết nối",
    reconnecting: "Đang kết nối lại…",
  }[status];

  return (
    <DashboardLayout fullscreen>
      <div className="min-h-full overflow-y-auto bg-slate-950 p-4 text-white md:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">EasyEdu · LiveKit POC</p>
              <h1 className="text-2xl font-bold md:text-3xl">Thử kết nối phòng trực tuyến</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Trang kiểm tra riêng. Chưa liên kết với lịch học, điểm danh hay phân công.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${status === "connected" ? "bg-emerald-400" : status === "reconnecting" ? "bg-amber-400" : "bg-slate-500"}`} />
              {statusText}
            </div>
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
            {!isConnected ? (
              <button
                type="button"
                onClick={connectToRoom}
                disabled={status === "connecting"}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === "connecting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                {status === "connecting" ? "Đang kết nối…" : "Kết nối phòng"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={toggleMicrophone}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 font-semibold transition ${microphoneEnabled ? "bg-slate-700 hover:bg-slate-600" : "bg-rose-600 hover:bg-rose-500"}`}
                >
                  {microphoneEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                  {microphoneEnabled ? "Tắt microphone" : "Bật microphone"}
                </button>
                <button
                  type="button"
                  onClick={toggleCamera}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 font-semibold transition ${cameraEnabled ? "bg-slate-700 hover:bg-slate-600" : "bg-rose-600 hover:bg-rose-500"}`}
                >
                  {cameraEnabled ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
                  {cameraEnabled ? "Tắt camera" : "Bật camera"}
                </button>
                <button
                  type="button"
                  onClick={leaveRoom}
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-500/70 px-4 py-2.5 font-semibold text-rose-200 transition hover:bg-rose-500/10"
                >
                  <LogOut className="h-4 w-4" />
                  Rời phòng
                </button>
              </>
            )}
            {roomName && <span className="text-sm text-slate-400">Phòng: {roomName}</span>}
          </div>

          {error && (
            <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
            <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold">Âm thanh và hình ảnh</h2>
                <span className="text-sm text-slate-400">{participants.length} người</span>
              </div>
              {participants.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {participants.map((participant, index) => (
                    <div key={participant.identity}>
                      <VideoTile participant={participant} isLocal={index === 0 && participant === roomRef.current?.localParticipant} />
                      {participant !== roomRef.current?.localParticipant && <RemoteAudio participant={participant} />}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 text-center text-slate-400">
                  <Users className="mb-3 h-10 w-10 opacity-60" />
                  <p>{status === "connecting" ? "Đang kết nối tới LiveKit…" : "Kết nối phòng để bắt đầu kiểm tra."}</p>
                  <p className="mt-1 text-xs">Mở trang này trên trình duyệt thứ hai để thử âm thanh và camera hai chiều.</p>
                </div>
              )}
            </section>

            <aside className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-4 flex items-center gap-2 font-semibold">
                <Users className="h-4 w-4 text-sky-300" />
                Người tham gia
              </h2>
              {participants.length ? (
                <ul className="space-y-2">
                  {participants.map((participant) => (
                    <li key={participant.identity} className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      <span className="truncate">{participant.name || participant.identity}</span>
                      {participant === roomRef.current?.localParticipant && <span className="ml-auto text-xs text-slate-400">Bạn</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400">Chưa có người tham gia.</p>
              )}
              <p className="mt-5 text-xs leading-relaxed text-slate-500">
                Chỉ tài khoản EasyEdu đã đăng nhập mới lấy được token thử nghiệm. Token có thời hạn 10 phút.
              </p>
            </aside>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
