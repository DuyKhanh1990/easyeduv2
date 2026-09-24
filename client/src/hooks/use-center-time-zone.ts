import { useQuery } from "@tanstack/react-query";
import { validateCenterTimeZone } from "@shared/center-time";

export function useCenterTimeZone() {
  return useQuery<string>({
    queryKey: ["/api/center-time-zone"],
    queryFn: async () => {
      const response = await fetch("/api/center-time-zone", { credentials: "include" });
      if (!response.ok) throw new Error("Không tải được múi giờ của trung tâm");
      const data = await response.json();
      return validateCenterTimeZone(data.timeZone);
    },
    staleTime: 5 * 60_000,
  });
}