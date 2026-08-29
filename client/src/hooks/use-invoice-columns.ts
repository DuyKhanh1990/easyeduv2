import { useEffect, useState } from "react";
import type { DragEvent } from "react";
import type { SortKey } from "./use-invoice-filters";

export interface ColumnDef {
  key: string;
  label: string;
  sortKey?: SortKey;
  defaultVisible: boolean;
  align?: "left" | "right";
}

export const ALL_COLUMNS: ColumnDef[] = [
  { key: "name",        label: "Tên",                 sortKey: "name",        defaultVisible: true },
  { key: "branch",      label: "Cơ sở",              sortKey: "branch",      defaultVisible: true },
  { key: "code",        label: "Mã",                  sortKey: "code",        defaultVisible: true },
  { key: "settleCode",  label: "Mã kết toán",         sortKey: "settleCode",  defaultVisible: false },
  { key: "type",        label: "Loại",                sortKey: "type",        defaultVisible: true },
  { key: "className",   label: "Lớp",                                         defaultVisible: false },
  { key: "category",    label: "Danh mục",            sortKey: "category",    defaultVisible: true },
  { key: "amount",      label: "Số tiền",                                     defaultVisible: false, align: "right" },
  { key: "promotion",   label: "Khuyến mãi",                                  defaultVisible: false, align: "right" },
  { key: "surcharge",   label: "Phụ thu",                                     defaultVisible: false, align: "right" },
  { key: "deduction",   label: "Đặt cọc",                                     defaultVisible: false, align: "right" },
  { key: "total",       label: "Tổng tiền",           sortKey: "grandTotal",  defaultVisible: true,  align: "right" },
  { key: "paymentProgress",   label: "Đã thu / Còn nợ",                       defaultVisible: true },
  { key: "scheduleProgress",  label: "Đợt & Tiến độ",                        defaultVisible: true },
  { key: "paidAmount",  label: "Đã thu",                                      defaultVisible: false, align: "right" },
  { key: "remaining",   label: "Còn lại",                                     defaultVisible: false, align: "right" },
  { key: "description", label: "Mô tả",               sortKey: "description", defaultVisible: false },
  { key: "status",      label: "Trạng thái",          sortKey: "status",      defaultVisible: true },
  { key: "einvoice",    label: "HĐĐT",                                        defaultVisible: true },
  { key: "dueDate",     label: "Hạn TT",              sortKey: "dueDate",     defaultVisible: true },
  { key: "creator",     label: "Người tạo",                                   defaultVisible: true },
  { key: "createdAt",   label: "Ngày tạo",            sortKey: "createdAt",   defaultVisible: true },
  { key: "paidBy",      label: "Người thanh toán",                            defaultVisible: false },
  { key: "paidAt",      label: "Ngày thanh toán",     sortKey: "paidAt",      defaultVisible: false },
  { key: "updater",     label: "Người cập nhật",                              defaultVisible: false },
  { key: "updatedAt",   label: "Ngày cập nhật",       sortKey: "updatedAt",   defaultVisible: false },
  { key: "commission",  label: "Hoa hồng",            sortKey: "commission",  defaultVisible: false, align: "right" },
];

const INVOICE_COLUMNS_STORAGE_KEY = "edumanage:invoices:columns";
const DEFAULT_COLUMN_ORDER = ALL_COLUMNS.map(column => column.key);
const DEFAULT_COLUMN_VISIBLE = Object.fromEntries(
  ALL_COLUMNS.map(column => [column.key, column.defaultVisible]),
) as Record<string, boolean>;
const VALID_COLUMN_KEYS = new Set(DEFAULT_COLUMN_ORDER);

interface StoredColumnConfig {
  order?: unknown;
  visible?: unknown;
}

function getInitialColumnConfig(): { order: string[]; visible: Record<string, boolean> } {
  const fallback = {
    order: DEFAULT_COLUMN_ORDER,
    visible: DEFAULT_COLUMN_VISIBLE,
  };

  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(INVOICE_COLUMNS_STORAGE_KEY);
    if (!raw) return fallback;

    const stored = JSON.parse(raw) as StoredColumnConfig;
    const storedOrder = Array.isArray(stored.order)
      ? stored.order.filter(
          (key): key is string => typeof key === "string" && VALID_COLUMN_KEYS.has(key),
        )
      : [];
    const uniqueStoredOrder = [...new Set(storedOrder)];
    const order = [
      ...uniqueStoredOrder,
      ...DEFAULT_COLUMN_ORDER.filter(key => !uniqueStoredOrder.includes(key)),
    ];

    const visible = { ...DEFAULT_COLUMN_VISIBLE };
    if (stored.visible && typeof stored.visible === "object" && !Array.isArray(stored.visible)) {
      for (const [key, value] of Object.entries(stored.visible)) {
        if (VALID_COLUMN_KEYS.has(key) && typeof value === "boolean") {
          visible[key] = value;
        }
      }
    }

    return { order, visible };
  } catch {
    return fallback;
  }
}

export function useInvoiceColumns() {
  const [columnOrder, setColumnOrder] = useState<string[]>(
    () => getInitialColumnConfig().order,
  );
  const [columnVisible, setColumnVisible] = useState<Record<string, boolean>>(
    () => getInitialColumnConfig().visible,
  );
  const [colManagerOpen, setColManagerOpen] = useState(false);
  const [dragKey, setDragKey]               = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        INVOICE_COLUMNS_STORAGE_KEY,
        JSON.stringify({ order: columnOrder, visible: columnVisible }),
      );
    } catch {
      // Ignore storage failures (for example private browsing restrictions).
    }
  }, [columnOrder, columnVisible]);

  const visibleColumns = columnOrder
    .map(key => ALL_COLUMNS.find(c => c.key === key)!)
    .filter(c => c && columnVisible[c.key]);

  const handleColDragStart = (key: string) => setDragKey(key);

  const handleColDragOver = (e: DragEvent<HTMLElement>, overKey: string) => {
    e.preventDefault();
    if (!dragKey || dragKey === overKey) return;
    setColumnOrder(prev => {
      const next = [...prev];
      const fromIdx = next.indexOf(dragKey);
      const toIdx   = next.indexOf(overKey);
      if (fromIdx === -1 || toIdx === -1) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, dragKey);
      return next;
    });
  };

  return {
    columnOrder,
    columnVisible, setColumnVisible,
    colManagerOpen, setColManagerOpen,
    dragKey, setDragKey,
    visibleColumns,
    handleColDragStart,
    handleColDragOver,
  };
}
