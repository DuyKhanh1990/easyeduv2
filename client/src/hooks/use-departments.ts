import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { z } from "zod";
import { STATIC_STALE_TIME, getAuthHeaders } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

async function handleResponse(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || "Thao tác thất bại.");
  }
  return res;
}

export function useDepartments() {
  return useQuery({
    queryKey: [api.departments.list.path],
    queryFn: async () => {
      const res = await fetch(api.departments.list.path, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch departments");
      return api.departments.list.responses[200].parse(await res.json());
    },
    staleTime: STATIC_STALE_TIME,
  });
}

export function useCreateDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.departments.create.input>) => {
      const res = await fetch(api.departments.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(data),
        credentials: "include",
      });
      await handleResponse(res);
      return api.departments.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.departments.list.path] });
    },
  });
}

export function useUpdateDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: z.infer<typeof api.departments.update.input> }) => {
      const res = await fetch(api.departments.update.path.replace(":id", id), {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(data),
        credentials: "include",
      });
      await handleResponse(res);
      return api.departments.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.departments.list.path] });
    },
  });
}

export function useDeleteDepartment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(api.departments.delete.path.replace(":id", id), {
        method: "DELETE",
        headers: getAuthHeaders(),
        credentials: "include",
      });
      await handleResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.departments.list.path] });
    },
    onError: (err: Error) => {
      toast({ title: "Không thể xóa phòng ban", description: err.message, variant: "destructive" });
    },
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.roles.create.input>) => {
      const res = await fetch(api.roles.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(data),
        credentials: "include",
      });
      await handleResponse(res);
      return api.roles.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.departments.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-permissions"] });
    },
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: z.infer<typeof api.roles.update.input> }) => {
      const res = await fetch(api.roles.update.path.replace(":id", id), {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(data),
        credentials: "include",
      });
      await handleResponse(res);
      return api.roles.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.departments.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-permissions"] });
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(api.roles.delete.path.replace(":id", id), {
        method: "DELETE",
        headers: getAuthHeaders(),
        credentials: "include",
      });
      await handleResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.departments.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-permissions"] });
    },
    onError: (err: Error) => {
      toast({ title: "Không thể xóa vai trò", description: err.message, variant: "destructive" });
    },
  });
}
