import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMonths, format, subMonths } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Loader2, Plus, X } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

const weekdays = [
  { id: 1, short: "T2", label: "Thứ 2" },
  { id: 2, short: "T3", label: "Thứ 3" },
  { id: 3, short: "T4", label: "Thứ 4" },
  { id: 4, short: "T5", label: "Thứ 5" },
  { id: 5, short: "T6", label: "Thứ 6" },
  { id: 6, short: "T7", label: "Thứ 7" },
  { id: 0, short: "CN", label: "Chủ Nhật" },
];

const windowSchema = z.object({
  startTime: z.string(),
  endTime: z.string(),
});

const availabilityFormSchema = z.object({
  locationId: z.string().min(1, "Vui lòng chọn cơ sở."),
  weekdays: z.array(z.number()).min(1, "Chọn ít nhất một ngày trong tuần."),
  dayWindows: z.record(z.string(), z.array(windowSchema)),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().optional(),
}).superRefine((values, ctx) => {
  if (values.effectiveFrom && values.effectiveTo && values.effectiveTo < values.effectiveFrom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["effectiveTo"],
      message: "Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.",
    });
  }
  for (const weekday of values.weekdays) {
    const windows = values.dayWindows[String(weekday)] ?? [];
    if (!windows.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weekdays"],
        message: `Vui lòng nhập giờ rảnh cho ${weekdays.find((day) => day.id === weekday)?.label}.`,
      });
      continue;
    }
    windows.forEach((window, index) => {
      const path = ["dayWindows", String(weekday), index] as (string | number)[];
      if (!window.startTime) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, "startTime"], message: "Nhập giờ bắt đầu." });
      }
      if (!window.endTime) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, "endTime"], message: "Nhập giờ kết thúc." });
      }
      if (window.startTime && window.endTime && window.endTime <= window.startTime) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, "endTime"], message: "Giờ kết thúc phải sau giờ bắt đầu." });
      }
    });
  }
});

type AvailabilityForm = z.infer<typeof availabilityFormSchema>;
type AvailabilityItem = {
  id: string;
  teacherId: string;
  locationId: string;
  weekday: number;
  startTime?: string | null;
  endTime?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  availabilityType: "shift" | "time_window";
  shiftTemplate?: { name?: string; startTime?: string; endTime?: string } | null;
};
type MyAvailabilityData = {
  profile: { id: string; fullName?: string; code?: string };
  assignedLocations: { id: string; name: string }[];
  availabilities: AvailabilityItem[];
};
type DeleteTarget = { id: string; date: string; time: string; availabilityType: "shift" | "time_window" };

function localToday() {
  return format(new Date(), "yyyy-MM-dd");
}

function formatDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatEffectiveRange(from?: string | null, to?: string | null) {
  if (from && to) return `${formatDate(from)} – ${formatDate(to)}`;
  if (from) return `Từ ${formatDate(from)}`;
  if (to) return `Đến ${formatDate(to)}`;
  return "Không giới hạn";
}

