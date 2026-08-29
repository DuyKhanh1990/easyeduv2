import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  FileSearch,
  Link2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Unlink,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLocations } from "@/hooks/use-locations";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getAuthHeaders, queryClient } from "@/lib/queryClient";
import { getBidvRequestDate } from "@shared/bidv-reconciliation";

type ReconciliationRow = {
  id: string;
  transactionId: string;
  vaCode: string;
  invoiceId: string | null;
  amount: string;
  status: string;
  createdAt: string;
  invoiceCode: string | null;
  invoiceStatus: string | null;
  invoiceGrandTotal: string | null;
  invoicePaidAmount: string | null;
  location: { id: string; name: string; code: string } | null;
};

type ReconciliationResponse = {
  rows: ReconciliationRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary: {
    totalTransactions: number;
    totalAmount: string;
    linkedTransactions: number;
    unlinkedTransactions: number;
  };
};

type ReconciliationSession = {
  id: string;
  reconcileDate: string;
  status: "queued" | "running" | "succeeded" | "empty" | "failed" | "partial";
  requestedAt: string;
  completedAt: string | null;
  recordCount: number;
  totalAmount: string;
  errorCode: string | null;
  errorMessage: string | null;
  signatureVerified: boolean;
  locationId: string | null;
};

type SessionResponse = {
  rows: ReconciliationSession[];
  total: number;
};

type ReconciliationRecord = {
  id: string;
  externalTransactionId: string | null;
  traceNumber: string | null;
  vaCode: string | null;
  billId: string | null;
  transactionDate: string | null;
  valueDate: string | null;
  amount: string;
  transactionType: string | null;
  bankStatus: string | null;
  bankDescription: string | null;
  currency: string;
};

type RecordResponse = {
  rows: ReconciliationRecord[];
  total: number;
};

const EMPTY_FILTERS = {
  dateFrom: "",
  dateTo: "",
  locationId: "all",
  status: "all",
  search: "",
};

function formatMoney(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount)
    ? `${amount.toLocaleString("vi-VN")} đ`
    : "0 đ";
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: string) {
  if (status === "processed") return "Đã ghi nhận";
  if (status === "pending") return "Đang chờ";
  if (status === "failed") return "Lỗi";
  return status || "Không xác định";
}

function sessionStatusLabel(status: string) {
  if (status === "queued") return "Đang xếp hàng";
  if (status === "running") return "Đang lấy file";
  if (status === "succeeded") return "Thành công";
  if (status === "empty") return "File rỗng";
  if (status === "failed") return "Lỗi";
  if (status === "partial") return "Một phần";
  return status;
}

