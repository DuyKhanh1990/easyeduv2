import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { vi } from "date-fns/locale";
import {
  ArrowLeft, CalendarIcon, ChevronLeft, ChevronRight,
  ChevronsUpDown, SlidersHorizontal, Download, Search, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { parseNum, fmtDate } from "@/types/invoice-types";
import { downloadXlsx } from "@/lib/excel-utils";

interface Props {
  onBack: () => void;
}

function defaultCurrentMonth() {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
  };
}

function fmtMoney(n: number) {
  if (n === 0) return "0";
  return n.toLocaleString("vi-VN");
}

const PAGE_SIZE = 20;

const VN_ACCOUNTS: { code: string; name: string }[] = [
  { code: "111",  name: "Tiền mặt" },
  { code: "1111", name: "Tiền Việt Nam" },
  { code: "1112", name: "Ngoại tệ" },
  { code: "1113", name: "Vàng tiền tệ" },
  { code: "112",  name: "Tiền gửi Ngân hàng" },
  { code: "1121", name: "Tiền Việt Nam" },
  { code: "1122", name: "Ngoại tệ" },
  { code: "1123", name: "Vàng tiền tệ" },
  { code: "113",  name: "Tiền đang chuyển" },
  { code: "1131", name: "Tiền Việt Nam" },
  { code: "1132", name: "Ngoại tệ" },
  { code: "121",  name: "Chứng khoán kinh doanh" },
  { code: "1211", name: "Cổ phiếu" },
  { code: "1212", name: "Trái phiếu" },
  { code: "128",  name: "Đầu tư nắm giữ đến ngày đáo hạn" },
  { code: "131",  name: "Phải thu của khách hàng" },
  { code: "133",  name: "Thuế GTGT được khấu trừ" },
  { code: "136",  name: "Phải thu nội bộ" },
  { code: "138",  name: "Phải thu khác" },
  { code: "141",  name: "Tạm ứng" },
  { code: "152",  name: "Nguyên liệu, vật liệu" },
  { code: "153",  name: "Công cụ, dụng cụ" },
  { code: "156",  name: "Hàng hóa" },
  { code: "211",  name: "Tài sản cố định hữu hình" },
  { code: "214",  name: "Hao mòn tài sản cố định" },
  { code: "242",  name: "Chi phí trả trước" },
  { code: "331",  name: "Phải trả cho người bán" },
  { code: "333",  name: "Thuế và các khoản phải nộp nhà nước" },
  { code: "334",  name: "Phải trả người lao động" },
  { code: "335",  name: "Chi phí phải trả" },
  { code: "338",  name: "Phải trả, phải nộp khác" },
  { code: "341",  name: "Vay và nợ thuê tài chính" },
  { code: "411",  name: "Vốn đầu tư của chủ sở hữu" },
  { code: "421",  name: "Lợi nhuận sau thuế chưa phân phối" },
  { code: "511",  name: "Doanh thu bán hàng và cung cấp dịch vụ" },
  { code: "515",  name: "Doanh thu hoạt động tài chính" },
  { code: "521",  name: "Các khoản giảm trừ doanh thu" },
  { code: "611",  name: "Mua hàng" },
  { code: "621",  name: "Chi phí nguyên liệu, vật liệu trực tiếp" },
  { code: "622",  name: "Chi phí nhân công trực tiếp" },
  { code: "627",  name: "Chi phí sản xuất chung" },
  { code: "632",  name: "Giá vốn hàng bán" },
  { code: "635",  name: "Chi phí tài chính" },
  { code: "641",  name: "Chi phí bán hàng" },
  { code: "642",  name: "Chi phí quản lý doanh nghiệp" },
  { code: "711",  name: "Thu nhập khác" },
  { code: "811",  name: "Chi phí khác" },
  { code: "821",  name: "Chi phí thuế thu nhập doanh nghiệp" },
  { code: "911",  name: "Xác định kết quả kinh doanh" },
];

