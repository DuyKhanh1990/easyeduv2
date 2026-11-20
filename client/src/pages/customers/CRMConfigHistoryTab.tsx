import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { CalendarIcon, Eye, History, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getCrmFieldLabel } from "@/lib/crm-customer-fields";
import { HistoryPaginationFooter } from "@/components/common/HistoryPaginationFooter";

type HistoryEvent = {
  id: string;
  entity_type: string;
  action: "created" | "updated" | "deleted";
  old_content: string | null;
  new_content: string | null;
  ev_time: string;
  user_name: string | null;
};

const ENTITY_LABELS: Record<string, string> = {
  "pipeline-group": "Nhóm pipeline",
  relationship: "Mối quan hệ",
  "reject-reason": "Lý do từ chối",
  "customer-source": "Nguồn khách hàng",
  school: "Trường học",
  "custom-field": "Trường thông tin bổ sung",
  "required-field": "Trường thông tin bắt buộc",
};

const FIELD_LABELS: Record<string, string> = {
  name: "Tên",
  reason: "Lý do",
  label: "Tên trường",
  color: "Màu sắc",
  position: "Vị trí",
  isParentGroup: "Là nhóm cha",
  isSystemDefault: "Mặc định hệ thống",
  fieldType: "Loại dữ liệu",
  options: "Danh sách lựa chọn",
  fieldKey: "Trường thông tin",
  isRequired: "Trạng thái bắt buộc",
};

const HIDDEN_FIELDS = new Set([
  "id",
  "parentId",
  "groupId",
  "createdAt",
  "updatedAt",
]);

