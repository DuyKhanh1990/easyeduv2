import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { TeacherSalaryTable } from "@shared/schema";
import type { TeacherSalaryPackage, SalaryRange } from "./use-teacher-salary-packages";

const QUERY_KEY = "/api/teacher-salary-tables";

export type TeacherSalaryTableWithRelations = TeacherSalaryTable & {
  location?: { id: string; name: string } | null;
  creatorName?: string | null;
};

export type SessionInfo = {
  sessionId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  attendedCount: number;
  isEligible: boolean;
};

export type TeacherSalaryDetailRow = {
  teacherId: string;
  teacherName: string;
  teacherCode: string;
  classId: string;
  className: string;
  courseId: string | null;
  role: string;
  sessions: SessionInfo[];
  sessionDates: string[];
};

export type TeacherSalaryRowPackage = {
  teacherId: string;
  classId: string;
  packageId: string;
};

function findRangeSalary(value: number, ranges: SalaryRange[]): number {
  if (!ranges || ranges.length === 0) return 0;
  const match = ranges.find((r) => value >= r.from && value <= r.to);
  return match ? match.price : 0;
}

export function calculateSessionSalary(
  session: SessionInfo,
  pkg: TeacherSalaryPackage
): number | null {
  if (!session.isEligible) return null;
  const ranges = pkg.ranges as SalaryRange[] | null;

  switch (pkg.type) {
    case "theo-gio":
      return session.durationHours * Number(pkg.unitPrice || 0);
    case "theo-buoi":
      return Number(pkg.unitPrice || 0);
    case "theo-so-hv": {
      if (ranges && ranges.length > 0) {
        const rangePrice = findRangeSalary(session.attendedCount, ranges);
        return session.attendedCount * rangePrice;
      }
      return session.attendedCount * Number(pkg.unitPrice || 0);
    }
    case "tong-so-gio":
    case "tong-so-buoi":
      return null;
    default:
      return null;
  }
}

export function calculateTotalSalary(
  row: TeacherSalaryDetailRow,
  pkg: TeacherSalaryPackage
): number {
  const ranges = pkg.ranges as SalaryRange[] | null;

  switch (pkg.type) {
    case "theo-gio":
    case "theo-buoi":
    case "theo-so-hv":
      return row.sessions.reduce((sum, s) => {
        const v = calculateSessionSalary(s, pkg);
        return sum + (v ?? 0);
      }, 0);
    case "tong-so-gio": {
      const totalHours = row.sessions
        .filter((s) => s.isEligible)
        .reduce((sum, s) => sum + s.durationHours, 0);
      return findRangeSalary(totalHours, ranges ?? []);
    }
    case "tong-so-buoi": {
      const totalSessions = row.sessions.filter((s) => s.isEligible).length;
      return findRangeSalary(totalSessions, ranges ?? []);
    }
    default:
      return 0;
  }
}

export function useTeacherSalaryTables() {
  return useQuery<TeacherSalaryTableWithRelations[]>({
    queryKey: [QUERY_KEY],
  });
}

export function useTeacherSalaryDetail(id: string | null) {
  return useQuery<TeacherSalaryDetailRow[]>({
    queryKey: [QUERY_KEY, id, "detail"],
    queryFn: async () => {
      const res = await fetch(`${QUERY_KEY}/${id}/detail`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!id,
  });
}

export function useTeacherSalaryRowPackages(id: string | null) {
  return useQuery<TeacherSalaryRowPackage[]>({
    queryKey: [QUERY_KEY, id, "packages"],
    queryFn: async () => {
      const res = await fetch(`${QUERY_KEY}/${id}/packages`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!id,
  });
}

export function useSaveTeacherSalaryRowPackages() {
  return useMutation({
    mutationFn: ({ id, assignments }: { id: string; assignments: TeacherSalaryRowPackage[] }) =>
      apiRequest("POST", `${QUERY_KEY}/${id}/packages`, { assignments }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, variables.id, "packages"] });
    },
  });
}

export function useCreateTeacherSalaryTable() {
  return useMutation({
    mutationFn: (data: Partial<TeacherSalaryTable>) =>
      apiRequest("POST", QUERY_KEY, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

export function useUpdateTeacherSalaryTable() {
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TeacherSalaryTable> }) =>
      apiRequest("PATCH", `${QUERY_KEY}/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

export function useDeleteTeacherSalaryTable() {
  return useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `${QUERY_KEY}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
