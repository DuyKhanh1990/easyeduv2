import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, differenceInCalendarDays } from "date-fns";
import { vi } from "date-fns/locale";
import {
  ArrowLeft, CalendarIcon, ChevronDown, ChevronRight as ChevronRightIcon,
  SlidersHorizontal, Download, Search, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

function parseNum(v: any): number {
  if (!v) return 0;
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

function pctChange(prev: number, curr: number): string {
  if (prev === 0 && curr === 0) return "—";
  if (prev === 0) return "+∞";
  const p = ((curr - prev) / Math.abs(prev)) * 100;
  return (p >= 0 ? "+" : "") + p.toFixed(2) + "%";
}

function pctColor(prev: number, curr: number, isExpense: boolean): string {
  if (prev === 0 && curr === 0) return "text-muted-foreground";
  const pct = prev === 0 ? Infinity : (curr - prev) / Math.abs(prev);
  if (pct === 0) return "text-muted-foreground";
  const up = pct > 0;
  return isExpense
    ? (up ? "text-rose-600" : "text-emerald-600")
    : (up ? "text-emerald-600" : "text-rose-600");
}

export function PhanBoReport({ onBack }: Props) {
  const [paidAtRange, setPaidAtRange] = useState<{ from?: Date; to?: Date }>(defaultCurrentMonth);
  const [calOpen, setCalOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterLocation, setFilterLocation] = useState("all");
  const [filterCreator, setFilterCreator] = useState("all");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState("all");
  const [expandedThu, setExpandedThu] = useState(true);
  const [expandedChi, setExpandedChi] = useState(true);

  const paidAtFrom = paidAtRange.from ? format(paidAtRange.from, "yyyy-MM-dd") : undefined;
  const paidAtTo   = paidAtRange.to   ? format(paidAtRange.to,   "yyyy-MM-dd") : undefined;

  const prevRange = useMemo(() => {
    if (!paidAtFrom || !paidAtTo) return { from: undefined, to: undefined };
    const a = new Date(paidAtFrom);
    const b = new Date(paidAtTo);
    const duration = differenceInCalendarDays(b, a) + 1;
    const prevTo   = subDays(a, 1);
    const prevFrom = subDays(a, duration);
    return {
      from: format(prevFrom, "yyyy-MM-dd"),
      to:   format(prevTo,   "yyyy-MM-dd"),
    };
  }, [paidAtFrom, paidAtTo]);

  function buildQS(from?: string, to?: string) {
    const p = new URLSearchParams();
    if (from) p.set("paidAtFrom", from);
    if (to)   p.set("paidAtTo",   to);
    if (filterLocation !== "all") p.append("locationNames", filterLocation);
    if (filterCreator !== "all") p.append("creatorNames", filterCreator);
    if (filterPaymentMethod !== "all") p.append("paymentMethods", filterPaymentMethod);
    p.set("limit", "10000");
    return p.toString();
  }

  const currQS = buildQS(paidAtFrom, paidAtTo);
  const prevQS = buildQS(prevRange.from, prevRange.to);

  const { data: currData, isLoading: loadingCurr, refetch: refetchCurr } = useQuery<{ data: any[] }>({
    queryKey: ["/api/finance/invoices", "phan-bo-curr", currQS],
    queryFn: async () => {
      const res = await fetch(`/api/finance/invoices?${currQS}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: prevData } = useQuery<{ data: any[] }>({
    queryKey: ["/api/finance/invoices", "phan-bo-prev", prevQS],
    queryFn: async () => {
      if (!prevRange.from) return { data: [] };
      const res = await fetch(`/api/finance/invoices?${prevQS}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30_000,
    enabled: !!prevRange.from,
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

  const locationOpts = filterOptionsData?.locationNames ?? [];
  const creatorOpts  = filterOptionsData?.creatorNames  ?? [];

  const activeFilterCount = [
    filterLocation !== "all",
    filterCreator !== "all",
    filterPaymentMethod !== "all",
  ].filter(Boolean).length;

  function groupByCategory(rows: any[], type: "Thu" | "Chi") {
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.type !== type) continue;
      const cat = r.category ?? "Khác";
      map.set(cat, (map.get(cat) ?? 0) + parseNum(r.paidAmount));
    }
    return map;
  }

  const currRows = currData?.data ?? [];
  const prevRows = prevData?.data ?? [];

  const currThuMap = useMemo(() => groupByCategory(currRows, "Thu"), [currRows]);
  const currChiMap = useMemo(() => groupByCategory(currRows, "Chi"), [currRows]);
  const prevThuMap = useMemo(() => groupByCategory(prevRows, "Thu"), [prevRows]);
  const prevChiMap = useMemo(() => groupByCategory(prevRows, "Chi"), [prevRows]);

  const allThuCats = useMemo(() => {
    const s = new Set([...currThuMap.keys(), ...prevThuMap.keys()]);
    return Array.from(s).sort();
  }, [currThuMap, prevThuMap]);

  const allChiCats = useMemo(() => {
    const s = new Set([...currChiMap.keys(), ...prevChiMap.keys()]);
    return Array.from(s).sort();
  }, [currChiMap, prevChiMap]);

  const filteredThuCats = allThuCats.filter(c => !search || c.toLowerCase().includes(search.toLowerCase()));
  const filteredChiCats = allChiCats.filter(c => !search || c.toLowerCase().includes(search.toLowerCase()));

  const currThuTotal = Array.from(currThuMap.values()).reduce((a, b) => a + b, 0);
  const currChiTotal = Array.from(currChiMap.values()).reduce((a, b) => a + b, 0);
  const prevThuTotal = Array.from(prevThuMap.values()).reduce((a, b) => a + b, 0);
  const prevChiTotal = Array.from(prevChiMap.values()).reduce((a, b) => a + b, 0);

  const currProfit = currThuTotal - currChiTotal;
  const prevProfit = prevThuTotal - prevChiTotal;

  const currLabel = paidAtFrom && paidAtTo
    ? `${format(new Date(paidAtFrom), "d/M/yyyy")} - ${format(new Date(paidAtTo), "d/M/yyyy")}`
    : "Kỳ hiện tại";

  const prevLabel = prevRange.from && prevRange.to
    ? `${format(new Date(prevRange.from), "d/M/yyyy")} - ${format(new Date(prevRange.to), "d/M/yyyy")}`
    : "Kỳ trước";

  const calLabel = paidAtFrom && paidAtTo
    ? `${format(new Date(paidAtFrom), "d/M/yyyy")} - ${format(new Date(paidAtTo), "d/M/yyyy")}`
    : "Chọn kỳ";

  function resetFilters() {
    setFilterLocation("all");
    setFilterCreator("all");
    setFilterPaymentMethod("all");
  }

  function handleDownload() {
    const dataRows: (string | number)[][] = [];

    dataRows.push(["1. Thu", prevThuTotal, currThuTotal, pctChange(prevThuTotal, currThuTotal)]);
    for (const cat of allThuCats) {
      const p = prevThuMap.get(cat) ?? 0;
      const c = currThuMap.get(cat) ?? 0;
      dataRows.push([`  ${cat}`, p, c, pctChange(p, c)]);
    }

    dataRows.push(["2. Chi", prevChiTotal, currChiTotal, pctChange(prevChiTotal, currChiTotal)]);
    for (const cat of allChiCats) {
      const p = prevChiMap.get(cat) ?? 0;
      const c = currChiMap.get(cat) ?? 0;
      dataRows.push([`  ${cat}`, p, c, pctChange(p, c)]);
    }

    downloadXlsx({
      filename: `PhanBoThuChi_${paidAtFrom ?? "all"}_${paidAtTo ?? "all"}`,
      sheetName: "Phân bổ Thu-Chi",
      title: "Báo cáo Phân bổ Thu - Chi",
      subtitle: `Kỳ hiện tại: ${currLabel}  |  Kỳ trước: ${prevLabel}`,
      columns: [
        { header: "Danh mục",                       width: 32 },
        { header: `Kỳ trước (${prevLabel})`,         width: 22 },
        { header: `Kỳ hiện tại (${currLabel})`,      width: 22 },
        { header: "% thay đổi",                      width: 14 },
      ],
      rows: dataRows,
      summaryRows: [
        ["Lợi nhuận", prevProfit, currProfit, pctChange(prevProfit, currProfit)],
      ],
    });
  }

  const isLoading = loadingCurr;

  return (
    <div className="mt-4 space-y-3">
      {/* Title bar */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1.5 h-8 px-2 shrink-0" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
          Quay lại
        </Button>
        <div className="h-4 w-px bg-border" />
        <h2 className="text-base font-semibold text-foreground shrink-0">Phân bổ Thu - Chi</h2>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Tìm danh mục..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-9 pl-8 text-sm"
          />
          {search && (
            <button
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch("")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 h-9 rounded-md border border-input bg-background px-3 text-sm text-left hover:bg-muted/50 transition-colors whitespace-nowrap"
            >
              <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className={paidAtFrom || paidAtTo ? "text-foreground" : "text-muted-foreground"}>
                {calLabel}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="range"
              selected={{ from: paidAtRange.from, to: paidAtRange.to }}
              onSelect={r => setPaidAtRange(r ?? {})}
              locale={vi}
              numberOfMonths={2}
            />
            <div className="p-2 border-t flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setPaidAtRange({}); setCalOpen(false); }} className="text-xs h-7">Xoá</Button>
              <Button size="sm" onClick={() => setCalOpen(false)} className="text-xs h-7">Xong</Button>
            </div>
          </PopoverContent>
        </Popover>

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
          <PopoverContent align="start" className="w-[440px] p-4" side="bottom">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">Bộ lọc</p>
              {activeFilterCount > 0 && (
                <button className="text-xs text-muted-foreground hover:text-foreground underline" onClick={resetFilters}>
                  Xoá tất cả
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Cơ sở</label>
                <Select value={filterLocation} onValueChange={setFilterLocation}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả cơ sở</SelectItem>
                    {locationOpts.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Được tạo bởi</label>
                <Select value={filterCreator} onValueChange={setFilterCreator}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    {creatorOpts.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Hình thức thanh toán</label>
                <Select value={filterPaymentMethod} onValueChange={setFilterPaymentMethod}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="cash">Tiền mặt</SelectItem>
                    <SelectItem value="transfer">Chuyển khoản</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button size="sm" className="h-8 text-xs" onClick={() => setFilterOpen(false)}>Áp dụng</Button>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          size="sm"
          className="h-9 gap-2 bg-blue-600 hover:bg-blue-700 text-white"
          disabled={loadingCurr}
          onClick={() => refetchCurr()}
        >
          Xem báo cáo
        </Button>

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

      {/* Table */}
      <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-[#1e3a5f] text-white">
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap border-r border-white/20 w-64">
                  Danh mục
                </th>
                <th className="px-4 py-3 text-right font-semibold whitespace-nowrap border-r border-white/20 min-w-[160px]">
                  Kỳ trước<br />
                  <span className="text-[11px] font-normal opacity-80">({prevLabel})</span>
                </th>
                <th className="px-4 py-3 text-right font-semibold whitespace-nowrap border-r border-white/20 min-w-[160px]">
                  Kỳ hiện tại<br />
                  <span className="text-[11px] font-normal opacity-80">({currLabel})</span>
                </th>
                <th className="px-4 py-3 text-right font-semibold whitespace-nowrap min-w-[100px]">
                  % thay đổi
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/40">
                    {[0,1,2,3].map(j => (
                      <td key={j} className="px-4 py-2.5 border-r border-border/30 last:border-r-0">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <>
                  {/* ── 1. Thu ── */}
                  <tr
                    className="bg-blue-50 border-b border-border/50 cursor-pointer hover:bg-blue-100/60 transition-colors"
                    onClick={() => setExpandedThu(v => !v)}
                  >
                    <td className="px-4 py-2.5 font-semibold text-blue-800 border-r border-border/40">
                      <span className="flex items-center gap-1">
                        {expandedThu ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRightIcon className="w-3.5 h-3.5" />}
                        1. Thu
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-blue-800 border-r border-border/40">
                      {fmtMoney(prevThuTotal)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-blue-800 border-r border-border/40">
                      {fmtMoney(currThuTotal)}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${pctColor(prevThuTotal, currThuTotal, false)}`}>
                      {pctChange(prevThuTotal, currThuTotal)}
                    </td>
                  </tr>

                  {expandedThu && filteredThuCats.map(cat => {
                    const p = prevThuMap.get(cat) ?? 0;
                    const c = currThuMap.get(cat) ?? 0;
                    return (
                      <tr key={cat} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2 pl-8 border-r border-border/30 text-foreground/80">
                          {cat}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground border-r border-border/30">
                          {fmtMoney(p)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium text-emerald-700 border-r border-border/30">
                          {fmtMoney(c)}
                        </td>
                        <td className={`px-4 py-2 text-right tabular-nums ${pctColor(p, c, false)}`}>
                          {pctChange(p, c)}
                        </td>
                      </tr>
                    );
                  })}

                  {/* ── 2. Chi ── */}
                  <tr
                    className="bg-orange-50 border-b border-border/50 cursor-pointer hover:bg-orange-100/60 transition-colors"
                    onClick={() => setExpandedChi(v => !v)}
                  >
                    <td className="px-4 py-2.5 font-semibold text-orange-800 border-r border-border/40">
                      <span className="flex items-center gap-1">
                        {expandedChi ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRightIcon className="w-3.5 h-3.5" />}
                        2. Chi
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-orange-800 border-r border-border/40">
                      {fmtMoney(prevChiTotal)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-orange-800 border-r border-border/40">
                      {fmtMoney(currChiTotal)}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${pctColor(prevChiTotal, currChiTotal, true)}`}>
                      {pctChange(prevChiTotal, currChiTotal)}
                    </td>
                  </tr>

                  {expandedChi && filteredChiCats.map(cat => {
                    const p = prevChiMap.get(cat) ?? 0;
                    const c = currChiMap.get(cat) ?? 0;
                    return (
                      <tr key={cat} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2 pl-8 border-r border-border/30 text-foreground/80">
                          {cat}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground border-r border-border/30">
                          {fmtMoney(p)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium text-orange-700 border-r border-border/30">
                          {fmtMoney(c)}
                        </td>
                        <td className={`px-4 py-2 text-right tabular-nums ${pctColor(p, c, true)}`}>
                          {pctChange(p, c)}
                        </td>
                      </tr>
                    );
                  })}

                  {/* ── Lợi nhuận ── */}
                  <tr className="bg-[#1e3a5f] text-white">
                    <td className="px-4 py-3 font-bold border-r border-white/20">Lợi nhuận</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-bold border-r border-white/20 ${prevProfit >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                      {fmtMoney(prevProfit)}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums font-bold border-r border-white/20 ${currProfit >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                      {fmtMoney(currProfit)}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums font-bold ${pctColor(prevProfit, currProfit, false)}`}>
                      {pctChange(prevProfit, currProfit)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
