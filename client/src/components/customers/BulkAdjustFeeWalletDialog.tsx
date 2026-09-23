import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Scale, Search, Trash2, Users } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type WalletSummary = { hocPhi: number; datCoc: number; total: number };
type StudentOption = { id: string; fullName: string; code?: string; type?: string | null };
type ClassOption = { id: string; name: string };
type WalletRow = StudentOption & {
  summary: WalletSummary;
  hocPhiInput: string;
  datCocInput: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  initialStudentIds: string[];
  students: StudentOption[];
  classes: ClassOption[];
};

const EMPTY_SUMMARY: WalletSummary = { hocPhi: 0, datCoc: 0, total: 0 };

function formatCurrency(value: number) {
  return value.toLocaleString("vi-VN") + " đ";
}

function formatSignedCurrency(value: number) {
  if (value === 0) return "0 đ";
  return `${value > 0 ? "+" : "−"}${formatCurrency(Math.abs(value))}`;
}

function parseAdjustment(value: string) {
  if (!value || value === "-") return 0;
  const parsed = Number(value);
  return Number.isInteger(parsed) && Number.isFinite(parsed) ? parsed : 0;
}

function updateAmount(value: string) {
  if (value === "" || value === "-") return value;
  if (!/^-?\d*$/.test(value)) return null;
  const isNegative = value.startsWith("-");
  const digits = value.replace(/^-/, "").replace(/^0+(?=\d)/, "");
  return `${isNegative ? "-" : ""}${digits}`;
}

function toRow(student: StudentOption, summary = EMPTY_SUMMARY): WalletRow {
  return {
    ...student,
    summary,
    hocPhiInput: "",
    datCocInput: "",
  };
}

