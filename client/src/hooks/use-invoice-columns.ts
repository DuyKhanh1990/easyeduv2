import { useEffect, useState } from "react";
import type { DragEvent } from "react";
import type { SortKey } from "./use-invoice-filters";

export interface ColumnDef {
  key: string;
  labelKey: string;
  sortKey?: SortKey;
  defaultVisible: boolean;
  align?: "left" | "right";
}

export const ALL_COLUMNS: ColumnDef[] = [
  { key: "name",        labelKey: "finance.column.name", sortKey: "name", defaultVisible: true },
  { key: "branch",      labelKey: "finance.branch",                      sortKey: "branch",      defaultVisible: true },
  { key: "code",        labelKey: "finance.column.code",                 sortKey: "code",        defaultVisible: true },
  { key: "settleCode",  labelKey: "finance.column.settleCode",            sortKey: "settleCode",  defaultVisible: false },
  { key: "type",        labelKey: "finance.type",                        sortKey: "type",        defaultVisible: true },
  { key: "className",   labelKey: "finance.class",                                             defaultVisible: false },
  { key: "category",    labelKey: "finance.category",                    sortKey: "category",    defaultVisible: true },
  { key: "amount",      labelKey: "finance.amount",                                           defaultVisible: false, align: "right" },
  { key: "promotion",   labelKey: "finance.promotion",                                        defaultVisible: false, align: "right" },
  { key: "surcharge",   labelKey: "finance.surcharge",                                        defaultVisible: false, align: "right" },
  { key: "deduction",   labelKey: "finance.deposit",                                           defaultVisible: false, align: "right" },
  { key: "total",       labelKey: "finance.total",                       sortKey: "grandTotal",  defaultVisible: true,  align: "right" },
  { key: "paymentProgress",   labelKey: "finance.column.paymentProgress",                       defaultVisible: true },
  { key: "scheduleProgress",  labelKey: "finance.column.scheduleProgress",                      defaultVisible: true },
  { key: "paidAmount",  labelKey: "finance.paid",                                               defaultVisible: false, align: "right" },
  { key: "remaining",   labelKey: "finance.remaining",                                          defaultVisible: false, align: "right" },
  { key: "description", labelKey: "finance.description",               sortKey: "description", defaultVisible: false },
  { key: "status",      labelKey: "finance.status",                    sortKey: "status",      defaultVisible: true },
  { key: "einvoice",    labelKey: "finance.column.einvoice",                                     defaultVisible: true },
  { key: "dueDate",     labelKey: "finance.column.dueDate",             sortKey: "dueDate",     defaultVisible: true },
  { key: "creator",     labelKey: "finance.creator",                                             defaultVisible: true },
  { key: "createdAt",   labelKey: "finance.createdDate",                sortKey: "createdAt",   defaultVisible: true },
  { key: "paidBy",      labelKey: "finance.payer",                                               defaultVisible: false },
  { key: "paidAt",      labelKey: "finance.paidDate",                    sortKey: "paidAt",      defaultVisible: false },
  { key: "paymentMethod", labelKey: "finance.column.paymentMethod",                            defaultVisible: true },
  { key: "updater",     labelKey: "finance.column.updater",                                      defaultVisible: false },
  { key: "updatedAt",   labelKey: "finance.column.updatedAt",            sortKey: "updatedAt",   defaultVisible: false },
  { key: "commission",  labelKey: "finance.column.commission",           sortKey: "commission",  defaultVisible: false, align: "right" },
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