const ACTION_CONFIG = {
  created: { label: "Thêm mới", icon: <Plus className="h-3 w-3" />, color: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200" },
  updated: { label: "Sửa", icon: <Pencil className="h-3 w-3" />, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  deleted: { label: "Xóa", icon: <Trash2 className="h-3 w-3" />, color: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
} as const;

function stripUtc(value: string) {
  return value.replace("Z", "").replace("+00:00", "");
}

function formatDateTime(value: string) {
  try {
    return format(new Date(stripUtc(value)), "HH:mm — dd/MM/yyyy", { locale: vi });
  } catch {
    return value;
  }
}

function parseContent(value: string | null) {
  if (!value) return {};
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
}

function getRequiredFieldLabel(value: unknown) {
  if (!value) return "—";
  const key = String(value);
  const label = getCrmFieldLabel(key);
  return label.startsWith("custom:") ? "Trường tùy chỉnh" : label;
}

function displayValue(value: unknown, fieldKey?: string) {
  if (value === null || value === undefined || value === "") return "—";
  if (fieldKey === "fieldKey") return getRequiredFieldLabel(value);
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  const valueLabels: Record<string, string> = {
    text: "Văn bản ngắn",
    textarea: "Văn bản dài",
    number: "Số",
    date: "Ngày",
    select: "Danh sách lựa chọn",
  };
  if (valueLabels[String(value)]) return valueLabels[String(value)];
  return String(value);
}

function getFieldLabel(key: string, content: Record<string, unknown>) {
  if (key === "fieldKey") return "Trường thông tin";
  return FIELD_LABELS[key] ?? "Thông tin khác";
}

function HistoryDetail({ event, onClose }: { event: HistoryEvent | null; onClose: () => void }) {
  if (!event) return null;
  const config = ACTION_CONFIG[event.action];
  const oldContent = parseContent(event.old_content);
  const newContent = parseContent(event.new_content);
  const keys = Array.from(new Set([...Object.keys(oldContent), ...Object.keys(newContent)]))
    .filter(key => !HIDDEN_FIELDS.has(key))
    .filter(key => event.action === "deleted" || String(oldContent[key] ?? "") !== String(newContent[key] ?? ""));

  return (
    <Dialog open={!!event} onOpenChange={open => !open && onClose()}>
      <DialogContent className="w-[80vw] max-w-[80vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${config.bg} ${config.border} ${config.color}`}>
              {config.icon}{config.label}
            </span>
            <span className="font-bold text-slate-700">{ENTITY_LABELS[event.entity_type] ?? event.entity_type}</span>
            <span className="text-slate-400 font-normal">{formatDateTime(event.ev_time)}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="text-xs text-slate-500 space-y-0.5 -mt-1">
          {event.user_name && <div><span className="font-medium">Thực hiện bởi:</span> {event.user_name}</div>}
        </div>
        {keys.length > 0 ? (
          <table className="w-full text-xs mt-2">
            <thead><tr className="border-b border-slate-100">
              <th className="text-left py-1.5 pr-3 font-semibold text-slate-500">Trường</th>
              {event.action === "updated" && <th className="text-left py-1.5 pr-3 font-semibold text-red-400">Trước</th>}
              <th className="text-left py-1.5 font-semibold text-emerald-600">{event.action === "updated" ? "Sau" : "Giá trị"}</th>
            </tr></thead>
            <tbody>{keys.map(key => (
              <tr key={key} className="border-b border-slate-50">
                <td className="py-2 pr-3 font-medium text-slate-600">{getFieldLabel(key, { ...oldContent, ...newContent })}</td>
                {event.action === "updated" && <td className="py-2 pr-3"><span className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded line-through">{displayValue(oldContent[key], key)}</span></td>}
                <td className="py-2"><span className={`${event.action === "deleted" ? "bg-slate-100 text-slate-700" : "bg-emerald-50 text-emerald-700"} px-1.5 py-0.5 rounded`}>{displayValue(event.action === "updated" ? newContent[key] : oldContent[key] ?? newContent[key], key)}</span></td>
              </tr>
            ))}</tbody>
          </table>
        ) : <p className="text-xs text-slate-400 mt-2 italic">Không có chi tiết thay đổi được ghi lại.</p>}
      </DialogContent>
    </Dialog>
  );
}

export function CRMConfigHistoryTab() {
  const [action, setAction] = useState("all");
  const [entityType, setEntityType] = useState("all");
  const [page, setPage] = useState(1);
  const [detailEvent, setDetailEvent] = useState<HistoryEvent | null>(null);
  const [pageSize, setPageSize] = useState(50);
  const params = new URLSearchParams({ limit: String(pageSize), offset: String((page - 1) * pageSize) });
  if (action !== "all") params.set("action", action);
  if (entityType !== "all") params.set("entityType", entityType);

  const { data, isLoading } = useQuery<{ events: HistoryEvent[]; total: number }>({
    queryKey: ["/api/crm/config-history", action, entityType, page],
    queryFn: async () => {
      const response = await fetch(`/api/crm/config-history?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Không thể tải lịch sử");
      return response.json();
    },
    staleTime: 30_000,
  });
  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col min-h-0 gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={entityType} onValueChange={value => { setEntityType(value); setPage(1); }}>
          <SelectTrigger className="h-8 w-[210px] text-xs"><SelectValue placeholder="Tất cả danh mục" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả danh mục</SelectItem>
            {Object.entries(ENTITY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={action} onValueChange={value => { setAction(value); setPage(1); }}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Tất cả thao tác" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả thao tác</SelectItem>
            <SelectItem value="created">Thêm mới</SelectItem>
            <SelectItem value="updated">Sửa</SelectItem>
            <SelectItem value="deleted">Xóa</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(pageSize)} onValueChange={value => { setPageSize(Number(value)); setPage(1); }}>
          <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="50">50 / trang</SelectItem>
            <SelectItem value="100">100 / trang</SelectItem>
            <SelectItem value="200">200 / trang</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground"><CalendarIcon className="h-3.5 w-3.5" />{total} sự kiện</div>
      </div>
      <div className="overflow-auto">
        {isLoading ? <p className="text-sm text-muted-foreground text-center py-12">Đang tải lịch sử...</p> : events.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground"><History className="h-12 w-12 opacity-15" /><p className="text-sm">Chưa có lịch sử cấu hình</p></div>
        ) : <div className="space-y-1.5">{events.map(event => {
          const config = ACTION_CONFIG[event.action];
          const content = parseContent(event.new_content ?? event.old_content);
          const name = content.name ?? content.reason ?? content.label
            ?? (content.fieldKey ? getRequiredFieldLabel(content.fieldKey) : null)
            ?? "—";
          return <div key={event.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white border border-slate-100">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${config.bg} ${config.border} ${config.color}`}>{config.icon}{config.label}</span>
            <span className="text-xs font-semibold text-slate-700">{ENTITY_LABELS[event.entity_type] ?? event.entity_type}</span>
            <span className="text-xs text-slate-600 truncate flex-1">{String(name)}</span>
            {event.user_name && <span className="text-[11px] text-slate-400">bởi {event.user_name}</span>}
            <span className="text-[10px] text-slate-400 whitespace-nowrap">{formatDateTime(event.ev_time)}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDetailEvent(event)} title="Xem chi tiết"><Eye className="h-3.5 w-3.5" /></Button>
          </div>;
        })}</div>}
      </div>
      <HistoryPaginationFooter
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        isLoading={isLoading}
        onPageChange={setPage}
        onPageSizeChange={value => { setPageSize(value); setPage(1); }}
        legend={<>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500" /> Thêm mới</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Sửa</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Xóa</span>
        </>}
      />
      <HistoryDetail event={detailEvent} onClose={() => setDetailEvent(null)} />
    </div>
  );
}