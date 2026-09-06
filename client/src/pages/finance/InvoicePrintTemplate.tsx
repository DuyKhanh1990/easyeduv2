import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  Eye, EyeOff, Printer, Save, RotateCcw, ChevronDown,
  Type, Table2, Variable, X, Search,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Trash2, Merge, SplitSquareHorizontal,
  Grid3x3, Square, Rows2, CircleAlert,
} from "lucide-react";
import { evaluate } from "mathjs";
import DOMPurify from "dompurify";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { InvoicePrintTemplateRow } from "@shared/schema";

/* ─────────────────── TYPES ─────────────────── */
type PageSize = "A4" | "A5" | "K80";
type Orientation = "portrait" | "landscape";

interface TemplateData {
  html: string;
  pageSize: PageSize;
  orientation: Orientation;
}

interface TableCtx {
  table: HTMLTableElement;
  cell: HTMLTableCellElement;
  rowIndex: number;
  colIndex: number;
}

/* ─────────────────── TABLE INLINE TOOLBAR (inside main toolbar) ─────────────────── */
function TableInlineToolbar({
  ctx,
  selectedCells,
  bordersHidden,
  onAddRowAbove,
  onAddRowBelow,
  onDeleteRow,
  onAddColLeft,
  onAddColRight,
  onDeleteCol,
  onMergeCells,
  onSplitCell,
  onDeleteTable,
  onToggleBorders,
}: {
  ctx: TableCtx;
  selectedCells: HTMLTableCellElement[];
  bordersHidden: boolean;
  onAddRowAbove: () => void;
  onAddRowBelow: () => void;
  onDeleteRow: () => void;
  onAddColLeft: () => void;
  onAddColRight: () => void;
  onDeleteCol: () => void;
  onMergeCells: () => void;
  onSplitCell: () => void;
  onDeleteTable: () => void;
  onToggleBorders: () => void;
}) {
  const canMerge = selectedCells.length >= 1;
  const canSplit = ctx.cell.colSpan > 1 || ctx.cell.rowSpan > 1;

  const btn = (icon: React.ReactNode, label: string, onClick: () => void, danger = false) => (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={onClick}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors whitespace-nowrap ${
              danger ? "text-red-600 hover:bg-red-50" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            {icon}<span>{label}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const sep = () => <div className="w-px h-4 bg-gray-200 mx-0.5 shrink-0" />;

  return (
    <div className="flex items-center gap-0 flex-wrap border-t border-blue-100 bg-blue-50/60 px-2 py-0.5">
      <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mr-1.5 shrink-0">Bảng:</span>
      {btn(<ArrowUp className="h-3 w-3" />, "Thêm hàng trên", onAddRowAbove)}
      {btn(<ArrowDown className="h-3 w-3" />, "Thêm hàng dưới", onAddRowBelow)}
      {btn(<Trash2 className="h-3 w-3" />, "Xoá hàng", onDeleteRow, true)}
      {sep()}
      {btn(<ArrowLeft className="h-3 w-3" />, "Thêm cột trái", onAddColLeft)}
      {btn(<ArrowRight className="h-3 w-3" />, "Thêm cột phải", onAddColRight)}
      {btn(<Trash2 className="h-3 w-3" />, "Xoá cột", onDeleteCol, true)}
      {sep()}
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={onMergeCells}
              disabled={!canMerge}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors whitespace-nowrap ${
                canMerge ? "text-blue-700 hover:bg-blue-100" : "text-gray-300 cursor-not-allowed"
              }`}
            >
              <Merge className="h-3 w-3" />
              <span>Gộp ô{canMerge ? ` (${selectedCells.length + 1})` : ""}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {canMerge ? "Gộp các ô đã chọn" : "Kéo chuột qua nhiều ô để gộp"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={onSplitCell}
              disabled={!canSplit}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors whitespace-nowrap ${
                canSplit ? "text-blue-700 hover:bg-blue-100" : "text-gray-300 cursor-not-allowed"
              }`}
            >
              <SplitSquareHorizontal className="h-3 w-3" /><span>Tách ô</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Tách ô đã gộp</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {sep()}
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={onToggleBorders}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors whitespace-nowrap ${
                bordersHidden ? "bg-amber-100 text-amber-700 hover:bg-amber-200" : "text-gray-700 hover:bg-gray-100"
              }`}
              data-testid="button-toggle-borders"
            >
              {bordersHidden ? <Square className="h-3 w-3" /> : <Grid3x3 className="h-3 w-3" />}
              <span>{bordersHidden ? "Hiện kẻ bảng" : "Ẩn kẻ bảng"}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {bordersHidden ? "Bật lại đường kẻ bảng khi in" : "Ẩn kẻ bảng (bố cục ẩn)"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {sep()}
      {btn(<Trash2 className="h-3 w-3" />, "Xoá bảng", onDeleteTable, true)}
    </div>
  );
}

/* ─────────────────── VIETNAMESE NUMBER WORDS ─────────────────── */
const VI_DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
function readThreeDigits(num: number, full: boolean): string {
  const hundreds = Math.floor(num / 100);
  const tens = Math.floor((num % 100) / 10);
  const units = num % 10;
  const parts: string[] = [];
  if (hundreds > 0 || full) parts.push(`${VI_DIGITS[hundreds]} trăm`);
  if (tens === 0) {
    if (units > 0) { if (hundreds > 0 || full) parts.push("lẻ"); parts.push(VI_DIGITS[units]); }
  } else if (tens === 1) {
    parts.push("mười");
    if (units === 5) parts.push("lăm"); else if (units > 0) parts.push(VI_DIGITS[units]);
  } else {
    parts.push(`${VI_DIGITS[tens]} mươi`);
    if (units === 1) parts.push("mốt"); else if (units === 5) parts.push("lăm"); else if (units > 0) parts.push(VI_DIGITS[units]);
  }
  return parts.join(" ");
}
function numberToVietnameseWords(n: number): string {
  if (!isFinite(n) || n === 0) return "Không đồng";
  let num = Math.floor(Math.abs(n));
  const groups: number[] = [];
  while (num > 0) { groups.push(num % 1000); num = Math.floor(num / 1000); }
  const units = ["", "nghìn", "triệu", "tỷ"];
  const out: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]; if (g === 0) continue;
    const text = readThreeDigits(g, i !== groups.length - 1);
    out.push(text + (units[i] ? " " + units[i] : ""));
  }
  let words = out.join(" ").replace(/\s+/g, " ").trim();
  words = words.charAt(0).toUpperCase() + words.slice(1);
  return `${words} đồng`;
}

/* ─────────────────── SAMPLE DATA ─────────────────── */
const SAMPLE_HISTORY = [
  { label: "Đợt 1", paidDate: "01/04/2025", amount: 2000000, method: "Chuyển khoản", status: "paid" },
  { label: "Đợt 2 (Phiếu thu này)", paidDate: "05/05/2025", amount: 1000000, method: "Tiền mặt", status: "paid", current: true },
  { label: "Đợt 3", paidDate: "Dự kiến 05/06/2025", amount: 700000, method: "Tiền mặt", status: "unpaid" },
  { label: "Đợt 4", paidDate: "Dự kiến 05/07/2025", amount: 600000, method: "Chuyển khoản", status: "unpaid" },
  { label: "Đợt 5", paidDate: "Dự kiến 05/08/2025", amount: 700000, method: "Tiền mặt", status: "unpaid" },
];

const SAMPLE_DATA = {
  customer_name: "Nguyễn Văn A",
  phone: "0901 234 567",
  address: "123 Đường ABC, Quận 1, TP. HCM",
  invoice_code: "INV-2026-001",
  date: "01/04/2025",
  total: 5000000,
  thanh_tien: 5000000,
  da_thanh_toan: 2000000,
  con_lai: 3000000,
  lop: "A1 - Toán nâng cao 6",
  noi_dung: "Ghi chú mẫu cho hóa đơn",
  khoan_thu: "Học phí tháng 5",
  thu_ky_nay: 1000000,
  phuong_thuc: "Tiền mặt",
  nguoi_tao: "Nguyễn Văn A",
  nguoi_thanh_toan: "Nguyễn Thị Thu",
  // KM / PT / Khấu trừ (sample)
  tong_truoc_kmpt: 5300000,
  km_theo_sp: 50000,
  pt_theo_sp: 20000,
  km_toan_don: 280000,
  pt_toan_don: 10000,
  tong_km: 330000,
  tong_pt: 30000,
  khau_tru: 0,
  // Giá trị đã tính sẵn (dùng trực tiếp trong template, không cần công thức)
  tong_sau_km: 5300000 - 330000,           // = 4.970.000 (sau khuyến mãi, trước phụ thu)
  tong_sau_kmpt: 5300000 - 330000 + 30000, // = 5.000.000 (sau KM và phụ thu, trước khấu trừ)
  // Hoá đơn gốc (parent) – mẫu cho phiếu thu của 1 đợt
  ma_hd_goc: "INV-2026-001",
  tong_hd_goc: 5000000,
  da_thu_hd_goc: 2000000,
  con_lai_hd_goc: 3000000,
  // Bằng chữ (số tiền đã thanh toán)
  thanh_chu: numberToVietnameseWords(2000000),
  // Cơ sở
  ten_co_so: "Cơ sở Trung tâm",
  dia_chi_co_so: "123 Đường Giải Phóng, Quận Hai Bà Trưng, Hà Nội",
  sdt_co_so: "0123 456 789",
  // Logo cơ sở (placeholder)
  logo: "",
  // Ngân hàng (sample)
  ten_ngan_hang: "MB Bank",
  so_tai_khoan: "1234567890",
  chu_tai_khoan: "NGUYEN VAN A",
  items: [
    { name: "Dịch vụ cắt tóc nam", price: 150000, quantity: 2, discount: 0, extra: 0 },
    { name: "Nhuộm tóc cao cấp", price: 600000, quantity: 1, discount: 50000, extra: 0 },
    { name: "Gội đầu massage", price: 80000, quantity: 2, discount: 10000, extra: 20000 },
  ],
};

/* ─────────────────── VARIABLES ─────────────────── */
type VariableDef = { label: string; key: string; description: string; group?: string };
const VARIABLES: VariableDef[] = [
  // ── Khách hàng / hoá đơn cơ bản ──
  { group: "Khách hàng & Hoá đơn", label: "Tên khách hàng", key: "customer_name", description: "{{customer_name}}" },
  { group: "Khách hàng & Hoá đơn", label: "Số điện thoại", key: "phone", description: "{{phone}}" },
  { group: "Khách hàng & Hoá đơn", label: "Địa chỉ", key: "address", description: "{{address}}" },
  { group: "Khách hàng & Hoá đơn", label: "Mã hoá đơn", key: "invoice_code", description: "{{invoice_code}}" },
  { group: "Khách hàng & Hoá đơn", label: "Ngày lập", key: "date", description: "{{date}}" },
  { group: "Khách hàng & Hoá đơn", label: "Lớp", key: "lop", description: "{{lop}}" },
  { group: "Khách hàng & Hoá đơn", label: "Ghi chú hóa đơn", key: "noi_dung", description: "{{noi_dung}}" },
  { group: "Khách hàng & Hoá đơn", label: "Khoản thu", key: "khoan_thu", description: "{{khoan_thu}}" },

  // ── KM / PT / Khấu trừ / Thành tiền ──
  { group: "KM / PT / Thành tiền", label: "Tổng trước KM/PT", key: "tong_truoc_kmpt", description: "{{tong_truoc_kmpt}}" },
  { group: "KM / PT / Thành tiền", label: "KM theo sản phẩm", key: "km_theo_sp", description: "{{km_theo_sp}}" },
  { group: "KM / PT / Thành tiền", label: "Phụ thu theo sản phẩm", key: "pt_theo_sp", description: "{{pt_theo_sp}}" },
  { group: "KM / PT / Thành tiền", label: "KM toàn đơn", key: "km_toan_don", description: "{{km_toan_don}}" },
  { group: "KM / PT / Thành tiền", label: "Phụ thu toàn đơn", key: "pt_toan_don", description: "{{pt_toan_don}}" },
  { group: "KM / PT / Thành tiền", label: "Tổng khuyến mãi", key: "tong_km", description: "{{tong_km}}" },
  { group: "KM / PT / Thành tiền", label: "Tổng phụ thu", key: "tong_pt", description: "{{tong_pt}}" },
  { group: "KM / PT / Thành tiền", label: "Đặt cọc", key: "khau_tru", description: "{{khau_tru}}" },
  { group: "KM / PT / Thành tiền", label: "Sau KM (trước phụ thu)", key: "tong_sau_km", description: "{{tong_sau_km}}" },
  { group: "KM / PT / Thành tiền", label: "Sau KM & phụ thu", key: "tong_sau_kmpt", description: "{{tong_sau_kmpt}}" },
  { group: "KM / PT / Thành tiền", label: "Thành tiền (sau KM/PT)", key: "thanh_tien", description: "{{thanh_tien}}" },

  // ── Thanh toán hoá đơn này ──
  { group: "Thanh toán", label: "Tổng tiền HĐ này", key: "total", description: "{{total}}" },
  { group: "Thanh toán", label: "Đã thanh toán", key: "da_thanh_toan", description: "{{da_thanh_toan}}" },
  { group: "Thanh toán", label: "Còn lại", key: "con_lai", description: "{{con_lai}}" },
  { group: "Thanh toán", label: "Thu kỳ này", key: "thu_ky_nay", description: "{{thu_ky_nay}}" },
  { group: "Thanh toán", label: "Phương thức TT", key: "phuong_thuc", description: "{{phuong_thuc}}" },
  { group: "Thanh toán", label: "Người tạo", key: "nguoi_tao", description: "{{nguoi_tao}}" },
  { group: "Thanh toán", label: "Người thanh toán", key: "nguoi_thanh_toan", description: "{{nguoi_thanh_toan}}" },

  // ── Hoá đơn cha – khi in một đợt ──
  { group: "Hoá đơn Cha (nhiều đợt)", label: "Mã HĐ gốc", key: "ma_hd_goc", description: "{{ma_hd_goc}}" },
  { group: "Hoá đơn Cha (nhiều đợt)", label: "Tổng tiền HĐ gốc", key: "tong_hd_goc", description: "{{tong_hd_goc}}" },
  { group: "Hoá đơn Cha (nhiều đợt)", label: "Đã thu HĐ gốc", key: "da_thu_hd_goc", description: "{{da_thu_hd_goc}}" },
  { group: "Hoá đơn Cha (nhiều đợt)", label: "Còn lại HĐ gốc", key: "con_lai_hd_goc", description: "{{con_lai_hd_goc}}" },

  // ── Bằng chữ ──
  { group: "Thanh toán", label: "Thành chữ (tiền đã TT)", key: "thanh_chu", description: "{{thanh_chu}}" },

  // ── Bảng động ──
  { group: "Bảng dữ liệu", label: "Bảng sản phẩm", key: "items", description: "{{items}}" },
  { group: "Bảng dữ liệu", label: "Lịch sử thanh toán", key: "lich_su_thanh_toan", description: "{{lich_su_thanh_toan}}" },

  // ── Cơ sở ──
  { group: "Cơ sở", label: "Logo cơ sở chính", key: "logo", description: "{{logo}}" },
  { group: "Cơ sở", label: "Tên cơ sở", key: "ten_co_so", description: "{{ten_co_so}}" },
  { group: "Cơ sở", label: "Địa chỉ cơ sở", key: "dia_chi_co_so", description: "{{dia_chi_co_so}}" },
  { group: "Cơ sở", label: "Số điện thoại cơ sở", key: "sdt_co_so", description: "{{sdt_co_so}}" },

  // ── Ngân hàng ──
  { group: "Ngân hàng", label: "Tên ngân hàng", key: "ten_ngan_hang", description: "{{ten_ngan_hang}}" },
  { group: "Ngân hàng", label: "Số tài khoản", key: "so_tai_khoan", description: "{{so_tai_khoan}}" },
  { group: "Ngân hàng", label: "Chủ tài khoản", key: "chu_tai_khoan", description: "{{chu_tai_khoan}}" },
  { group: "Ngân hàng", label: "Mã QR ngân hàng", key: "qr_ngan_hang", description: "{{qr_ngan_hang}}" },
];

const VARIABLE_HELP: Record<string, { meaning: string; example: string }> = {
  customer_name: { meaning: "Tên khách hàng, học viên hoặc đối tượng đứng tên hóa đơn.", example: "Nguyễn Văn A" },
  phone: { meaning: "Số điện thoại của khách hàng hoặc phụ huynh.", example: "0901 234 567" },
  address: { meaning: "Địa chỉ của khách hàng hoặc học viên.", example: "123 Đường ABC, Quận 1" },
  invoice_code: { meaning: "Mã của hóa đơn hoặc phiếu thu đang được in.", example: "PT-029/PT-029-1" },
  date: { meaning: "Ngày lập hóa đơn hoặc phiếu thu đang in.", example: "06/09/2026" },
  lop: { meaning: "Tên lớp học gắn với hóa đơn.", example: "A1 - Toán nâng cao" },
  noi_dung: { meaning: "Nội dung ghi chú đã lưu trên hóa đơn.", example: "Thu học phí tháng 9" },
  khoan_thu: { meaning: "Tên khoản thu, ưu tiên tên gói hoặc sản phẩm đầu tiên của hóa đơn.", example: "Học phí — Đợt 1" },
  tong_truoc_kmpt: { meaning: "Tổng giá trị trước khi áp dụng khuyến mãi và phụ thu.", example: "5.500.000 đ" },
  km_theo_sp: { meaning: "Tổng khuyến mãi áp dụng riêng trên từng sản phẩm.", example: "300.000 đ" },
  pt_theo_sp: { meaning: "Tổng phụ thu áp dụng riêng trên từng sản phẩm.", example: "100.000 đ" },
  km_toan_don: { meaning: "Khuyến mãi áp dụng cho toàn bộ hóa đơn.", example: "200.000 đ" },
  pt_toan_don: { meaning: "Phụ thu áp dụng cho toàn bộ hóa đơn.", example: "50.000 đ" },
  tong_km: { meaning: "Tổng tất cả khuyến mãi theo sản phẩm và toàn hóa đơn.", example: "500.000 đ" },
  tong_pt: { meaning: "Tổng tất cả phụ thu theo sản phẩm và toàn hóa đơn.", example: "150.000 đ" },
  khau_tru: { meaning: "Khoản đặt cọc hoặc khấu trừ được tính vào hóa đơn.", example: "500.000 đ" },
  tong_sau_km: { meaning: "Giá trị sau khi trừ khuyến mãi nhưng chưa cộng phụ thu.", example: "5.000.000 đ" },
  tong_sau_kmpt: { meaning: "Giá trị sau khi trừ khuyến mãi và cộng phụ thu.", example: "5.150.000 đ" },
  thanh_tien: { meaning: "Thành tiền cuối của hóa đơn hoặc đợt đang in.", example: "1.000.000 đ" },
  total: { meaning: "Tổng tiền của riêng hóa đơn hoặc đợt đang được in, không phải toàn chuỗi nhiều đợt.", example: "Đợt 1 có giá trị 1.000.000 đ" },
  da_thanh_toan: { meaning: "Số tiền đã thanh toán của riêng hóa đơn hoặc đợt đang in.", example: "1.000.000 đ" },
  con_lai: { meaning: "Số tiền còn lại của riêng hóa đơn hoặc đợt đang in.", example: "0 đ" },
  thu_ky_nay: { meaning: "Số tiền thực thu trong đợt đang được in.", example: "1.000.000 đ" },
  phuong_thuc: { meaning: "Phương thức thanh toán của hóa đơn hoặc đợt đang in.", example: "Tiền mặt" },
  nguoi_tao: { meaning: "Tên nhân sự đã tạo hóa đơn.", example: "Nguyễn Thị B" },
  nguoi_thanh_toan: { meaning: "Tên nhân sự ghi nhận thanh toán cho hóa đơn hoặc đợt này.", example: "Trần Văn C" },
  ma_hd_goc: { meaning: "Mã hóa đơn cha chứa toàn bộ các đợt thanh toán.", example: "PT-029" },
  tong_hd_goc: { meaning: "Tổng tiền của toàn bộ hóa đơn cha, gồm tất cả các đợt.", example: "3.000.000 đ" },
  da_thu_hd_goc: { meaning: "Tổng số tiền đã thu cộng dồn từ tất cả các đợt của hóa đơn cha.", example: "Đã thu 2 đợt: 2.000.000 đ" },
  con_lai_hd_goc: { meaning: "Số tiền còn phải thu của toàn bộ hóa đơn cha sau các đợt đã thanh toán.", example: "1.000.000 đ" },
  thanh_chu: { meaning: "Số tiền đã thanh toán của phiếu đang in được viết bằng chữ.", example: "Một triệu đồng" },
  items: { meaning: "Chèn bảng động liệt kê sản phẩm, số lượng, khuyến mãi, phụ thu và thành tiền.", example: "Bảng các gói học phí trên hóa đơn" },
  lich_su_thanh_toan: { meaning: "Chèn bảng tất cả đợt đã thanh toán và chưa thanh toán của hóa đơn.", example: "Đợt 1 đã thanh toán; Đợt 3 chưa thanh toán" },
  logo: { meaning: "Logo của cơ sở chính.", example: "Ảnh logo EduManage" },
  ten_co_so: { meaning: "Tên cơ sở phát hành hóa đơn.", example: "Cơ sở Minh Khai" },
  dia_chi_co_so: { meaning: "Địa chỉ của cơ sở phát hành hóa đơn.", example: "250 Minh Khai, Hà Nội" },
  sdt_co_so: { meaning: "Số điện thoại liên hệ của cơ sở.", example: "024 1234 5678" },
  ten_ngan_hang: { meaning: "Tên ngân hàng nhận thanh toán của hóa đơn.", example: "MB Bank" },
  so_tai_khoan: { meaning: "Số tài khoản ngân hàng nhận thanh toán.", example: "0123456789" },
  chu_tai_khoan: { meaning: "Tên chủ tài khoản ngân hàng nhận thanh toán.", example: "CÔNG TY ABC" },
  qr_ngan_hang: { meaning: "Chèn ảnh QR chuyển khoản của tài khoản ngân hàng.", example: "Mã VietQR để khách hàng quét thanh toán" },
};

function VariableSidebarItem({ variable, onInsert }: { variable: VariableDef; onInsert: (key: string) => void }) {
  const help = VARIABLE_HELP[variable.key];
  return (
    <div className="flex items-start rounded border border-transparent hover:border-primary/20 hover:bg-primary/10 transition-colors group">
      <button
        type="button"
        onClick={() => onInsert(variable.key)}
        className="min-w-0 flex-1 text-left px-2 py-1.5 text-xs hover:text-primary"
        data-testid={`var-btn-${variable.key}`}
      >
        <div className="font-medium">{variable.label}</div>
        <div className="text-muted-foreground group-hover:text-primary/60 font-mono text-[10px]">{variable.description}</div>
      </button>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="mt-1.5 mr-1.5 shrink-0 rounded-full p-0.5 text-orange-500 hover:bg-orange-100 hover:text-orange-700 transition-colors"
            aria-label={`Giải thích biến ${variable.label}`}
            data-testid={`var-help-${variable.key}`}
          >
            <CircleAlert className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="right" align="start" className="w-72 p-3">
          <div className="space-y-2">
            <div>
              <p className="text-sm font-semibold text-foreground">{variable.label}</p>
              <code className="text-[11px] text-primary">{variable.description}</code>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ý nghĩa</p>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground">{help?.meaning ?? "Dữ liệu được lấy tự động từ hóa đơn khi in."}</p>
            </div>
            <div className="rounded-md border border-orange-200 bg-orange-50 p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-700">Ví dụ</p>
              <p className="mt-0.5 text-xs leading-relaxed text-orange-950">{help?.example ?? "Giá trị thực tế của hóa đơn"}</p>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ─────────────────── PAGE SIZE CONFIG ─────────────────── */
const PAGE_SIZES: Record<PageSize, { width: string; minHeight: string; label: string; cssSize: string }> = {
  A4:  { width: "210mm", minHeight: "297mm", label: "A4 (210 × 297mm)",  cssSize: "A4" },
  A5:  { width: "148mm", minHeight: "210mm", label: "A5 (148 × 210mm)",  cssSize: "A5" },
  K80: { width: "80mm",  minHeight: "120mm", label: "K80 (80mm – Bill nhiệt)", cssSize: "80mm auto" },
};

/* ─────────────────── DEFAULT TEMPLATE ─────────────────── */
const DEFAULT_TEMPLATE = `<div style="font-family: Arial, sans-serif; font-size: 13px;">
  <div style="text-align: center; margin-bottom: 12px;">
    <div style="font-size: 18px; font-weight: bold;">HOÁ ĐƠN DỊCH VỤ</div>
    <div style="color: #666; font-size: 12px;">Mã: {{invoice_code}} | Ngày: {{date}}</div>
  </div>
  <table style="width:100%;margin-bottom:10px;font-size:12px;">
    <tr>
      <td style="width:50%"><b>Khách hàng:</b> {{customer_name}}</td>
      <td style="width:50%"><b>SĐT:</b> {{phone}}</td>
    </tr>
    <tr>
      <td colspan="2"><b>Địa chỉ:</b> {{address}}</td>
    </tr>
  </table>
  <hr style="border:none;border-top:1px solid #ccc;margin:8px 0"/>
  {{items}}
  <hr style="border:none;border-top:1px solid #ccc;margin:8px 0"/>
  <table style="width:100%;font-size:13px;">
    <tr>
      <td style="text-align:right;padding:3px 0"><b>Tổng cộng:</b></td>
      <td style="text-align:right;padding:3px 0;width:100px"><b>{{total}} đ</b></td>
    </tr>
    <tr>
      <td style="text-align:right;padding:3px 0">Đã thanh toán:</td>
      <td style="text-align:right;padding:3px 0">{{da_thanh_toan}} đ</td>
    </tr>
    <tr>
      <td style="text-align:right;padding:3px 0;font-weight:bold;color:#dc2626">Còn lại: = {{total}} - {{da_thanh_toan}}</td>
      <td style="text-align:right;padding:3px 0;font-weight:bold;color:#dc2626"></td>
    </tr>
  </table>
  <div style="text-align:center;margin-top:20px;font-size:11px;color:#888;">Cảm ơn quý khách. Hẹn gặp lại!</div>
</div>`;

/* ─────────────────── HELPERS ─────────────────── */
function fmtMoney(n: number) {
  return n.toLocaleString("vi-VN");
}

function _bankNameToVietQRCode(name: string): string {
  const n = (name ?? "").toLowerCase().replace(/[\s.]/g, "");
  if (n.includes("mbbank") || n === "mb") return "MB";
  if (n.includes("vietcombank") || n.includes("vcb")) return "VCB";
  if (n.includes("techcombank") || n === "tcb") return "TCB";
  if (n.includes("bidv")) return "BIDV";
  if (n.includes("vietinbank") || n.includes("viettinbank") || n === "ctg") return "CTG";
  if (n.includes("sacombank") || n === "stb") return "STB";
  if (n.includes("agribank") || n === "agb") return "AGRIBANK";
  if (n.includes("tpbank")) return "TPB";
  if (n.includes("vpbank") || n === "vpb") return "VPB";
  if (n === "acb" || n.startsWith("acb")) return "ACB";
  if (n === "ocb" || n.startsWith("ocb")) return "OCB";
  if (n.includes("hdbank") || n === "hdb") return "HDB";
  if (n.includes("msb") || n.includes("maritimebank")) return "MSB";
  if (n.includes("seabank")) return "SEAB";
  if (n === "vib" || n.startsWith("vib")) return "VIB";
  if (n.includes("namabank") || n.includes("nama")) return "NAB";
  if (n.includes("pvcombank") || n.includes("pvcom")) return "PVCB";
  if (n.includes("bvbank") || n === "bvb") return "BVB";
  if (n.includes("kienlongbank") || n.includes("kienlong")) return "KLB";
  if (n.includes("lienvietpostbank") || n === "lpb") return "LPB";
  if (n.includes("shb")) return "SHB";
  if (n.includes("abbank") || n === "abb") return "ABB";
  if (n.includes("eximbank") || n.includes("exim")) return "EIB";
  if (n.includes("scb")) return "SCB";
  if (n.includes("ncb")) return "NVB";
  return name;
}

function renderItems(items: typeof SAMPLE_DATA.items): string {
  const rows = items.map((item, i) => {
    const thanh_tien = item.price * item.quantity - item.discount + item.extra;
    return `<tr>
      <td style="border:1px solid #ccc;padding:5px;text-align:center">${i + 1}</td>
      <td style="border:1px solid #ccc;padding:5px">${item.name}</td>
      <td style="border:1px solid #ccc;padding:5px;text-align:right">${fmtMoney(item.price)}</td>
      <td style="border:1px solid #ccc;padding:5px;text-align:center">${item.quantity}</td>
      <td style="border:1px solid #ccc;padding:5px;text-align:right">${fmtMoney(item.discount)}</td>
      <td style="border:1px solid #ccc;padding:5px;text-align:right">${fmtMoney(item.extra)}</td>
      <td style="border:1px solid #ccc;padding:5px;text-align:right"><b>${fmtMoney(thanh_tien)}</b></td>
    </tr>`;
  }).join("");

  return `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:4px;">
    <thead>
      <tr style="background:#f3f4f6">
        <th style="border:1px solid #ccc;padding:5px;text-align:center;width:36px">STT</th>
        <th style="border:1px solid #ccc;padding:5px;text-align:left">Tên dịch vụ / SP</th>
        <th style="border:1px solid #ccc;padding:5px;text-align:right">Đơn giá</th>
        <th style="border:1px solid #ccc;padding:5px;text-align:center">SL</th>
        <th style="border:1px solid #ccc;padding:5px;text-align:right">KM</th>
        <th style="border:1px solid #ccc;padding:5px;text-align:right">Phụ thu</th>
        <th style="border:1px solid #ccc;padding:5px;text-align:right">Thành tiền</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}


function renderHistory(history: typeof SAMPLE_HISTORY): string {
  const rows = history.map((s, i) => {
    const isPaid = s.status === "paid";
    const amountText = s.amount > 0 ? `${fmtMoney(s.amount)} đ` : "";
    const isCurrent = (s as any).current === true;
    const noteText = `${s.label} ${isPaid ? "đã thanh toán" : "chưa thanh toán"}`;
    const trStyle = isCurrent ? `style="font-weight:bold;background:#fafafa;"` : "";
    return `<tr ${trStyle}>
      <td style="border:1px solid #111;padding:5px;text-align:center">${i + 1}</td>
      <td style="border:1px solid #111;padding:5px;text-align:center">${s.paidDate}</td>
      <td style="border:1px solid #111;padding:5px;text-align:right">${amountText}</td>
      <td style="border:1px solid #111;padding:5px;text-align:center">${s.method}</td>
      <td style="border:1px solid #111;padding:5px">${noteText}</td>
    </tr>`;
  }).join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:10.5px;">
    <thead>
      <tr style="background:#f3f4f6">
        <th style="border:1px solid #111;padding:5px;width:8%">Đợt</th>
        <th style="border:1px solid #111;padding:5px;width:22%">Ngày thanh toán</th>
        <th style="border:1px solid #111;padding:5px;width:22%">Số tiền</th>
        <th style="border:1px solid #111;padding:5px;width:20%">Phương thức</th>
        <th style="border:1px solid #111;padding:5px">Ghi chú</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderTemplate(html: string, data: typeof SAMPLE_DATA, logoUrl?: string): string {
  const { items: _items, ...rest } = data;
  const numericData: Record<string, number | string> = rest as Record<string, number | string>;

  let output = html;

  // Step 1: Replace {{items}} & {{lich_su_thanh_toan}} with rendered tables
  output = output.replace(/\{\{items\}\}/g, renderItems(data.items));
  output = output.replace(/\{\{lich_su_thanh_toan\}\}/g, renderHistory(SAMPLE_HISTORY));

  // Step 2a: Replace {{logo}} with real img or dashed placeholder
  output = output.replace(/\{\{logo\}\}/g, () => {
    const url = logoUrl || data.logo;
    if (url) {
      return `<img src="${url}" alt="Logo" style="max-width:120px;max-height:60px;object-fit:contain;" />`;
    }
    return `<div style="display:inline-flex;align-items:center;justify-content:center;width:80px;height:40px;background:#f3f4f6;border:1px dashed #ccc;border-radius:4px;font-size:10px;color:#aaa;">Logo</div>`;
  });

  // Step 2b: Replace {{qr_ngan_hang}} — ưu tiên qrUrl đã upload, fallback sang VietQR tự tạo
  output = output.replace(/\{\{qr_ngan_hang\}\}/g, () => {
    const storedQr  = (data as any).qrUrl ?? "";
    const bankName  = (data as any).ten_ngan_hang ?? "";
    const bankAcct  = (data as any).so_tai_khoan ?? "";
    const bankOwner = (data as any).chu_tai_khoan ?? "";
    // Ưu tiên 1: QR ảnh đã lưu trong cơ sở
    if (storedQr) {
      return `<img src="${storedQr}" alt="QR chuyển khoản" style="width:120px;height:120px;object-fit:contain;" />`;
    }
    // Ưu tiên 2: Tự tạo bằng VietQR nếu có số tài khoản
    if (!bankAcct) {
      return `<div style="display:inline-flex;align-items:center;justify-content:center;width:100px;height:100px;background:#f3f4f6;border:1px dashed #ccc;border-radius:4px;font-size:10px;color:#aaa;">QR Bank</div>`;
    }
    const code = _bankNameToVietQRCode(bankName);
    const url = `https://img.vietqr.io/image/${encodeURIComponent(code)}-${encodeURIComponent(bankAcct)}-compact2.jpg` +
      (bankOwner ? `?accountName=${encodeURIComponent(bankOwner)}` : "");
    return `<img src="${url}" alt="QR chuyển khoản" style="width:120px;height:120px;object-fit:contain;" />`;
  });

  // Step 3: Formula evaluation via token substitution
  // Replace numeric {{vars}} with opaque tokens so we can find arithmetic formulas
  // even when contentEditable has injected HTML tags inside the expression.
  const numToks: Record<string, number> = {};
  let tokIdx = 0;
  output = output.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = numericData[key];
    if (typeof val === "number") {
      const tok = `__T${tokIdx++}__`;
      numToks[tok] = val;
      return tok;
    }
    return match; // leave non-numeric vars for step 4
  });

  // Find =expression patterns.
  // The expression regex uses a STRUCTURED form: token (op token)* — this prevents
  // the greedy suffix from consuming the entire document after the "=" sign, which
  // was the root cause of formula evaluation silently failing.
  // Tags and whitespace are allowed between any two parts (handles contentEditable spans).
  const GAP = "(?:(?:<[^>]*>|\\s|\\(|\\))*)";
  const TOK = "(?:__T\\d+__|[0-9]+(?:\\.\\d+)?)";
  const formulaPattern = new RegExp(
    `([^<>]*)=\\s*(${GAP}${TOK}(?:${GAP}[+\\-*/]${GAP}${TOK})*)`,
    "g",
  );

  output = output.replace(formulaPattern, (match, label, rawExpr) => {
    // Strip all HTML tags to get a clean arithmetic string with token names
    const stripped = rawExpr.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
    // Substitute tokens with their numeric values
    const expr = stripped.replace(/__T(\d+)__/g, (_: string, i: string) => {
      const t = `__T${i}__`;
      return numToks[t] !== undefined ? String(numToks[t]) : "0";
    });
    const cleaned = expr.replace(/\s/g, "");
    // Accept only pure arithmetic expressions containing an operator
    if (
      /^[\d+\-*/().]+$/.test(cleaned) &&
      /\d/.test(cleaned) &&
      /[+\-*/]/.test(cleaned)
    ) {
      try {
        // eslint-disable-next-line no-new-func
        const result = new Function(`return (${cleaned})`)();
        if (typeof result === "number" && isFinite(result)) {
          return label + fmtMoney(Math.round(result)) + " đ";
        }
      } catch { /* invalid expression — fall through */ }
    }
    return match;
  });

  // Replace remaining tokens (numeric vars not part of a formula) with formatted values
  output = output.replace(/__T(\d+)__/g, (_: string, i: string) => {
    const t = `__T${i}__`;
    return numToks[t] !== undefined ? fmtMoney(numToks[t]) : "";
  });

  // Step 4: Replace remaining {{variable}} with formatted display values
  output = output.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = (data as Record<string, unknown>)[key];
    if (val === undefined) return `{{${key}}}`;
    if (typeof val === "number") return fmtMoney(val);
    return String(val);
  });

  return DOMPurify.sanitize(output, {
    ADD_TAGS: ["style"],
    ADD_ATTR: ["style", "data-borderless"],
  });
}

