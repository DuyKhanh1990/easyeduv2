/**
 * Excel export utilities for /store tabs.
 * Each function takes the already-filtered/visible data and a toast callback.
 */
import ExcelJS from "exceljs";

// ── helpers ─────────────────────────────────────────────────────────────────

function fmtVND(val: string | number | null | undefined): string {
  if (val == null) return "0";
  const n = typeof val === "string" ? parseFloat(val) : val;
  return isNaN(n) ? "0" : n.toLocaleString("vi-VN");
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtDay(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function styleHeader(row: ExcelJS.Row) {
  row.height = 26;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E5FA3" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin" }, left: { style: "thin" },
      bottom: { style: "thin" }, right: { style: "thin" },
    };
  });
}

function styleDataRow(row: ExcelJS.Row, idx: number) {
  const bg = idx % 2 === 0 ? "FFFFFFFF" : "FFF5F7FA";
  row.height = 22;
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    cell.border = {
      top: { style: "thin", color: { argb: "FFE5E7EB" } },
      left: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      right: { style: "thin", color: { argb: "FFE5E7EB" } },
    };
    cell.alignment = { vertical: "middle" };
  });
}

function triggerDownload(buffer: ExcelJS.Buffer, filename: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── 1. Nhập kho ──────────────────────────────────────────────────────────────

export type ReceiptRow = {
  id: string; code: string; name: string; date: string; status: string;
  has_invoice: boolean; total_amount: string;
  location_name: string | null; warehouse_name: string | null;
  supplier_name: string | null; created_by_name: string | null;
  item_count: number; total_quantity: number; created_at: string;
  [key: string]: any;
};

export async function exportNhapKho(rows: ReceiptRow[], toast: (o: any) => void) {
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Nhập kho");
    ws.columns = [
      { width: 18 }, { width: 16 }, { width: 14 }, { width: 28 },
      { width: 18 }, { width: 14 }, { width: 8 }, { width: 8 },
      { width: 18 }, { width: 22 }, { width: 10 }, { width: 20 },
    ];
    const hdr = ws.addRow([
      "Ngày tạo", "Cơ sở", "Mã phiếu", "Tên phiếu",
      "Kho", "Trạng thái", "Số SP", "SL",
      "Tổng tiền (VNĐ)", "Nhà cung cấp", "Hoá đơn", "Người tạo",
    ]);
    styleHeader(hdr);
    ws.views = [{ state: "frozen", ySplit: 1 }];

    rows.forEach((r, i) => {
      const statusLabel = r.status === "completed" ? "Đã nhập kho" : r.status === "cancelled" ? "Đã hủy" : "Nháp";
      const row = ws.addRow([
        fmtDate(r.created_at), r.location_name ?? "—", r.code, r.name,
        r.warehouse_name ?? "—", statusLabel, r.item_count, r.total_quantity,
        fmtVND(r.total_amount), r.supplier_name ?? "—",
        r.has_invoice ? "Có" : "—", r.created_by_name ?? "—",
      ]);
      styleDataRow(row, i);
      row.getCell(7).alignment = { vertical: "middle", horizontal: "center" };
      row.getCell(8).alignment = { vertical: "middle", horizontal: "center" };
      row.getCell(9).alignment = { vertical: "middle", horizontal: "right" };
      row.getCell(11).alignment = { vertical: "middle", horizontal: "center" };
    });

    const buf = await wb.xlsx.writeBuffer();
    triggerDownload(buf, `nhap_kho_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: "Thành công", description: `Đã xuất ${rows.length} phiếu nhập kho.` });
  } catch {
    toast({ title: "Lỗi", description: "Không thể xuất file Excel.", variant: "destructive" });
  }
}

// ── 2. Xuất kho ──────────────────────────────────────────────────────────────

export type IssueReceiptRow = {
  id: string; code: string; name: string; date: string; status: string;
  has_invoice: boolean; total_amount: string;
  location_name: string | null; warehouse_name: string | null;
  recipient_name: string | null; created_by_name: string | null;
  item_count: number; total_quantity: number; created_at: string;
  [key: string]: any;
};

export async function exportXuatKho(rows: IssueReceiptRow[], toast: (o: any) => void) {
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Xuất kho");
    ws.columns = [
      { width: 18 }, { width: 16 }, { width: 14 }, { width: 28 },
      { width: 18 }, { width: 14 }, { width: 8 }, { width: 8 },
      { width: 18 }, { width: 22 }, { width: 10 }, { width: 20 },
    ];
    const hdr = ws.addRow([
      "Ngày tạo", "Cơ sở", "Mã phiếu", "Tên phiếu",
      "Kho xuất", "Trạng thái", "Số SP", "SL",
      "Tổng tiền (VNĐ)", "Người nhận", "Hoá đơn", "Người tạo",
    ]);
    styleHeader(hdr);
    ws.views = [{ state: "frozen", ySplit: 1 }];

    rows.forEach((r, i) => {
      const statusLabel = r.status === "completed" ? "Đã xuất kho" : r.status === "cancelled" ? "Đã hủy" : "Nháp";
      const row = ws.addRow([
        fmtDate(r.created_at), r.location_name ?? "—", r.code, r.name,
        r.warehouse_name ?? "—", statusLabel, r.item_count, r.total_quantity,
        fmtVND(r.total_amount), r.recipient_name ?? "—",
        r.has_invoice ? "Có" : "—", r.created_by_name ?? "—",
      ]);
      styleDataRow(row, i);
      row.getCell(7).alignment = { vertical: "middle", horizontal: "center" };
      row.getCell(8).alignment = { vertical: "middle", horizontal: "center" };
      row.getCell(9).alignment = { vertical: "middle", horizontal: "right" };
      row.getCell(11).alignment = { vertical: "middle", horizontal: "center" };
    });

    const buf = await wb.xlsx.writeBuffer();
    triggerDownload(buf, `xuat_kho_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: "Thành công", description: `Đã xuất ${rows.length} phiếu xuất kho.` });
  } catch {
    toast({ title: "Lỗi", description: "Không thể xuất file Excel.", variant: "destructive" });
  }
}

