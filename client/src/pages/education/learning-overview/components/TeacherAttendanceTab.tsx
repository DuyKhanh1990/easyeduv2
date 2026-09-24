import { useState, useRef, useEffect, useCallback } from "react";
import { ClipboardCheck, Search, ChevronLeft, ChevronRight, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTeacherAttendanceTab, TeacherAttendanceRow } from "../hooks/useTeacherAttendanceTab";
import { useToast } from "@/hooks/use-toast";

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const PAGE_SIZE_OPTIONS = [20, 50, 100];

const PRESETS = [
  { label: "Hôm nay", get: () => { const t = todayStr(); return { from: t, to: t }; } },
  { label: "Hôm qua", get: () => { const d = daysAgo(1); return { from: d, to: d }; } },
  { label: "7 ngày gần nhất", get: () => ({ from: daysAgo(6), to: todayStr() }) },
  { label: "28 ngày gần nhất", get: () => ({ from: daysAgo(27), to: todayStr() }) },
  { label: "Tuần này", get: () => thisWeek() },
  { label: "Tháng này", get: () => thisMonth() },
  { label: "Năm nay", get: () => thisYear() },
];

function todayStr() { return new Date().toISOString().split("T")[0]; }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split("T")[0];
}
function thisWeek() {
  const d = new Date(); const day = d.getDay();
  const mon = new Date(d); mon.setDate(d.getDate() - ((day + 6) % 7));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { from: mon.toISOString().split("T")[0], to: sun.toISOString().split("T")[0] };
}
function thisMonth() {
  const d = new Date();
  return { from: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, to: todayStr() };
}
function thisYear() {
  return { from: `${new Date().getFullYear()}-01-01`, to: todayStr() };
}