/* ─────────────────── TOOLBAR BUTTON ─────────────────── */
function ToolbarBtn({
  onClick, title, active, children,
}: { onClick: () => void; title: string; active?: boolean; children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onMouseDown={(e) => { e.preventDefault(); onClick(); }}
            className={`p-1.5 rounded transition-colors ${
              active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
            data-testid={`toolbar-${title.toLowerCase().replace(/\s/g, "-")}`}
          >
            {children}
          </button>
        </TooltipTrigger>
        <TooltipContent>{title}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ─────────────────── TABLE GRID PICKER ─────────────────── */
const MAX_ROWS = 8;
const MAX_COLS = 8;

function TableGridPicker({ onSelect, onClose: closePopover }: {
  onSelect: (rows: number, cols: number) => void;
  onClose: () => void;
}) {
  const [hoverRow, setHoverRow] = useState(0);
  const [hoverCol, setHoverCol] = useState(0);

  return (
    <div className="p-2 select-none">
      <div className="text-xs text-muted-foreground mb-2 text-center">
        {hoverRow > 0 && hoverCol > 0
          ? `${hoverRow} hàng × ${hoverCol} cột`
          : "Di chuột để chọn kích thước"}
      </div>
      <div
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${MAX_COLS}, 1fr)` }}
        onMouseLeave={() => { setHoverRow(0); setHoverCol(0); }}
      >
        {Array.from({ length: MAX_ROWS }, (_, r) =>
          Array.from({ length: MAX_COLS }, (_, c) => {
            const row = r + 1;
            const col = c + 1;
            const isHighlighted = row <= hoverRow && col <= hoverCol;
            return (
              <div
                key={`${r}-${c}`}
                className={`w-5 h-5 rounded-sm border cursor-pointer transition-colors ${
                  isHighlighted
                    ? "bg-primary/30 border-primary/60"
                    : "bg-muted border-border"
                }`}
                onMouseEnter={() => { setHoverRow(row); setHoverCol(col); }}
                onClick={() => {
                  onSelect(row, col);
                  closePopover();
                }}
                data-testid={`grid-cell-${row}-${col}`}
              />
            );
          })
        )}
      </div>
      <div className="text-[10px] text-muted-foreground mt-2 text-center">
        Tối đa {MAX_ROWS} × {MAX_COLS}
      </div>
    </div>
  );
}

