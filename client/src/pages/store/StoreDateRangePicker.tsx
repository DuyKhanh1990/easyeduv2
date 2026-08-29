import { useState, useEffect } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { CalendarIcon, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DateRange = { from?: Date; to?: Date };

const PRESETS = [
  { key: "yesterday",  label: "Ngày hôm qua" },
  { key: "7d",         label: "7 ngày gần nhất" },
  { key: "28d",        label: "28 ngày gần nhất" },
  { key: "thisweek",   label: "Tuần này" },
  { key: "thismonth",  label: "Tháng này" },
  { key: "thisyear",   label: "Năm nay" },
  { key: "lastweek",   label: "Tuần trước" },
  { key: "lastmonth",  label: "Tháng trước" },
];

function getPresetRange(key: string): DateRange {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  switch (key) {
    case "yesterday": {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      return { from: d, to: d };
    }
    case "7d": {
      const f = new Date(today);
      f.setDate(f.getDate() - 6);
      return { from: f, to: today };
    }
    case "28d": {
      const f = new Date(today);
      f.setDate(f.getDate() - 27);
      return { from: f, to: today };
    }
    case "thisweek": {
      const day = today.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const f = new Date(today);
      f.setDate(today.getDate() + diff);
      const t = new Date(f);
      t.setDate(f.getDate() + 6);
      return { from: f, to: t };
    }
    case "thismonth":
      return {
        from: new Date(today.getFullYear(), today.getMonth(), 1),
        to: new Date(today.getFullYear(), today.getMonth() + 1, 0),
      };
    case "thisyear":
      return {
        from: new Date(today.getFullYear(), 0, 1),
        to: new Date(today.getFullYear(), 11, 31),
      };
    case "lastweek": {
      const day = today.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const f = new Date(today);
      f.setDate(today.getDate() + diff - 7);
      const t = new Date(f);
      t.setDate(f.getDate() + 6);
      return { from: f, to: t };
    }
    case "lastmonth": {
      const f = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const t = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: f, to: t };
    }
    default:
      return {};
  }
}

export function StoreDateRangePicker({
  value,
  onChange,
  placeholder = "Chọn thời gian",
  className,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(value);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(value);
      setActivePreset(null);
    }
  }, [open]);

  const triggerText = value.from
    ? `${format(value.from, "dd/MM/yyyy")} – ${value.to ? format(value.to, "dd/MM/yyyy") : "..."}`
    : placeholder;
  const hasValue = !!value.from;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-9 min-w-0 gap-2 text-sm font-normal whitespace-nowrap",
            className,
            hasValue && "border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100"
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 truncate">{triggerText}</span>
          {hasValue && (
            <span
              className="ml-0.5 leading-none text-blue-400 hover:text-blue-700"
              onClick={e => {
                e.stopPropagation();
                onChange({});
              }}
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0 w-auto" sideOffset={4}>
        <div className="flex">
          <div className="border-r py-2" style={{ width: 158 }}>
            {PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => {
                  setActivePreset(p.key);
                  setDraft(getPresetRange(p.key));
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors",
                  activePreset === p.key
                    ? "text-primary font-medium bg-primary/5"
                    : "hover:bg-muted/60 text-foreground"
                )}
              >
                <span
                  className={cn(
                    "w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 transition-colors",
                    activePreset === p.key
                      ? "border-primary bg-primary"
                      : "border-muted-foreground/40"
                  )}
                />
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col">
            <Calendar
              mode="range"
              selected={{ from: draft.from, to: draft.to }}
              onSelect={r => {
                setDraft({ from: r?.from, to: r?.to });
                setActivePreset(null);
              }}
              locale={vi}
              numberOfMonths={2}
              showOutsideDays={false}
              initialFocus
              classNames={{
                months: "flex flex-col sm:flex-row sm:space-x-0 sm:space-y-0 [&>div:first-child]:border-r [&>div:first-child]:border-border [&>div:first-child]:pr-4 [&>div:last-child]:pl-4",
              }}
            />
            <div className="flex justify-end gap-2 px-4 py-3 border-t">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                HỦY
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onChange(draft);
                  setOpen(false);
                }}
              >
                CẬP NHẬT
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
