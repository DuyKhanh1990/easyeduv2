import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CalendarDays, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";

type BookingRegistration = {
  id: string;
  batchId: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  teacherName: string;
  sessionDate: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  status: "pending" | "finalized" | "cancelled" | string;
  cancellationCutoffAt: string;
  packageName: string;
  classCode: string | null;
  className: string | null;
  failureReason: string | null;
  canCancel: boolean;
};

type RegistrationsResponse = { registrations: BookingRegistration[] };

function formatScheduleDate(date: string, language: string) {
  const parsed = new Date(`${date}T12:00:00+07:00`);
  return new Intl.DateTimeFormat(language === "en" ? "en-GB" : "vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(parsed);
}

export function StudentBookingHistory() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const registrationsQuery = useQuery<RegistrationsResponse>({
    queryKey: ["/api/my-space/schedule-registration/registrations"],
    queryFn: async () => {
      const response = await fetch("/api/my-space/schedule-registration/registrations", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Unable to load registrations");
      return response.json();
    },
    refetchInterval: 60_000,
  });
  const cancelMutation = useMutation({
    mutationFn: async (slotIds: string[]) => {
      const response = await fetch("/api/my-space/schedule-registration/cancel", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotIds }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || t("mySpace.calendar.registrationCancelError"));
      return body;
    },
    onSuccess: async (result) => {
      const cancelledCount = (result.results ?? []).filter((row: any) => row.status === "cancelled").length;
      const finalizedCount = (result.results ?? []).filter((row: any) => row.status === "finalized").length;
      const failures = (result.results ?? [])
        .map((row: any) => row.failureReason)
        .filter((message: unknown): message is string => typeof message === "string" && message.length > 0);
      toast({
        title: cancelledCount > 0
          ? `${cancelledCount} ${lang === "en" ? "session(s) cancelled" : "buổi đã được hủy"}`
          : lang === "en" ? "Sessions have reached their cutoff" : "Các buổi đã đến hạn chốt",
        description: finalizedCount > 0
          ? `${finalizedCount} ${lang === "en" ? "session(s) were finalized and could not be cancelled." : "buổi đã chốt nên không thể hủy."}`
          : failures[0],
      });
      setSelectedIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ["/api/my-space/schedule-registration/registrations"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/my-space/schedule-registration/options"] });
    },
    onError: (error: Error) => {
      toast({ title: error.message || t("mySpace.calendar.registrationCancelError"), variant: "destructive" });
    },
  });

  const registrations = registrationsQuery.data?.registrations ?? [];
  const cancellableIds = useMemo(
    () => new Set(registrations.filter((row) => row.canCancel).map((row) => row.id)),
    [registrations],
  );
  const selectedCount = [...selectedIds].filter((id) => cancellableIds.has(id)).length;

  const toggleSelection = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const cancelSelected = () => {
    const slotIds = [...selectedIds].filter((id) => cancellableIds.has(id));
    if (slotIds.length === 0) return;
    const confirmation = window.confirm(t("mySpace.calendar.cancelRegistrationConfirm"));
    if (confirmation) cancelMutation.mutate(slotIds);
  };

  if (registrationsQuery.isLoading) {
    return (
      <div className="flex min-h-40 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {lang === "en" ? "Loading registrations..." : "Đang tải lịch đã đăng ký..."}
      </div>
    );
  }

  if (registrationsQuery.isError) {
    return (
      <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {t("mySpace.calendar.registrationListError")}
      </div>
    );
  }

  if (registrations.length === 0) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-4 text-center">
        <CalendarDays className="mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("mySpace.calendar.registrationListEmpty")}</p>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {registrations.length} {lang === "en" ? "sessions" : "buổi học"}
        </p>
        {selectedCount > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={cancelSelected}
            disabled={cancelMutation.isPending}
          >
            {cancelMutation.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <X className="mr-2 h-4 w-4" />}
            {t("mySpace.calendar.cancelSelected")} ({selectedCount})
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="w-12 px-3 py-3 text-center">STT</th>
              <th className="px-3 py-3">{t("mySpace.calendar.registrationStudent")}</th>
              <th className="px-3 py-3">{t("mySpace.calendar.registrationTeacher")}</th>
              <th className="px-3 py-3">{t("mySpace.calendar.registrationSchedule")}</th>
              <th className="px-3 py-3">{t("mySpace.calendar.registrationStatus")}</th>
              <th className="px-3 py-3">{t("mySpace.calendar.registrationClass")}</th>
              <th className="w-20 px-3 py-3 text-center">{t("mySpace.calendar.registrationActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {registrations.map((row, index) => {
              const badge = row.status === "finalized"
                ? <Badge className="bg-emerald-600 hover:bg-emerald-600">{t("mySpace.calendar.registrationSuccess")}</Badge>
                : row.status === "cancelled"
                  ? <Badge variant="secondary">{t("mySpace.calendar.registrationCancelled")}</Badge>
                  : <Badge variant="outline" className="border-amber-500/50 bg-amber-50 text-amber-800">
                    {row.failureReason ? t("mySpace.calendar.registrationNeedsDeposit") : t("mySpace.calendar.registrationPending")}
                  </Badge>;
              return (
                <tr key={row.id} className="align-top hover:bg-muted/20">
                  <td className="px-3 py-3 text-center text-muted-foreground">{index + 1}</td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-foreground">{row.studentName}</div>
                    {row.studentCode && <div className="text-xs text-muted-foreground">{row.studentCode}</div>}
                  </td>
                  <td className="px-3 py-3">{row.teacherName}</td>
                  <td className="px-3 py-3">
                    <div className="font-medium">{formatScheduleDate(row.sessionDate, lang)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {row.shiftName} · {row.startTime}–{row.endTime}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {badge}
                    {row.failureReason && (
                      <p className="mt-1 max-w-48 text-xs text-amber-800">{row.failureReason}</p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {row.classCode
                      ? <span className="font-medium">{row.classCode}</span>
                      : <span className="text-muted-foreground">—</span>}
                    {row.className && <div className="mt-1 max-w-48 truncate text-xs text-muted-foreground">{row.className}</div>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {row.canCancel && (
                      <input
                        type="checkbox"
                        aria-label={`${t("mySpace.calendar.cancelSelected")}: ${row.studentName} ${row.sessionDate}`}
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleSelection(row.id)}
                        className="h-4 w-4 cursor-pointer accent-destructive"
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
