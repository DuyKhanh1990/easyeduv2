import { storage } from "../storage";

export type MySpaceAssignmentsWriteAction = "create" | "edit";

export async function hasMySpaceAssignmentsWritePermission(
  req: any,
  action: MySpaceAssignmentsWriteAction,
): Promise<boolean> {
  if (req.isSuperAdmin) return true;

  const permissions = await storage.getEffectivePermissions(
    req.roleIds ?? [],
    "/my-space/assignments",
  );
  return action === "create" ? permissions.canCreate : permissions.canEdit;
}