export default function MyAvailability() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  const featureQuery = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/system-settings/my-space-availability"],
    queryFn: async () => {
      const response = await fetch("/api/system-settings/my-space-availability", { credentials: "include" });
      if (!response.ok) throw new Error("Không thể kiểm tra cài đặt tính năng.");
      return response.json();
    },
  });
  const availabilityQuery = useQuery<MyAvailabilityData>({
    queryKey: ["/api/my-space/availability"],
    queryFn: async () => {
      const response = await fetch("/api/my-space/availability", { credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Không thể tải lịch rảnh.");
      return payload;
    },
    enabled: featureQuery.data?.enabled === true,
  });
  const data = availabilityQuery.data;
  const locations = data?.assignedLocations ?? [];

  const form = useForm<AvailabilityForm>({
    resolver: zodResolver(availabilityFormSchema),
    defaultValues: {
      locationId: "",
      weekdays: [],
      dayWindows: {},
      effectiveFrom: localToday(),
      effectiveTo: "",
    },
  });
  const selectedWeekdays = form.watch("weekdays") ?? [];
  const dayWindows = form.watch("dayWindows") ?? {};

  const createMutation = useMutation({
    mutationFn: async (values: AvailabilityForm) => {
      const windows = values.weekdays.flatMap((weekday) =>
        (values.dayWindows[String(weekday)] ?? []).map((window) => ({
          weekday,
          startTime: window.startTime,
          endTime: window.endTime,
        })),
      );
      const response = await apiRequest("POST", "/api/my-space/availability/windows", {
        locationId: values.locationId,
        windows,
        effectiveFrom: values.effectiveFrom || null,
        effectiveTo: values.effectiveTo || null,
      });
      return response.json();
    },
    onSuccess: (created: AvailabilityItem[]) => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-space/availability"] });
      toast({
        title: "Đã lưu lịch rảnh",
        description: created.length ? `Đã đăng ký ${created.length} khoảng giờ.` : "Các khoảng giờ này đã được đăng ký trước đó.",
      });
      setDialogOpen(false);
      form.reset({ locationId: locations[0]?.id ?? "", weekdays: [], dayWindows: {}, effectiveFrom: localToday(), effectiveTo: "" });
    },
    onError: (error: Error) => toast({ title: "Không thể lưu lịch rảnh", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, date, mode, availabilityType }: DeleteTarget & { mode: "single" | "future" }) => {
      const path = availabilityType === "time_window"
        ? `/api/my-space/availability/windows/${id}/remove-from-date`
        : `/api/my-space/availability/${id}/remove-from-date`;
      await apiRequest("POST", path, { date, mode });
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-space/availability"] });
      setDeleteTarget(null);
      toast({
        title: "Đã cập nhật lịch rảnh",
        description: variables.mode === "single"
          ? "Đã xóa giờ rảnh trong ngày đã chọn."
          : "Đã xóa giờ rảnh từ ngày đã chọn trở đi.",
      });
    },
    onError: (error: Error) => toast({ title: "Không thể xóa lịch rảnh", description: error.message, variant: "destructive" }),
  });

  const days = useMemo(() => {
    const count = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index + 1);
      return { date, day: index + 1, weekday: date.getDay(), isWeekend: date.getDay() === 0 || date.getDay() === 6 };
    });
  }, [visibleMonth]);

  const rows = useMemo(() => {
    const grouped = new Map<string, { locationId: string; effectiveRanges: string[]; perDay: AvailabilityItem[][] }>();
    for (const item of data?.availabilities ?? []) {
      const key = item.locationId;
      for (const day of days) {
        if (Number(item.weekday) !== day.weekday) continue;
        const dateKey = format(day.date, "yyyy-MM-dd");
        const from = item.effectiveFrom?.slice(0, 10) ?? "";
        const to = item.effectiveTo?.slice(0, 10) ?? "";
        if ((from && dateKey < from) || (to && dateKey > to)) continue;
        let row = grouped.get(key);
        if (!row) {
          row = { locationId: key, effectiveRanges: [], perDay: Array.from({ length: days.length }, () => []) };
          grouped.set(key, row);
        }
        const range = formatEffectiveRange(from || null, to || null);
        if (!row.effectiveRanges.includes(range)) row.effectiveRanges.push(range);
        row.perDay[day.day - 1].push(item);
      }
    }
    return [...grouped.values()].sort((a, b) =>
      (locations.find((location) => location.id === a.locationId)?.name ?? "")
        .localeCompare(locations.find((location) => location.id === b.locationId)?.name ?? "", "vi"),
    );
  }, [data?.availabilities, days, locations, visibleMonth]);

  const openCreateDialog = () => {
    form.reset({
      locationId: locations[0]?.id ?? "",
      weekdays: [],
      dayWindows: {},
      effectiveFrom: localToday(),
      effectiveTo: "",
    });
    setDialogOpen(true);
  };

  const updateDayWindows = (weekday: number, next: Array<{ startTime: string; endTime: string }>) => {
    form.setValue("dayWindows", { ...form.getValues("dayWindows"), [String(weekday)]: next }, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const titleMonth = format(visibleMonth, "M/yyyy");
  const isPageLoading = featureQuery.isLoading || (featureQuery.data?.enabled === true && availabilityQuery.isLoading);

  return (
    <DashboardLayout>
      <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <CalendarDays className="h-5 w-5 text-primary" />
              Đăng ký lịch rảnh
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Xem và đăng ký giờ rảnh của bạn tại các cơ sở được phân công.
            </p>
          </div>
          {featureQuery.data?.enabled && (
            <Button onClick={openCreateDialog} disabled={locations.length === 0} className="gap-2">
              <Plus className="h-4 w-4" />
              Đăng ký mới
            </Button>
          )}
        </div>

        {isPageLoading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải...
          </div>
        ) : featureQuery.isError ? (
          <Card><CardContent className="py-10 text-center text-sm text-destructive">{(featureQuery.error as Error).message}</CardContent></Card>
        ) : featureQuery.data?.enabled !== true ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Tính năng đăng ký lịch rảnh hiện chưa được bật.</CardContent></Card>
        ) : availabilityQuery.isError ? (
          <Card><CardContent className="py-10 text-center text-sm text-destructive">{(availabilityQuery.error as Error).message}</CardContent></Card>
        ) : (
          <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader className="flex flex-wrap flex-row items-center justify-between gap-3 py-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock3 className="h-4 w-4" /> Lịch giờ rảnh — Tháng {titleMonth}
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ô trống là ngày không có giờ rảnh đăng ký. Chỉ hiển thị lịch của bạn.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setVisibleMonth((month) => subMonths(month, 1))} aria-label="Tháng trước">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Badge variant="outline" className="min-w-24 justify-center">Tháng {titleMonth}</Badge>
                <Button variant="outline" size="icon" onClick={() => setVisibleMonth((month) => addMonths(month, 1))} aria-label="Tháng sau">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-auto p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-max border-collapse text-sm">
                  <thead>
                    <tr className="border-y bg-muted/30">
                      <th className="sticky left-0 z-20 min-w-[175px] bg-background px-3 py-2 text-left">Cơ sở / Hiệu lực</th>
                      {days.map((day) => (
                        <th key={day.day} className={cn("min-w-[102px] border-r border-border/50 px-2 py-2 text-center last:border-r-0", day.isWeekend && "bg-orange-50 text-orange-700")}>
                          <div className="text-xs font-normal">{weekdays.find((item) => item.id === day.weekday)?.short}</div>
                          <div className="font-semibold">{day.day}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={days.length + 1} className="px-4 py-12 text-center text-sm text-muted-foreground">
                          Tháng này chưa có giờ rảnh nào được đăng ký.
                        </td>
                      </tr>
                    ) : rows.map((row) => (
                      <tr key={row.locationId} className="border-b">
                        <td className="sticky left-0 z-10 bg-background px-3 py-3 align-top">
                          <div className="font-medium">{locations.find((location) => location.id === row.locationId)?.name ?? "Cơ sở"}</div>
                          {[...row.effectiveRanges].sort().map((range) => (
                            <div key={range} className="mt-1 text-[10px] text-muted-foreground">Hiệu lực: {range}</div>
                          ))}
                        </td>
                        {row.perDay.map((items, index) => (
                          <td key={index} className={cn("border-r border-border/50 px-2 py-2 align-top last:border-r-0", days[index].isWeekend && "bg-orange-50/40")}>
                            <div className="flex min-h-7 flex-col gap-1">
                              {[...items].sort((a, b) => String(a.startTime ?? "").localeCompare(String(b.startTime ?? ""))).map((item) => {
                                const start = String(item.startTime ?? item.shiftTemplate?.startTime ?? "").slice(0, 5);
                                const end = String(item.endTime ?? item.shiftTemplate?.endTime ?? "").slice(0, 5);
                                const time = start && end ? `${start} - ${end}` : item.shiftTemplate?.name ?? "Ca đã đăng ký";
                                return (
                                  <div key={`${item.availabilityType}-${item.id}`} className="flex items-center gap-1">
                                    <span className="whitespace-nowrap rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">{time}</span>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 shrink-0 p-0 text-destructive hover:bg-destructive/10"
                                      aria-label="Xóa giờ rảnh"
                                      title="Xóa giờ rảnh"
                                      onClick={() => setDeleteTarget({
                                        id: item.id,
                                        date: format(days[index].date, "yyyy-MM-dd"),
                                        time,
                                        availabilityType: item.availabilityType,
                                      })}
                                    >
                                      <X className="h-2.5 w-2.5" />
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[85vw] max-w-[85vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Đăng ký giờ rảnh của tôi</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((values) => createMutation.mutate(values))} className="space-y-5">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="locationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cơ sở</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Chọn cơ sở" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Nhân sự</label>
                    <Input value={data?.profile.fullName ?? ""} readOnly aria-label="Tên nhân sự" />
                    {data?.profile.code && <p className="text-xs text-muted-foreground">Mã: {data.profile.code}</p>}
                  </div>
                  <FormField
                    control={form.control}
                    name="effectiveFrom"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Từ ngày</FormLabel>
                        <FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="effectiveTo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Đến ngày</FormLabel>
                        <FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="weekdays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ngày trong tuần</FormLabel>
                        <div className="grid grid-cols-7 items-center gap-1 rounded-xl border bg-muted/20 px-2 py-3">
                          {weekdays.map((day) => (
                            <label key={day.id} className="flex min-w-0 items-center justify-center gap-1">
                              <Checkbox
                                checked={field.value?.includes(day.id)}
                                onCheckedChange={(checked) => {
                                  const current = field.value ?? [];
                                  const next = checked ? [...current, day.id] : current.filter((value) => value !== day.id);
                                  field.onChange(next);
                                  const windows = form.getValues("dayWindows") ?? {};
                                  if (checked) {
                                    form.setValue("dayWindows", {
                                      ...windows,
                                      [String(day.id)]: windows[String(day.id)]?.length
                                        ? windows[String(day.id)]
                                        : [{ startTime: "", endTime: "" }],
                                    }, { shouldValidate: true });
                                  } else {
                                    const copy = { ...windows };
                                    delete copy[String(day.id)];
                                    form.setValue("dayWindows", copy, { shouldValidate: true });
                                  }
                                }}
                              />
                              <span className="cursor-pointer whitespace-nowrap text-xs font-medium">{day.short}</span>
                            </label>
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dayWindows"
                    render={({ field }) => {
                      const selectedDays = [...selectedWeekdays].sort((a, b) =>
                        weekdays.findIndex((day) => day.id === a) - weekdays.findIndex((day) => day.id === b),
                      );
                      return (
                        <FormItem>
                          <FormLabel className="text-base font-semibold uppercase tracking-wide">Khoảng giờ rảnh theo thứ</FormLabel>
                          {selectedDays.length ? (
                            <div className="overflow-hidden rounded-xl border">
                              <div className="grid grid-cols-[48px_minmax(0,1fr)_40px] items-center border-b bg-muted/40 px-2 py-3 text-sm font-semibold">
                                <div>Thứ</div><div>Khoảng thời gian</div><div className="text-center">Thêm</div>
                              </div>
                              {selectedDays.map((weekday) => {
                                const key = String(weekday);
                                const windows = field.value?.[key] ?? [];
                                const day = weekdays.find((item) => item.id === weekday)!;
                                return (
                                  <div key={key} className="grid grid-cols-[48px_minmax(0,1fr)_40px] items-center gap-2 border-b px-2 py-3 last:border-b-0">
                                    <div className="font-bold text-primary">{day.short}</div>
                                    <div className="space-y-2">
                                      {windows.map((window, index) => (
                                        <div key={`${key}-${index}`} className="space-y-1">
                                          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_32px] items-center gap-1.5">
                                            <Input
                                              type="time"
                                              className="min-w-0 px-2"
                                              value={window.startTime}
                                              onChange={(event) => {
                                                const next = [...windows];
                                                next[index] = { ...next[index], startTime: event.target.value };
                                                updateDayWindows(weekday, next);
                                              }}
                                              aria-label={`${day.label}, giờ bắt đầu`}
                                            />
                                            <span className="text-sm text-muted-foreground">đến</span>
                                            <Input
                                              type="time"
                                              className="min-w-0 px-2"
                                              value={window.endTime}
                                              onChange={(event) => {
                                                const next = [...windows];
                                                next[index] = { ...next[index], endTime: event.target.value };
                                                updateDayWindows(weekday, next);
                                              }}
                                              aria-label={`${day.label}, giờ kết thúc`}
                                            />
                                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" disabled={windows.length <= 1} onClick={() => updateDayWindows(weekday, windows.filter((_, rowIndex) => rowIndex !== index))} aria-label="Xóa khoảng giờ">
                                              <X className="h-4 w-4" />
                                            </Button>
                                          </div>
                                          <div className="grid grid-cols-2 gap-2">
                                            {(form.formState.errors as any).dayWindows?.[key]?.[index]?.startTime?.message && <p className="text-[10px] leading-3 text-destructive">{(form.formState.errors as any).dayWindows[key][index].startTime.message}</p>}
                                            {(form.formState.errors as any).dayWindows?.[key]?.[index]?.endTime?.message && <p className="text-[10px] leading-3 text-destructive">{(form.formState.errors as any).dayWindows[key][index].endTime.message}</p>}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                    <Button type="button" variant="ghost" size="icon" className="mx-auto h-8 w-8 text-primary" onClick={() => updateDayWindows(weekday, [...windows, { startTime: "", endTime: "" }])} aria-label={`Thêm khoảng giờ ${day.short}`}>
                                      <Plus className="h-5 w-5" />
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">Chọn thứ trong tuần để nhập giờ rảnh.</div>
                          )}
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending || locations.length === 0}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Lưu đăng ký
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && !deleteMutation.isPending && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Xóa giờ rảnh đã đăng ký</DialogTitle></DialogHeader>
          {deleteTarget && (
            <div className="space-y-2 text-sm">
              <p>Khoảng giờ <strong>{deleteTarget.time}</strong> ngày <strong>{formatDate(deleteTarget.date)}</strong>.</p>
              <p className="text-muted-foreground">Chọn xóa riêng ngày này hoặc xóa giờ rảnh từ ngày này trở đi. Các ngày trước đó được giữ nguyên.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate({ ...deleteTarget, mode: "single" })}>Xóa ngày này</Button>
                <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate({ ...deleteTarget, mode: "future" })}>Xóa từ ngày này trở đi</Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" disabled={deleteMutation.isPending} onClick={() => setDeleteTarget(null)}>Hủy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
