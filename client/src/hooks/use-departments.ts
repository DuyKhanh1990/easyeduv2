import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { z } from "zod";

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
      const res = await fetch(api.departments.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch departments");
      return api.departments.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.departments.create.input>) => {
      const res = await fetch(api.departments.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(api.departments.delete.path.replace(":id", id), {
        method: "DELETE",
        credentials: "include",
      });
      await handleResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.departments.list.path] });
    },
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.roles.create.input>) => {
      const res = await fetch(api.roles.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      await handleResponse(res);
      return api.roles.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.departments.list.path] });
    },
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: z.infer<typeof api.roles.update.input> }) => {
      const res = await fetch(api.roles.update.path.replace(":id", id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      await handleResponse(res);
      return api.roles.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.departments.list.path] });
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(api.roles.delete.path.replace(":id", id), {
        method: "DELETE",
        credentials: "include",
      });
      await handleResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.departments.list.path] });
    },
  });
}
