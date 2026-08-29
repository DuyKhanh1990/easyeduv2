import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { getAuthHeaders } from "@/lib/queryClient";

export function useStaff(locationId?: string, minimal?: boolean, includeCurrentUser?: boolean) {
  return useQuery({
    queryKey: [api.staff.list.path, locationId, minimal, includeCurrentUser],
    queryFn: async () => {
      const url = new URL(api.staff.list.path, window.location.origin);
      if (locationId) url.searchParams.append("locationId", locationId);
      if (minimal) url.searchParams.append("minimal", "true");
      if (includeCurrentUser) url.searchParams.append("includeCurrentUser", "true");
      const res = await fetch(url.toString(), { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch staff");
      return res.json();
    },
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}
