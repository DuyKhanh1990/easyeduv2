import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/queryClient";

export interface DeferredSession {
  sessionId: string;
  date: string;
  price: number;
  isPaid: boolean | null;
  status: string | null;
  packageId: string | null;
  packageType: string | null;
  packageName: string | null;
  deductsFee: boolean;
}

export interface DeferredClassSummary {
  classId: string;
  className: string;
  locationId: string;
  totalSessions: number;
  totalAmount: number;
  hasReceipt: boolean;
  receiptPaidAmount: number;
  sessions: DeferredSession[];
}

export interface DeferredStudentSummary {
  studentId: string;
  studentName: string;
  totalSessions: number;
  totalAmount: number;
  classes: DeferredClassSummary[];
}

export interface DeferredTuitionData {
  students: DeferredStudentSummary[];
  total: number;
  allStudents: { id: string; name: string }[];
  allClasses: { id: string; name: string }[];
  availableMonths: string[];
}

export function useDeferredTuition(params: {
  studentIds?: string[];
  classIds?: string[];
  month?: string;
  page?: number;
  pageSize?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params.studentIds?.length) searchParams.set("studentIds", params.studentIds.join(","));
  if (params.classIds?.length)   searchParams.set("classIds",   params.classIds.join(","));
  if (params.month)              searchParams.set("month",      params.month);
  if (params.page)               searchParams.set("page",       String(params.page));
  if (params.pageSize)           searchParams.set("pageSize",   String(params.pageSize));

  const qs  = searchParams.toString();
  const url = `/api/finance/deferred-tuition${qs ? `?${qs}` : ""}`;

  return useQuery<DeferredTuitionData>({
    queryKey: ["/api/finance/deferred-tuition", params.studentIds, params.classIds, params.month, params.page, params.pageSize],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Không thể tải dữ liệu học phí trả sau");
      return res.json();
    },
    staleTime: 30_000,
    // The tab is unmounted when switching to another invoice tab. Always
    // refresh when it is selected again so the amounts reflect new receipts.
    refetchOnMount: "always",
  });
}
