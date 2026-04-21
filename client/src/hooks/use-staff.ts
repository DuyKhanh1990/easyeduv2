import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useStaff(locationId?: string, minimal?: boolean) {
  return useQuery({
    queryKey: [api.staff.list.path, locationId, minimal],
    queryFn: async () => {
      const url = new URL(api.staff.list.path, window.location.origin);
      if (locationId) url.searchParams.append("locationId", locationId);
      if (minimal) url.searchParams.append("minimal", "true");
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch staff");
      return res.json();
    },
  });
}
