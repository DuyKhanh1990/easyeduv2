import { useState } from "react";
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
  { key: "branch",      label: "Cơ sở",           sortKey: "branch",      defaultVisible: true },
  { key: "code",        label: "Mã",               sortKey: "code",        defaultVisible: true },
  { key: "settleCode",  label: "Mã kết toán",      sortKey: "settleCode",  defaultVisible: true },
  { key: "type",        label: "Loại",             sortKey: "type",        defaultVisible: true },
  { key: "name",        label: "Tên",              sortKey: "name",        defaultVisible: true },
  { key: "category",    label: "Danh mục",         sortKey: "category",    defaultVisible: false },
  { key: "amount",      label: "Số tiền",                                  defaultVisible: true,  align: "right" },
  { key: "promotion",   label: "Khuyến mãi",                               defaultVisible: true,  align: "right" },
  { key: "surcharge",   label: "Phụ thu",                                  defaultVisible: true,  align: "right" },
  { key: "deduction",   label: "Khấu trừ",                                 defaultVisible: true,  align: "right" },
  { key: "total",       label: "Tổng tiền",        sortKey: "grandTotal",  defaultVisible: true,  align: "right" },
  { key: "paymentProgress",   label: "Đã thu / Còn nợ",                     defaultVisible: true },
  { key: "scheduleProgress",  label: "Đợt & Tiến độ",                       defaultVisible: true },
  { key: "paidAmount",  label: "Đã thu",                                   defaultVisible: false, align: "right" },
  { key: "remaining",   label: "Còn lại",                                  defaultVisible: false, align: "right" },
  { key: "description", label: "Mô tả",            sortKey: "description", defaultVisible: true },
  { key: "status",      label: "Trạng thái",       sortKey: "status",      defaultVisible: true },
  { key: "dueDate",     label: "Hạn TT",           sortKey: "dueDate",     defaultVisible: true },
  { key: "creator",     label: "Người tạo",                                defaultVisible: true },
  { key: "createdAt",   label: "Ngày tạo",         sortKey: "createdAt",   defaultVisible: true },
  { key: "updater",     label: "Người cập nhật",                           defaultVisible: true },
  { key: "updatedAt",   label: "Ngày cập nhật",    sortKey: "updatedAt",   defaultVisible: true },
  { key: "commission",  label: "Hoa hồng",         sortKey: "commission",  defaultVisible: false, align: "right" },
];

export function useInvoiceColumns() {
  const [columnOrder, setColumnOrder]     = useState<string[]>(ALL_COLUMNS.map(c => c.key));
  const [columnVisible, setColumnVisible] = useState<Record<string, boolean>>(
    Object.fromEntries(ALL_COLUMNS.map(c => [c.key, c.defaultVisible]))
  );
  const [colManagerOpen, setColManagerOpen] = useState(false);
  const [dragKey, setDragKey]               = useState<string | null>(null);

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
