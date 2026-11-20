import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/queryClient";

export function useFavicon() {
  const { data: locations } = useQuery<Array<{ id: string; isMain: boolean | null; logoUrl?: string | null }>>({
    queryKey: ["/api/locations"],
    queryFn: async () => {
      const res = await fetch("/api/locations", { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 1000 * 60 * 30,
    retry: false,
  });

  useEffect(() => {
    const mainLocation = locations?.find((l) => l.isMain);
    const logoUrl = mainLocation?.logoUrl;
    if (!logoUrl) return;

    const link =
      (document.querySelector("link[rel='icon']") as HTMLLinkElement | null) ??
      (() => {
        const el = document.createElement("link");
        el.rel = "icon";
        document.head.appendChild(el);
        return el;
      })();

    link.type = "";
    link.href = logoUrl;
  }, [locations]);
}
