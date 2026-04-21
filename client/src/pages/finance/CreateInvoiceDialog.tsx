import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Search, CreditCard, Plus, ChevronDown, X, CalendarIcon,
} from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { useClasses } from "@/hooks/use-classes";
import { fmtMoney } from "@/types/invoice-types";

interface Product {
  id: string;
  packageId: string | null;
  packageType: string | null;
  name: string;
  unitPrice: number;
  quantity: number;
  promotionKeys: string[];
  surchargeKeys: string[];
  categoryId: string;
}

const calcBase = (p: Product) =>
  p.packageType === "khoá" ? p.unitPrice : p.unitPrice * p.quantity;

const calcPromoAmountForProduct = (p: Product, promotionOptions: any[]) => {
  const base = calcBase(p);
  return p.promotionKeys.reduce((sum, key) => {
    const opt = promotionOptions.find((o: any) => o.id === key);
    if (!opt) return sum;
    const val = parseFloat(opt.valueAmount || "0");
    return sum + (opt.valueType === "percent" ? Math.round(base * val / 100) : val);
  }, 0);
};

const calcSurchargeAmountForProduct = (p: Product, base: number, surchargeOptions: any[]) =>
  p.surchargeKeys.reduce((sum, key) => {
    const opt = surchargeOptions.find((o: any) => o.id === key);
    if (!opt) return sum;
    const val = parseFloat(opt.valueAmount || "0");
    return sum + (opt.valueType === "percent" ? Math.round(base * val / 100) : val);
  }, 0);

