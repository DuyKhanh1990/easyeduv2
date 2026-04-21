import { useQuery } from "@tanstack/react-query";

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
  permissions: Record<string, ResourcePermission>;
  staffId: string | null;
  userId: string | null;
  locationIds: string[];
};

export function useMyPermissions() {
  return useQuery<MyPermissionsResult>({
    queryKey: ["/api/my-permissions"],
    queryFn: async () => {
      const res = await fetch("/api/my-permissions", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch permissions");
      return res.json();
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
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
