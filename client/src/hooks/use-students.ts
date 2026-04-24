import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";
import type { StudentResponse } from "@shared/schema";

export function useStudents(params?: { 
  locationId?: string; 
  limit?: number; 
  offset?: number; 
  searchTerm?: string; 
  type?: string; 
  pipelineStage?: string;
  sources?: string[];
  rejectReasons?: string[];
  salesIds?: string[];
  managerIds?: string[];
  teacherIds?: string[];
  classIds?: string[];
  startDate?: string;
  endDate?: string;
  updatedFrom?: string;
  updatedTo?: string;
  accountStatuses?: string[];
  learningStatuses?: string[];
  birthdayFrom?: string;
  birthdayTo?: string;
}) {
  return useQuery<{ students: StudentResponse[]; total: number }>({
    queryKey: [api.students.list.path, params],
    queryFn: async () => {
      const url = new URL(api.students.list.path, window.location.origin);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== "all") {
            if (Array.isArray(value)) {
              value.forEach(v => url.searchParams.append(key, v.toString()));
            } else {
              url.searchParams.append(key, value.toString());
            }
          }
        });
      }
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch students");
      return res.json();
    },
  });
}

export function useStudent(id: string) {
  return useQuery({
    queryKey: [api.students.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.students.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch student");
      return api.students.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.students.create.input>) => {
      const res = await fetch(api.students.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create student");
      return api.students.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.students.list.path] });
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update student");
      return api.students.update.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.students.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.students.get.path, data.id] });
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
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete student");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.students.list.path] });
    },
  });
}
