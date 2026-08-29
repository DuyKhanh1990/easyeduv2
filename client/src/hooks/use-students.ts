import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";
import type { StudentResponse } from "@shared/schema";
import { getAuthHeaders } from "@/lib/queryClient";

export function useStudents(params?: { 
  locationId?: string; 
  limit?: number; 
  offset?: number; 
  searchTerm?: string; 
  type?: string; 
  pipelineStage?: string;
  pipelineGroupId?: string;
  parentRelationshipId?: string;
  sources?: string[];
  rejectReasons?: string[];
  salesIds?: string[];
  managerIds?: string[];
  teacherIds?: string[];
  classIds?: string[];
  schoolIds?: string[];
  birthYear?: string;
  startDate?: string;
  endDate?: string;
  updatedFrom?: string;
  updatedTo?: string;
  accountStatuses?: string[];
  learningStatuses?: string[];
  birthdayFrom?: string;
  birthdayTo?: string;
  classTabId?: string;
  classTab?: "unassigned";
  enabled?: boolean;
}) {
  const { enabled, ...queryParams } = params ?? {};
  return useQuery<{ students: StudentResponse[]; total: number }>({
    queryKey: [api.students.list.path, queryParams],
    queryFn: async () => {
      const url = new URL(api.students.list.path, window.location.origin);
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined && value !== "all") {
          if (Array.isArray(value)) {
            value.forEach(v => url.searchParams.append(key, v.toString()));
          } else {
            url.searchParams.append(key, value.toString());
          }
        }
      });
      const res = await fetch(url.toString(), { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch students");
      return res.json();
    },
    enabled: enabled !== false,
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useStudent(id: string) {
  return useQuery({
    queryKey: [api.students.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.students.get.path, { id });
      const res = await fetch(url, { credentials: "include", headers: getAuthHeaders() });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch student");
      return api.students.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useCreateStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.students.create.input>) => {
      const res = await fetch(api.students.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create student");
      return api.students.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.students.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/students/customer-learning-status-summary"] });
    },
  });
}

export function useUpdateStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & z.infer<typeof api.students.update.input>) => {
      const url = buildUrl(api.students.update.path, { id });
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update student");
      return api.students.update.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.students.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.students.get.path, data.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/students/customer-learning-status-summary"] });
    },
  });
}

export function useDeleteStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const url = buildUrl(api.students.delete.path, { id });
      const res = await fetch(url, {
        method: "DELETE",
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const error = new Error(body?.message || "Không thể xóa học viên");
        Object.assign(error, {
          code: body?.code,
          classes: body?.classes,
        });
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.students.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/students/customer-learning-status-summary"] });
    },
  });
}
