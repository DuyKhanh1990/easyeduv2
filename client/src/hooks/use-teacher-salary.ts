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
  /** Hệ số từ Chấm công giáo viên. null = chưa chấm công → dùng logic cũ */
  attendanceCoefficient: number | null;
  checkInAt: string | null;
  checkOutAt: string | null;
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

export type TeacherSalarySessionPackage = {
  sessionId: string;
  teacherId: string;
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
  const coeff = session.attendanceCoefficient;
  const hasAttendance = coeff !== null && coeff !== undefined;

  // Nếu không có chấm công giáo viên → dùng logic cũ (dựa vào điểm danh học viên)
  if (!hasAttendance && !session.isEligible) return null;
  // Nếu có chấm công nhưng hệ số = 0 → không tính lương
  if (hasAttendance && coeff === 0) return 0;

  const ranges = pkg.ranges as SalaryRange[] | null;
  const multiplier = hasAttendance ? coeff! : 1;

  switch (pkg.type) {
    case "theo-gio":
      return session.durationHours * Number(pkg.unitPrice || 0) * multiplier;
    case "theo-buoi":
      return Number(pkg.unitPrice || 0) * multiplier;
    case "theo-so-hv": {
      const base = (() => {
        if (ranges && ranges.length > 0) {
          const rangePrice = findRangeSalary(session.attendedCount, ranges);
          return session.attendedCount * rangePrice;
        }
        return session.attendedCount * Number(pkg.unitPrice || 0);
      })();
      return base * multiplier;
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
      // Nếu session có chấm công → tính giờ hiệu quả = lịch * hệ số
      // Nếu không → dùng logic cũ (isEligible)
      const totalHours = row.sessions.reduce((sum, s) => {
        const coeff = s.attendanceCoefficient;
        if (coeff !== null && coeff !== undefined) {
          return sum + s.durationHours * coeff;
        }
        return s.isEligible ? sum + s.durationHours : sum;
      }, 0);
      return findRangeSalary(totalHours, ranges ?? []);
    }
    case "tong-so-buoi": {
      // Đếm số buổi nguyên (có chấm công GV hoặc eligible theo HV) → tra bảng range
      const totalSessions = row.sessions.reduce((sum, s) => {
        const coeff = s.attendanceCoefficient;
        if (coeff !== null && coeff !== undefined) return coeff > 0 ? sum + 1 : sum;
        return s.isEligible ? sum + 1 : sum;
      }, 0);
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

export function useTeacherSalarySessionPackages(id: string | null) {
  return useQuery<TeacherSalarySessionPackage[]>({
    queryKey: [QUERY_KEY, id, "session-packages"],
    queryFn: async () => {
      const res = await fetch(`${QUERY_KEY}/${id}/session-packages`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!id,
  });
}

export function useSaveTeacherSalarySessionPackage() {
  return useMutation({
    mutationFn: ({
      salaryTableId,
      sessionId,
      teacherId,
      packageId,
    }: {
      salaryTableId: string;
      sessionId: string;
      teacherId: string;
      packageId: string;
    }) =>
      apiRequest("POST", `${QUERY_KEY}/${salaryTableId}/session-packages`, {
        sessionId,
        teacherId,
        packageId,
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEY, variables.salaryTableId, "session-packages"],
      });
    },
  });
}

export function useDeleteTeacherSalarySessionPackage() {
  return useMutation({
    mutationFn: ({
      salaryTableId,
      sessionId,
      teacherId,
    }: {
      salaryTableId: string;
      sessionId: string;
      teacherId: string;
    }) =>
      apiRequest(
        "DELETE",
        `${QUERY_KEY}/${salaryTableId}/session-packages/${sessionId}/${teacherId}`
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEY, variables.salaryTableId, "session-packages"],
      });
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
