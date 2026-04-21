import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  Eye, EyeOff, Printer, Save, RotateCcw, ChevronDown,
  Type, Table2, Variable, X,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Trash2, Columns3, Rows3, Merge, SplitSquareHorizontal,
} from "lucide-react";
import { evaluate } from "mathjs";
import DOMPurify from "dompurify";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

/* ─────────────────── TABLE FLOAT TOOLBAR ─────────────────── */
function TableFloatToolbar({
  ctx,
  paperEl,
  selectedCells,
  onAddRowAbove,
  onAddRowBelow,
  onDeleteRow,
  onAddColLeft,
  onAddColRight,
  onDeleteCol,
  onMergeCells,
  onSplitCell,
  onDeleteTable,
}: {
  ctx: TableCtx;
  paperEl: HTMLDivElement;
  selectedCells: HTMLTableCellElement[];
  onAddRowAbove: () => void;
  onAddRowBelow: () => void;
  onDeleteRow: () => void;
  onAddColLeft: () => void;
  onAddColRight: () => void;
  onDeleteCol: () => void;
  onMergeCells: () => void;
  onSplitCell: () => void;
  onDeleteTable: () => void;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const tableRect = ctx.table.getBoundingClientRect();
    const paperRect = paperEl.getBoundingClientRect();
    setPos({
      top: tableRect.top - paperRect.top - 40,
      left: tableRect.left - paperRect.left,
    });
  }, [ctx.table, ctx.rowIndex, ctx.colIndex, paperEl]);

  const canMerge = selectedCells.length >= 1; // primary (ctx.cell) + at least 1 secondary
  const canSplit = ctx.cell.colSpan > 1 || ctx.cell.rowSpan > 1;

  const btn = (icon: React.ReactNode, label: string, onClick: () => void, danger = false) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={onClick}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
            danger
              ? "text-red-600 hover:bg-red-50"
              : "text-gray-700 hover:bg-gray-100"
          }`}
        >
          {icon}
          <span>{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );

  const sep = () => <div className="w-px h-5 bg-gray-200 mx-0.5" />;

  return (
    <TooltipProvider delayDuration={400}>
      <div
        style={{
          position: "absolute",
          top: Math.max(0, pos.top),
          left: pos.left,
          zIndex: 200,
          whiteSpace: "nowrap",
        }}
        className="flex items-center bg-white border border-gray-200 rounded-lg shadow-xl px-1 py-0.5 text-[11px] select-none"
      >
        {btn(<ArrowUp className="h-3 w-3" />, "Thêm hàng trên", onAddRowAbove)}
        {btn(<ArrowDown className="h-3 w-3" />, "Thêm hàng dưới", onAddRowBelow)}
        {btn(<Trash2 className="h-3 w-3" />, "Xoá hàng", onDeleteRow, true)}
        {sep()}
        {btn(<ArrowLeft className="h-3 w-3" />, "Thêm cột trái", onAddColLeft)}
        {btn(<ArrowRight className="h-3 w-3" />, "Thêm cột phải", onAddColRight)}
        {btn(<Trash2 className="h-3 w-3" />, "Xoá cột", onDeleteCol, true)}
        {sep()}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={onMergeCells}
              disabled={!canMerge}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                canMerge ? "text-blue-700 hover:bg-blue-50" : "text-gray-300 cursor-not-allowed"
              }`}
            >
              <Merge className="h-3 w-3" />
              <span>Gộp ô {canMerge ? `(${selectedCells.length + 1})` : ""}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {canMerge ? "Gộp các ô đã chọn" : "Kéo chuột qua nhiều ô để chọn rồi gộp"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={onSplitCell}
              disabled={!canSplit}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                canSplit ? "text-blue-700 hover:bg-blue-50" : "text-gray-300 cursor-not-allowed"
              }`}
            >
              <SplitSquareHorizontal className="h-3 w-3" />
              <span>Tách ô</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Tách ô đã gộp thành các ô riêng</TooltipContent>
        </Tooltip>
        {sep()}
        {btn(<Trash2 className="h-3 w-3" />, "Xoá bảng", onDeleteTable, true)}
      </div>
    </TooltipProvider>
  );
}

/* ─────────────────── SAMPLE DATA ─────────────────── */
const SAMPLE_DATA = {
  customer_name: "Nguyễn Văn A",
  phone: "0901 234 567",
  address: "123 Lê Lợi, Q.1, TP.HCM",
  invoice_code: "HD-2026-0001",
  date: "30/03/2026",
  total: 1500000,
  da_thanh_toan: 500000,
  items: [
    { name: "Dịch vụ cắt tóc nam", price: 150000, quantity: 2, discount: 0, extra: 0 },
    { name: "Nhuộm tóc cao cấp", price: 600000, quantity: 1, discount: 50000, extra: 0 },
    { name: "Gội đầu massage", price: 80000, quantity: 2, discount: 10000, extra: 20000 },
  ],
};

/* ─────────────────── VARIABLES ─────────────────── */
const VARIABLES: { label: string; key: string; description: string }[] = [
  { label: "Tên khách hàng", key: "customer_name", description: "{{customer_name}}" },
  { label: "Số điện thoại", key: "phone", description: "{{phone}}" },
  { label: "Địa chỉ", key: "address", description: "{{address}}" },
  { label: "Mã hoá đơn", key: "invoice_code", description: "{{invoice_code}}" },
  { label: "Ngày lập", key: "date", description: "{{date}}" },
  { label: "Tổng tiền", key: "total", description: "{{total}}" },
  { label: "Đã thanh toán", key: "da_thanh_toan", description: "{{da_thanh_toan}}" },
  { label: "Bảng sản phẩm", key: "items", description: "{{items}}" },
];

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

function processFormula(text: string, data: Record<string, number | string>): string {
  if (!text.includes("=")) return text;
  const eqIdx = text.indexOf("=");
  const label = text.substring(0, eqIdx);
  let expression = text.substring(eqIdx + 1).trim();
  expression = expression.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = data[key.trim()];
    return typeof val === "number" ? String(val) : "0";
  });
  if (!/^[\d\s+\-*/().]+$/.test(expression)) return text;
  try {
    const result = evaluate(expression);
    return label + fmtMoney(Number(result)) + " đ";
  } catch {
    return text;
  }
}

function renderTemplate(html: string, data: typeof SAMPLE_DATA): string {
  const numericData: Record<string, number | string> = { ...data };

  let output = html;

  // Step 1: Replace {{items}} with rendered table
  output = output.replace(/\{\{items\}\}/g, renderItems(data.items));

  // Step 2: Evaluate formulas BEFORE replacing variables
  // Matches text nodes (no < or >) containing "=" and at least one {{variable}}
  const formulaRegex = /([^<>]*=[^<>]*\{\{[\w]+\}\}[^<>]*)/g;
  output = output.replace(formulaRegex, (match) => processFormula(match, numericData));

  // Step 3: Replace remaining {{variable}} with formatted display values
  output = output.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = (data as Record<string, unknown>)[key];
    if (val === undefined) return `{{${key}}}`;
    if (typeof val === "number") return fmtMoney(val);
    return String(val);
  });

  return DOMPurify.sanitize(output, { ADD_TAGS: ["style"], ADD_ATTR: ["style"] });
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

  const [isDefault, setIsDefault] = useState<boolean>(!!template.isDefault);

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

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = template.html || DEFAULT_TEMPLATE;
    }
  }, [template.id]);

  const exec = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  }, []);

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
  }, [tableCtx, selectedCells]);

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
    const rendered = renderTemplate(html, SAMPLE_DATA);
    setPreviewHtml(rendered);
    setIsPreview(true);
  }, []);

  const handlePrint = useCallback(() => {
    const html = editorRef.current?.innerHTML || "";
    const rendered = renderTemplate(html, SAMPLE_DATA);
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
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={isPreview ? () => setIsPreview(false) : handlePreview} data-testid="button-preview-toggle">
            {isPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {isPreview ? "Đóng xem trước" : "Xem trước"}
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
            <div className="flex flex-col gap-1">
              {VARIABLES.map((v) => (
                <button
                  key={v.key}
                  onClick={() => insertVar(v.key)}
                  className="text-left px-2 py-1.5 rounded text-xs hover:bg-primary/10 hover:text-primary transition-colors border border-transparent hover:border-primary/20 group"
                  data-testid={`var-btn-${v.key}`}
                  title={v.description}
                >
                  <div className="font-medium">{v.label}</div>
                  <div className="text-muted-foreground group-hover:text-primary/60 font-mono text-[10px]">{v.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Formula hint */}
          <div className="p-3 border-b">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Công thức</span>
            </div>
            <div className="text-[11px] text-muted-foreground space-y-1.5 bg-muted/50 rounded p-2">
              <p>Nhập dấu <span className="font-mono font-bold">=</span> để tính toán:</p>
              <p className="font-mono bg-background rounded px-1 py-0.5 text-[10px]">
                Còn lại: = {"{{total}}"} - {"{{da_thanh_toan}}"}
              </p>
              <p className="text-[10px]">Hỗ trợ: <span className="font-mono">+ - * / ( )</span></p>
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

          {/* Page canvas */}
          <div className="flex-1 overflow-auto p-8 flex justify-center">
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
              {/* Table float toolbar */}
              {!isPreview && tableCtx && paperRef.current && (
                <TableFloatToolbar
                  ctx={tableCtx}
                  paperEl={paperRef.current}
                  selectedCells={selectedCells}
                  onAddRowAbove={addRowAbove}
                  onAddRowBelow={addRowBelow}
                  onDeleteRow={deleteRow}
                  onAddColLeft={addColLeft}
                  onAddColRight={addColRight}
                  onDeleteCol={deleteCol}
                  onMergeCells={mergeCells}
                  onSplitCell={splitCell}
                  onDeleteTable={deleteTable}
                />
              )}

              {/* Preview layer – always in DOM, hidden when not previewing */}
              <div
                dangerouslySetInnerHTML={{ __html: previewHtml }}
                data-testid="preview-content"
                style={{ display: isPreview ? "block" : "none" }}
              />
              {/* Editor layer – always in DOM, hidden when previewing */}
              <div
                ref={editorRef}
                contentEditable={!isPreview}
                suppressContentEditableWarning
                className="outline-none min-h-full"
                style={{
                  fontFamily: "Arial, sans-serif",
                  fontSize: "13px",
                  lineHeight: "1.5",
                  display: isPreview ? "none" : "block",
                  userSelect: isDraggingRef.current ? "none" : undefined,
                }}
                onMouseDown={handleEditorMouseDown}
                onMouseOver={handleEditorMouseOver}
                data-testid="template-editor"
                data-placeholder="Nhập nội dung mẫu hoá đơn tại đây..."
              />
            </div>
          </div>

          {/* Preview notice */}
          {isPreview && (
            <div className="shrink-0 flex items-center justify-center gap-3 py-2 bg-amber-50 dark:bg-amber-950/20 border-t text-xs text-amber-700 dark:text-amber-400">
              <Eye className="h-3.5 w-3.5" />
              <span>Đang xem trước với dữ liệu mẫu. Biến <span className="font-mono">{"{{...}}"}</span> đã được thay thế.</span>
              <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => setIsPreview(false)}>
                Quay lại chỉnh sửa
              </Button>
            </div>
          )}
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