// ── 3. Chuyển kho ────────────────────────────────────────────────────────────

export type TransferRow = {
  id: string; code: string; date: string; status: string; note: string | null;
  from_warehouse_name: string | null; to_warehouse_name: string | null;
  created_by_name: string | null;
  item_count: number; total_quantity: number; created_at: string;
  [key: string]: any;
};

export async function exportChuyenKho(rows: TransferRow[], toast: (o: any) => void) {
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Chuyển kho");
    ws.columns = [
      { width: 18 }, { width: 14 }, { width: 14 }, { width: 20 },
      { width: 20 }, { width: 16 }, { width: 8 }, { width: 8 },
      { width: 20 }, { width: 30 },
    ];
    const hdr = ws.addRow([
      "Ngày tạo", "Mã phiếu", "Ngày chuyển kho", "Kho nguồn",
      "Kho đích", "Trạng thái", "Số SP", "SL",
      "Người tạo", "Ghi chú",
    ]);
    styleHeader(hdr);
    ws.views = [{ state: "frozen", ySplit: 1 }];

    rows.forEach((r, i) => {
      const statusLabel =
        r.status === "completed" ? "Hoàn thành" :
        r.status === "transferring" ? "Đang chuyển" :
        r.status === "cancelled" ? "Đã hủy" : "Nháp";
      const row = ws.addRow([
        fmtDate(r.created_at), r.code, fmtDay(r.date),
        r.from_warehouse_name ?? "—", r.to_warehouse_name ?? "—",
        statusLabel, r.item_count, r.total_quantity,
        r.created_by_name ?? "—", r.note ?? "",
      ]);
      styleDataRow(row, i);
      row.getCell(7).alignment = { vertical: "middle", horizontal: "center" };
      row.getCell(8).alignment = { vertical: "middle", horizontal: "center" };
    });

    const buf = await wb.xlsx.writeBuffer();
    triggerDownload(buf, `chuyen_kho_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: "Thành công", description: `Đã xuất ${rows.length} phiếu chuyển kho.` });
  } catch {
    toast({ title: "Lỗi", description: "Không thể xuất file Excel.", variant: "destructive" });
  }
}

// ── 4. Tồn kho ───────────────────────────────────────────────────────────────

export type InventoryRow = {
  productId: string; code: string; name: string;
  warehouseId: string; warehouseName: string;
  totalImport: number; totalExport: number;
  actualStock: number; reservedQty: number; availableQty: number;
  status: "ok" | "low" | "out";
  updatedAt: string | null;
};

export async function exportTonKho(
  rows: InventoryRow[],
  fetchAll: () => Promise<InventoryRow[]>,
  toast: (o: any) => void,
) {
  try {
    // If we only have the current page, fetch all for export
    const data = rows.length > 0 ? await fetchAll() : rows;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Tồn kho");
    ws.columns = [
      { width: 14 }, { width: 30 }, { width: 20 }, { width: 12 },
      { width: 10 }, { width: 14 }, { width: 12 }, { width: 12 },
      { width: 12 }, { width: 20 },
    ];
    const hdr = ws.addRow([
      "Mã SP", "Tên sản phẩm", "Kho", "Tổng nhập",
      "Đã xuất", "Tồn thực tế", "Đã giữ chỗ", "Khả dụng",
      "Trạng thái", "Cập nhật lần cuối",
    ]);
    styleHeader(hdr);
    ws.views = [{ state: "frozen", ySplit: 1 }];

    data.forEach((r, i) => {
      const statusLabel = r.status === "ok" ? "Còn hàng" : r.status === "low" ? "Sắp hết" : "Hết hàng";
      const row = ws.addRow([
        r.code, r.name, r.warehouseName,
        r.totalImport, r.totalExport, r.actualStock,
        r.reservedQty, r.availableQty,
        statusLabel, r.updatedAt ? fmtDate(r.updatedAt) : "—",
      ]);
      styleDataRow(row, i);
      // Right-align numbers
      [4, 5, 6, 7, 8].forEach(col => {
        row.getCell(col).alignment = { vertical: "middle", horizontal: "right" };
      });
      row.getCell(9).alignment = { vertical: "middle", horizontal: "center" };
      // Color status cell
      const statusCell = row.getCell(9);
      if (r.status === "ok") statusCell.font = { color: { argb: "FF16A34A" }, bold: true };
      else if (r.status === "low") statusCell.font = { color: { argb: "FFCA8A04" }, bold: true };
      else statusCell.font = { color: { argb: "FFDC2626" }, bold: true };
    });

    const buf = await wb.xlsx.writeBuffer();
    triggerDownload(buf, `ton_kho_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: "Thành công", description: `Đã xuất ${data.length} sản phẩm tồn kho.` });
  } catch {
    toast({ title: "Lỗi", description: "Không thể xuất file Excel.", variant: "destructive" });
  }
}
