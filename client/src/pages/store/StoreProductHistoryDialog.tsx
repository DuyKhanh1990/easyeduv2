import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { History, PackagePlus, Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type ProductHistoryEvent = {
  id: string;
  action: "store.product.created" | "store.product.updated" | "store.product.deleted";
  oldContent: string | null;
  newContent: string | null;
  createdAt: string;
  userName: string | null;
};

type HistoryResponse = { events: ProductHistoryEvent[]; total: number };

const PAGE_SIZE = 50;
const EVENT_CONFIG = {
  "store.product.created": {
    label: "Thêm mới",
    Icon: PackagePlus,
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  "store.product.updated": {
    label: "Chỉnh sửa",
    Icon: Pencil,
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  "store.product.deleted": {
    label: "Xóa",
    Icon: Trash2,
    className: "border-slate-300 bg-slate-100 text-slate-600",
  },
} as const;

const LEGACY_FIELD_LABELS: Record<string, string> = {
  code: "Mã sản phẩm",
  name: "Tên sản phẩm",
  categoryId: "Danh mục (ID)",
  unitId: "Đơn vị (ID)",
  supplierId: "Nhà cung cấp (ID)",
  costPrice: "Giá nhập",
  salePrice: "Giá bán",
  starPrice: "Giá sao",
  description: "Mô tả",
  imageUrl: "URL hình ảnh",
  hasVariants: "Có biến thể",
  status: "Trạng thái",
};

function parseSnapshot(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => {
      const label = LEGACY_FIELD_LABELS[key] ?? key;
      if (key === "hasVariants" && typeof value === "boolean") return [label, value ? "Có" : "Không"];
      if (key === "status" && value === "active") return [label, "Đang bán"];
      if (key === "status" && value === "inactive") return [label, "Ngừng bán"];
      return [label, value];
    }));
  } catch {
    return null;
  }
}

function displayValue(value: unknown) {
  if (value == null || value === "") return "—";
  return String(value);
}

function EventSnapshot({
  oldContent,
  newContent,
}: {
  oldContent: Record<string, unknown> | null;
  newContent: Record<string, unknown> | null;
}) {
  const fields = Array.from(new Set([
    ...Object.keys(oldContent ?? {}),
    ...Object.keys(newContent ?? {}),
  ])).filter(key => !oldContent || !newContent || oldContent[key] !== newContent[key]);

  if (!fields.length) return <p className="text-xs text-slate-400 italic">Không có thay đổi được ghi nhận.</p>;

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-100">
      <table className="w-full min-w-[420px] text-xs">
        <thead>
          <tr className="bg-slate-50 text-left">
            <th className="px-3 py-2 font-semibold text-slate-500">Trường</th>
            {oldContent && <th className="px-3 py-2 font-semibold text-red-600">Trước</th>}
            {newContent && <th className="px-3 py-2 font-semibold text-emerald-700">Sau</th>}
          </tr>
        </thead>
        <tbody>
          {fields.map(field => (
            <tr key={field} className="border-t border-slate-100">
              <td className="px-3 py-2 font-medium text-slate-600">{field}</td>
              {oldContent && <td className="px-3 py-2 text-slate-600">{displayValue(oldContent[field])}</td>}
              {newContent && <td className="px-3 py-2 text-slate-700">{displayValue(newContent[field])}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StoreProductHistoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useQuery<HistoryResponse>({
    queryKey: ["/api/store/products/history", page, PAGE_SIZE],
    queryFn: () => apiRequest("GET", `/api/store/products/history?page=${page}&pageSize=${PAGE_SIZE}`).then(res => res.json()),
    enabled: open,
    staleTime: 15_000,
  });
  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(900px,95vw)] max-w-[900px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Nhật ký sản phẩm
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Đang tải nhật ký...</div>
          ) : isError ? (
            <div className="py-16 text-center text-sm text-destructive">Không tải được nhật ký sản phẩm.</div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <History className="h-10 w-10 opacity-20" />
              <p className="text-sm">Chưa có thao tác nào được ghi nhận.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {events.map(event => {
                const config = EVENT_CONFIG[event.action];
                const Icon = config.Icon;
                const oldContent = parseSnapshot(event.oldContent);
                const newContent = parseSnapshot(event.newContent);
                const product = newContent ?? oldContent ?? {};
                const date = new Date(event.createdAt);
                return (
                  <article key={event.id} className="rounded-xl border border-slate-100 bg-white p-3">
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${config.className}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${config.className}`}>
                            {config.label}
                          </span>
                          <span className="truncate text-sm font-semibold text-slate-800">
                            {displayValue(product["Mã sản phẩm"] ?? product.code)} · {displayValue(product["Tên sản phẩm"] ?? product.name)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {Number.isNaN(date.getTime()) ? event.createdAt : format(date, "HH:mm — dd/MM/yyyy", { locale: vi })}
                          {event.userName ? ` · bởi ${event.userName}` : ""}
                        </p>
                        <EventSnapshot oldContent={oldContent} newContent={newContent} />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t pt-3 text-xs text-muted-foreground">
          <span>Tổng {total.toLocaleString("vi-VN")} sự kiện</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border p-1.5 disabled:opacity-40"
              aria-label="Trang trước"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage(current => Math.max(1, current - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span>{page} / {totalPages}</span>
            <button
              type="button"
              className="rounded-md border p-1.5 disabled:opacity-40"
              aria-label="Trang sau"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage(current => Math.min(totalPages, current + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