function formatDateLabel(dateStr: string) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function isoToTimeStr(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function computeMinutes(row: TeacherAttendanceRow & { localCheckIn?: string; localCheckOut?: string }) {
  const checkInStr = row.localCheckIn ?? isoToTimeStr(row.checkInAt);
  const checkOutStr = row.localCheckOut ?? isoToTimeStr(row.checkOutAt);

  const start = timeToMinutes(row.startTime.substring(0, 5));
  const end = timeToMinutes(row.endTime.substring(0, 5));
  const scheduled = end - start;
  const scheduledHours = Math.round((scheduled / 60) * 100) / 100;

  if (!checkInStr && !checkOutStr) return { missing: null, extra: null, coefficient: null, scheduledHours };

  if (checkInStr && checkOutStr) {
    const actual = timeToMinutes(checkOutStr) - timeToMinutes(checkInStr);
    const diff = actual - scheduled;
    const coefficient = Math.round((actual / 60) * 100) / 100;
    return {
      missing: diff < 0 ? -diff : 0,
      extra: diff > 0 ? diff : 0,
      coefficient,
      scheduledHours,
    };
  }

  if (checkInStr) {
    // Chỉ có giờ vào: tính actual = endTime - checkIn (giả sử dạy đến hết)
    const actual = end - timeToMinutes(checkInStr);
    const late = timeToMinutes(checkInStr) - start;
    const coefficient = Math.round((actual / 60) * 100) / 100;
    return { missing: late > 0 ? late : 0, extra: late < 0 ? -late : 0, coefficient, scheduledHours };
  }

  // Chỉ có giờ ra: tính actual = checkOut - startTime (giả sử đến đúng giờ)
  const actual = timeToMinutes(checkOutStr!) - start;
  const early = end - timeToMinutes(checkOutStr!);
  const coefficient = Math.round((actual / 60) * 100) / 100;
  return { missing: early > 0 ? early : 0, extra: early < 0 ? -early : 0, coefficient, scheduledHours };
}

function buildIsoFromDateAndTime(dateStr: string, timeStr: string): string | null {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(dateStr + "T00:00:00");
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

interface EditState {
  checkIn: string;
  checkOut: string;
  note: string;
  dirty: boolean;
}

const AUTO_SAVE_DELAY = 800;

export function TeacherAttendanceTab({ enabled }: { enabled: boolean }) {
  const { toast } = useToast();
  const tab = useTeacherAttendanceTab(enabled);

  const [searchInput, setSearchInput] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [savedFlash, setSavedFlash] = useState<Set<string>>(new Set());
  const datePickerRef = useRef<HTMLDivElement>(null);
  const autoSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // After server refetch, clean up non-dirty edit states whose values now match server data
  useEffect(() => {
    if (tab.rows.length === 0) return;
    setEdits((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const row of tab.rows) {
        const key = rowKey(row);
        const edit = next[key];
        if (!edit || edit.dirty) continue;
        const serverCheckIn = isoToTimeStr(row.checkInAt);
        const serverCheckOut = isoToTimeStr(row.checkOutAt);
        if (edit.checkIn === serverCheckIn && edit.checkOut === serverCheckOut && edit.note === row.note) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tab.rows]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function rowKey(r: TeacherAttendanceRow) { return `${r.sessionId}__${r.staffId}`; }

  function getEdit(row: TeacherAttendanceRow): EditState {
    const key = rowKey(row);
    return edits[key] ?? {
      checkIn: isoToTimeStr(row.checkInAt),
      checkOut: isoToTimeStr(row.checkOutAt),
      note: row.note,
      dirty: false,
    };
  }

  const saveRow = useCallback(async (row: TeacherAttendanceRow, editSnapshot: EditState) => {
    const key = rowKey(row);
    setSaving((prev) => new Set(prev).add(key));
    try {
      await tab.saveMutation.mutateAsync({
        sessionId: row.sessionId,
        staffId: row.staffId,
        checkInAt: buildIsoFromDateAndTime(row.sessionDate, editSnapshot.checkIn),
        checkOutAt: buildIsoFromDateAndTime(row.sessionDate, editSnapshot.checkOut),
        note: editSnapshot.note,
      });
      // Mark as clean but KEEP the values so inputs don't reset while waiting for server refetch
      setEdits((prev) => {
        const next = { ...prev };
        if (next[key]) {
          next[key] = { ...next[key], dirty: false };
        }
        return next;
      });
      setSavedFlash((prev) => new Set(prev).add(key));
      setTimeout(() => setSavedFlash((prev) => { const s = new Set(prev); s.delete(key); return s; }), 1500);
    } catch {
      toast({ title: "Lỗi khi lưu chấm công", variant: "destructive" });
    } finally {
      setSaving((prev) => { const s = new Set(prev); s.delete(key); return s; });
    }
  }, [tab.saveMutation, toast]);

  function scheduleAutoSave(row: TeacherAttendanceRow, newEdit: EditState) {
    const key = rowKey(row);
    if (autoSaveTimers.current[key]) clearTimeout(autoSaveTimers.current[key]);
    autoSaveTimers.current[key] = setTimeout(() => {
      saveRow(row, newEdit);
      delete autoSaveTimers.current[key];
    }, AUTO_SAVE_DELAY);
  }

  function updateCheckIn(row: TeacherAttendanceRow, value: string) {
    const key = rowKey(row);
    const cur = getEdit(row);
    // Auto-fill checkOut với endTime chỉ khi đây là lần đầu chạm vào dòng này và checkOut đang trống
    const isFirstEdit = !edits[key];
    const newCheckOut = (isFirstEdit && !cur.checkOut)
      ? row.endTime.substring(0, 5)
      : cur.checkOut;
    const newEdit: EditState = { ...cur, checkIn: value, checkOut: newCheckOut, dirty: true };
    setEdits((prev) => ({ ...prev, [key]: newEdit }));
    scheduleAutoSave(row, newEdit);
  }

  function updateCheckOut(row: TeacherAttendanceRow, value: string) {
    const key = rowKey(row);
    const cur = getEdit(row);
    const newEdit: EditState = { ...cur, checkOut: value, dirty: true };
    setEdits((prev) => ({ ...prev, [key]: newEdit }));
    scheduleAutoSave(row, newEdit);
  }

  function updateNote(row: TeacherAttendanceRow, value: string) {
    const key = rowKey(row);
    const cur = getEdit(row);
    const newEdit: EditState = { ...cur, note: value, dirty: true };
    setEdits((prev) => ({ ...prev, [key]: newEdit }));
    scheduleAutoSave(row, newEdit);
  }

  const totalPages = Math.ceil(tab.total / tab.pageSize);

  const allKeys = tab.rows.map(rowKey);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedIds.has(k));

  function toggleAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allKeys));
  }

  function toggleRow(key: string) {
    setSelectedIds((prev) => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key); else s.add(key);
      return s;
    });
  }

  const dateLabel = (() => {
    const { dateFrom, dateTo } = tab.filters;
    if (!dateFrom && !dateTo) return "Chọn khoảng thời gian";
    if (dateFrom === dateTo) return formatDateLabel(dateFrom);
    return `${formatDateLabel(dateFrom)} – ${formatDateLabel(dateTo)}`;
  })();

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm flex flex-col h-full overflow-hidden">
      {/* Fixed header + filters */}
      <div className="shrink-0 bg-card border-b border-border/50 px-6 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold">Chấm công giáo viên</h2>
          {tab.total > 0 && (
            <span className="text-sm text-muted-foreground">({tab.total} buổi dạy)</span>
          )}
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-4">
        {/* Search */}
        <form
          onSubmit={(e) => { e.preventDefault(); tab.onFiltersChange({ search: searchInput }); }}
          className="flex items-center gap-2"
        >
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm giáo viên hoặc lớp..."
              className="pl-8 pr-3 py-1.5 border border-border rounded-lg text-sm bg-background text-foreground w-56"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-secondary/70 transition-colors"
          >Tìm</button>
        </form>

        {/* Date range picker */}
        <div className="relative" ref={datePickerRef}>
          <button
            onClick={() => setShowDatePicker((v) => !v)}
            className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-sm bg-background hover:bg-secondary/50 transition-colors"
          >
            <span className="text-blue-600 font-medium">{dateLabel}</span>
          </button>

          {showDatePicker && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-background border border-border rounded-xl shadow-lg flex text-sm" style={{ minWidth: 480 }}>
              {/* Presets */}
              <div className="w-40 border-r border-border p-3 space-y-1">
                {PRESETS.map((p) => {
                  const range = p.get();
                  const active = tab.filters.dateFrom === range.from && tab.filters.dateTo === range.to;
                  return (
                    <button
                      key={p.label}
                      onClick={() => {
                        tab.onFiltersChange({ dateFrom: range.from, dateTo: range.to });
                        setShowDatePicker(false);
                      }}
                      className={cn(
                        "w-full text-left px-2 py-1.5 rounded-lg transition-colors text-xs",
                        active ? "bg-blue-600 text-white" : "hover:bg-secondary/60"
                      )}
                    >{p.label}</button>
                  );
                })}
              </div>
              {/* Manual date inputs */}
              <div className="flex-1 p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground w-12">Từ ngày</label>
                  <input
                    type="date"
                    value={tab.filters.dateFrom}
                    onChange={(e) => tab.onFiltersChange({ dateFrom: e.target.value })}
                    className="border border-border rounded-lg px-2 py-1 text-sm text-foreground bg-background flex-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground w-12">Đến ngày</label>
                  <input
                    type="date"
                    value={tab.filters.dateTo}
                    onChange={(e) => tab.onFiltersChange({ dateTo: e.target.value })}
                    className="border border-border rounded-lg px-2 py-1 text-sm text-foreground bg-background flex-1"
                  />
                </div>
                <div className="flex justify-end gap-2 mt-2">
                  <button
                    onClick={() => { tab.onFiltersChange({ dateFrom: "", dateTo: "" }); setShowDatePicker(false); }}
                    className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-secondary/60"
                  >Xóa</button>
                  <button
                    onClick={() => setShowDatePicker(false)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                  >Áp dụng</button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Page size */}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span>Hiển thị</span>
          {PAGE_SIZE_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => tab.setPageSize(n)}
              className={cn(
                "w-8 h-8 rounded-full text-sm font-semibold transition-colors",
                tab.pageSize === n ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-secondary/60"
              )}
            >{n}</button>
          ))}
        </div>
      </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6 pt-4">
      <div className="bg-background border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 1100 }}>
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-3 w-10 shrink-0">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wide whitespace-nowrap min-w-[130px]">Tên giáo viên</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wide whitespace-nowrap min-w-[100px]">Lớp học</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wide whitespace-nowrap min-w-[120px]">Ngày</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wide whitespace-nowrap min-w-[90px]">Giờ bắt đầu</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wide whitespace-nowrap min-w-[90px]">Giờ kết thúc</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wide whitespace-nowrap min-w-[110px]">Thời gian vào</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wide whitespace-nowrap min-w-[110px]">Thời gian ra</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-foreground uppercase tracking-wide whitespace-nowrap min-w-[90px]">Giờ thiếu (ph)</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-foreground uppercase tracking-wide whitespace-nowrap min-w-[90px]">Giờ thêm (ph)</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-foreground uppercase tracking-wide whitespace-nowrap min-w-[80px]">Hệ số (giờ)</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wide min-w-[140px]">Ghi chú</th>
                <th className="px-3 py-3 w-8 shrink-0" />
              </tr>
            </thead>
            <tbody>
              {tab.isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {Array.from({ length: 13 }).map((_, j) => (
                      <td key={j} className="px-3 py-3">
                        <div className="h-4 rounded bg-secondary/40 animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : tab.rows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="text-center py-16 text-muted-foreground text-sm">
                    <div className="flex flex-col items-center gap-2">
                      <ClipboardCheck className="w-8 h-8 text-muted-foreground/40" />
                      <span>Không có dữ liệu lịch dạy trong khoảng thời gian này</span>
                    </div>
                  </td>
                </tr>
              ) : (
                tab.rows.map((row) => {
                  const key = rowKey(row);
                  const edit = getEdit(row);
                  const isSaving = saving.has(key);
                  const isJustSaved = savedFlash.has(key);
                  const { missing, extra, coefficient, scheduledHours } = computeMinutes({
                    ...row,
                    localCheckIn: edit.checkIn,
                    localCheckOut: edit.checkOut,
                  });
                  const weekdayLabel = WEEKDAY_LABELS[row.weekday] ?? "";
                  const [y, m, d] = row.sessionDate.split("-");
                  const dateStr = `${weekdayLabel}, ${d}/${m}/${y}`;

                  return (
                    <tr
                      key={key}
                      className={cn(
                        "border-b border-border/50 last:border-0 transition-colors",
                        selectedIds.has(key) ? "bg-blue-50/50 dark:bg-blue-950/20" : "hover:bg-secondary/20",
                        edit.dirty && "bg-amber-50/30 dark:bg-amber-950/10"
                      )}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(key)}
                          onChange={() => toggleRow(key)}
                          className="rounded"
                        />
                      </td>

                      {/* Teacher name */}
                      <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                        {row.teacherName}
                      </td>

                      {/* Class */}
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {row.className}
                      </td>

                      {/* Date */}
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap text-xs">
                        {dateStr}
                      </td>

                      {/* Start time (scheduled) */}
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {row.startTime.substring(0, 5)}
                      </td>

                      {/* End time (scheduled) */}
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {row.endTime.substring(0, 5)}
                      </td>

                      {/* Check-in */}
                      <td className="px-3 py-2">
                        <input
                          type="time"
                          value={edit.checkIn}
                          onChange={(e) => updateCheckIn(row, e.target.value)}
                          className="border border-border rounded px-1.5 py-1 text-xs bg-background text-foreground w-24"
                        />
                      </td>

                      {/* Check-out — auto-filled with endTime when checkIn is entered */}
                      <td className="px-3 py-2">
                        <input
                          type="time"
                          value={edit.checkOut}
                          onChange={(e) => updateCheckOut(row, e.target.value)}
                          className="border border-border rounded px-1.5 py-1 text-xs bg-background text-foreground w-24"
                        />
                      </td>

                      {/* Missing minutes */}
                      <td className="px-3 py-2 text-center">
                        {missing !== null && missing > 0 ? (
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                            -{missing}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>

                      {/* Extra minutes */}
                      <td className="px-3 py-2 text-center">
                        {extra !== null && extra > 0 ? (
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            +{extra}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>

                      {/* Coefficient (hours) */}
                      <td className="px-3 py-2 text-center">
                        {coefficient !== null ? (
                          <span className={cn(
                            "inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-semibold tabular-nums",
                            coefficient >= scheduledHours
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                              : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                          )}>
                            {coefficient % 1 === 0 ? `${coefficient}` : coefficient.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>

                      {/* Note */}
                      <td className="px-3 py-2 min-w-[140px]">
                        <input
                          type="text"
                          value={edit.note}
                          onChange={(e) => updateNote(row, e.target.value)}
                          placeholder="Ghi chú..."
                          className="border border-border rounded px-1.5 py-1 text-xs bg-background text-foreground w-full"
                        />
                      </td>

                      {/* Auto-save status indicator */}
                      <td className="px-2 py-2 text-center w-8">
                        {isSaving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 mx-auto" />
                        ) : isJustSaved ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mx-auto" />
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      </div>

      {/* Footer - pagination */}
      <div className="shrink-0 px-6 py-3 border-t border-border/50">
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Trang {tab.page} / {totalPages} · {tab.total} kết quả</span>
          <div className="flex items-center gap-1">
            <button
              disabled={tab.page === 1}
              onClick={() => tab.setPage(tab.page - 1)}
              className="px-2 py-1.5 rounded-lg border border-border hover:bg-secondary/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            ><ChevronLeft className="w-4 h-4" /></button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = totalPages <= 7 ? i + 1
                : tab.page <= 4 ? i + 1
                : tab.page >= totalPages - 3 ? totalPages - 6 + i
                : tab.page - 3 + i;
              return (
                <button
                  key={p}
                  onClick={() => tab.setPage(p)}
                  className={cn(
                    "w-8 h-8 rounded-lg border text-xs font-medium transition-colors",
                    tab.page === p ? "bg-blue-600 border-blue-600 text-white" : "border-border hover:bg-secondary/70"
                  )}
                >{p}</button>
              );
            })}
            <button
              disabled={tab.page >= totalPages}
              onClick={() => tab.setPage(tab.page + 1)}
              className="px-2 py-1.5 rounded-lg border border-border hover:bg-secondary/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            ><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
