import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { vi } from "date-fns/locale";
import { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableCell, TableRow, WidthType } from "docx";
import { Banknote, CalendarDays, ChevronLeft, ChevronRight, Download, Eye, Pencil, Plus, Search, Trash2, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const PAGE_SIZES = [20, 30, 50];

function formatVND(amount: number) {
  return new Intl.NumberFormat("vi-VN").format(amount) + " ₫";
}

interface StaffAdvance {
  id: string;
  staffId: string;
  date: string;
  amount: number;
  documentDueDate?: string | null;
  reason?: string;
  items?: Array<{ name: string; amount: number }>;
}

interface Staff {
  id: string;
  fullName: string;
  code?: string;
  assignments?: Array<{
    location?: { name?: string } | null;
    department?: { name?: string } | null;
    role?: { name?: string } | null;
  }>;
}

interface TamUngTabProps {
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

type AdvanceItem = { name: string; amount: string };

function formatDateValue(value?: string | null) {
  if (!value) return "Chưa xác định";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return `ngày ${format(date, "dd")} tháng ${format(date, "MM")} năm ${format(date, "yyyy")}`;
}

function numberToVietnameseWords(value: number) {
  if (!value) return "không đồng";
  const digits = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
  const readThree = (number: number, full = false) => {
    const hundred = Math.floor(number / 100);
    const ten = Math.floor((number % 100) / 10);
    const unit = number % 10;
    const words: string[] = [];
    if (hundred || full) words.push(`${digits[hundred]} trăm`);
    if (ten > 1) {
      words.push(`${digits[ten]} mươi`);
      if (unit === 1) words.push("mốt");
      else if (unit === 4) words.push("tư");
      else if (unit === 5) words.push("lăm");
      else if (unit) words.push(digits[unit]);
    } else if (ten === 1) {
      words.push("mười");
      if (unit === 5) words.push("lăm");
      else if (unit) words.push(digits[unit]);
    } else if (unit) {
      if (hundred || full) words.push("lẻ");
      words.push(digits[unit]);
    }
    return words.join(" ");
  };
  const groups = [
    { value: Math.floor(value / 1_000_000_000), suffix: "tỷ" },
    { value: Math.floor((value % 1_000_000_000) / 1_000_000), suffix: "triệu" },
    { value: Math.floor((value % 1_000_000) / 1_000), suffix: "nghìn" },
    { value: value % 1_000, suffix: "" },
  ];
  const words: string[] = [];
  let hasPrevious = false;
  groups.forEach(({ value: groupValue, suffix }) => {
    if (!groupValue && !hasPrevious) return;
    if (!groupValue) return;
    words.push(readThree(groupValue, hasPrevious && groupValue < 100));
    if (suffix) words.push(suffix);
    hasPrevious = true;
  });
  return `${words.join(" ")} đồng`;
}

export function TamUngTab({ canCreate = false, canEdit = false, canDelete = false }: TamUngTabProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [printRecord, setPrintRecord] = useState<StaffAdvance | null>(null);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | "view">("create");
  const [form, setForm] = useState({
    staffId: "",
    date: format(new Date(), "yyyy-MM-dd"),
    documentDueDate: format(addDays(new Date(), 7), "yyyy-MM-dd"),
    amount: "",
    reason: "",
    items: [] as AdvanceItem[],
  });
  const [staffSearch, setStaffSearch] = useState("");
  const [staffDropdownOpen, setStaffDropdownOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data: records = [], isLoading } = useQuery<StaffAdvance[]>({
    queryKey: ["/api/staff-advances"],
  });

  const { data: staff = [] } = useQuery<Staff[]>({
    queryKey: ["/api/staff", "minimal"],
    queryFn: async () => {
      const res = await fetch("/api/staff", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((s) =>
      s.fullName.toLowerCase().includes(q) || (s.code ?? "").toLowerCase().includes(q)
    );
  }, [staff, staffSearch]);

  const selectedStaff = staff.find((s) => s.id === form.staffId);
  const totalAmount = records.reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const paginated = records.slice((page - 1) * pageSize, page * pageSize);

  const resetForm = () => {
    setForm({
      staffId: "",
      date: format(new Date(), "yyyy-MM-dd"),
      documentDueDate: format(addDays(new Date(), 7), "yyyy-MM-dd"),
      amount: "",
      reason: "",
      items: [],
    });
    setStaffSearch("");
    setStaffDropdownOpen(false);
    setCalendarOpen(false);
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/staff-advances", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-advances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/salary-sheets"] });
      toast({ title: "Thành công", description: "Đã tạo phiếu tạm ứng" });
      setOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err?.message || "Không thể tạo phiếu tạm ứng", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PUT", `/api/staff-advances/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-advances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/salary-sheets"] });
      toast({ title: "Thành công", description: "Đã cập nhật phiếu tạm ứng" });
      setOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err?.message || "Không thể cập nhật phiếu", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/staff-advances/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-advances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/salary-sheets"] });
      toast({ title: "Đã xoá", description: "Đã xoá phiếu tạm ứng" });
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err?.message || "Không thể xoá phiếu", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (dialogMode === "view") return;
    if (!form.staffId) {
      toast({ title: "Lỗi", description: "Vui lòng chọn nhân viên", variant: "destructive" });
      return;
    }
    const amount = parseInt(form.amount.replace(/\D/g, ""), 10);
    if (!amount || amount <= 0) {
      toast({ title: "Lỗi", description: "Số tiền phải lớn hơn 0", variant: "destructive" });
      return;
    }
    if (!form.date) {
      toast({ title: "Lỗi", description: "Vui lòng chọn ngày", variant: "destructive" });
      return;
    }
    if (!form.documentDueDate) {
      toast({ title: "Lỗi", description: "Vui lòng chọn thời hạn hoàn chứng từ", variant: "destructive" });
      return;
    }
    const items = form.items
      .filter((item) => item.name.trim() || item.amount)
      .map((item) => ({ name: item.name.trim(), amount: parseInt(item.amount.replace(/\D/g, ""), 10) || 0 }));
    const incompleteItem = items.find((item) => !item.name || item.amount <= 0);
    if (incompleteItem) {
      toast({ title: "Lỗi", description: "Vui lòng nhập đầy đủ tên khoản và số tiền", variant: "destructive" });
      return;
    }
    const data = { staffId: form.staffId, date: form.date, documentDueDate: form.documentDueDate, amount, reason: form.reason, items };
    if (dialogMode === "edit" && activeRecordId) {
      updateMutation.mutate({ id: activeRecordId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);

  const openRecord = (record: StaffAdvance, mode: "edit" | "view") => {
    if (mode === "view") {
      setPrintRecord(record);
      return;
    }
    setActiveRecordId(record.id);
    setDialogMode(mode);
    setForm({
      staffId: record.staffId,
      date: String(record.date).slice(0, 10),
      documentDueDate: record.documentDueDate ? String(record.documentDueDate).slice(0, 10) : "",
      amount: record.amount ? new Intl.NumberFormat("vi-VN").format(Number(record.amount)) : "",
      reason: record.reason ?? "",
      items: (record.items ?? []).map((item) => ({
        name: item.name,
        amount: item.amount ? new Intl.NumberFormat("vi-VN").format(Number(item.amount)) : "",
      })),
    });
    setStaffSearch("");
    setStaffDropdownOpen(false);
    setCalendarOpen(false);
    setOpen(true);
  };

  const updateItem = (index: number, field: keyof AdvanceItem, value: string) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
    }));
  };

  const getStaffName = (staffId: string) => {
    const person = staff.find((s) => s.id === staffId);
    return person ? `${person.code ? `${person.code} ` : ""}${person.fullName}` : staffId;
  };

  const getStaffForPrint = (staffId: string) => staff.find((person) => person.id === staffId);
  const getCompanyName = (person?: Staff) => person?.assignments?.find((assignment) => assignment.location?.name)?.location?.name || "................................";
  const getDepartmentRoles = (person?: Staff) => {
    const pairs = (person?.assignments ?? [])
      .map((assignment) => [assignment.department?.name, assignment.role?.name].filter(Boolean).join("|"))
      .filter(Boolean);
    return pairs.length ? Array.from(new Set(pairs)).join(", ") : "................................";
  };

  const printAdvance = () => {
    document.body.classList.add("printing-advance");
    window.print();
    window.setTimeout(() => document.body.classList.remove("printing-advance"), 500);
  };

  const downloadWord = async () => {
    if (!printRecord) return;
    const printStaff = getStaffForPrint(printRecord.staffId);
    const amount = Number(printRecord.amount || 0);
    const date = new Date(`${String(printRecord.date).slice(0, 10)}T00:00:00`);
    const labelParagraph = (label: string, value: string, italic = false) => new Paragraph({
      spacing: { after: 160 },
      children: [
        new TextRun({ text: label, bold: true, font: "Times New Roman", size: 26 }),
        new TextRun({ text: value, italics: italic, font: "Times New Roman", size: 26 }),
      ],
    });
    const costRows = printRecord.items?.length
      ? printRecord.items.map((item) => new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 100 },
        children: [
          new TextRun({
            text: `${item.name}: ${new Intl.NumberFormat("vi-VN").format(Number(item.amount || 0))} VNĐ`,
            font: "Times New Roman",
            size: 26,
          }),
        ],
      }))
      : [new Paragraph({
        indent: { left: 720 },
        children: [new TextRun({ text: "Chưa có danh mục chi tiết.", font: "Times New Roman", size: 26 })],
      })];
    const signatures = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({
        children: ["Giám đốc", "Kế toán trưởng", "Phụ trách bộ phận", "Người đề nghị tạm ứng"].map((title) => new TableCell({
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: title, bold: true, font: "Times New Roman", size: 26 })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "(Ký, họ tên)", italics: true, font: "Times New Roman", size: 26 })] }),
          ],
        })),
      })],
    });
    const children = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({
          text: "GIẤY ĐỀ NGHỊ TẠM ỨNG",
          bold: true,
          font: "Times New Roman",
          size: 32,
        })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 720 },
        children: [new TextRun({
          text: `Ngày ${format(date, "dd")} tháng ${format(date, "MM")} năm ${format(date, "yyyy")}`,
          italics: true,
          font: "Times New Roman",
          size: 26,
        })],
      }),
      labelParagraph("Kính gửi: ", `Ban Giám đốc và Phòng Kế toán ${getCompanyName(printStaff)}`),
      labelParagraph("Tôi tên là: ", printStaff?.fullName || "................................"),
      labelParagraph("Bộ phận/Chức vụ: ", getDepartmentRoles(printStaff)),
      labelParagraph("Số tiền đề nghị tạm ứng: ", `${new Intl.NumberFormat("vi-VN").format(amount)} VNĐ`),
      labelParagraph("(Viết bằng chữ): ", `${numberToVietnameseWords(amount)}./.`, true),
      labelParagraph("Lý do tạm ứng: ", printRecord.reason || "................................"),
      new Paragraph({
        spacing: { after: 100 },
        children: [new TextRun({ text: "Dự toán chi phí gồm:", bold: true, font: "Times New Roman", size: 26 })],
      }),
      ...costRows,
      labelParagraph("Thời hạn hoàn chứng từ thanh toán: ", formatDateValue(printRecord.documentDueDate)),
      new Paragraph({ text: "", spacing: { after: 900 } }),
      signatures,
    ];
    const doc = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: "Times New Roman",
              size: 26,
            },
          },
        },
      },
      sections: [{
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
          },
        },
        children,
      }],
    });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `giay-de-nghi-tam-ung-${String(printRecord.date).slice(0, 10)}.docx`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 px-5 pt-3 pb-0">
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50/60">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <Wallet className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Tạm ứng</p>
            <p className="text-sm font-bold text-amber-700">{formatVND(totalAmount)}</p>
            <p className="text-[10px] text-slate-400">{records.length} phiếu</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden mx-5 mb-4 mt-3 bg-white dark:bg-gray-950 rounded-xl border border-slate-200 dark:border-gray-800 shadow-sm">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 shrink-0 bg-slate-50/50">
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
            Tất cả <span className="font-bold">{records.length}</span>
          </span>
          {canCreate && (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white"
               onClick={() => { resetForm(); setActiveRecordId(null); setDialogMode("create"); setOpen(true); }}
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm mới
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse" style={{ minWidth: 640 }}>
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-100 dark:bg-slate-900" style={{ boxShadow: "0 1px 0 0 #e2e8f0" }}>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-48">Nhân viên</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Ngày</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-36">Số tiền</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Lý do</th>
                <th className="w-28"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="text-center py-16 text-sm text-slate-400">Đang tải...</td></tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-16">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <Wallet className="w-10 h-10 opacity-25" />
                      <p className="text-sm font-medium">Chưa có phiếu tạm ứng</p>
                      <p className="text-xs opacity-60">Nhấn "Thêm mới" để tạo phiếu đầu tiên</p>
                    </div>
                  </td>
                </tr>
              ) : paginated.map((record, index) => (
                <tr key={record.id} className={cn("group hover:bg-amber-50/40 transition-colors", index % 2 ? "bg-slate-50/60" : "bg-white")}>
                  <td className="px-4 py-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-bold text-violet-600 uppercase">{getStaffName(record.staffId).charAt(0)}</span>
                      </div>
                      <span className="text-xs font-semibold text-slate-700 truncate max-w-[180px]">{getStaffName(record.staffId)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 border-b border-slate-100 text-xs text-slate-600 font-medium">
                    {record.date ? format(new Date(record.date), "dd/MM/yyyy") : "—"}
                  </td>
                  <td className="px-4 py-3 border-b border-slate-100 text-right">
                    <span className="text-sm font-bold text-amber-600">-{formatVND(Number(record.amount || 0))}</span>
                  </td>
                  <td className="px-4 py-3 border-b border-slate-100 max-w-xs">
                    {record.reason ? <p className="text-xs text-slate-600 truncate" title={record.reason}>{record.reason}</p> : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-3 border-b border-slate-100">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button title="Xem" className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-violet-100 text-slate-400 hover:text-violet-600 flex items-center justify-center" onClick={() => openRecord(record, "view")}>
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {canEdit && (
                        <button title="Sửa" className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-amber-100 text-slate-400 hover:text-amber-600 flex items-center justify-center" onClick={() => openRecord(record, "edit")}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          title="Xoá"
                          className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-500 flex items-center justify-center"
                          onClick={() => { if (confirm("Xoá phiếu tạm ứng này?")) deleteMutation.mutate(record.id); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 shrink-0 bg-slate-50/50">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Hiển thị</span>
            <select
              className="border border-slate-200 rounded-md text-xs px-2 py-1 bg-white"
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            >
              {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            <span>bản ghi</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-violet-50 flex items-center justify-center disabled:opacity-40" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-slate-500 min-w-[80px] text-center font-medium">Trang {page} / {totalPages}</span>
            <button className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-violet-50 flex items-center justify-center disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) resetForm(); }}>
        <DialogContent className="sm:max-w-[420px] p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
            <DialogTitle className="flex items-center gap-2.5 text-base">
              <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center"><Banknote className="h-4 w-4 text-amber-600" /></div>
              {dialogMode === "create" ? "Tạo phiếu tạm ứng" : dialogMode === "edit" ? "Sửa phiếu tạm ứng" : "Chi tiết phiếu tạm ứng"}
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Nhân viên <span className="text-red-500">*</span></Label>
              <div className="relative">
                 <button type="button" disabled={dialogMode === "view"} onClick={() => setStaffDropdownOpen((value) => !value)} className={cn("w-full flex items-center justify-between border rounded-xl px-3 py-2.5 text-sm text-left", staffDropdownOpen ? "border-violet-400 ring-2 ring-violet-100 bg-white" : "border-slate-200 bg-slate-50", dialogMode === "view" && "cursor-default opacity-80")}>
                  <span className={selectedStaff ? "text-slate-800 font-medium" : "text-slate-400"}>{selectedStaff ? `${selectedStaff.code ? `${selectedStaff.code} · ` : ""}${selectedStaff.fullName}` : "Chọn nhân viên..."}</span>
                  <Search className="h-4 w-4 text-slate-400 shrink-0" />
                </button>
                {staffDropdownOpen && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                    <div className="p-2 border-b border-slate-100 flex items-center gap-2"><Search className="h-3.5 w-3.5 text-slate-400" /><input autoFocus className="flex-1 text-sm outline-none" placeholder="Tìm theo tên hoặc mã..." value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)} /></div>
                    <div className="max-h-44 overflow-y-auto">
                      {filteredStaff.map((person) => (
                        <button key={person.id} type="button" onClick={() => { setForm((value) => ({ ...value, staffId: person.id })); setStaffDropdownOpen(false); setStaffSearch(""); }} className={cn("w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-violet-50", form.staffId === person.id && "bg-violet-50 font-semibold text-violet-700")}>
                          <span className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center text-[10px] font-bold text-violet-600">{person.fullName.charAt(0)}</span>
                          <span className="font-medium text-slate-800">{person.fullName}{person.code && <span className="ml-2 text-xs text-slate-400">{person.code}</span>}</span>
                        </button>
                      ))}
                      {filteredStaff.length === 0 && <p className="px-4 py-3 text-xs text-slate-400 text-center">Không tìm thấy nhân viên</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Ngày <span className="text-red-500">*</span></Label>
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                   <PopoverTrigger asChild><button type="button" disabled={dialogMode === "view"} className="w-full flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 text-left disabled:cursor-default disabled:opacity-80"><CalendarDays className="h-4 w-4 text-slate-400" /><span className="text-slate-800 font-medium">{format(new Date(form.date), "dd/MM/yyyy", { locale: vi })}</span></button></PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={new Date(form.date)} onSelect={(date) => { if (date) { setForm((value) => ({ ...value, date: format(date, "yyyy-MM-dd") })); setCalendarOpen(false); } }} locale={vi} initialFocus /></PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Số tiền (₫) <span className="text-red-500">*</span></Label>
                 <input disabled={dialogMode === "view"} type="text" inputMode="numeric" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 font-medium disabled:cursor-default disabled:opacity-80" placeholder="0" value={form.amount} onChange={(e) => { const raw = e.target.value.replace(/\D/g, ""); setForm((value) => ({ ...value, amount: raw ? new Intl.NumberFormat("vi-VN").format(Number(raw)) : "" })); }} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Thời hạn hoàn chứng từ thanh toán <span className="text-red-500">*</span></Label>
              <div className="relative">
                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  disabled={dialogMode === "view"}
                  type="date"
                  className="w-full border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-sm bg-slate-50 font-medium disabled:cursor-default disabled:opacity-80"
                  value={form.documentDueDate}
                  onChange={(e) => setForm((value) => ({ ...value, documentDueDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Lý do</Label>
              <Textarea disabled={dialogMode === "view"} placeholder="Nhập lý do tạm ứng..." className="resize-none text-sm border-slate-200 rounded-xl bg-slate-50 disabled:cursor-default disabled:opacity-80" rows={3} value={form.reason} onChange={(e) => setForm((value) => ({ ...value, reason: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Danh mục khoản chi <span className="normal-case font-normal text-slate-400">(chỉ liệt kê)</span></Label>
                {dialogMode !== "view" && (
                  <button type="button" aria-label="Thêm khoản chi" className="w-7 h-7 rounded-full border border-violet-200 bg-violet-50 text-violet-600 hover:bg-violet-100 inline-flex items-center justify-center" onClick={() => setForm((value) => ({ ...value, items: [...value.items, { name: "", amount: "" }] }))}>
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>
              {form.items.length > 0 && (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_120px_28px] gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    <span>Khoản tạm ứng</span><span className="text-right">Số tiền</span><span />
                  </div>
                  {form.items.map((item, index) => (
                    <div key={index} className="grid grid-cols-[1fr_120px_28px] gap-2 items-center">
                      <input disabled={dialogMode === "view"} className="min-w-0 border border-slate-200 rounded-lg px-2.5 py-2 text-sm bg-slate-50 disabled:cursor-default disabled:opacity-80" placeholder="VD: Vé máy bay" value={item.name} onChange={(e) => updateItem(index, "name", e.target.value)} />
                      <input disabled={dialogMode === "view"} inputMode="numeric" className="min-w-0 border border-slate-200 rounded-lg px-2.5 py-2 text-sm bg-slate-50 text-right disabled:cursor-default disabled:opacity-80" placeholder="0" value={item.amount} onChange={(e) => { const raw = e.target.value.replace(/\D/g, ""); updateItem(index, "amount", raw ? new Intl.NumberFormat("vi-VN").format(Number(raw)) : ""); }} />
                      {dialogMode !== "view" ? (
                        <button type="button" title="Xóa khoản" className="w-7 h-7 rounded-md text-slate-400 hover:bg-red-50 hover:text-red-500 flex items-center justify-center" onClick={() => setForm((value) => ({ ...value, items: value.items.filter((_, itemIndex) => itemIndex !== index) }))}><X className="h-4 w-4" /></button>
                      ) : <span />}
                    </div>
                  ))}
                </div>
              )}
              {dialogMode === "view" && form.items.length === 0 && <p className="text-xs text-slate-400">Chưa có khoản chi chi tiết.</p>}
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-slate-50/50">
            <Button variant="outline" size="sm" onClick={() => { setOpen(false); resetForm(); }}>{dialogMode === "view" ? "Đóng" : "Hủy"}</Button>
            {dialogMode !== "view" && <Button size="sm" className="gap-1.5 text-white bg-amber-600 hover:bg-amber-700 min-w-[120px]" onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "Đang lưu..." : dialogMode === "edit" ? "Lưu thay đổi" : "Tạo phiếu tạm ứng"}
            </Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!printRecord} onOpenChange={(value) => { if (!value) setPrintRecord(null); }}>
        <DialogContent className="sm:max-w-[920px] max-h-[95vh] overflow-y-auto p-0">
          {printRecord && (() => {
            const printStaff = getStaffForPrint(printRecord.staffId);
            const amount = Number(printRecord.amount || 0);
            return (
              <>
                <DialogHeader className="px-5 py-4 border-b border-slate-200 flex-row items-center justify-between">
                  <DialogTitle className="text-base">Xem giấy đề nghị tạm ứng</DialogTitle>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={downloadWord}>
                      <Download className="h-3.5 w-3.5" /> Tải file Word
                    </Button>
                    <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={printAdvance}>In để ký</Button>
                    <Button variant="outline" size="sm" onClick={() => setPrintRecord(null)}>Đóng</Button>
                  </div>
                </DialogHeader>
                <div className="bg-slate-100 p-4 sm:p-8">
                  <article className="advance-print-page mx-auto w-full max-w-[820px] min-h-[1050px] bg-white px-8 py-10 sm:px-14 sm:py-12 text-[16px] leading-relaxed text-black shadow-sm">
                    <h1 className="text-center text-[27px] font-bold uppercase leading-tight">GIẤY ĐỀ NGHỊ TẠM ỨNG</h1>
                    <p className="mt-1 text-center text-[19px] italic">
                      Ngày {format(new Date(`${String(printRecord.date).slice(0, 10)}T00:00:00`), "dd")} tháng {format(new Date(`${String(printRecord.date).slice(0, 10)}T00:00:00`), "MM")} năm {format(new Date(`${String(printRecord.date).slice(0, 10)}T00:00:00`), "yyyy")}
                    </p>

                    <div className="mt-12 space-y-3">
                      <p><strong>Kính gửi:</strong> Ban Giám đốc và Phòng Kế toán <strong>{getCompanyName(printStaff)}</strong></p>
                      <p><strong>Tôi tên là:</strong> {printStaff?.fullName || "................................"}</p>
                      <p><strong>Bộ phận/Chức vụ:</strong> {getDepartmentRoles(printStaff)}</p>
                      <p><strong>Số tiền đề nghị tạm ứng:</strong> {new Intl.NumberFormat("vi-VN").format(amount)} VNĐ</p>
                      <p><em>(Viết bằng chữ):</em> {numberToVietnameseWords(amount)}./.</p>
                      <p><strong>Lý do tạm ứng:</strong> {printRecord.reason || "................................"}</p>
                      <div>
                        <p><strong>Dự toán chi phí gồm:</strong></p>
                        {printRecord.items?.length ? (
                          <ul className="ml-10 mt-1 list-[circle] space-y-1.5">
                            {printRecord.items.map((item, index) => (
                              <li key={`${item.name}-${index}`}>{item.name}: {new Intl.NumberFormat("vi-VN").format(Number(item.amount || 0))} VNĐ</li>
                            ))}
                          </ul>
                        ) : <p className="ml-10 text-slate-500">Chưa có danh mục chi tiết.</p>}
                      </div>
                      <p><strong>Thời hạn hoàn chứng từ thanh toán:</strong> {formatDateValue(printRecord.documentDueDate)}</p>
                    </div>

                    <div className="mt-24 grid grid-cols-4 gap-4 text-center leading-tight">
                      {["Giám đốc", "Kế toán trưởng", "Phụ trách bộ phận", "Người đề nghị tạm ứng"].map((title) => (
                        <div key={title}>
                          <p className="font-bold">{title}</p>
                          <p className="italic">(Ký, họ tên)</p>
                        </div>
                      ))}
                    </div>
                  </article>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
      <style>{`
        @media print {
          body.printing-advance * { visibility: hidden !important; }
          body.printing-advance .advance-print-page,
          body.printing-advance .advance-print-page * { visibility: visible !important; }
          body.printing-advance .advance-print-page {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 210mm !important;
            box-sizing: border-box !important;
            max-width: none !important;
            min-height: auto !important;
            margin: 0 !important;
            padding: 16mm 16mm !important;
            box-shadow: none !important;
          }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </div>
  );
}