export function BulkAdjustFeeWalletDialog({
  open,
  onClose,
  initialStudentIds,
  students,
  classes,
}: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<WalletRow[]>([]);
  const [individualSearch, setIndividualSearch] = useState("");
  const [classSearch, setClassSearch] = useState("");
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [classPickerOpen, setClassPickerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const initialRows = students
      .filter(student => initialStudentIds.includes(student.id) && student.type !== "Phụ huynh")
      .reduce<WalletRow[]>((result, student) => {
        if (!result.some(row => row.id === student.id)) result.push(toRow(student));
        return result;
      }, []);
    setRows(initialRows);
    setIndividualSearch("");
    setClassSearch("");
    setSelectedClassIds([]);
  }, [open]); // The initial selection is intentionally captured when the dialog opens.

  const rowIds = useMemo(() => rows.map(row => row.id), [rows]);
  const { data: walletMap = {}, isFetching: isLoadingWallets } = useQuery<
    Record<string, { summary: WalletSummary }>
  >({
    queryKey: ["/api/students/fee-wallets-batch", rowIds.join(",")],
    queryFn: async () => {
      if (rowIds.length === 0) return {};
      const response = await apiRequest("POST", "/api/students/fee-wallets-batch", { studentIds: rowIds });
      return response.json();
    },
    enabled: open && rowIds.length > 0,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!walletMap || Object.keys(walletMap).length === 0) return;
    setRows(current => current.map(row => ({
      ...row,
      summary: walletMap[row.id]?.summary ?? row.summary,
    })));
  }, [walletMap]);

  const { data: individualResults = [], isFetching: isSearching } = useQuery<StudentOption[]>({
    queryKey: ["/api/students/minimal-wallet-adjustment", individualSearch.trim()],
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/students?minimal=true&limit=30&searchTerm=${encodeURIComponent(individualSearch.trim())}`,
      );
      const json = await response.json();
      return (json.students ?? []).filter((student: StudentOption) => student.type !== "Phụ huynh");
    },
    enabled: open && individualSearch.trim().length >= 2,
    staleTime: 30_000,
  });

  const addStudents = (newStudents: StudentOption[]) => {
    setRows(current => {
      const existing = new Set(current.map(row => row.id));
      return [
        ...current,
        ...newStudents
          .filter(student => student.type !== "Phụ huynh" && !existing.has(student.id))
          .map(student => toRow(student)),
      ];
    });
  };

  const addStudentsFromClasses = async () => {
    if (selectedClassIds.length === 0) return;
    try {
      const responses = await Promise.all(
        selectedClassIds.map(classId =>
          apiRequest("GET", `/api/classes/${classId}/active-students`).then(response => response.json()),
        ),
      );
      const classStudents = responses.flat().map((item: any): StudentOption | null => {
        const student = item.student ?? item;
        const id = item.studentId ?? student.id;
        if (!id) return null;
        return { id, fullName: student.fullName ?? "", code: student.code, type: student.type };
      }).filter((student: StudentOption | null): student is StudentOption => Boolean(student));
      addStudents(classStudents);
      setSelectedClassIds([]);
      setClassPickerOpen(false);
      toast({
        title: "Đã thêm học viên",
        description: `Đã thêm học viên đang học từ ${selectedClassIds.length} lớp (học viên trùng chỉ giữ một dòng).`,
      });
    } catch (error: any) {
      toast({ title: "Không thể tải học viên theo lớp", description: error.message, variant: "destructive" });
    }
  };

  const updateRow = (id: string, field: "hocPhiInput" | "datCocInput", value: string) => {
    const normalized = updateAmount(value);
    if (normalized === null) return;
    setRows(current => current.map(row => row.id === id ? { ...row, [field]: normalized } : row));
  };

  const adjustmentRows = rows.map(row => ({
    ...row,
    hocPhiAdjustment: parseAdjustment(row.hocPhiInput),
    datCocAdjustment: parseAdjustment(row.datCocInput),
  }));
  const hasAdjustment = adjustmentRows.some(row => row.hocPhiAdjustment !== 0 || row.datCocAdjustment !== 0);
  const totalCurrent = adjustmentRows.reduce((sum, row) => sum + row.summary.total, 0);
  const totalAfter = adjustmentRows.reduce(
    (sum, row) => sum + row.summary.total + row.hocPhiAdjustment + row.datCocAdjustment,
    0,
  );

  const adjustmentMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/students/fee-wallet-adjustments", {
      adjustments: adjustmentRows
        .filter(row => row.hocPhiAdjustment !== 0 || row.datCocAdjustment !== 0)
        .map(row => ({
          studentId: row.id,
          hocPhiAmount: row.hocPhiAdjustment,
          datCocAmount: row.datCocAdjustment,
        })),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/students/fee-wallets-batch"] });
      await Promise.all(rows.map(row =>
        queryClient.invalidateQueries({ queryKey: ["/api/students", row.id, "fee-wallet"] }),
      ));
      toast({ title: "Đã cân bằng tài khoản thành công", description: `Đã cập nhật ${adjustmentRows.filter(row => row.hocPhiAdjustment !== 0 || row.datCocAdjustment !== 0).length} học viên.` });
      close();
    },
    onError: (error: any) => {
      toast({ title: "Không thể cân bằng tài khoản", description: error.message, variant: "destructive" });
      close();
    },
  });

  const close = () => {
    if (adjustmentMutation.isPending) return;
    setRows([]);
    setSelectedClassIds([]);
    setIndividualSearch("");
    onClose();
  };

  const filteredClasses = classes.filter(classItem =>
    classItem.name.toLowerCase().includes(classSearch.trim().toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) close(); }}>
      <DialogContent className="w-[99vw] max-w-[99vw] max-h-[92vh] overflow-hidden flex flex-col z-[301]" overlayClassName="z-[300]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            Cân bằng tài khoản nhiều học viên
          </DialogTitle>
          <DialogDescription>
            Chọn nhanh theo lớp hoặc tìm từng học viên. Số dương để cộng, số âm để trừ; mỗi học viên là một dòng riêng.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Users className="h-3.5 w-3.5 text-primary" /> Thêm theo lớp
            </label>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between font-normal"
              onClick={() => setClassPickerOpen(current => !current)}
            >
              {selectedClassIds.length > 0 ? `Đã chọn ${selectedClassIds.length} lớp` : "Chọn một hoặc nhiều lớp"}
              <Plus className={cn("h-4 w-4 transition-transform", classPickerOpen && "rotate-45")} />
            </Button>
            {classPickerOpen && (
              <div className="rounded-md border bg-background p-2">
                <Input value={classSearch} onChange={event => setClassSearch(event.target.value)} placeholder="Tìm lớp..." className="mb-2 h-8 text-xs" />
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {filteredClasses.map(classItem => (
                    <label key={classItem.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted cursor-pointer text-sm">
                      <Checkbox
                        checked={selectedClassIds.includes(classItem.id)}
                        onCheckedChange={checked => setSelectedClassIds(current => checked
                          ? [...current, classItem.id]
                          : current.filter(id => id !== classItem.id))}
                      />
                      <span className="truncate">{classItem.name}</span>
                    </label>
                  ))}
                  {filteredClasses.length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">Không tìm thấy lớp</p>}
                </div>
                <Button type="button" size="sm" className="mt-2 w-full" onClick={addStudentsFromClasses} disabled={selectedClassIds.length === 0}>
                  Thêm học viên đang học
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Search className="h-3.5 w-3.5 text-primary" /> Thêm học viên lẻ
            </label>
            <Input value={individualSearch} onChange={event => setIndividualSearch(event.target.value)} placeholder="Tìm theo tên, mã hoặc số điện thoại..." />
            {individualSearch.trim().length >= 2 && (
              <div className="max-h-40 overflow-y-auto rounded-md border bg-background">
                {isSearching && <p className="p-3 text-xs text-muted-foreground">Đang tìm...</p>}
                {!isSearching && individualResults.map(student => {
                  const added = rows.some(row => row.id === student.id);
                  return (
                    <button
                      type="button"
                      key={student.id}
                      disabled={added}
                      onClick={() => addStudents([student])}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                    >
                      <span className="truncate">{student.fullName} {student.code && <span className="text-xs text-muted-foreground">({student.code})</span>}</span>
                      <Plus className="h-4 w-4 shrink-0" />
                    </button>
                  );
                })}
                {!isSearching && individualResults.length === 0 && <p className="p-3 text-xs text-muted-foreground">Không tìm thấy học viên</p>}
              </div>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
          <div className="min-w-[860px]">
            <div className="grid grid-cols-[minmax(210px,1.3fr)_150px_150px_150px_32px] gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground">
              <span>Học viên</span><span>Học phí</span><span>Đặt cọc</span><span>Tổng sau cân bằng</span><span />
            </div>
            {rows.length === 0 ? (
              <div className="flex min-h-36 items-center justify-center px-4 text-sm text-muted-foreground">Chưa có học viên. Hãy chọn theo lớp hoặc tìm học viên lẻ.</div>
            ) : (
              rows.map(row => {
                const hocPhiAdjustment = parseAdjustment(row.hocPhiInput);
                const datCocAdjustment = parseAdjustment(row.datCocInput);
                const adjustedHocPhi = row.summary.hocPhi + hocPhiAdjustment;
                const adjustedDatCoc = row.summary.datCoc + datCocAdjustment;
                return (
                  <div key={row.id} className="grid grid-cols-[minmax(210px,1.3fr)_150px_150px_150px_32px] items-center gap-2 border-b px-3 py-2 last:border-b-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.fullName || "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">{row.code || row.id}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Hiện tại: {isLoadingWallets ? "Đang tải..." : formatCurrency(row.summary.total)}
                      </p>
                    </div>
                    <div>
                      <Input value={row.hocPhiInput} onChange={event => updateRow(row.id, "hocPhiInput", event.target.value)} placeholder="± số tiền" inputMode="numeric" className="h-8 text-xs" disabled={adjustmentMutation.isPending} />
                      <p className={cn("mt-1 text-[11px]", adjustedHocPhi < 0 ? "text-red-600" : "text-muted-foreground")}>{formatCurrency(adjustedHocPhi)}</p>
                    </div>
                    <div>
                      <Input value={row.datCocInput} onChange={event => updateRow(row.id, "datCocInput", event.target.value)} placeholder="± số tiền" inputMode="numeric" className="h-8 text-xs" disabled={adjustmentMutation.isPending} />
                      <p className={cn("mt-1 text-[11px]", adjustedDatCoc < 0 ? "text-red-600" : "text-muted-foreground")}>{formatCurrency(adjustedDatCoc)}</p>
                    </div>
                    <p className={cn("text-sm font-semibold", adjustedHocPhi + adjustedDatCoc < 0 ? "text-red-600" : "text-primary")}>
                      {formatCurrency(adjustedHocPhi + adjustedDatCoc)}
                    </p>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setRows(current => current.filter(item => item.id !== row.id))} disabled={adjustmentMutation.isPending} title="Xóa học viên">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="grid gap-2 rounded-lg bg-primary/5 px-4 py-3 sm:grid-cols-3">
          <div><p className="text-xs text-muted-foreground">Số học viên</p><p className="font-semibold">{rows.length}</p></div>
          <div><p className="text-xs text-muted-foreground">Tổng hiện tại</p><p className="font-semibold">{formatCurrency(totalCurrent)}</p></div>
          <div><p className="text-xs text-muted-foreground">Tổng sau cân bằng</p><p className={cn("font-semibold", totalAfter < 0 ? "text-red-600" : "text-primary")}>{formatCurrency(totalAfter)} <span className="text-xs font-normal text-muted-foreground">({formatSignedCurrency(totalAfter - totalCurrent)})</span></p></div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={adjustmentMutation.isPending}>Huỷ</Button>
          <Button onClick={() => adjustmentMutation.mutate()} disabled={adjustmentMutation.isPending || rows.length === 0 || !hasAdjustment}>
            {adjustmentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lưu cân bằng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}