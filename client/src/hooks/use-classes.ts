import { useQuery } from "@tanstack/react-query";

export function useClasses(locationId?: string, options?: { enabled?: boolean; minimal?: boolean; view?: "list" }) {
  const viewKey = options?.minimal ? "minimal" : (options?.view ?? undefined);

  return useQuery({
    queryKey: ["/api/classes", locationId, viewKey],
    queryFn: async () => {
      const url = new URL("/api/classes", window.location.origin);
      if (locationId && locationId !== "all") {
        url.searchParams.append("locationId", locationId);
      }
      if (options?.minimal) {
        url.searchParams.append("minimal", "true");
      } else if (options?.view) {
        url.searchParams.append("view", options.view);
      }
      const res = await fetch(url.toString(), { credentials: "include" });
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
      const res = await fetch(`/api/classes/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch class");
      return res.json();
    },
    enabled: !!id,
  });
}