export function CreateInvoiceDialog({ open, onClose, invoiceId, defaultStudent }: { open: boolean; onClose: () => void; invoiceId?: string | null; defaultStudent?: { id: string; fullName: string; code: string } | null }) {
  const isEdit = Boolean(invoiceId);

  const [invoiceType, setInvoiceType] = useState<"income" | "expense">("income");
  const [locationId, setLocationId]   = useState<string>("");
  const [classId, setClassId]         = useState<string>("");
  const [account, setAccount]         = useState<string>("111");
  const [counterAccount, setCounterAccount] = useState<string>("511");
  const [studentId, setStudentId]     = useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [subjectName, setSubjectName] = useState<string>("");
  const [studentSearch, setStudentSearch] = useState<string>("");
  const [preloadedStudent, setPreloadedStudent] = useState<{ id: string; fullName: string; code: string } | null>(null);
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([
    { id: "1", packageId: null, packageType: null, name: "", unitPrice: 0, quantity: 1, promotionKeys: [], surchargeKeys: [], categoryId: "" },
  ]);
  const [openPromoId, setOpenPromoId] = useState<string | null>(null);
  const [openSurchargeId, setOpenSurchargeId] = useState<string | null>(null);
  const [paymentSchedule, setPaymentSchedule] = useState<{ id: string; label: string; code: string; amount: number; due: Date | undefined; status: string; paymentMethod: string; bank: string }[]>([]);
  const [openDuePicker, setOpenDuePicker] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [directPaidAmount, setDirectPaidAmount] = useState<number>(0);
  const [directPaymentMethod, setDirectPaymentMethod] = useState<string>("cash");
  const [directBank, setDirectBank] = useState<string>("");
  const [deduction, setDeduction] = useState<number>(0);

  const { toast } = useToast();

  const { data: editData } = useQuery<any>({
    queryKey: ["/api/finance/invoices", invoiceId],
    enabled: open && Boolean(invoiceId),
  });

  const { data: allCategoriesForEdit = [] } = useQuery<any[]>({ queryKey: ["/api/finance/transaction-categories"], enabled: open && Boolean(invoiceId) });

  useEffect(() => {
    if (!open) return;
    if (!isEdit || !editData) {
      if (!isEdit) {
        setInvoiceType("income");
        setLocationId("");
        setClassId("");
        setAccount("111");
        setCounterAccount("511");
        setPreloadedStudent(defaultStudent ?? null);
        setStudentId(defaultStudent?.id ?? null);
        setSelectedStaffId(null);
        setSubjectName("");
        setStudentSearch("");
        setProducts([{ id: "1", packageId: null, packageType: null, name: "", unitPrice: 0, quantity: 1, promotionKeys: [], surchargeKeys: [], categoryId: "" }]);
        setPaymentSchedule([]);
        setNote("");
        setDueDate(new Date().toISOString().split("T")[0]);
        setDirectPaidAmount(0);
        setDirectPaymentMethod("cash");
        setDirectBank("");
        setDeduction(0);
      }
      return;
    }

    const inv = editData;
    setInvoiceType(inv.type === "Thu" ? "income" : "expense");
    setLocationId(inv.locationId ?? "");
    setAccount(inv.account ?? "111");
    setCounterAccount(inv.counterAccount ?? "511");
    setClassId(inv.classId ?? "");
    setStudentId(inv.studentId ?? null);
    setSubjectName(inv.subjectName ?? "");
    setStudentSearch("");
    if (inv.studentId && inv.studentFullName) {
      setPreloadedStudent({ id: inv.studentId, fullName: inv.studentFullName, code: inv.studentCode ?? "" });
    } else {
      setPreloadedStudent(null);
    }
    setNote(inv.note ?? inv.description ?? "");
    setDueDate(inv.dueDate ? inv.dueDate.split("T")[0] : new Date().toISOString().split("T")[0]);
    setDirectPaidAmount(parseFloat(inv.paidAmount) || 0);
    setDirectPaymentMethod(inv.paymentMethod ?? "cash");
    setDirectBank(inv.appliedBankAccount?.bankAccount ?? "");
    setDeduction(parseFloat(inv.deduction) || 0);

    const matchedCat = allCategoriesForEdit.find((c: any) => c.name === inv.category);
    const fallbackCatId = matchedCat?.id ?? "";

    if (Array.isArray(inv.items) && inv.items.length > 0) {
      setProducts(inv.items.map((item: any, i: number) => {
        const itemCat = item.category ? allCategoriesForEdit.find((c: any) => c.name === item.category) : null;
        return {
          id: item.id ?? String(i + 1),
          packageId: item.packageId ?? null,
          packageType: item.packageType ?? null,
          name: item.packageName ?? "",
          unitPrice: parseFloat(item.unitPrice) || 0,
          quantity: item.quantity ?? 1,
          promotionKeys: item.promotionKeys ?? [],
          surchargeKeys: item.surchargeKeys ?? [],
          categoryId: itemCat?.id ?? fallbackCatId,
        };
      }));
    } else {
      setProducts([{ id: "1", packageId: null, packageType: null, name: "", unitPrice: 0, quantity: 1, promotionKeys: [], surchargeKeys: [], categoryId: fallbackCatId }]);
    }

    if (Array.isArray(inv.paymentSchedule) && inv.paymentSchedule.length > 0) {
      setPaymentSchedule(inv.paymentSchedule.map((s: any, i: number) => ({
        id: s.id ?? String(i + 1),
        label: s.label ?? `Đợt ${i + 1}`,
        code: s.code ?? "",
        amount: parseFloat(s.amount) || 0,
        due: s.dueDate ? new Date(s.dueDate) : undefined,
        status: s.status ?? "unpaid",
        paymentMethod: s.paymentMethod ?? "cash",
        bank: s.bank ?? "",
      })));
    } else {
      setPaymentSchedule([]);
    }
  }, [open, isEdit, editData, allCategoriesForEdit]);

  const saveMutation = useMutation({
    mutationFn: (body: any) =>
      isEdit
        ? apiRequest("PATCH", `/api/finance/invoices/${invoiceId}`, body)
        : apiRequest("POST", "/api/finance/invoices", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
      if (studentId) {
        queryClient.invalidateQueries({ queryKey: ["/api/students", studentId, "fee-wallet"] });
      }
      toast({ title: isEdit ? "Đã cập nhật phiếu thành công" : "Đã lưu phiếu thành công" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Lỗi khi lưu", description: err.message, variant: "destructive" });
    },
  });

  const { data: locations = [] } = useQuery<any[]>({ queryKey: ["/api/locations"] });
  const { data: allCategories = [] } = useQuery<any[]>({ queryKey: ["/api/finance/transaction-categories"] });

  const selectedLocation = (locations as any[]).find((l: any) => l.id === locationId);
  const locationBanks: { bankName: string; bankAccount: string; accountHolder: string }[] = (() => {
    if (!selectedLocation?.bankAccounts) return [];
    try { return JSON.parse(selectedLocation.bankAccounts); } catch { return []; }
  })();
  const { data: classes = [] } = useClasses(locationId || undefined, { minimal: true, enabled: open });

  const feePackageUrl = `/api/fee-packages${locationId ? `?locationId=${encodeURIComponent(locationId)}` : ""}`;
  const { data: feePackages = [] } = useQuery<any[]>({
    queryKey: ["/api/fee-packages", locationId],
    queryFn: () => apiRequest("GET", feePackageUrl).then(r => r.json()),
    enabled: open,
  });

  const { data: promotionOptions = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/promotions", { type: "promotion" }],
    queryFn: () => apiRequest("GET", "/api/finance/promotions?type=promotion").then(r => r.json()),
    enabled: open,
  });

  const { data: surchargeOptions = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/promotions", { type: "surcharge" }],
    queryFn: () => apiRequest("GET", "/api/finance/promotions?type=surcharge").then(r => r.json()),
    enabled: open,
  });

  const { data: studentsData } = useQuery<any[]>({
    queryKey: ["/api/invoice/search-students", locationId, studentSearch],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "20" });
      if (studentSearch) params.set("searchTerm", studentSearch);
      if (locationId) params.set("locationId", locationId);
      return apiRequest("GET", `/api/invoice/search-students?${params}`).then(r => r.json());
    },
    enabled: open,
  });

  const studentsRaw: any[] = Array.isArray(studentsData) ? studentsData : [];
  const students: any[] = preloadedStudent && !studentsRaw.some((s: any) => s.id === preloadedStudent.id)
    ? [preloadedStudent, ...studentsRaw]
    : studentsRaw;

  const categories = allCategories.filter(c =>
    c.isActive !== false && c.type === (invoiceType === "income" ? "income" : "expense")
  );
  const isHocPhi = products.some(p => {
    const cat = allCategories.find(c => c.id === p.categoryId);
    return cat?.name?.toLowerCase().includes("học phí");
  });

  const { data: studentWallet } = useQuery<any>({
    queryKey: ["/api/students", studentId, "fee-wallet"],
    queryFn: () => apiRequest("GET", `/api/students/${studentId}/fee-wallet`).then(r => r.json()),
    enabled: open && Boolean(studentId),
  });
  const datCocBalance = (studentWallet?.summary?.datCoc ?? 0) as number;

  const selectedPerson = students.find((s: any) => s.id === studentId);
  const displayName = selectedPerson ? `[${selectedPerson.code}] ${selectedPerson.fullName}` : subjectName;

  const totalAmount    = products.reduce((s, p) => s + calcBase(p), 0);
  const totalPromo     = products.reduce((s, p) => s + calcPromoAmountForProduct(p, promotionOptions), 0);
  const totalSurcharge = products.reduce((s, p) => {
    return s + calcSurchargeAmountForProduct(p, calcBase(p), surchargeOptions);
  }, 0);
  const subTotal     = totalAmount - totalPromo + totalSurcharge;  // Thành tiền
  const finalTotal   = Math.max(0, subTotal - deduction);           // Tổng tiền (sau khấu trừ)
  const grandTotal   = finalTotal;                                   // alias dùng trong submit
  const paid         = paymentSchedule.length > 0
    ? paymentSchedule.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0)
    : directPaidAmount;
  const paidPercent  = finalTotal > 0 ? Math.round((paid / finalTotal) * 100) : (subTotal > 0 ? 100 : 0);

  const addProduct = () => setProducts(prev => [...prev, { id: Date.now().toString(), packageId: null, packageType: null, name: "", unitPrice: 0, quantity: 1, promotionKeys: [], surchargeKeys: [], categoryId: prev[0]?.categoryId ?? "" }]);
  const removeProduct = (id: string) => setProducts(prev => prev.filter(p => p.id !== id));
  const scheduleAllocated = paymentSchedule.reduce((s, p) => s + p.amount, 0);
  const scheduleRemaining = finalTotal - scheduleAllocated;
  const canAddSchedule = scheduleRemaining > 0;

  const addPayment = () => {
    if (!canAddSchedule) return;
    setPaymentSchedule(prev => {
      const allocated = prev.reduce((s, p) => s + p.amount, 0);
      const remaining = Math.max(0, finalTotal - allocated);
      return [...prev, { id: Date.now().toString(), label: `ĐỢT ${prev.length + 1}`, code: `PT-${Date.now()}`, amount: remaining, due: new Date(), status: "unpaid", paymentMethod: "cash", bank: "" }];
    });
  };
  const removePayment = (id: string) => setPaymentSchedule(prev => prev.filter(p => p.id !== id));
  const updatePaymentAmount = (id: string, amount: number) => setPaymentSchedule(prev => {
    const updated = prev.map(p => p.id === id ? { ...p, amount } : p);
    const lastId = updated[updated.length - 1]?.id;
    if (lastId && id !== lastId && updated.length > 1) {
      const othersTotal = updated.slice(0, -1).reduce((s, p) => s + p.amount, 0);
      const newLastAmount = Math.max(0, finalTotal - othersTotal);
      return updated.map(p => p.id === lastId ? { ...p, amount: newLastAmount } : p);
    }
    return updated;
  });
  const handleAmountBlur = (id: string, amount: number) => {
    setPaymentSchedule(prev => {
      if (prev.length !== 1 || prev[0].id !== id) return prev;
      const remaining = grandTotal - amount;
      if (remaining <= 0) return prev;
      const newItem = {
        id: Date.now().toString(),
        label: `ĐỢT 2`,
        code: `PT-${Date.now()}`,
        amount: remaining,
        due: new Date(),
        status: "unpaid",
        paymentMethod: "cash",
        bank: "",
      };
      return [...prev, newItem];
    });
  };
  const updatePaymentDue = (id: string, due: Date) => { setPaymentSchedule(prev => prev.map(p => p.id === id ? { ...p, due } : p)); setOpenDuePicker(null); };

  const handleSelectFeePackage = (productId: string, pkgId: string) => {
    const pkg = feePackages.find((fp: any) => fp.id === pkgId);
    if (!pkg) return;
    setProducts(prev => prev.map(x => x.id === productId ? {
      ...x,
      packageId: pkg.id,
      packageType: pkg.type ?? null,
      name: pkg.name,
      unitPrice: parseFloat(pkg.totalAmount || pkg.fee || "0"),
      quantity: x.quantity,
    } : x));
  };

  const handleSave = () => {
    if (!locationId) { toast({ title: "Vui lòng chọn Cơ sở", variant: "destructive" }); return; }
    if (products.some(p => !p.categoryId)) { toast({ title: "Vui lòng chọn Danh mục cho tất cả sản phẩm", variant: "destructive" }); return; }
    if (!studentId && !subjectName.trim()) { toast({ title: "Vui lòng chọn hoặc nhập Tên", variant: "destructive" }); return; }

    const firstCat = allCategories.find((c: any) => c.id === products[0]?.categoryId);

    const items = products.map(p => {
      const base = calcBase(p);
      const promoAmt = calcPromoAmountForProduct(p, promotionOptions);
      const surchargeAmt = calcSurchargeAmountForProduct(p, base, surchargeOptions);
      const itemCat = allCategories.find((c: any) => c.id === p.categoryId);
      return {
        packageName: p.name,
        packageId: p.packageId,
        packageType: p.packageType,
        unitPrice: String(p.unitPrice),
        quantity: p.quantity,
        promotionKeys: p.promotionKeys,
        surchargeKeys: p.surchargeKeys,
        promotionAmount: String(promoAmt),
        surchargeAmount: String(surchargeAmt),
        subtotal: String(base - promoAmt + surchargeAmt),
        category: itemCat?.name ?? "",
      };
    });

    const schedule = paymentSchedule.map(s => ({
      label: s.label,
      code: s.code,
      amount: String(s.amount),
      dueDate: s.due ? s.due.toISOString().split("T")[0] : null,
      status: s.status,
      paymentMethod: s.paymentMethod || null,
      appliedBankAccount: s.paymentMethod === "transfer" && s.bank
        ? locationBanks.find(b => b.bankAccount === s.bank) ?? { bankAccount: s.bank }
        : null,
    }));

    const hasSchedule = paymentSchedule.length > 0;
    const effectivePaid = hasSchedule
      ? paymentSchedule.filter(s => s.status === "paid").reduce((sum, s) => sum + s.amount, 0)
      : directPaidAmount;
    const effectiveRemaining = Math.max(0, grandTotal - effectivePaid);

    const selectedBank = !hasSchedule && directPaymentMethod === "transfer" && directBank
      ? locationBanks.find(b => b.bankAccount === directBank) ?? { bankAccount: directBank }
      : null;

    saveMutation.mutate({
      type: invoiceType === "income" ? "Thu" : "Chi",
      locationId,
      category: firstCat?.name ?? "",
      classId: classId || null,
      studentId: studentId || null,
      subjectName: studentId ? null : subjectName.trim(),
      account,
      counterAccount,
      totalAmount: String(totalAmount),
      totalPromotion: String(totalPromo),
      totalSurcharge: String(totalSurcharge),
      grandTotal: String(finalTotal),
      deduction: String(deduction),
      paidAmount: String(effectivePaid),
      remainingAmount: String(effectiveRemaining),
      paymentMethod: !hasSchedule ? (directPaymentMethod || null) : null,
      appliedBankAccount: selectedBank,
      note,
      dueDate: dueDate || null,
      status: (grandTotal === 0 && subTotal > 0) || (effectivePaid >= grandTotal && grandTotal > 0) ? "paid" : effectivePaid > 0 ? "partial" : (isEdit ? undefined : "unpaid"),
      items,
      paymentSchedule: schedule,
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="w-screen h-screen max-w-none max-h-none m-0 rounded-none p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-xs font-semibold">
            <CreditCard className="h-4 w-4 text-purple-600" />
            {isEdit ? `Chỉnh sửa phiếu ${editData?.code ?? ""}` : "Tạo phiếu thu / chi"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* LEFT PANEL */}
          <div className="flex-1 overflow-y-auto px-6 py-4 border-r space-y-4 min-w-0">

            <div className="flex items-center gap-1 p-1 rounded-lg border bg-muted/30 w-fit">
              <button
                onClick={() => { setInvoiceType("income"); setProducts(prev => prev.map(p => ({ ...p, categoryId: "" }))); }}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${invoiceType === "income" ? "bg-purple-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                data-testid="toggle-income"
              >
                Phiếu thu
              </button>
              <button
                onClick={() => { setInvoiceType("expense"); setProducts(prev => prev.map(p => ({ ...p, categoryId: "" }))); }}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${invoiceType === "expense" ? "bg-purple-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                data-testid="toggle-expense"
              >
                Phiếu chi
              </button>
            </div>

            {/* Row 1: Cơ sở, Tên, Lớp */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Cơ sở <span className="text-red-500">*</span></label>
                <Select value={locationId} onValueChange={v => { setLocationId(v); setStudentId(null); setSubjectName(""); setClassId(""); setProducts(prev => prev.map(p => ({ ...p, packageId: null }))); }}>
                  <SelectTrigger className="h-9" data-testid="select-branch"><SelectValue placeholder="Chọn cơ sở" /></SelectTrigger>
                  <SelectContent>
                    {locations.map((loc: any) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Tên <span className="text-red-500">*</span></label>
                <Popover open={studentPickerOpen} onOpenChange={setStudentPickerOpen}>
                  <PopoverTrigger asChild>
                    <button
                      className="w-full h-9 flex items-center justify-between px-3 rounded-md border bg-background text-sm hover:border-purple-400 transition-colors text-left"
                      data-testid="button-student-picker"
                    >
                      <span className={displayName ? "text-foreground truncate" : "text-muted-foreground"}>
                        {displayName || "Tên học viên / đối tượng..."}
                      </span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-1" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-2" align="start">
                    <div className="mb-2 relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        className="h-8 text-xs pl-7"
                        placeholder="Tìm tên, mã..."
                        value={studentSearch}
                        onChange={e => setStudentSearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="max-h-52 overflow-y-auto space-y-0.5">
                      {students.length === 0 ? (
                        <p className="text-xs text-center text-muted-foreground py-4">Không tìm thấy</p>
                      ) : (() => {
                        const studentItems = students.filter((s: any) => s.entityType !== "staff");
                        const staffItems = students.filter((s: any) => s.entityType === "staff");
                        return (
                          <>
                            {studentItems.length > 0 && studentSearch && (
                              <p className="text-[10px] font-medium text-muted-foreground px-2 py-1">Học viên / Phụ huynh</p>
                            )}
                            {studentItems.map((s: any) => (
                              <button
                                key={s.id}
                                className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/60 transition-colors ${studentId === s.id ? "bg-purple-50 text-purple-700" : ""}`}
                                onClick={() => { setStudentId(s.id); setSelectedStaffId(null); setSubjectName(""); setDeduction(0); setStudentPickerOpen(false); }}
                              >
                                <span className="font-mono text-muted-foreground">[{s.code}]</span> {s.fullName}
                                <span className="ml-1 text-[10px] text-muted-foreground">({s.type})</span>
                              </button>
                            ))}
                            {staffItems.length > 0 && (
                              <>
                                <div className="border-t my-1" />
                                <p className="text-[10px] font-medium text-muted-foreground px-2 py-1">Nhân viên</p>
                                {staffItems.map((s: any) => (
                                  <button
                                    key={s.id}
                                    className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/60 transition-colors ${selectedStaffId === s.id ? "bg-blue-50 text-blue-700" : ""}`}
                                    onClick={() => { setStudentId(null); setSelectedStaffId(s.id); setSubjectName(`[${s.code}] ${s.fullName}`); setDeduction(0); setStudentPickerOpen(false); }}
                                  >
                                    <span className="font-mono text-muted-foreground">[{s.code}]</span> {s.fullName}
                                    <span className="ml-1 text-[10px] text-blue-500">(Nhân viên)</span>
                                  </button>
                                ))}
                              </>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <div className="mt-2 pt-2 border-t">
                      <p className="text-[10px] text-muted-foreground mb-1">Hoặc nhập tên thủ công:</p>
                      <Input
                        className="h-7 text-xs"
                        placeholder="Tên đối tượng khác..."
                        value={studentId ? "" : subjectName}
                        onChange={e => { setSubjectName(e.target.value); setStudentId(null); setSelectedStaffId(null); }}
                      />
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Lớp</label>
                <Select value={classId} onValueChange={setClassId}>
                  <SelectTrigger className="h-9" data-testid="select-class"><SelectValue placeholder="Chọn lớp" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((cls: any) => (
                      <SelectItem key={cls.id} value={cls.id}>[{cls.classCode}] {cls.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: Tài khoản thu/chi, Tài khoản đối ứng, Hạn Thanh toán */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{invoiceType === "income" ? "Tài khoản thu" : "Tài khoản chi"} <span className="text-red-500">*</span></label>
                <Select value={account} onValueChange={setAccount}>
                  <SelectTrigger className="h-9" data-testid="select-account"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="111">111 - Tiền mặt</SelectItem>
                    <SelectItem value="112">112 - Tiền gửi ngân hàng</SelectItem>
                    <SelectItem value="131">131 - Phải thu khách hàng</SelectItem>
                    <SelectItem value="141">141 - Tạm ứng</SelectItem>
                    <SelectItem value="338">338 - Phải trả khác</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Tài khoản đối ứng</label>
                <Select value={counterAccount} onValueChange={setCounterAccount}>
                  <SelectTrigger className="h-9" data-testid="select-counterpart"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="511">511 - Doanh thu</SelectItem>
                    <SelectItem value="711">711 - Thu nhập khác</SelectItem>
                    <SelectItem value="3387">3387 - Doanh thu chưa thực hiện</SelectItem>
                    <SelectItem value="331">331 - Phải trả người bán</SelectItem>
                    <SelectItem value="334">334 - Phải trả người lao động</SelectItem>
                    <SelectItem value="642">642 - Chi phí quản lý doanh nghiệp</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Hạn thanh toán</label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="h-9 text-sm"
                  data-testid="input-due-date"
                />
              </div>
            </div>

            {/* Product list */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">Danh sách sản phẩm</span>
                <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={addProduct} data-testid="button-add-product">
                  <Plus className="h-3.5 w-3.5" /> Thêm sản phẩm
                </Button>
              </div>

              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-xs table-fixed">
                  <colgroup>
                    <col style={{ width: "17%" }} />
                    <col style={{ width: "22%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "3%" }} />
                  </colgroup>
                  <thead className="bg-muted/60">
                    <tr className="border-b">
                      <th className="p-2 text-left font-semibold text-muted-foreground">Danh mục</th>
                      <th className="p-2 text-left font-semibold text-muted-foreground">Tên gói</th>
                      <th className="p-2 text-right font-semibold text-muted-foreground">Đơn giá</th>
                      <th className="p-2 text-center font-semibold text-muted-foreground">SL</th>
                      <th className="p-2 text-right font-semibold text-muted-foreground">Khuyến mãi</th>
                      <th className="p-2 text-right font-semibold text-muted-foreground">Phụ thu</th>
                      <th className="p-2 text-right font-semibold text-muted-foreground">Thành tiền</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p, idx) => {
                      const isKhoa = p.packageType === "khoá";
                      const isProductHocPhi = allCategories.find((c: any) => c.id === p.categoryId)?.name?.toLowerCase().includes("học phí");
                      const base = calcBase(p);
                      const promoAmt = calcPromoAmountForProduct(p, promotionOptions);
                      const surchargeAmt = calcSurchargeAmountForProduct(p, base, surchargeOptions);
                      const subtotal = base - promoAmt + surchargeAmt;
                      const togglePromo = (key: string) => setProducts(prev => prev.map(x => x.id === p.id ? {
                        ...x,
                        promotionKeys: x.promotionKeys.includes(key) ? x.promotionKeys.filter(k => k !== key) : [...x.promotionKeys, key]
                      } : x));
                      const toggleSurcharge = (key: string) => setProducts(prev => prev.map(x => x.id === p.id ? {
                        ...x,
                        surchargeKeys: x.surchargeKeys.includes(key) ? x.surchargeKeys.filter(k => k !== key) : [...x.surchargeKeys, key]
                      } : x));
                      return (
                        <tr key={p.id} className={`border-b last:border-0 ${idx % 2 === 1 ? "bg-muted/20" : ""}`}>
                          <td className="p-2">
                            <Select
                              value={p.categoryId}
                              onValueChange={v => {
                                setProducts(prev => prev.map(x => x.id === p.id ? { ...x, categoryId: v, packageId: null, packageType: null, name: "" } : x));
                                setDeduction(0);
                              }}
                            >
                              <SelectTrigger className="h-8 text-[11px]" data-testid={`select-item-category-${p.id}`}>
                                <SelectValue placeholder="Chọn..." />
                              </SelectTrigger>
                              <SelectContent>
                                {categories.length === 0
                                  ? <SelectItem value="_none" disabled>Chưa có danh mục</SelectItem>
                                  : categories.map((cat: any) => (
                                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                    ))
                                }
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-2">
                            {isProductHocPhi ? (
                              <Select value={p.packageId ?? feePackages.find((fp: any) => fp.name === p.name)?.id ?? ""} onValueChange={v => handleSelectFeePackage(p.id, v)}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Chọn gói học phí..." /></SelectTrigger>
                                <SelectContent>
                                  {p.packageId && p.name && !feePackages.find((fp: any) => fp.id === p.packageId) && (
                                    <SelectItem key={p.packageId} value={p.packageId}>{p.name}</SelectItem>
                                  )}
                                  {feePackages.length === 0
                                    ? <SelectItem value="_none" disabled>Chưa có gói học phí</SelectItem>
                                    : feePackages.map((fp: any) => (
                                        <SelectItem key={fp.id} value={fp.id}>
                                          {fp.name} {fp.courseName ? `(${fp.courseName})` : ""}
                                        </SelectItem>
                                      ))
                                  }
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                className="h-8 text-xs"
                                placeholder="Tên gói / dịch vụ..."
                                value={p.name}
                                onChange={e => setProducts(prev => prev.map(x => x.id === p.id ? { ...x, name: e.target.value } : x))}
                              />
                            )}
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              value={p.unitPrice}
                              readOnly={isKhoa}
                              onChange={e => !isKhoa && setProducts(prev => prev.map(x => x.id === p.id ? { ...x, unitPrice: Number(e.target.value) } : x))}
                              className={`h-8 text-[11px] text-right px-1.5 ${isKhoa ? "bg-muted/40 cursor-not-allowed opacity-70" : ""}`}
                              title={isKhoa ? "Gói theo khoá: đơn giá cố định" : undefined}
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              min={1}
                              value={p.quantity}
                              onChange={e => setProducts(prev => prev.map(x => x.id === p.id ? { ...x, quantity: Number(e.target.value) } : x))}
                              className="h-8 text-[11px] text-center px-1"
                            />
                            {isKhoa && (
                              <p className="text-[9px] text-amber-600 mt-0.5 leading-tight">Gói theo khoá, không ảnh hưởng tổng tiền</p>
                            )}
                          </td>
                          <td className="p-2">
                            <Popover open={openPromoId === p.id} onOpenChange={v => setOpenPromoId(v ? p.id : null)}>
                              <PopoverTrigger asChild>
                                <button className="w-full h-8 flex items-center justify-between px-2 rounded-md border bg-background hover:border-purple-400 transition-colors text-[11px]">
                                  <span className={promoAmt > 0 ? "text-green-600 font-semibold" : "text-muted-foreground"}>
                                    {promoAmt > 0 ? `-${fmtMoney(promoAmt)}` : "Chọn..."}
                                  </span>
                                  <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-52 p-2" align="start">
                                <p className="text-xs font-semibold mb-2 text-muted-foreground">Chọn khuyến mãi</p>
                                <div className="space-y-1.5">
                                  {promotionOptions.length === 0
                                    ? <p className="text-xs text-muted-foreground">Chưa có khuyến mãi</p>
                                    : promotionOptions.map((o: any) => {
                                        const val = parseFloat(o.valueAmount || "0");
                                        const amt = o.valueType === "percent" ? Math.round(base * val / 100) : val;
                                        return (
                                          <label key={o.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                                            <Checkbox
                                              checked={p.promotionKeys.includes(o.id)}
                                              onCheckedChange={() => togglePromo(o.id)}
                                            />
                                            <div className="flex-1 min-w-0">
                                              <p className="text-xs font-medium">{o.name}</p>
                                              <p className="text-xs text-muted-foreground">-{fmtMoney(amt)}</p>
                                            </div>
                                          </label>
                                        );
                                      })
                                  }
                                </div>
                              </PopoverContent>
                            </Popover>
                          </td>
                          <td className="p-2">
                            <Popover open={openSurchargeId === p.id} onOpenChange={v => setOpenSurchargeId(v ? p.id : null)}>
                              <PopoverTrigger asChild>
                                <button className="w-full h-8 flex items-center justify-between px-2 rounded-md border bg-background hover:border-purple-400 transition-colors text-[11px]">
                                  <span className={surchargeAmt > 0 ? "text-orange-600 font-semibold" : "text-muted-foreground"}>
                                    {surchargeAmt > 0 ? `+${fmtMoney(surchargeAmt)}` : "Chọn..."}
                                  </span>
                                  <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-56 p-2" align="start">
                                <p className="text-xs font-semibold mb-2 text-muted-foreground">Chọn phụ thu</p>
                                <div className="space-y-1.5">
                                  {surchargeOptions.length === 0
                                    ? <p className="text-xs text-muted-foreground">Chưa có phụ thu</p>
                                    : surchargeOptions.map((o: any) => {
                                        const val = parseFloat(o.valueAmount || "0");
                                        const amt = o.valueType === "percent" ? Math.round(base * val / 100) : val;
                                        return (
                                          <label key={o.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                                            <Checkbox
                                              checked={p.surchargeKeys.includes(o.id)}
                                              onCheckedChange={() => toggleSurcharge(o.id)}
                                            />
                                            <div className="flex-1 min-w-0">
                                              <p className="text-xs font-medium">{o.name}</p>
                                              <p className="text-xs text-muted-foreground">+{fmtMoney(amt)}</p>
                                            </div>
                                          </label>
                                        );
                                      })
                                  }
                                </div>
                              </PopoverContent>
                            </Popover>
                          </td>
                          <td className="p-2 text-right font-semibold text-xs">{fmtMoney(subtotal)}</td>
                          <td className="p-2 text-center">
                            <button
                              onClick={() => removeProduct(p.id)}
                              disabled={products.length === 1}
                              className="text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Note */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Ghi chú</label>
              <Textarea
                placeholder="Nhập thông tin chi tiết..."
                value={note}
                onChange={e => setNote(e.target.value)}
                className="text-sm resize-none"
                rows={3}
                data-testid="textarea-note"
              />
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div className="w-[400px] flex-shrink-0 overflow-y-auto px-5 py-4 space-y-4 bg-muted/20">
            <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Số tiền:</span>
                  <span className="font-medium text-foreground">{fmtMoney(totalAmount)}</span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span>Khuyến mãi:</span>
                  <span>{totalPromo > 0 ? `-${fmtMoney(totalPromo)}` : "0 ₫"}</span>
                </div>
                <div className="flex justify-between text-orange-500">
                  <span>Phụ thu:</span>
                  <span>{totalSurcharge > 0 ? `+${fmtMoney(totalSurcharge)}` : "0 ₫"}</span>
                </div>
                <div className="flex justify-between font-semibold pt-1 border-t">
                  <span>Thành tiền:</span>
                  <span>{fmtMoney(subTotal)}</span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground flex-shrink-0">Khấu trừ:</span>
                    <Input
                      type="number"
                      min={0}
                      max={studentId && datCocBalance > 0 ? Math.min(subTotal, datCocBalance) : subTotal}
                      value={deduction}
                      onChange={e => {
                        const maxDed = studentId && datCocBalance > 0
                          ? Math.min(subTotal, datCocBalance)
                          : subTotal;
                        setDeduction(Math.min(maxDed, Math.max(0, Number(e.target.value))));
                      }}
                      className="h-7 text-xs text-right w-32 border-muted"
                      data-testid="input-deduction"
                    />
                  </div>
                  {studentId && datCocBalance > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-blue-600 bg-blue-50 rounded px-2 py-1">
                        <span>Tiền cọc còn:</span>
                        <span className="font-semibold">{fmtMoney(Math.max(0, datCocBalance - deduction))}</span>
                      </div>
                      {deduction > 0 && isHocPhi && (
                        <p className="text-[10px] text-muted-foreground px-1">Ưu tiên trừ cọc vào danh mục Học phí trước</p>
                      )}
                    </div>
                  )}
                  {studentId && datCocBalance <= 0 && studentWallet !== undefined && (
                    <p className="text-xs text-muted-foreground text-right">Học viên không có tiền cọc</p>
                  )}
                </div>
                <div className="flex justify-between font-bold pt-1 border-t text-foreground">
                  <span>Tổng tiền:</span>
                  <span className="text-base">{fmtMoney(finalTotal)}</span>
                </div>
              </div>
              <div className="pt-2 border-t space-y-2">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground flex-shrink-0">Đã thanh toán</span>
                  {paymentSchedule.length === 0 ? (
                    <Input
                      type="number"
                      min={0}
                      max={grandTotal}
                      value={directPaidAmount}
                      onChange={e => setDirectPaidAmount(Math.min(grandTotal, Math.max(0, Number(e.target.value))))}
                      className="h-7 text-xs text-right font-bold text-blue-600 w-32 border-blue-200 focus-visible:ring-blue-400"
                      data-testid="input-direct-paid"
                    />
                  ) : (
                    <span className="font-bold text-blue-600">{fmtMoney(paid)}</span>
                  )}
                </div>
                {paymentSchedule.length === 0 && (
                  <div className="flex gap-2 items-end">
                    <div className="space-y-0.5 w-36 flex-shrink-0">
                      <span className="text-xs text-muted-foreground">Hình thức</span>
                      <Select value={directPaymentMethod} onValueChange={v => { setDirectPaymentMethod(v); if (v === "cash") setDirectBank(""); }}>
                        <SelectTrigger className="h-8 text-xs" data-testid="select-direct-payment-method"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">Tiền mặt</SelectItem>
                          <SelectItem value="transfer">Chuyển khoản</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {directPaymentMethod === "transfer" && (
                      <div className="flex-1 space-y-0.5">
                        <span className="text-xs text-muted-foreground">Ngân hàng</span>
                        <Select value={directBank} onValueChange={setDirectBank}>
                          <SelectTrigger className="h-8 text-xs" data-testid="select-direct-bank"><SelectValue placeholder="Chọn ngân hàng" /></SelectTrigger>
                          <SelectContent>
                            {locationBanks.length === 0
                              ? <SelectItem value="_none" disabled>Chưa cấu hình ngân hàng</SelectItem>
                              : locationBanks.map((b, i) => (
                                  <SelectItem key={i} value={b.bankAccount}>
                                    {b.bankName} - {b.bankAccount}{b.accountHolder ? ` (${b.accountHolder})` : ""}
                                  </SelectItem>
                                ))
                            }
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
                <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-blue-500 rounded-full transition-all" style={{ width: `${paidPercent}%` }} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{paidPercent}%</span>
                  <span>{fmtMoney(paid)} / {fmtMoney(grandTotal)}</span>
                </div>
              </div>
            </div>

            {/* Payment schedule */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Lịch thanh toán</span>
                <Button
                  size="sm" variant="outline"
                  className={`h-7 gap-1 text-xs transition-opacity ${!canAddSchedule ? "opacity-40 cursor-not-allowed" : ""}`}
                  onClick={addPayment}
                  disabled={!canAddSchedule}
                  title={!canAddSchedule ? "Đã phân bổ đủ tổng tiền" : "Thêm đợt thanh toán"}
                  data-testid="button-add-payment"
                >
                  <Plus className="h-3 w-3" /> Thêm
                </Button>
              </div>
              {paymentSchedule.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3 border rounded-lg">Nhấn "+ Thêm" để tạo đợt thanh toán</p>
              )}
              <div className="space-y-2">
                {paymentSchedule.map(p => (
                  <div key={p.id} className="rounded-lg border bg-card p-3 space-y-2 shadow-sm">
                    {/* Header: label + status + delete */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold">{p.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${p.status === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {p.status === "paid" ? "Đã thanh toán" : "Chưa thanh toán"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground">Mã: {p.code}</span>
                        <button
                          onClick={() => removePayment(p.id)}
                          className="text-muted-foreground hover:text-red-500 transition-colors ml-1"
                          data-testid={`button-delete-payment-${p.id}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {/* Số tiền + Hạn on same row */}
                    <div className="flex gap-2">
                      <div className="flex-1 space-y-0.5">
                        <span className="text-xs text-muted-foreground">Số tiền</span>
                        <Input
                          type="number"
                          value={p.amount}
                          onChange={e => updatePaymentAmount(p.id, Number(e.target.value))}
                          onBlur={e => handleAmountBlur(p.id, Number(e.target.value))}
                          className="h-8 text-xs text-right font-semibold"
                          data-testid={`input-payment-amount-${p.id}`}
                        />
                      </div>
                      <div className="flex-1 space-y-0.5">
                        <span className="text-xs text-muted-foreground">Hạn</span>
                        <Popover open={openDuePicker === p.id} onOpenChange={v => setOpenDuePicker(v ? p.id : null)}>
                          <PopoverTrigger asChild>
                            <button
                              className="w-full flex items-center gap-1.5 h-8 px-2 rounded-md border bg-background text-xs hover:border-purple-400 transition-colors"
                              data-testid={`button-due-date-${p.id}`}
                            >
                              <CalendarIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              <span className={p.due ? "text-foreground" : "text-muted-foreground"}>
                                {p.due ? format(p.due, "dd/MM/yyyy") : "Chọn ngày..."}
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start" side="left">
                            <Calendar
                              mode="single"
                              selected={p.due}
                              onSelect={(date: Date | undefined) => { if (date) updatePaymentDue(p.id, date); }}
                              locale={vi}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    {/* Hình thức thanh toán */}
                    <div className="flex gap-2 items-end">
                      <div className="space-y-0.5 w-36 flex-shrink-0">
                        <span className="text-xs text-muted-foreground">Hình thức</span>
                        <Select
                          value={p.paymentMethod}
                          onValueChange={v => setPaymentSchedule(prev => prev.map(x => x.id === p.id ? { ...x, paymentMethod: v, bank: v === "cash" ? "" : x.bank } : x))}
                        >
                          <SelectTrigger className="h-8 text-xs" data-testid={`select-payment-method-${p.id}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cash">Tiền mặt</SelectItem>
                            <SelectItem value="transfer">Chuyển khoản</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {p.paymentMethod === "transfer" && (
                        <div className="flex-1 space-y-0.5">
                          <span className="text-xs text-muted-foreground">Ngân hàng</span>
                          <Select
                            value={p.bank}
                            onValueChange={v => setPaymentSchedule(prev => prev.map(x => x.id === p.id ? { ...x, bank: v } : x))}
                          >
                            <SelectTrigger className="h-8 text-xs" data-testid={`select-bank-${p.id}`}><SelectValue placeholder="Chọn ngân hàng" /></SelectTrigger>
                            <SelectContent>
                              {locationBanks.length === 0
                                ? <SelectItem value="_none" disabled>Chưa cấu hình ngân hàng</SelectItem>
                                : locationBanks.map((b, i) => (
                                    <SelectItem key={i} value={b.bankAccount}>
                                      {b.bankName} - {b.bankAccount}{b.accountHolder ? ` (${b.accountHolder})` : ""}
                                    </SelectItem>
                                  ))
                              }
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t bg-muted/20 flex-shrink-0">
          <Button variant="outline" onClick={onClose} disabled={saveMutation.isPending} data-testid="button-cancel">Huỷ</Button>
          {!isEdit && (
            <Button variant="outline" onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save">
              {saveMutation.isPending ? "Đang lưu..." : "Lưu"}
            </Button>
          )}
          <Button className="bg-purple-600 hover:bg-purple-700 gap-1" onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save-pay">
            {saveMutation.isPending ? "Đang lưu..." : isEdit ? "Cập nhật phiếu" : "Lưu & Thu tiền"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
