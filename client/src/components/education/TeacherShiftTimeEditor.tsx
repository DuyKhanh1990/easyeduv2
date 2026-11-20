import { Input } from "@/components/ui/input";

export type TeacherShiftTimeOption = {
  key: string;
  label: string;
  startTime: string;
  endTime: string;
};

type Props = {
  teacher: any;
  shifts: TeacherShiftTimeOption[];
  onRangeChange: (shiftKey: string, startTime: string, endTime: string) => void;
  disabled?: boolean;
};

function shortTime(value: string | null | undefined): string {
  return String(value || "").slice(0, 5);
}

export function TeacherShiftTimeEditor({ teacher, shifts, onRangeChange, disabled = false }: Props) {
  if (teacher?.mode === "all") return null;

  const assignedShifts = shifts.filter((shift) =>
    (teacher?.shift_keys || teacher?.shiftKeys || []).includes(shift.key)
  );

  if (assignedShifts.length === 0) return null;

  return (
    <div className="space-y-2 border-t pt-3">
      <p className="text-xs font-medium text-muted-foreground">Khung giờ phụ trách</p>
      <div className="space-y-2">
        {assignedShifts.map((shift) => {
          const configured = teacher?.shift_time_ranges?.[shift.key];
          const startTime = shortTime(configured?.start_time || shift.startTime);
          const endTime = shortTime(configured?.end_time || shift.endTime);

          return (
            <div
              key={shift.key}
              className="grid grid-cols-[minmax(90px,1fr)_minmax(88px,112px)_auto_minmax(88px,112px)] items-center gap-2"
            >
              <span className="truncate text-xs font-medium" title={shift.label}>{shift.label}</span>
              <Input
                type="time"
                value={startTime}
                disabled={disabled}
                aria-label={`Giờ bắt đầu ${shift.label}`}
                className="h-8 px-2 text-xs"
                onChange={(event) => onRangeChange(shift.key, event.target.value, endTime)}
              />
              <span className="text-xs text-muted-foreground">đến</span>
              <Input
                type="time"
                value={endTime}
                disabled={disabled}
                aria-label={`Giờ kết thúc ${shift.label}`}
                className="h-8 px-2 text-xs"
                onChange={(event) => onRangeChange(shift.key, startTime, event.target.value)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}