function AccountMultiSelect({
  selected, onChange,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const visible = q.trim()
    ? VN_ACCOUNTS.filter(a =>
        a.code.includes(q) || a.name.toLowerCase().includes(q.toLowerCase())
      )
    : VN_ACCOUNTS;

  const toggle = (code: string) => {
    onChange(
      selected.includes(code) ? selected.filter(c => c !== code) : [...selected, code]
    );
  };

  const label = selected.length === 0
    ? "Tất cả tài khoản"
    : selected.length === 1
    ? `${selected[0]} - ${VN_ACCOUNTS.find(a => a.code === selected[0])?.name ?? ""}`
    : `${selected.length} tài khoản đã chọn`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex items-center justify-between gap-1 h-9 w-full rounded-md border px-3 text-sm text-left hover:bg-muted/50 transition-colors ${
            selected.length > 0 ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-input bg-background text-muted-foreground"
          }`}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="w-3.5 h-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <Input
          placeholder="Tìm mã hoặc tên tài khoản..."
          value={q}
          onChange={e => setQ(e.target.value)}
          className="h-8 text-xs mb-2"
        />
        {selected.length > 0 && (
          <button
            className="text-[11px] text-indigo-600 hover:underline mb-1 px-1"
            onClick={() => onChange([])}
          >
            Xoá tất cả ({selected.length})
          </button>
        )}
        <div className="max-h-64 overflow-y-auto space-y-0.5">
          {visible.map(a => (
            <label
              key={a.code}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-xs"
            >
              <Checkbox
                checked={selected.includes(a.code)}
                onCheckedChange={() => toggle(a.code)}
              />
              <span className="font-mono text-indigo-700 w-10 shrink-0">{a.code}</span>
              <span className="text-muted-foreground truncate">- {a.name}</span>
            </label>
          ))}
          {visible.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-4">Không tìm thấy</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ThuChiReport({ onBack }: Props) {
  const [page, setPage] = useState(1);
  const [paidAtRange, setPaidAtRange] = useState<{ from?: Date; to?: Date }>(defaultCurrentMonth);
  const [calOpen, setCalOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterLocation, setFilterLocation] = useState<string>("all");
  const [filterCreator, setFilterCreator] = useState<string>("all");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>("all");
  const [filterBank, setFilterBank] = useState<string>("all");
  const [filterAccountCodes, setFilterAccountCodes] = useState<string[]>([]);

  const paidAtFrom = paidAtRange.from ? format(paidAtRange.from, "yyyy-MM-dd") : undefined;
  const paidAtTo   = paidAtRange.to   ? format(paidAtRange.to,   "yyyy-MM-dd") : undefined;

  const activeFilterCount = [
    filterType !== "all",
    filterLocation !== "all",
    filterCreator !== "all",
    filterPaymentMethod !== "all",
    filterBank !== "all",
    filterAccountCodes.length > 0,
  ].filter(Boolean).length;

  function buildQS(overrides: Record<string, string | string[] | number | undefined> = {}) {
    const p = new URLSearchParams();
    if (paidAtFrom) p.set("paidAtFrom", paidAtFrom);
    if (paidAtTo)   p.set("paidAtTo",   paidAtTo);
    if (search)     p.set("search",     search);
    if (filterType !== "all") p.append("types", filterType);
    if (filterLocation !== "all") p.append("locationNames", filterLocation);
    if (filterCreator !== "all") p.append("creatorNames", filterCreator);
    if (filterPaymentMethod !== "all") p.append("paymentMethods", filterPaymentMethod);
    Object.entries(overrides).forEach(([k, v]) => {
      if (v === undefined) return;
      if (Array.isArray(v)) v.forEach(item => p.append(k, item));
      else p.set(k, String(v));
    });
    return p.toString();
  }

  const mainQS = buildQS({ page: String(page), limit: String(PAGE_SIZE) });
  const allQS  = buildQS({ limit: "10000" });

  const preQS = useMemo(() => {
    const p = new URLSearchParams();
    if (paidAtFrom) {
      const dayBefore = format(subDays(new Date(paidAtFrom), 1), "yyyy-MM-dd");
      p.set("paidAtTo", dayBefore);
    }
    if (filterType !== "all") p.append("types", filterType);
    if (filterLocation !== "all") p.append("locationNames", filterLocation);
    if (filterCreator !== "all") p.append("creatorNames", filterCreator);
    if (filterPaymentMethod !== "all") p.append("paymentMethods", filterPaymentMethod);
    p.set("limit", "10000");
    return p.toString();
  }, [paidAtFrom, filterType, filterLocation, filterCreator, filterPaymentMethod]);

  const { data: mainData, isLoading, refetch } = useQuery<{ data: any[]; total: number }>({
    queryKey: ["/api/finance/invoices", "thu-chi-report-page", mainQS],
    queryFn: async () => {
      const res = await fetch(`/api/finance/invoices?${mainQS}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: allData } = useQuery<{ data: any[]; total: number }>({
    queryKey: ["/api/finance/invoices", "thu-chi-report-all", allQS],
    queryFn: async () => {
      const res = await fetch(`/api/finance/invoices?${allQS}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: preData } = useQuery<{ data: any[]; total: number }>({
    queryKey: ["/api/finance/invoices", "thu-chi-report-pre", preQS],
    queryFn: async () => {
      if (!paidAtFrom) return { data: [], total: 0 };
      const res = await fetch(`/api/finance/invoices?${preQS}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30_000,
    enabled: !!paidAtFrom,
  });

  const { data: filterOptionsData } = useQuery<Record<string, string[]>>({
    queryKey: ["/api/finance/invoices/filter-options"],
    queryFn: async () => {
      const res = await fetch("/api/finance/invoices/filter-options", { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: locationsData = [] } = useQuery<any[]>({
    queryKey: ["/api/locations"],
    queryFn: async () => {
      const res = await fetch("/api/locations", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 120_000,
  });

  const bankOptions = useMemo(() => {
    const names = new Set<string>();
    for (const loc of locationsData) {
      if (loc.bankAccounts) {
        try {
          const arr = JSON.parse(loc.bankAccounts);
          for (const b of arr) { if (b.bankName) names.add(b.bankName); }
        } catch {}
      }
      if (loc.bankName) names.add(loc.bankName);
    }
    return Array.from(names).sort();
  }, [locationsData]);

  const locationOpts = filterOptionsData?.locationNames ?? [];
  const creatorOpts  = filterOptionsData?.creatorNames  ?? [];

  function applyClientFilters(rows: any[]) {
    return rows.filter(r => {
      if (filterBank !== "all") {
        const acct = (r.appliedBankAccount as any) ?? {};
        if ((acct.bankName ?? "") !== filterBank) return false;
      }
      if (filterAccountCodes.length > 0) {
        const matchesAccount = filterAccountCodes.includes(r.account ?? "") ||
                               filterAccountCodes.includes(r.counterAccount ?? "");
        if (!matchesAccount) return false;
      }
      return true;
    });
  }

  const rows     = applyClientFilters(mainData?.data ?? []);
  const allRows  = applyClientFilters(allData?.data  ?? []);
  const preRows  = applyClientFilters(preData?.data  ?? []);
  const total    = mainData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageIncome  = rows.reduce((s, r) => r.type === "Thu" ? s + parseNum(r.paidAmount) : s, 0);
  const pageExpense = rows.reduce((s, r) => r.type === "Chi" ? s + parseNum(r.paidAmount) : s, 0);

  const periodIncome  = allRows.reduce((s, r) => r.type === "Thu" ? s + parseNum(r.paidAmount) : s, 0);
  const periodExpense = allRows.reduce((s, r) => r.type === "Chi" ? s + parseNum(r.paidAmount) : s, 0);
  const periodNet     = periodIncome - periodExpense;

  const preIncome  = preRows.reduce((s, r) => r.type === "Thu" ? s + parseNum(r.paidAmount) : s, 0);
  const preExpense = preRows.reduce((s, r) => r.type === "Chi" ? s + parseNum(r.paidAmount) : s, 0);
  const preNet     = preIncome - preExpense;

  const endNet = preNet + periodNet;

  const dateLabel = paidAtFrom && paidAtTo
    ? `${format(new Date(paidAtFrom), "d/M/yyyy")} - ${format(new Date(paidAtTo), "d/M/yyyy")}`
    : paidAtFrom ? `Từ ${format(new Date(paidAtFrom), "d/M/yyyy")}`
    : paidAtTo   ? `Đến ${format(new Date(paidAtTo), "d/M/yyyy")}`
    : "Chọn kỳ";

  const preDateLabel = paidAtFrom
    ? format(subDays(new Date(paidAtFrom), 1), "d/M/yyyy")
    : "—";

  const COL_COUNT = 14;

  function handleDownload() {
    const pmLabel = (m: string) =>
      m === "cash" ? "Tiền mặt" : m === "transfer" ? "Chuyển khoản" : m ?? "";

    const dataRows = allRows.map((inv, idx) => {
      const isIncome = inv.type === "Thu";
      const grand    = parseNum(inv.grandTotal);
      return [
        idx + 1,
        isIncome ? "Phiếu thu" : "Phiếu chi",
        inv.settleCode ?? "",
        fmtDate(inv.paidAt),
        inv.name ?? "",
        inv.category ?? "",
        inv.description ?? "",
        inv.creatorName ?? "",
        pmLabel(inv.paymentMethod),
        inv.code ?? "",
        inv.account ?? "",
        inv.counterAccount ?? "",
        isIncome ? grand : "",
        !isIncome ? grand : "",
      ];
    });

    downloadXlsx({
      filename: `BaoCaoThuChi_${paidAtFrom ?? "all"}_${paidAtTo ?? "all"}`,
      sheetName: "Thu - Chi",
      title: "Báo cáo Thu - Chi",
      subtitle: `Kỳ: ${dateLabel}`,
      columns: [
        { header: "STT",                    width: 5  },
        { header: "Loại hóa đơn",           width: 14 },
        { header: "Số bút toán",            width: 16 },
        { header: "Ngày thanh toán",        width: 16 },
        { header: "Họ và tên",              width: 24 },
        { header: "Danh mục",               width: 18 },
        { header: "Mô tả",                  width: 32 },
        { header: "Người thực hiện",        width: 20 },
        { header: "Hình thức TT",           width: 15 },
        { header: "Tham chiếu TT",          width: 20 },
        { header: "TK thu/chi",             width: 14 },
        { header: "TK đối ứng",             width: 14 },
        { header: "Thu / Nợ",               width: 18 },
        { header: "Chi / Có",               width: 18 },
      ],
      rows: dataRows,
      summaryRows: [
        [`Tổng đầu kỳ (Thu − Chi đến ${preDateLabel})`, "", "", "", "", "", "", "", "", "", "", "", preNet, ""],
        ["Tổng cộng trong kỳ", "", "", "", "", "", "", "", "", "", "", "", periodIncome, periodExpense],
        [`Tổng trong kỳ (${dateLabel})`, "", "", "", "", "", "", "", "", "", "", "", periodNet, ""],
        ["Tổng cuối kỳ (Đầu kỳ + Trong kỳ)", "", "", "", "", "", "", "", "", "", "", "", endNet, ""],
      ],
    });
  }

  function resetFilters() {
    setFilterType("all");
    setFilterLocation("all");
    setFilterCreator("all");
    setFilterPaymentMethod("all");
    setFilterBank("all");
    setFilterAccountCodes([]);
    setPage(1);
  }

  return (
    <div className="mt-4 space-y-3">
      {/* ── Title bar ── */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1.5 h-8 px-2 shrink-0" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
          Quay lại
        </Button>
        <div className="h-4 w-px bg-border" />
        <h2 className="text-base font-semibold text-foreground shrink-0">Báo cáo Thu - Chi</h2>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Tìm kiếm..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="h-9 pl-8 text-sm"
          />
          {search && (
            <button
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => { setSearch(""); setPage(1); }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Date range */}
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 h-9 rounded-md border border-input bg-background px-3 text-sm text-left hover:bg-muted/50 transition-colors whitespace-nowrap"
            >
              <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className={paidAtFrom || paidAtTo ? "text-foreground" : "text-muted-foreground"}>
                {dateLabel}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="range"
              selected={{ from: paidAtRange.from, to: paidAtRange.to }}
              onSelect={r => { setPaidAtRange(r ?? {}); setPage(1); }}
              locale={vi}
              numberOfMonths={2}
            />
            <div className="p-2 border-t flex justify-end gap-2">
              <Button
                variant="ghost" size="sm"
                onClick={() => { setPaidAtRange({}); setPage(1); setCalOpen(false); }}
                className="text-xs h-7"
              >
                Xoá
              </Button>
              <Button size="sm" onClick={() => setCalOpen(false)} className="text-xs h-7">Xong</Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Filter popover */}
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-2 relative">
              <SlidersHorizontal className="w-4 h-4" />
              Bộ lọc
              {activeFilterCount > 0 && (
                <Badge className="h-4 min-w-[16px] px-1 text-[10px] absolute -top-1.5 -right-1.5 bg-indigo-600">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[520px] p-4" side="bottom">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">Bộ lọc</p>
              {activeFilterCount > 0 && (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                  onClick={resetFilters}
                >
                  Xoá tất cả
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {/* Cơ sở */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Cơ sở</label>
                <Select value={filterLocation} onValueChange={v => { setFilterLocation(v); setPage(1); }}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Cơ sở" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả cơ sở</SelectItem>
                    {locationOpts.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Số hiệu tài khoản */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Số hiệu tài khoản</label>
                <AccountMultiSelect
                  selected={filterAccountCodes}
                  onChange={v => { setFilterAccountCodes(v); setPage(1); }}
                />
              </div>

              {/* Loại hóa đơn */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Loại hóa đơn</label>
                <Select value={filterType} onValueChange={v => { setFilterType(v); setPage(1); }}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Loại hóa đơn" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="Thu">Phiếu thu</SelectItem>
                    <SelectItem value="Chi">Phiếu chi</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Ngân hàng */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Ngân hàng</label>
                <Select value={filterBank} onValueChange={v => { setFilterBank(v); setPage(1); }}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Ngân hàng" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả ngân hàng</SelectItem>
                    {bankOptions.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Được tạo bởi */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Được tạo bởi</label>
                <Select value={filterCreator} onValueChange={v => { setFilterCreator(v); setPage(1); }}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Người tạo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    {creatorOpts.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Hình thức thanh toán */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Hình thức thanh toán</label>
                <Select value={filterPaymentMethod} onValueChange={v => { setFilterPaymentMethod(v); setPage(1); }}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Hình thức" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="cash">Tiền mặt</SelectItem>
                    <SelectItem value="transfer">Chuyển khoản</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button size="sm" className="h-8 text-xs" onClick={() => setFilterOpen(false)}>
                Áp dụng
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          size="sm"
          className="h-9 gap-2 bg-blue-600 hover:bg-blue-700 text-white"
          disabled={isLoading}
          onClick={() => refetch()}
        >
          Xem báo cáo
        </Button>

        {/* Download */}
        <Button
          variant="default"
          size="sm"
          className="h-9 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={handleDownload}
        >
          <Download className="w-4 h-4" />
          Tải xuống
        </Button>
      </div>

      {/* ── Table ── */}
      <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[1400px]" style={{ borderSpacing: 0 }}>
            <colgroup>
              <col className="w-10" />
              <col className="w-24" />
              <col className="w-28" />
              <col className="w-28" />
              <col style={{ minWidth: 120 }} />
              <col className="w-28" />
              <col style={{ minWidth: 220 }} />
              <col className="w-32" />
              <col className="w-32" />
              <col className="w-32" />
              <col className="w-28" />
              <col className="w-28" />
              <col className="w-32" />
              <col className="w-32" />
            </colgroup>

            <thead>
              <tr className="bg-muted/60">
                {[
                  { label: "STT",                      cls: "text-center" },
                  { label: "Loại hóa đơn",             cls: "" },
                  { label: "Số bút toán",              cls: "" },
                  { label: "Ngày thanh toán",          cls: "" },
                  { label: "Họ và tên",                cls: "" },
                  { label: "Danh mục",                 cls: "" },
                  { label: "Mô tả",                    cls: "" },
                  { label: "Người thực hiện",          cls: "" },
                  { label: "Hình thức thanh toán",     cls: "" },
                  { label: "Tham chiếu thanh toán",    cls: "" },
                  { label: "Tài khoản thu/chi",        cls: "" },
                  { label: "Tài khoản đối ứng",        cls: "" },
                  { label: "Thu/Nợ",                   cls: "text-right" },
                  { label: "Chi/Có",                   cls: "text-right" },
                ].map((c) => (
                  <th
                    key={c.label}
                    className={`px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap text-left border-b border-r border-border/60 last:border-r-0 ${c.cls}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {/* ── Tổng đầu kỳ ── */}
              <tr className="bg-blue-50/60 border-b border-border/50">
                <td colSpan={12} className="px-3 py-2 italic text-muted-foreground border-r border-border/40">
                  Tổng đầu kỳ&nbsp;
                  <span className="font-medium text-foreground/70 not-italic">
                    (Thu − Chi tính đến {preDateLabel})
                  </span>
                </td>
                <td colSpan={2} className={`px-3 py-2 text-right tabular-nums font-semibold ${preNet >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                  {fmtMoney(preNet)}
                </td>
              </tr>

              {/* ── Data rows ── */}
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/40">
                    {Array.from({ length: COL_COUNT }).map((_, j) => (
                      <td key={j} className="px-3 py-2 border-r border-border/30 last:border-r-0">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className="py-12 text-center text-muted-foreground italic text-sm">
                    Không có dữ liệu trong khoảng thời gian đã chọn
                  </td>
                </tr>
              ) : (
                rows.map((inv, idx) => {
                  const isIncome   = inv.type === "Thu";
                  const grandTotal = parseNum(inv.grandTotal);
                  const pmLabel    = inv.paymentMethod === "cash" ? "Tiền mặt"
                                   : inv.paymentMethod === "transfer" ? "Chuyển khoản"
                                   : inv.paymentMethod ?? "—";

                  return (
                    <tr
                      key={inv.id}
                      className={`border-b border-border/40 hover:bg-muted/20 transition-colors ${idx % 2 === 1 ? "bg-muted/5" : ""}`}
                    >
                      <td className="px-3 py-2 text-center text-muted-foreground border-r border-border/30">
                        {(page - 1) * PAGE_SIZE + idx + 1}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap border-r border-border/30">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${
                          isIncome ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700"
                        }`}>
                          {isIncome ? "Phiếu thu" : "Phiếu chi"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground font-mono border-r border-border/30">{inv.settleCode ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap border-r border-border/30">{fmtDate(inv.paidAt)}</td>
                      <td className="px-3 py-2 font-medium border-r border-border/30">{inv.name ?? "—"}</td>
                      <td className="px-3 py-2 border-r border-border/30">{inv.category ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground border-r border-border/30">
                        <span className="line-clamp-2">{inv.description ?? "—"}</span>
                      </td>
                      <td className="px-3 py-2 border-r border-border/30">{inv.creatorName ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap border-r border-border/30">{pmLabel}</td>
                      <td className="px-3 py-2 text-muted-foreground font-mono border-r border-border/30">{inv.code ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-indigo-700 font-medium border-r border-border/30">{inv.account ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-indigo-700 font-medium border-r border-border/30">{inv.counterAccount ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-700 border-r border-border/30">
                        {isIncome ? fmtMoney(grandTotal) : ""}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-orange-700">
                        {!isIncome ? fmtMoney(grandTotal) : ""}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            <tfoot>
              {/* Tổng cộng */}
              <tr className="border-t-2 border-border bg-muted/30">
                <td colSpan={12} className="px-3 py-2 font-semibold text-foreground border-r border-border/50">
                  Tổng cộng
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700 border-r border-border/50">
                  {fmtMoney(pageIncome)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-orange-700">
                  {fmtMoney(pageExpense)}
                </td>
              </tr>

              {/* Tổng trong kỳ */}
              <tr className="border-t border-border/60 bg-muted/20">
                <td colSpan={12} className="px-3 py-2 italic text-muted-foreground border-r border-border/50">
                  Tổng trong kỳ&nbsp;
                  <span className="font-medium text-foreground/70 not-italic">({dateLabel})</span>
                </td>
                <td colSpan={2} className={`px-3 py-2 text-right tabular-nums font-semibold ${periodNet >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                  {fmtMoney(periodNet)}
                </td>
              </tr>

              {/* Tổng cuối kỳ */}
              <tr className="border-t border-border/60 bg-indigo-50/60">
                <td colSpan={12} className="px-3 py-2 font-semibold text-foreground border-r border-border/50">
                  Tổng cuối kỳ&nbsp;
                  <span className="font-normal text-muted-foreground">(Tổng đầu kỳ + Tổng trong kỳ)</span>
                </td>
                <td colSpan={2} className={`px-3 py-2 text-right tabular-nums font-bold text-sm ${endNet >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                  {fmtMoney(endNet)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Hiển thị {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / {total} bản ghi
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline" size="icon" className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="px-2 tabular-nums">{page} / {totalPages}</span>
            <Button
              variant="outline" size="icon" className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
