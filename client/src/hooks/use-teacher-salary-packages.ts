import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { TeacherSalaryPackage } from "@shared/schema";

const QUERY_KEY = "/api/teacher-salary-packages";

export type { TeacherSalaryPackage };

export interface SalaryRange {
  from: number;
  to: number;
  price: number;
}

export const PACKAGE_TYPES = [
  { value: "theo-gio", label: "Theo giờ" },
  { value: "theo-buoi", label: "Theo buổi" },
  { value: "theo-so-hv", label: "Theo số HV" },
  { value: "tong-so-gio", label: "Tổng số giờ" },
  { value: "tong-so-buoi", label: "Tổng số buổi" },
] as const;

export const PACKAGE_ROLES = [
  { value: "Giáo viên", label: "Giáo viên" },
  { value: "Trợ giảng", label: "Trợ giảng" },
] as const;

export const RANGE_BASED_TYPES = ["theo-so-hv", "tong-so-gio", "tong-so-buoi"];

export function isRangeBasedType(type: string): boolean {
  return RANGE_BASED_TYPES.includes(type);
}

export function getPackageTypeLabel(type: string): string {
  return PACKAGE_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function getUnitPriceLabel(type: string): string {
  switch (type) {
    case "theo-gio": return "Đơn giá/giờ (VNĐ)";
    case "theo-buoi": return "Đơn giá/buổi (VNĐ)";
    default: return "Đơn giá (VNĐ)";
  }
}

export function formatUnitPrice(pkg: TeacherSalaryPackage): string {
  const ranges = pkg.ranges as SalaryRange[] | null;
  if (isRangeBasedType(pkg.type)) {
    if (!ranges || (ranges as SalaryRange[]).length === 0) return "Chưa thiết lập";
    return `${(ranges as SalaryRange[]).length} khoảng`;
  }
  if (!pkg.unitPrice) return "Chưa thiết lập";
  const price = Number(pkg.unitPrice);
  switch (pkg.type) {
    case "theo-gio": return `${price.toLocaleString("vi-VN")}đ/h`;
    case "theo-buoi": return `${price.toLocaleString("vi-VN")}đ/buổi`;
    default: return `${price.toLocaleString("vi-VN")}đ`;
  }
}

export function useTeacherSalaryPackages() {
  return useQuery<TeacherSalaryPackage[]>({
    queryKey: [QUERY_KEY],
  });
}

export function useCreateTeacherSalaryPackage() {
  return useMutation({
    mutationFn: (data: Partial<TeacherSalaryPackage>) =>
      apiRequest("POST", QUERY_KEY, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

export function useUpdateTeacherSalaryPackage() {
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TeacherSalaryPackage> }) =>
      apiRequest("PATCH", `${QUERY_KEY}/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

export function useDeleteTeacherSalaryPackage() {
  return useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `${QUERY_KEY}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
