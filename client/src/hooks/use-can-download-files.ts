import { useMyPermissions } from "./use-my-permissions";

export const DOWNLOAD_FILES_RESOURCE = "download_files";

/**
 * Returns whether the current user has permission to download file attachments.
 * - SuperAdmin: always true
 * - Staff with no explicit permission record: true (permissive default)
 * - Student: false by default, true only if explicitly granted via Settings → Phân quyền
 */
export function useCanDownloadFiles(): boolean {
  const { data } = useMyPermissions();
  if (!data) return true;
  if (data.isSuperAdmin) return true;
  const perm = data.permissions[DOWNLOAD_FILES_RESOURCE];
  if (data.isStudent) {
    return !!(perm?.canView);
  }
  if (perm === undefined) return true;
  return perm.canView;
}

/**
 * Resolves final canDownload value:
 * - If the content has an explicit allowDownload setting, that overrides the role default.
 * - null/undefined means "use role default".
 */
export function resolveCanDownload(
  contentAllowDownload: boolean | null | undefined,
  roleDefault: boolean
): boolean {
  if (contentAllowDownload === null || contentAllowDownload === undefined) {
    return roleDefault;
  }
  return contentAllowDownload;
}
