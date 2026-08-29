import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/queryClient";

export type ResourcePermission = {
  canView: boolean;
  canViewAll: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export type MyPermissionsResult = {
  isSuperAdmin: boolean;
  isStudent: boolean;
  departmentNames: string[];
  systemDepartmentNames: string[];
  permissions: Record<string, ResourcePermission>;
  staffId: string | null;
  userId: string | null;
  locationIds: string[];
};

export function useMyPermissions() {
  const token = getAuthHeaders();
  return useQuery<MyPermissionsResult | null>({
    queryKey: ["/api/my-permissions"],
    queryFn: async () => {
      const res = await fetch("/api/my-permissions", {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.status === 401 || res.status === 403) return null;
      if (!res.ok) throw new Error("Failed to fetch permissions");
      return res.json();
    },
    enabled: Object.keys(token).length > 0,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });
}

export function canAccessItem(
  data: MyPermissionsResult | undefined,
  href: string
): boolean {
  if (!data) return false;
  if (data.isSuperAdmin) return true;
  const perm = data.permissions[href];
  if (!perm) return false;
  return perm.canView || perm.canViewAll;
}