function sessionStatusClass(status: string) {
  if (status === "succeeded") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700";
  if (status === "empty") return "border-slate-200 bg-slate-50 text-slate-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function formatInputDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export default function ReconciliationPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [reconcileDate, setReconcileDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [requestLocationId, setRequestLocationId] = useState("all");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const { data: locations = [] } = useLocations();
  const { toast } = useToast();
  const bidvRequestDate = reconcileDate ? getBidvRequestDate(reconcileDate) : "";

  const openReconciliationFile = (sessionId: string) => {
    const fileWindow = window.open("", "_blank");
    if (!fileWindow) {
      toast({
        title: "Không thể mở file",
        description: "Trình duyệt đang chặn cửa sổ mới. Hãy cho phép popup rồi thử lại.",
        variant: "destructive",
      });
      return;
    }

    fileWindow.document.title = "Đang tải file đối soát BIDV...";
    fileWindow.document.body.textContent = "Đang tải file đối soát BIDV...";

    void fetch(`/api/reconciliation/bidv/sessions/${sessionId}/file`, {
      credentials: "include",
      headers: getAuthHeaders(),
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.text();
          throw new Error(body || `HTTP ${response.status}`);
        }
        return response.blob();
      })
      .then((blob) => {
        const fileUrl = URL.createObjectURL(blob);
        fileWindow.location.href = fileUrl;
        window.setTimeout(() => URL.revokeObjectURL(fileUrl), 60_000);
      })
      .catch((error: Error) => {
        fileWindow.close();
        toast({
          title: "Không thể mở file đối soát",
          description: error.message,
          variant: "destructive",
        });
      });
  };

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "25",
    });
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.locationId !== "all") params.set("locationId", filters.locationId);
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.search.trim()) params.set("search", filters.search.trim());
    return params.toString();
  }, [filters, page]);

  const { data, isLoading, isFetching, refetch } = useQuery<ReconciliationResponse>({
    queryKey: ["/api/bidv/reconciliation/transactions", queryString],
    queryFn: async () => {
      const response = await fetch(`/api/bidv/reconciliation/transactions?${queryString}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Không thể tải dữ liệu đối soát");
      }
      return response.json();
    },
  });

  const selectedSessionLocation = requestLocationId === "all" ? null : requestLocationId;
  const { data: sessionData, isFetching: sessionsFetching, refetch: refetchSessions } = useQuery<SessionResponse>({
    queryKey: ["/api/reconciliation/bidv/sessions", selectedSessionLocation],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", pageSize: "10" });
      if (selectedSessionLocation) params.set("locationId", selectedSessionLocation);
      const response = await fetch(`/api/reconciliation/bidv/sessions?${params}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error("Không thể tải lịch sử phiên đối soát");
      return response.json();
    },
    refetchInterval: (query) => {
      const sessions = (query.state.data as SessionResponse | undefined)?.rows ?? [];
      return sessions.some((session) => session.status === "queued" || session.status === "running") ? 3000 : false;
    },
  });

  const { data: recordData, isFetching: recordsFetching } = useQuery<RecordResponse>({
    queryKey: ["/api/reconciliation/bidv/sessions/records", selectedSessionId],
    queryFn: async () => {
      const response = await fetch(`/api/reconciliation/bidv/sessions/${selectedSessionId}/records?page=1&pageSize=100`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error("Không thể tải dòng giao dịch BIDV");
      return response.json();
    },
    enabled: !!selectedSessionId,
  });

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/reconciliation/bidv/sessions", {
        reconcileDate,
        locationId: selectedSessionLocation,
      });
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reconciliation/bidv/sessions"] });
      toast({
        title: result.existing ? "Ngày này đã có phiên đối soát" : "Đã tạo phiên đối soát",
        description: result.existing
          ? "Hệ thống giữ nguyên phiên hiện có, không tạo giao dịch trùng."
          : "Hệ thống đang gọi BIDV và sẽ cập nhật trạng thái tự động.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Không thể lấy file đối soát", description: error.message, variant: "destructive" });
    },
  });

  const retrySessionMutation = useMutation({
    mutationFn: ({ sessionId, locationId }: { sessionId: string; locationId: string | null }) =>
      apiRequest("POST", `/api/reconciliation/bidv/sessions/${sessionId}/retry`, { locationId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reconciliation/bidv/sessions"] });
      toast({ title: "Đã retry phiên đối soát", description: "Đang thử gọi BIDV lại." });
    },
    onError: (error: Error) => {
      toast({ title: "Không thể retry phiên", description: error.message, variant: "destructive" });
    },
  });

  const refreshSessionMutation = useMutation({
    mutationFn: ({ sessionId, locationId }: { sessionId: string; locationId: string | null }) =>
      apiRequest("POST", `/api/reconciliation/bidv/sessions/${sessionId}/refresh`, { locationId }),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reconciliation/bidv/sessions"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/reconciliation/bidv/sessions/records", variables.sessionId],
      });
      toast({
        title: "Đã bắt đầu cập nhật file",
        description: "Hệ thống đang lấy lại file đối soát của ngày này từ BIDV.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Không thể cập nhật file", description: error.message, variant: "destructive" });
    },
  });

  const refreshSession = (session: ReconciliationSession) => {
    const confirmed = window.confirm(
      `Cập nhật lại file đối soát ngày ${session.reconcileDate}?\n\n` +
      "Nếu BIDV trả file mới thành công, file và các dòng giao dịch hiện tại của ngày này sẽ được thay thế.",
    );
    if (!confirmed) return;
    refreshSessionMutation.mutate({
      sessionId: session.id,
      locationId: session.locationId,
    });
  };

  const summary = data?.summary ?? {
    totalTransactions: 0,
    totalAmount: "0",
    linkedTransactions: 0,
    unlinkedTransactions: 0,
  };
  const pagination = data?.pagination ?? { page: 1, pageSize: 25, total: 0, totalPages: 1 };

  const updateFilter = (key: keyof typeof EMPTY_FILTERS, value: string) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const clearFilters = () => {
    setPage(1);
    setFilters(EMPTY_FILTERS);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Tabs defaultValue="transactions" className="w-full">
          <div className="flex flex-wrap items-center gap-2">
            <TabsList className="grid h-10 min-w-0 flex-1 grid-cols-2 bg-muted/60 p-1">
            <TabsTrigger
              value="transactions"
              className="px-4 py-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              Thông tin giao dịch
            </TabsTrigger>
              <TabsTrigger
                value="reconciliation"
                className="px-4 py-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                Thông tin đối soát
              </TabsTrigger>
            </TabsList>
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh-bidv-reconciliation"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Làm mới
            </Button>
          </div>

          <TabsContent value="reconciliation" className="mt-0 space-y-6">
            <Card>
              <CardHeader className="border-b pb-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="h-4 w-4 text-blue-600" />
                  Lấy file đối soát từ BIDV
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[minmax(0,1fr)_14rem_auto] md:items-start">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Ngày giao dịch cần đối soát</label>
                  <Input
                    type="date"
                    value={reconcileDate}
                    onChange={(event) => setReconcileDate(event.target.value)}
                    data-testid="input-bidv-reconciliation-request-date"
                  />
                  <p className="min-h-8 max-w-56 text-xs leading-4 text-muted-foreground">
                    Đối soát T-1: hệ thống sẽ request BIDV ngày{" "}
                    <span className="font-medium text-foreground">{formatInputDate(bidvRequestDate)}</span>
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Cơ sở (bắt buộc)</label>
                  <Select value={requestLocationId} onValueChange={setRequestLocationId}>
                    <SelectTrigger data-testid="select-bidv-reconciliation-request-location">
                      <SelectValue placeholder="Tất cả cơ sở" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả cơ sở</SelectItem>
                      {locations.map((location) => (
                        <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="min-h-8 text-xs leading-4 text-transparent" aria-hidden="true">.</p>
                </div>
                <div className="md:pt-5">
                  <Button
                    onClick={() => createSessionMutation.mutate()}
                    disabled={!reconcileDate || selectedSessionLocation === null || createSessionMutation.isPending}
                    data-testid="button-fetch-bidv-reconciliation"
                  >
                    {createSessionMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowLeftRight className="mr-2 h-4 w-4" />
                    )}
                    Lấy file đối soát
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
                <div>
                  <CardTitle className="text-base">Lịch sử lấy file</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Chỉ đọc dữ liệu BIDV; chưa gửi file chênh lệch và chưa phát sinh tác động tài chính.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetchSessions()}
                  disabled={sessionsFetching}
                  data-testid="button-refresh-bidv-reconciliation-sessions"
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${sessionsFetching ? "animate-spin" : ""}`} />
                  Làm mới
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {sessionData?.rows.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ngày giao dịch</TableHead>
                        <TableHead>Thời điểm yêu cầu</TableHead>
                        <TableHead>Cơ sở</TableHead>
                        <TableHead>Trạng thái</TableHead>
                        <TableHead className="text-right">Giao dịch</TableHead>
                        <TableHead className="text-right">Tổng tiền</TableHead>
                        <TableHead>Chữ ký</TableHead>
                        <TableHead className="text-right">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sessionData.rows.map((session) => (
                        <TableRow key={session.id} data-testid={`row-bidv-reconciliation-session-${session.id}`}>
                          <TableCell className="font-medium">{session.reconcileDate}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatDate(session.requestedAt)}</TableCell>
                          <TableCell className="text-xs">
                            {session.locationId
                              ? locations.find((location) => location.id === session.locationId)?.name ?? session.locationId
                              : <span className="text-amber-600">Chưa gắn cơ sở</span>}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={sessionStatusClass(session.status)}>
                              {sessionStatusLabel(session.status)}
                            </Badge>
                            {session.errorMessage && (
                              <p className="mt-1 max-w-xs text-xs text-red-600">{session.errorMessage}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <div className="flex items-center justify-end gap-1">
                              <span>{session.recordCount.toLocaleString("vi-VN")}</span>
                              {(session.status === "succeeded" || session.status === "empty") && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => setSelectedSessionId(
                                    selectedSessionId === session.id ? null : session.id,
                                  )}
                                  title={selectedSessionId === session.id ? "Ẩn dòng giao dịch" : "Xem dòng giao dịch"}
                                  aria-label={selectedSessionId === session.id ? "Ẩn dòng giao dịch" : "Xem dòng giao dịch"}
                                  data-testid={`button-view-bidv-reconciliation-${session.id}`}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatMoney(session.totalAmount)}</TableCell>
                          <TableCell className="text-xs">
                            {session.signatureVerified ? (
                              <span className="text-emerald-600">Đã xác thực</span>
                            ) : session.status === "succeeded" || session.status === "empty" ? (
                              <span className="text-amber-600">Không có chữ ký</span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {(session.status === "succeeded" || session.status === "empty") && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openReconciliationFile(session.id)}
                                    data-testid={`button-view-bidv-reconciliation-file-${session.id}`}
                                  >
                                    Xem file
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => refreshSession(session)}
                                    disabled={refreshSessionMutation.isPending}
                                    data-testid={`button-refresh-bidv-reconciliation-${session.id}`}
                                  >
                                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                                    Cập nhật
                                  </Button>
                                </>
                              )}
                              {session.status === "failed" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => retrySessionMutation.mutate({
                                    sessionId: session.id,
                                    locationId: selectedSessionLocation,
                                  })}
                                   disabled={retrySessionMutation.isPending || selectedSessionLocation === null}
                                  data-testid={`button-retry-bidv-reconciliation-${session.id}`}
                                >
                                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                                  Retry
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    Chưa có phiên lấy file đối soát nào.
                  </div>
                )}
              </CardContent>
            </Card>

            {selectedSessionId && (
              <Card>
                <CardHeader className="border-b pb-4">
                  <CardTitle className="text-base">
                    Dòng giao dịch BIDV đã lưu
                    {recordData && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {recordData.total.toLocaleString("vi-VN")} dòng
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {recordsFetching ? (
                    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Đang tải dòng giao dịch...
                    </div>
                  ) : recordData?.rows.length ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Thời gian</TableHead>
                          <TableHead>Mã giao dịch BIDV</TableHead>
                          <TableHead>Trace</TableHead>
                          <TableHead>VA / khách hàng</TableHead>
                          <TableHead>Hóa đơn</TableHead>
                          <TableHead className="text-right">Số tiền</TableHead>
                          <TableHead>Kết quả</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recordData.rows.map((record) => (
                          <TableRow key={record.id} data-testid={`row-bidv-reconciliation-record-${record.id}`}>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {formatDate(record.transactionDate)}
                            </TableCell>
                            <TableCell className="max-w-[180px] break-all font-mono text-xs">
                              {record.externalTransactionId || "—"}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{record.traceNumber || "—"}</TableCell>
                            <TableCell className="font-mono text-xs">{record.vaCode || "—"}</TableCell>
                            <TableCell className="text-sm">{record.billId || "—"}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {formatMoney(record.amount)}
                            </TableCell>
                            <TableCell className="text-xs">{record.bankDescription || record.bankStatus || "Thành công"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                      File này không có dòng giao dịch.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

          </TabsContent>

          <TabsContent value="transactions" className="mt-0 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                title="Tổng giao dịch"
                value={summary.totalTransactions.toLocaleString("vi-VN")}
                icon={<FileSearch className="h-5 w-5 text-blue-600" />}
                tone="blue"
              />
              <SummaryCard
                title="Tổng giá trị"
                value={formatMoney(summary.totalAmount)}
                icon={<CircleDollarSign className="h-5 w-5 text-emerald-600" />}
                tone="emerald"
              />
              <SummaryCard
                title="Đã liên kết hóa đơn"
                value={summary.linkedTransactions.toLocaleString("vi-VN")}
                icon={<Link2 className="h-5 w-5 text-violet-600" />}
                tone="violet"
              />
              <SummaryCard
                title="Chưa liên kết"
                value={summary.unlinkedTransactions.toLocaleString("vi-VN")}
                icon={<Unlink className="h-5 w-5 text-amber-600" />}
                tone="amber"
              />
            </div>

            <Card>
              <CardHeader className="border-b pb-4">
                <CardTitle className="text-base">Bộ lọc giao dịch</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Từ ngày</label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(event) => updateFilter("dateFrom", event.target.value)}
                data-testid="input-reconciliation-date-from"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Đến ngày</label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(event) => updateFilter("dateTo", event.target.value)}
                data-testid="input-reconciliation-date-to"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Cơ sở</label>
              <Select value={filters.locationId} onValueChange={(value) => updateFilter("locationId", value)}>
                <SelectTrigger data-testid="select-reconciliation-location">
                  <SelectValue placeholder="Tất cả cơ sở" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả cơ sở</SelectItem>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Trạng thái log</label>
              <Select value={filters.status} onValueChange={(value) => updateFilter("status", value)}>
                <SelectTrigger data-testid="select-reconciliation-status">
                  <SelectValue placeholder="Tất cả trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả trạng thái</SelectItem>
                  <SelectItem value="processed">Đã ghi nhận</SelectItem>
                  <SelectItem value="pending">Đang chờ</SelectItem>
                  <SelectItem value="failed">Lỗi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Mã giao dịch, VA, hóa đơn..."
                  value={filters.search}
                  onChange={(event) => updateFilter("search", event.target.value)}
                  data-testid="input-reconciliation-search"
                />
              </div>
              <Button variant="ghost" onClick={clearFilters} title="Xóa bộ lọc">
                Xóa
              </Button>
            </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
                <div>
                  <CardTitle className="text-base">Danh sách giao dịch</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {pagination.total.toLocaleString("vi-VN")} giao dịch phù hợp bộ lọc
                  </p>
                </div>
                {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </CardHeader>
              <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Đang tải dữ liệu...
              </div>
            ) : data?.rows.length ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Thời gian</TableHead>
                      <TableHead>Mã giao dịch BIDV</TableHead>
                      <TableHead>Tài khoản định danh</TableHead>
                      <TableHead>Hóa đơn</TableHead>
                      <TableHead>Cơ sở</TableHead>
                      <TableHead className="text-right">Số tiền</TableHead>
                      <TableHead>Trạng thái</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((row) => (
                      <TableRow key={row.id} data-testid={`row-reconciliation-${row.id}`}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDate(row.createdAt)}
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <span className="break-all font-mono text-xs">{row.transactionId}</span>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">{row.vaCode}</span>
                        </TableCell>
                        <TableCell>
                          {row.invoiceCode ? (
                            <div>
                              <div className="font-medium">{row.invoiceCode}</div>
                              <div className="text-xs text-muted-foreground">
                                {row.invoiceStatus === "paid" ? "Đã thanh toán" : row.invoiceStatus || "—"}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-amber-600">Chưa liên kết</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.location?.name || row.location?.code || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                          {formatMoney(row.amount)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              row.status === "processed"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : row.status === "failed"
                                  ? "border-red-200 bg-red-50 text-red-700"
                                  : "border-amber-200 bg-amber-50 text-amber-700"
                            }
                          >
                            {row.status === "processed" ? (
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                            ) : null}
                            {statusLabel(row.status)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex items-center justify-between border-t px-4 py-3">
                  <span className="text-xs text-muted-foreground">
                    Trang {pagination.page} / {pagination.totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page <= 1 || isFetching}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                    >
                      Trước
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page >= pagination.totalPages || isFetching}
                      onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
                    >
                      Sau
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                <FileSearch className="h-10 w-10 opacity-30" />
                <p className="text-sm">Chưa có giao dịch BIDV phù hợp</p>
                <p className="text-xs">Dữ liệu sẽ xuất hiện sau khi hệ thống ghi nhận giao dịch thanh toán.</p>
              </div>
            )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function SummaryCard({
  title,
  value,
  icon,
  tone,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  tone: "blue" | "emerald" | "violet" | "amber";
}) {
  const toneClasses = {
    blue: "border-blue-100 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20",
    emerald: "border-emerald-100 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20",
    violet: "border-violet-100 bg-violet-50/50 dark:border-violet-900 dark:bg-violet-950/20",
    amber: "border-amber-100 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20",
  };

  return (
    <Card className={toneClasses[tone]}>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
        </div>
        <div className="rounded-lg bg-background/80 p-2.5 shadow-sm">{icon}</div>
      </CardContent>
    </Card>
  );
}