/* ─────────────────── MAIN COMPONENT ─────────────────── */
export function InvoicePrintTemplate({
  onClose,
  template,
}: {
  onClose?: () => void;
  template: InvoicePrintTemplateRow;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const editorRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState<PageSize>((template.pageSize as PageSize) || "A4");
  const [orientation, setOrientation] = useState<Orientation>((template.orientation as Orientation) || "portrait");
  const [isPreview, setIsPreview] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [sidebarTableOpen, setSidebarTableOpen] = useState(false);
  const [toolbarTableOpen, setToolbarTableOpen] = useState(false);
  const [tableCtx, setTableCtx] = useState<TableCtx | null>(null);
  const [selectedCells, setSelectedCells] = useState<HTMLTableCellElement[]>([]);
  const [bordersHidden, setBordersHidden] = useState(false);
  const [tableHoverBtns, setTableHoverBtns] = useState<{
    topPx: number; leftPx: number; bottomPx: number; rightPx: number;
    table: HTMLTableElement;
  } | null>(null);
  const hideTableBtnsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isDefault, setIsDefault] = useState<boolean>(!!template.isDefault);
  const [varSearch, setVarSearch] = useState("");
  const savedEditorHtml = useRef<string>("");

  const { data: locations = [] } = useQuery<Array<{ id: string; isMain: boolean; logoUrl?: string | null }>>({
    queryKey: ["/api/locations"],
    queryFn: async () => {
      const res = await fetch("/api/locations", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const mainLogoUrl = locations.find((l) => l.isMain)?.logoUrl ?? undefined;

  const saveMutation = useMutation({
    mutationFn: (data: { html: string; pageSize: string; orientation: string }) =>
      apiRequest("PATCH", `/api/finance/invoice-print-templates/${template.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoice-print-templates"] });
      setLastSaved(new Date());
      toast({ title: "Đã lưu mẫu hoá đơn", description: "Mẫu in đã được lưu thành công." });
    },
    onError: (err: any) => {
      toast({ title: "Lỗi lưu mẫu", description: err.message, variant: "destructive" });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (value: boolean) => {
      if (value) {
        const res = await apiRequest("POST", `/api/finance/invoice-print-templates/${template.id}/set-default`, { invoiceType: template.invoiceType });
        return res.json();
      } else {
        const res = await apiRequest("POST", `/api/finance/invoice-print-templates/${template.id}/unset-default`);
        return res.json();
      }
    },
    onSuccess: (_, value) => {
      setIsDefault(value);
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoice-print-templates"] });
      toast({
        title: value ? "Đã đặt làm mẫu mặc định" : "Đã bỏ mẫu mặc định",
        description: value
          ? `Mẫu "${template.name}" là mẫu in mặc định cho ${template.invoiceType === "Thu" ? "Phiếu thu" : "Phiếu chi"}.`
          : undefined,
      });
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    },
  });

  const refreshPreview = useCallback(() => {
    const html = editorRef.current?.innerHTML || "";
    setPreviewHtml(renderTemplate(html, SAMPLE_DATA, mainLogoUrl));
  }, [mainLogoUrl]);

  // MutationObserver: reliably updates preview on ANY change in the editor
  // (execCommand like bold/italic does NOT fire onInput, so this is needed)
  useEffect(() => {
    if (!editorRef.current) return;
    const observer = new MutationObserver(() => {
      refreshPreview();
    });
    observer.observe(editorRef.current, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["style"],
    });
    return () => observer.disconnect();
  }, [refreshPreview]);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = template.html || DEFAULT_TEMPLATE;
      refreshPreview();
    }
  }, [template.id, refreshPreview]);

  const exec = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  }, []);

  const setVerticalAlign = useCallback((align: "top" | "middle" | "bottom") => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const node = sel.getRangeAt(0).commonAncestorContainer;
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
    const cell = el?.closest("td, th") as HTMLElement | null;
    if (cell) {
      cell.style.verticalAlign = align;
      editorRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
    }
    editorRef.current?.focus();
  }, []);

  const applyLineHeight = useCallback((value: string) => {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const container = range.commonAncestorContainer;
    let el: Element | null = container.nodeType === Node.TEXT_NODE
      ? container.parentElement
      : container as Element;
    // Walk up to find the nearest block element inside the editor
    while (el && el !== editorRef.current) {
      const display = window.getComputedStyle(el).display;
      if (display === "block" || display === "table-cell" || el.tagName === "LI") break;
      el = el.parentElement;
    }
    if (el && el !== editorRef.current) {
      (el as HTMLElement).style.lineHeight = value;
    } else if (editorRef.current) {
      editorRef.current.style.lineHeight = value;
    }
    refreshPreview();
  }, [refreshPreview]);

  const insertVar = useCallback((variable: string) => {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      if (editorRef.current) {
        editorRef.current.innerHTML += `{{${variable}}}`;
      }
      return;
    }
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(`{{${variable}}}`);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }, []);

  const showTableLineBtns = useCallback((table: HTMLTableElement) => {
    if (hideTableBtnsTimerRef.current) { clearTimeout(hideTableBtnsTimerRef.current); hideTableBtnsTimerRef.current = null; }
    const rect = table.getBoundingClientRect();
    setTableHoverBtns({ topPx: rect.top, leftPx: rect.left, bottomPx: rect.bottom, rightPx: rect.right, table });
  }, []);

  const scheduleHideTableLineBtns = useCallback(() => {
    hideTableBtnsTimerRef.current = setTimeout(() => { setTableHoverBtns(null); hideTableBtnsTimerRef.current = null; }, 250);
  }, []);

  const insertLineAboveTable = useCallback((table: HTMLTableElement) => {
    const newDiv = document.createElement("div");
    newDiv.innerHTML = "<br>";
    table.parentNode?.insertBefore(newDiv, table);
    const range = document.createRange();
    range.setStart(newDiv, 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    editorRef.current?.focus();
    setTableHoverBtns(null);
    refreshPreview();
  }, [refreshPreview]);

  const insertLineBelowTable = useCallback((table: HTMLTableElement) => {
    const newDiv = document.createElement("div");
    newDiv.innerHTML = "<br>";
    table.parentNode?.insertBefore(newDiv, table.nextSibling);
    const range = document.createRange();
    range.setStart(newDiv, 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    editorRef.current?.focus();
    setTableHoverBtns(null);
    refreshPreview();
  }, [refreshPreview]);

  const insertTable = useCallback((rows: number, cols: number) => {
    editorRef.current?.focus();
    const headerCells = Array.from({ length: cols }, (_, i) =>
      `<th style="border:1px solid #ccc;padding:6px;background:#f3f4f6;font-weight:bold">Cột ${i + 1}</th>`
    ).join("");
    const bodyCells = Array.from({ length: cols }, () =>
      `<td style="border:1px solid #ccc;padding:6px">&nbsp;</td>`
    ).join("");
    const bodyRows = Array.from({ length: rows - 1 }, () =>
      `<tr>${bodyCells}</tr>`
    ).join("");
    const tableHtml = `<table style="width:100%;border-collapse:collapse;margin:8px 0"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table><br/>`;
    document.execCommand("insertHTML", false, tableHtml);
  }, []);

  /* ── Highlight helpers ── */
  // Primary highlighted cell: red border + light blue bg (like Word)
  const highlightActiveCell = (cell: HTMLTableCellElement, on: boolean) => {
    if (on) {
      cell.dataset.origBorder = cell.style.border;
      cell.dataset.origBg = cell.style.backgroundColor;
      cell.style.outline = "1px solid #e03131";
      cell.style.backgroundColor = "#dbeafe";
    } else {
      cell.style.outline = "";
      cell.style.backgroundColor = cell.dataset.origBg || "";
      delete cell.dataset.origBorder;
      delete cell.dataset.origBg;
    }
  };

  // Secondary selected cells (drag-selected for merge): blue border + lighter blue bg
  const highlightSelectedCell = (cell: HTMLTableCellElement, on: boolean) => {
    if (on) {
      cell.style.outline = "1px solid #3b82f6";
      cell.style.backgroundColor = "#eff6ff";
    } else {
      cell.style.outline = "";
      cell.style.backgroundColor = cell.dataset.origBg || "";
    }
  };

  // Drag state via refs (avoid re-renders on every mousemove)
  const isDraggingRef = useRef(false);
  const dragStartCellRef = useRef<HTMLTableCellElement | null>(null);
  const dragTableRef = useRef<HTMLTableElement | null>(null);

  const clearCellSelection = useCallback(() => {
    // Clear active cell highlight
    if (tableCtx) highlightActiveCell(tableCtx.cell, false);
    // Clear selected cells
    selectedCells.forEach(c => highlightSelectedCell(c, false));
    setSelectedCells([]);
  }, [tableCtx, selectedCells]);

  /* Helper: get all cells in rectangle between two cells in same table */
  const getCellsInRange = (
    table: HTMLTableElement,
    startCell: HTMLTableCellElement,
    endCell: HTMLTableCellElement,
  ): HTMLTableCellElement[] => {
    const allRows = Array.from(table.rows);
    const getPos = (cell: HTMLTableCellElement) => {
      const row = cell.closest("tr") as HTMLTableRowElement;
      const ri = allRows.indexOf(row);
      const ci = Array.from(row.cells).indexOf(cell);
      return { ri, ci };
    };
    const s = getPos(startCell);
    const e = getPos(endCell);
    const r1 = Math.min(s.ri, e.ri), r2 = Math.max(s.ri, e.ri);
    const c1 = Math.min(s.ci, e.ci), c2 = Math.max(s.ci, e.ci);
    const result: HTMLTableCellElement[] = [];
    for (let r = r1; r <= r2; r++) {
      const row = allRows[r];
      if (!row) continue;
      for (let c = c1; c <= c2; c++) {
        const cell = row.cells[c];
        if (cell) result.push(cell as HTMLTableCellElement);
      }
    }
    return result;
  };

  /* ── Column / Row drag-resize (Word-style) ── */
  const RESIZE_EDGE_PX = 5;
  const isResizingRef = useRef(false);

  const beginResize = useCallback(
    (mode: "col" | "row", cell: HTMLTableCellElement, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isResizingRef.current = true;
      // Suppress drag-cell-selection while resizing
      isDraggingRef.current = false;

      const startX = e.clientX;
      const startY = e.clientY;
      const cellRect = cell.getBoundingClientRect();
      const row = cell.closest("tr") as HTMLTableRowElement;
      const startW = cellRect.width;
      const startH = row.getBoundingClientRect().height;

      document.body.style.cursor = mode === "col" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: MouseEvent) => {
        if (mode === "col") {
          const newW = Math.max(20, startW + (ev.clientX - startX));
          cell.style.width = newW + "px";
        } else {
          const newH = Math.max(20, startH + (ev.clientY - startY));
          row.style.height = newH + "px";
        }
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        isResizingRef.current = false;
        refreshPreview();
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [refreshPreview],
  );

  const detectResizeEdge = useCallback(
    (cell: HTMLTableCellElement, clientX: number, clientY: number): "col" | "row" | null => {
      const r = cell.getBoundingClientRect();
      const nearRight = r.right - clientX <= RESIZE_EDGE_PX && r.right - clientX >= 0;
      const nearBottom = r.bottom - clientY <= RESIZE_EDGE_PX && r.bottom - clientY >= 0;
      if (nearRight) return "col";
      if (nearBottom) return "row";
      return null;
    },
    [],
  );

  const handleEditorMouseMoveCursor = useCallback(
    (e: React.MouseEvent) => {
      if (isResizingRef.current || isDraggingRef.current) return;
      const target = e.target as HTMLElement;
      const cell = target.closest("td, th") as HTMLTableCellElement | null;
      const editor = e.currentTarget as HTMLElement;
      if (!cell || !editorRef.current?.contains(cell)) {
        editor.style.cursor = "";
        return;
      }
      const edge = detectResizeEdge(cell, e.clientX, e.clientY);
      editor.style.cursor =
        edge === "col" ? "col-resize" : edge === "row" ? "row-resize" : "";
    },
    [detectResizeEdge],
  );

  const handleEditorMouseMove = useCallback((e: React.MouseEvent) => {
    handleEditorMouseMoveCursor(e);
    if (isResizingRef.current) return;
    const target = e.target as HTMLElement;
    const table = target.closest("table") as HTMLTableElement | null;
    if (table && editorRef.current?.contains(table)) {
      showTableLineBtns(table);
    } else {
      scheduleHideTableLineBtns();
    }
  }, [handleEditorMouseMoveCursor, showTableLineBtns, scheduleHideTableLineBtns]);

  /* ── Editor mouse handlers for cell selection ── */
  const handleEditorMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const cell = target.closest("td, th") as HTMLTableCellElement | null;
    if (!cell || !editorRef.current?.contains(cell)) {
      // Click outside table: clear selection
      if (tableCtx) highlightActiveCell(tableCtx.cell, false);
      selectedCells.forEach(c => highlightSelectedCell(c, false));
      setSelectedCells([]);
      setTableCtx(null);
      return;
    }

    // If the click happened on a cell edge → start drag-to-resize instead
    // of cell selection. (Word-style column / row resizing.)
    const edge = detectResizeEdge(cell, e.clientX, e.clientY);
    if (edge) {
      beginResize(edge, cell, e);
      return;
    }

    const table = cell.closest("table") as HTMLTableElement;
    const row = cell.closest("tr") as HTMLTableRowElement;
    const rowIndex = Array.from(table.rows).indexOf(row);
    const colIndex = Array.from(row.cells).indexOf(cell);

    // Clear previous selection
    if (tableCtx) highlightActiveCell(tableCtx.cell, false);
    selectedCells.forEach(c => highlightSelectedCell(c, false));
    setSelectedCells([]);

    // Highlight the clicked cell as primary
    highlightActiveCell(cell, true);
    setTableCtx({ table, cell, rowIndex, colIndex });

    // Start drag tracking
    isDraggingRef.current = true;
    dragStartCellRef.current = cell;
    dragTableRef.current = table;
  }, [tableCtx, selectedCells, detectResizeEdge, beginResize]);

  const handleEditorMouseOver = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current || !dragStartCellRef.current || !dragTableRef.current) return;
    const target = e.target as HTMLElement;
    const cell = target.closest("td, th") as HTMLTableCellElement | null;
    if (!cell || !dragTableRef.current.contains(cell)) return;
    if (cell === dragStartCellRef.current) {
      // Back to start: clear secondary selection
      selectedCells.forEach(c => highlightSelectedCell(c, false));
      setSelectedCells([]);
      return;
    }
    const range = getCellsInRange(dragTableRef.current, dragStartCellRef.current, cell);
    const secondary = range.filter(c => c !== dragStartCellRef.current);
    // Clear previous secondary
    selectedCells.forEach(c => highlightSelectedCell(c, false));
    // Apply new secondary
    secondary.forEach(c => highlightSelectedCell(c, true));
    setSelectedCells(secondary);
  }, [selectedCells]);

  /* Attach mouseup globally to end drag */
  useEffect(() => {
    const onMouseUp = () => { isDraggingRef.current = false; };
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, []);

  /* ── Table operations ── */
  const getCellColCount = (table: HTMLTableElement) => {
    let max = 0;
    Array.from(table.rows).forEach(r => {
      let count = 0;
      Array.from(r.cells).forEach(c => { count += c.colSpan || 1; });
      if (count > max) max = count;
    });
    return max;
  };

  const addRowAbove = useCallback(() => {
    if (!tableCtx) return;
    const { table, rowIndex } = tableCtx;
    const colCount = getCellColCount(table);
    const newRow = table.insertRow(rowIndex);
    for (let i = 0; i < colCount; i++) {
      const c = newRow.insertCell(i);
      c.style.cssText = "border:1px solid #ccc;padding:6px";
      c.innerHTML = "&nbsp;";
    }
  }, [tableCtx]);

  const addRowBelow = useCallback(() => {
    if (!tableCtx) return;
    const { table, rowIndex } = tableCtx;
    const colCount = getCellColCount(table);
    const newRow = table.insertRow(rowIndex + 1);
    for (let i = 0; i < colCount; i++) {
      const c = newRow.insertCell(i);
      c.style.cssText = "border:1px solid #ccc;padding:6px";
      c.innerHTML = "&nbsp;";
    }
  }, [tableCtx]);

  const deleteRow = useCallback(() => {
    if (!tableCtx) return;
    const { table, rowIndex } = tableCtx;
    if (table.rows.length <= 1) {
      table.remove();
    } else {
      table.deleteRow(rowIndex);
    }
    setTableCtx(null);
    clearCellSelection();
  }, [tableCtx, clearCellSelection]);

  const addColLeft = useCallback(() => {
    if (!tableCtx) return;
    const { table, colIndex } = tableCtx;
    Array.from(table.rows).forEach((row, ri) => {
      const isHeader = ri === 0 && row.cells[colIndex]?.tagName === "TH";
      const cell = document.createElement(isHeader ? "th" : "td");
      cell.style.cssText = isHeader
        ? "border:1px solid #ccc;padding:6px;background:#f3f4f6;font-weight:bold"
        : "border:1px solid #ccc;padding:6px";
      cell.innerHTML = isHeader ? `Cột mới` : "&nbsp;";
      row.insertBefore(cell, row.cells[colIndex] || null);
    });
  }, [tableCtx]);

  const addColRight = useCallback(() => {
    if (!tableCtx) return;
    const { table, colIndex } = tableCtx;
    Array.from(table.rows).forEach((row, ri) => {
      const isHeader = ri === 0 && row.cells[colIndex]?.tagName === "TH";
      const cell = document.createElement(isHeader ? "th" : "td");
      cell.style.cssText = isHeader
        ? "border:1px solid #ccc;padding:6px;background:#f3f4f6;font-weight:bold"
        : "border:1px solid #ccc;padding:6px";
      cell.innerHTML = isHeader ? `Cột mới` : "&nbsp;";
      const refCell = row.cells[colIndex + 1] || null;
      row.insertBefore(cell, refCell);
    });
  }, [tableCtx]);

  const deleteCol = useCallback(() => {
    if (!tableCtx) return;
    const { table, colIndex } = tableCtx;
    if (table.rows[0]?.cells.length <= 1) {
      table.remove();
    } else {
      Array.from(table.rows).forEach(row => {
        if (row.cells[colIndex]) row.deleteCell(colIndex);
      });
    }
    setTableCtx(null);
    clearCellSelection();
  }, [tableCtx, clearCellSelection]);

  const mergeCells = useCallback(() => {
    // All cells = primary (tableCtx.cell) + secondary (selectedCells)
    if (!tableCtx || selectedCells.length === 0) return;
    const allCells = [tableCtx.cell, ...selectedCells];
    const rows = new Set(allCells.map(c => c.closest("tr")));
    if (rows.size > 1) {
      toast({ title: "Chỉ gộp ô trong cùng một hàng", variant: "destructive" });
      return;
    }
    const row = allCells[0].closest("tr") as HTMLTableRowElement;
    const sorted = [...allCells].sort(
      (a, b) => Array.from(row.cells).indexOf(a) - Array.from(row.cells).indexOf(b)
    );
    const firstCell = sorted[0];
    const totalColspan = sorted.reduce((sum, c) => sum + (c.colSpan || 1), 0);
    const combinedContent = sorted.slice(1)
      .map(c => c.innerHTML.trim())
      .filter(h => h && h !== "&nbsp;")
      .join(" ");
    if (combinedContent) {
      const cur = firstCell.innerHTML.trim();
      firstCell.innerHTML = (cur && cur !== "&nbsp;" ? cur + " " : "") + combinedContent;
    }
    // Clear highlights before removing cells
    sorted.forEach(c => { c.style.outline = ""; c.style.backgroundColor = ""; });
    firstCell.colSpan = totalColspan;
    sorted.slice(1).forEach(c => c.remove());
    // Update context to the merged cell
    const table = tableCtx.table;
    const mergedRow = firstCell.closest("tr") as HTMLTableRowElement;
    const rowIndex = Array.from(table.rows).indexOf(mergedRow);
    const colIndex = Array.from(mergedRow.cells).indexOf(firstCell);
    setTableCtx({ table, cell: firstCell, rowIndex, colIndex });
    setSelectedCells([]);
  }, [tableCtx, selectedCells, toast]);

  const splitCell = useCallback(() => {
    if (!tableCtx) return;
    const { cell } = tableCtx;
    const colspan = cell.colSpan;
    if (colspan <= 1 && cell.rowSpan <= 1) return;
    const row = cell.closest("tr") as HTMLTableRowElement;
    const cellIdx = Array.from(row.cells).indexOf(cell);
    cell.colSpan = 1;
    cell.rowSpan = 1;
    for (let i = 1; i < colspan; i++) {
      const newCell = document.createElement(cell.tagName.toLowerCase());
      newCell.style.cssText = "border:1px solid #ccc;padding:6px";
      newCell.innerHTML = "&nbsp;";
      row.insertBefore(newCell, row.cells[cellIdx + 1] || null);
    }
  }, [tableCtx]);

  const deleteTable = useCallback(() => {
    if (!tableCtx) return;
    tableCtx.table.remove();
    setTableCtx(null);
    clearCellSelection();
  }, [tableCtx, clearCellSelection]);

  /* ── Toggle table borders (Word-style: keep table for layout, hide lines) ── */
  // Sync bordersHidden whenever a different table is selected
  useEffect(() => {
    if (tableCtx) {
      setBordersHidden(tableCtx.table.getAttribute("data-borderless") === "true");
    } else {
      setBordersHidden(false);
    }
  }, [tableCtx]);

  const toggleBorders = useCallback(() => {
    if (!tableCtx) return;
    const t = tableCtx.table;
    const next = t.getAttribute("data-borderless") !== "true";
    if (next) {
      t.setAttribute("data-borderless", "true");
    } else {
      t.removeAttribute("data-borderless");
    }
    setBordersHidden(next);
    refreshPreview();
  }, [tableCtx, refreshPreview]);

  const handleSave = useCallback(() => {
    const html = editorRef.current?.innerHTML || "";
    saveMutation.mutate({ html, pageSize, orientation });
  }, [pageSize, orientation, saveMutation]);

  const handleReset = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = DEFAULT_TEMPLATE;
    }
  }, []);

  const handlePreview = useCallback(() => {
    const html = editorRef.current?.innerHTML || "";
    savedEditorHtml.current = html;
    const rendered = renderTemplate(html, SAMPLE_DATA, mainLogoUrl);
    setPreviewHtml(rendered);
    setIsPreview(true);
  }, [mainLogoUrl]);

  useLayoutEffect(() => {
    if (!isPreview && editorRef.current) {
      const html = savedEditorHtml.current || template.html || DEFAULT_TEMPLATE;
      if (html) {
        editorRef.current.innerHTML = html;
        refreshPreview();
      }
    }
  }, [isPreview, template.html, refreshPreview]);

  const handlePrint = useCallback(() => {
    const html = editorRef.current?.innerHTML || "";
    const rendered = renderTemplate(html, SAMPLE_DATA, mainLogoUrl);
    const ps = PAGE_SIZES[pageSize];
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Hoá đơn</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: ${ps.cssSize} ${orientation}; margin: 10mm; }
    body { font-family: Arial, sans-serif; font-size: 13px; }
    .page { width: ${ps.width}; min-height: ${ps.minHeight}; }
    /* Borderless tables behave as invisible Word-style layout grids */
    table[data-borderless="true"] { border-color: transparent !important; }
    table[data-borderless="true"] td,
    table[data-borderless="true"] th {
      border: none !important;
      background: transparent !important;
    }
  </style>
</head>
<body>
  <div class="page">${rendered}</div>
  <script>window.onload = () => { window.print(); window.close(); }<\/script>
</body>
</html>`);
    printWindow.document.close();
  }, [pageSize, orientation]);

  const ps = PAGE_SIZES[pageSize];

  return (
    <div className="flex flex-col h-full gap-0 overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-card shrink-0">
        <div className="flex items-center gap-2">
          <Type className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Thiết kế mẫu in hoá đơn</span>
          <span className="text-muted-foreground text-sm">–</span>
          <span className="text-sm text-muted-foreground">{template.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 border rounded-md px-2.5 py-1 bg-muted/30">
            <Switch
              id="switch-is-default"
              checked={isDefault}
              onCheckedChange={(v) => setDefaultMutation.mutate(v)}
              disabled={setDefaultMutation.isPending}
              data-testid="switch-is-default"
            />
            <label htmlFor="switch-is-default" className="text-xs font-medium cursor-pointer select-none whitespace-nowrap">
              Mẫu in mặc định
              <span className="ml-1 text-muted-foreground font-normal">
                ({template.invoiceType === "Thu" ? "Phiếu thu" : "Phiếu chi"})
              </span>
            </label>
          </div>
          <Select value={pageSize} onValueChange={(v) => setPageSize(v as PageSize)}>
            <SelectTrigger className="h-8 text-xs w-48" data-testid="select-page-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(PAGE_SIZES) as [PageSize, typeof PAGE_SIZES[PageSize]][]).map(([key, cfg]) => (
                <SelectItem key={key} value={key} className="text-xs">{cfg.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={orientation} onValueChange={(v) => setOrientation(v as Orientation)}>
            <SelectTrigger className="h-8 text-xs w-36" data-testid="select-orientation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="portrait" className="text-xs">Dọc (Portrait)</SelectItem>
              <SelectItem value="landscape" className="text-xs">Ngang (Landscape)</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={handleReset} data-testid="button-reset-template">
            <RotateCcw className="h-3.5 w-3.5" /> Khôi phục
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => { if (!isPreview) handlePreview(); else setIsPreview(false); }} data-testid="button-preview-toggle">
            {isPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {isPreview ? "Hiện trình thiết kế" : "Phóng to xem trước"}
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={handlePrint} data-testid="button-print">
            <Printer className="h-3.5 w-3.5" /> In thử
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1" onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save-template">
            <Save className="h-3.5 w-3.5" /> {saveMutation.isPending ? "Đang lưu..." : "Lưu mẫu"}
          </Button>
          {onClose && (
            <button
              onClick={onClose}
              className="ml-1 p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              data-testid="button-close-print-template"
              title="Đóng"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ── */}
        <div className="w-52 shrink-0 border-r bg-muted/20 flex flex-col overflow-y-auto">
          {/* Variables */}
          <div className="p-3 border-b">
            <div className="flex items-center gap-1.5 mb-2">
              <Variable className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Biến dữ liệu</span>
            </div>
            {/* Search */}
            <div className="relative mb-2">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={varSearch}
                onChange={e => setVarSearch(e.target.value)}
                placeholder="Tìm biến..."
                className="w-full pl-6 pr-2 py-1 text-xs border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
            <div className="flex flex-col gap-2">
              {(() => {
                const q = varSearch.trim().toLowerCase();
                const filtered = q
                  ? VARIABLES.filter(v =>
                      v.label.toLowerCase().includes(q) ||
                      v.key.toLowerCase().includes(q) ||
                      v.description.toLowerCase().includes(q)
                    )
                  : VARIABLES;

                if (q) {
                  // Flat list when searching
                  return filtered.length === 0
                    ? <div className="text-xs text-muted-foreground px-2 py-2">Không tìm thấy</div>
                    : filtered.map((v) => (
                        <VariableSidebarItem key={v.key} variable={v} onInsert={insertVar} />
                      ));
                }

                // Grouped list when not searching
                const groups: Record<string, VariableDef[]> = {};
                filtered.forEach((v) => {
                  const g = v.group ?? "Khác";
                  (groups[g] ||= []).push(v);
                });
                return Object.entries(groups).map(([groupName, vars]) => (
                  <div key={groupName} className="flex flex-col gap-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80 mt-1.5 px-1">
                      {groupName}
                    </div>
                    {vars.map((v) => (
                      <VariableSidebarItem key={v.key} variable={v} onInsert={insertVar} />
                    ))}
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* Formula hint */}
          <div className="p-3 border-b">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Biến tính sẵn</span>
            </div>
            <div className="text-[11px] text-muted-foreground space-y-1.5 bg-muted/50 rounded p-2">
              <p>Dùng biến đã tính sẵn thay vì viết công thức:</p>
              <p className="font-mono bg-background rounded px-1 py-0.5 text-[10px]">{"{{tong_sau_km}}"}</p>
              <p className="text-[10px] text-muted-foreground">Tổng sau KM (trước phụ thu)</p>
              <p className="font-mono bg-background rounded px-1 py-0.5 text-[10px]">{"{{tong_sau_kmpt}}"}</p>
              <p className="text-[10px] text-muted-foreground">Tổng sau KM & phụ thu</p>
              <p className="font-mono bg-background rounded px-1 py-0.5 text-[10px]">{"{{thanh_tien}}"}</p>
              <p className="text-[10px] text-muted-foreground">Thành tiền cuối (sau khấu trừ)</p>
            </div>
          </div>

          {/* Insert table */}
          <div className="p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Table2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Chèn nhanh</span>
            </div>
            <Popover open={sidebarTableOpen} onOpenChange={setSidebarTableOpen}>
              <PopoverTrigger asChild>
                <button
                  className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-primary/10 hover:text-primary transition-colors border border-transparent hover:border-primary/20"
                  data-testid="button-insert-table"
                >
                  <div className="font-medium flex items-center gap-1.5">
                    <Table2 className="h-3 w-3" /> Chèn bảng tùy chỉnh
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Chọn số hàng và cột</div>
                </button>
              </PopoverTrigger>
              <PopoverContent side="right" align="start" className="p-0 w-auto">
                <TableGridPicker
                  onSelect={(rows, cols) => insertTable(rows, cols)}
                  onClose={() => setSidebarTableOpen(false)}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* ── Editor Area ── */}
        <div className="flex-1 overflow-auto bg-muted/30 flex flex-col">
          {!isPreview && (
            /* Toolbar */
            <div className="flex items-center gap-0.5 px-3 py-1.5 border-b bg-card shrink-0 flex-wrap">
              <ToolbarBtn onClick={() => exec("bold")} title="Đậm (Ctrl+B)">
                <Bold className="h-3.5 w-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => exec("italic")} title="Nghiêng (Ctrl+I)">
                <Italic className="h-3.5 w-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => exec("underline")} title="Gạch chân (Ctrl+U)">
                <Underline className="h-3.5 w-3.5" />
              </ToolbarBtn>

              <div className="w-px h-5 bg-border mx-1" />

              <ToolbarBtn onClick={() => exec("justifyLeft")} title="Căn trái">
                <AlignLeft className="h-3.5 w-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => exec("justifyCenter")} title="Căn giữa">
                <AlignCenter className="h-3.5 w-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => exec("justifyRight")} title="Căn phải">
                <AlignRight className="h-3.5 w-3.5" />
              </ToolbarBtn>

              <div className="w-px h-5 bg-border mx-1" />

              <ToolbarBtn onClick={() => setVerticalAlign("top")} title="Căn lề trên (ô bảng)">
                <AlignVerticalJustifyStart className="h-3.5 w-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => setVerticalAlign("middle")} title="Căn giữa dọc (ô bảng)">
                <AlignVerticalJustifyCenter className="h-3.5 w-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => setVerticalAlign("bottom")} title="Căn lề dưới (ô bảng)">
                <AlignVerticalJustifyEnd className="h-3.5 w-3.5" />
              </ToolbarBtn>

              <div className="w-px h-5 bg-border mx-1" />

              {/* Font family */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center gap-0.5 px-2 py-1 rounded text-xs hover:bg-muted transition-colors min-w-[90px] justify-between"
                    data-testid="toolbar-font-family"
                  >
                    <span>Font chữ</span>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="text-xs w-52">
                  {[
                    { label: "Arial", value: "Arial, sans-serif" },
                    { label: "Times New Roman", value: "'Times New Roman', serif" },
                    { label: "Courier New", value: "'Courier New', monospace" },
                    { label: "Georgia", value: "Georgia, serif" },
                    { label: "Verdana", value: "Verdana, sans-serif" },
                    { label: "Tahoma", value: "Tahoma, sans-serif" },
                    { label: "Trebuchet MS", value: "'Trebuchet MS', sans-serif" },
                    { label: "Palatino", value: "'Palatino Linotype', serif" },
                    { label: "Impact", value: "Impact, sans-serif" },
                  ].map(({ label, value }) => (
                    <DropdownMenuItem
                      key={value}
                      onSelect={() => exec("fontName", value)}
                      className="text-xs"
                      style={{ fontFamily: value }}
                      data-testid={`font-family-${label.replace(/\s/g, "-").toLowerCase()}`}
                    >
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="w-px h-5 bg-border mx-1" />

              {/* Font size */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center gap-0.5 px-2 py-1 rounded text-xs hover:bg-muted transition-colors"
                    data-testid="toolbar-font-size"
                  >
                    <span>Cỡ chữ</span>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="text-xs">
                  {["10px", "12px", "13px", "14px", "16px", "18px", "20px", "24px", "28px", "32px"].map((size) => (
                    <DropdownMenuItem
                      key={size}
                      onSelect={() => exec("fontSize", size === "10px" ? "1" : size === "12px" ? "2" : size === "13px" ? "2" : size === "14px" ? "3" : size === "16px" ? "4" : size === "18px" ? "5" : size === "20px" ? "5" : size === "24px" ? "6" : "7")}
                      className="text-xs"
                      style={{ fontSize: size }}
                      data-testid={`font-size-${size}`}
                    >
                      {size}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="w-px h-5 bg-border mx-1" />

              {/* Line height */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center gap-0.5 px-2 py-1 rounded text-xs hover:bg-muted transition-colors"
                    data-testid="toolbar-line-height"
                  >
                    <Rows2 className="h-3.5 w-3.5" />
                    <span>Giãn dòng</span>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="text-xs">
                  {[
                    { label: "1 — Đơn", value: "1" },
                    { label: "1.15", value: "1.15" },
                    { label: "1.5", value: "1.5" },
                    { label: "2 — Đôi", value: "2" },
                    { label: "2.5", value: "2.5" },
                    { label: "3", value: "3" },
                  ].map(({ label, value }) => (
                    <DropdownMenuItem
                      key={value}
                      onSelect={() => applyLineHeight(value)}
                      className="text-xs"
                      data-testid={`line-height-${value}`}
                    >
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="w-px h-5 bg-border mx-1" />

              {/* Variables quick insert */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="flex items-center gap-0.5 px-2 py-1 rounded text-xs hover:bg-muted transition-colors"
                    data-testid="toolbar-insert-var"
                  >
                    <Variable className="h-3.5 w-3.5" />
                    <span>Chèn biến</span>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="p-2 w-52">
                  <div className="flex flex-col gap-0.5">
                    {VARIABLES.map((v) => (
                      <button
                        key={v.key}
                        onClick={() => insertVar(v.key)}
                        className="text-left px-2 py-1 rounded text-xs hover:bg-muted transition-colors"
                        data-testid={`toolbar-var-${v.key}`}
                      >
                        <span className="font-medium">{v.label}</span>
                        <span className="text-muted-foreground ml-1 font-mono text-[10px]">{v.description}</span>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <div className="w-px h-5 bg-border mx-1" />

              {/* Table insert with grid picker */}
              <Popover open={toolbarTableOpen} onOpenChange={setToolbarTableOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="flex items-center gap-0.5 px-2 py-1 rounded text-xs hover:bg-muted transition-colors"
                    data-testid="toolbar-insert-table"
                  >
                    <Table2 className="h-3.5 w-3.5" />
                    <span>Chèn bảng</span>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="p-0 w-auto">
                  <TableGridPicker
                    onSelect={(rows, cols) => insertTable(rows, cols)}
                    onClose={() => setToolbarTableOpen(false)}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* ── Table inline toolbar — shows below main toolbar when a table cell is active ── */}
          {!isPreview && tableCtx && (
            <TableInlineToolbar
              ctx={tableCtx}
              selectedCells={selectedCells}
              bordersHidden={bordersHidden}
              onAddRowAbove={addRowAbove}
              onAddRowBelow={addRowBelow}
              onDeleteRow={deleteRow}
              onAddColLeft={addColLeft}
              onAddColRight={addColRight}
              onDeleteCol={deleteCol}
              onMergeCells={mergeCells}
              onSplitCell={splitCell}
              onDeleteTable={deleteTable}
              onToggleBorders={toggleBorders}
            />
          )}

          {/* Split canvas: Editor (trái) | Live Preview (phải) */}
          <div className="flex-1 overflow-hidden flex">
            {/* ── EDITOR PANE ── */}
            {!isPreview && (
              <div className="flex-1 min-w-0 overflow-auto p-6 flex justify-center bg-muted/10 border-r">
                <div className="flex flex-col items-center gap-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                    Trình thiết kế (chỉnh sửa)
                  </div>
                  <div
                    ref={paperRef}
                    style={{
                      width: ps.width,
                      minHeight: ps.minHeight,
                      background: "white",
                      boxShadow: "0 2px 16px rgba(0,0,0,0.12)",
                      padding: "10mm",
                      position: "relative",
                    }}
                  >
                    <div
                      ref={editorRef}
                      contentEditable
                      suppressContentEditableWarning
                      className="outline-none min-h-full invoice-template-editor"
                      style={{
                        fontFamily: "Arial, sans-serif",
                        fontSize: "13px",
                        lineHeight: "1.5",
                        userSelect: isDraggingRef.current ? "none" : undefined,
                      }}
                      onMouseDown={handleEditorMouseDown}
                      onMouseOver={handleEditorMouseOver}
                      onMouseMove={handleEditorMouseMove}
                      onMouseLeave={scheduleHideTableLineBtns}
                      onInput={refreshPreview}
                      data-testid="template-editor"
                      data-placeholder="Nhập nội dung mẫu hoá đơn tại đây..."
                    />
                    {/* ── Floating ↑/↓ buttons to insert line above/below a table ── */}
                    {tableHoverBtns && (
                      <>
                        <button
                          style={{
                            position: "fixed",
                            top: tableHoverBtns.topPx - 11,
                            left: tableHoverBtns.leftPx + 2,
                            zIndex: 9999,
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            background: "#f59e0b",
                            border: "2px solid white",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "white",
                            boxShadow: "0 1px 5px rgba(0,0,0,0.35)",
                            padding: 0,
                          }}
                          onMouseEnter={() => { if (hideTableBtnsTimerRef.current) { clearTimeout(hideTableBtnsTimerRef.current); hideTableBtnsTimerRef.current = null; } }}
                          onMouseLeave={scheduleHideTableLineBtns}
                          onMouseDown={e => { e.preventDefault(); insertLineAboveTable(tableHoverBtns.table); }}
                          title="Chèn dòng trống phía trên bảng"
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 2L5 8M2 5L5 2L8 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                        <button
                          style={{
                            position: "fixed",
                            top: tableHoverBtns.bottomPx - 9,
                            left: tableHoverBtns.rightPx - 22,
                            zIndex: 9999,
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            background: "#f59e0b",
                            border: "2px solid white",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "white",
                            boxShadow: "0 1px 5px rgba(0,0,0,0.35)",
                            padding: 0,
                          }}
                          onMouseEnter={() => { if (hideTableBtnsTimerRef.current) { clearTimeout(hideTableBtnsTimerRef.current); hideTableBtnsTimerRef.current = null; } }}
                          onMouseLeave={scheduleHideTableLineBtns}
                          onMouseDown={e => { e.preventDefault(); insertLineBelowTable(tableHoverBtns.table); }}
                          title="Chèn dòng trống phía dưới bảng"
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 8L5 2M2 5L5 8L8 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── PREVIEW PANE ── */}
            <div className="flex-1 min-w-0 overflow-auto p-6 flex justify-center bg-muted/30">
              <div className="flex flex-col items-center gap-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1.5">
                  <Eye className="h-3 w-3" /> Xem trước (dữ liệu mẫu)
                </div>
                <div
                  style={{
                    width: ps.width,
                    minHeight: ps.minHeight,
                    background: "white",
                    boxShadow: "0 2px 16px rgba(0,0,0,0.12)",
                    padding: "10mm",
                  }}
                >
                  <div
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                    data-testid="preview-content"
                    style={{
                      fontFamily: "Arial, sans-serif",
                      fontSize: "13px",
                      lineHeight: "1.5",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer status ── */}
      <div className="shrink-0 flex items-center justify-between px-4 py-1.5 border-t bg-muted/20 text-xs text-muted-foreground">
        <span>Khổ giấy: <b>{ps.label}</b></span>
        <span>
          {lastSaved
            ? `Đã lưu lúc ${lastSaved.toLocaleTimeString("vi-VN")}`
            : "Chưa lưu – Nhấn Lưu mẫu để lưu thay đổi"}
        </span>
      </div>
    </div>
  );
}
