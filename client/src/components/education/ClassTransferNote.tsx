import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : String(value);
}

function formatTime(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : "—";
}

function TransferSessionList({ sessions }: { sessions: any[] }) {
  if (sessions.length === 0) {
    return <p className="text-xs text-slate-500 italic">Chưa có dữ liệu buổi học.</p>;
  }

  return (
    <ol className="space-y-1.5 overflow-x-auto">
      {sessions.map((session, index) => {
        const date = new Date(`${String(session.sessionDate).slice(0, 10)}T00:00:00`);
        const weekday = Number.isNaN(date.getTime())
          ? ""
          : ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"][date.getDay()];

        return (
          <li
            key={`${session.sessionIndex ?? "session"}-${session.sessionDate}-${index}`}
            className="flex min-w-max items-center gap-1 whitespace-nowrap rounded-md bg-white px-2 py-1.5 text-xs"
          >
            <span className="font-medium">
              {session.sessionIndex != null ? `Buổi ${session.sessionIndex} · ` : ""}
            </span>
            {weekday ? `${weekday}, ` : ""}
            {formatDate(session.sessionDate)}
            <span className="ml-1 whitespace-nowrap text-slate-600">
              {formatTime(session.startTime)}–{formatTime(session.endTime)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function ClassTransferNote({
  note,
  transferInfo,
  targetClassName,
}: {
  note?: string | null;
  transferInfo?: {
    sourceClassName?: string;
    targetClassName?: string;
    sourceSessions?: any[];
    targetSessions?: any[];
  };
  targetClassName?: string;
}) {
  if (!note?.startsWith("Chuyển từ lớp ")) return null;

  const sourceClassName =
    transferInfo?.sourceClassName ?? note.split(/\r?\n/)[0]?.replace("Chuyển từ lớp ", "").trim() ?? "";
  const destinationClassName = transferInfo?.targetClassName ?? targetClassName ?? "Lớp đích";
  const [open, setOpen] = useState(false);

  return (
    <Tooltip delayDuration={150} open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          className="mt-0.5 block max-w-full cursor-help truncate text-left font-['Roboto'] !text-[12px] font-normal text-orange-600 underline decoration-dotted underline-offset-2 hover:text-orange-700"
          aria-label={`Xem thông tin chuyển lớp từ ${sourceClassName}`}
        >
          Chuyển từ lớp {sourceClassName} sang
        </button>
      </TooltipTrigger>
      <TooltipContent
        portal
        side="top"
        sideOffset={8}
        className="z-[100] w-[min(900px,calc(100vw-2rem))] max-h-[min(70vh,520px)] overflow-y-auto border-orange-200 p-3 text-left"
      >
        <div className="mb-3 text-xs font-semibold text-orange-700">Thông tin chuyển lớp</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <section className="min-w-0 rounded-lg bg-orange-50 p-2.5">
            <h4 className="mb-2 text-sm font-semibold text-slate-800">
              {sourceClassName}
              <span className="ml-1 text-[10px] font-normal text-slate-500">(lớp chuyển)</span>
            </h4>
            <TransferSessionList sessions={transferInfo?.sourceSessions ?? []} />
          </section>
          <section className="min-w-0 rounded-lg bg-sky-50 p-2.5">
            <h4 className="mb-2 text-sm font-semibold text-slate-800">
              {destinationClassName}
              <span className="ml-1 text-[10px] font-normal text-slate-500">(lớp đích)</span>
            </h4>
            <TransferSessionList sessions={transferInfo?.targetSessions ?? []} />
          </section>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
