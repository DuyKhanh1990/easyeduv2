import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/queryClient";

export interface ClassesPage {
  data: any[];
  total: number;
  page: number;
  pageSize: number;
}

export function useClasses(locationId?: string, options?: { enabled?: boolean; minimal?: boolean; view?: "list"; page?: number; pageSize?: number; search?: string; status?: string }) {
  const viewKey = options?.minimal ? "minimal" : (options?.view ?? undefined);

  return useQuery<any>({
    queryKey: ["/api/classes", locationId, viewKey, options?.page, options?.pageSize, options?.search, options?.status],
    queryFn: async () => {
      const url = new URL("/api/classes", window.location.origin);
      if (locationId && locationId !== "all") {
        url.searchParams.append("locationId", locationId);
      }
      if (options?.minimal) {
        url.searchParams.append("minimal", "true");
      } else if (options?.view) {
        url.searchParams.append("view", options.view);
        if (options.page != null) url.searchParams.append("page", String(options.page));
        if (options.pageSize != null) url.searchParams.append("pageSize", String(options.pageSize));
        if (options.search) url.searchParams.append("search", options.search);
        if (options.status) url.searchParams.append("status", options.status);
      }
      const res = await fetch(url.toString(), { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch classes");
      return res.json();
    },
    enabled: options?.enabled !== undefined ? options.enabled : true,
  });
}

export function useClass(id: string) {
  return useQuery({
    queryKey: ["/api/classes", id],
    queryFn: async () => {
      const res = await fetch(`/api/classes/${id}`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch class");
      return res.json();
    },
    enabled: !!id,
  });
}
