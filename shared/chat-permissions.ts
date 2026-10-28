export type ChatPermissionFlags = {
  canView: boolean;
  canViewAll: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export function hasChatViewScope(permissions: ChatPermissionFlags): boolean {
  return permissions.canView || permissions.canViewAll;
}

export function canCreateChat(permissions: ChatPermissionFlags): boolean {
  return permissions.canCreate && hasChatViewScope(permissions);
}

export function canViewConversation(permissions: ChatPermissionFlags, isMember: boolean): boolean {
  return permissions.canViewAll || (permissions.canView && isMember);
}

export function canCreateClassChat(
  permissions: ChatPermissionFlags,
  scope: { isStudent: boolean; isSuperAdmin: boolean; locationAllowed: boolean; assignedToClass: boolean },
): boolean {
  if (scope.isStudent) return false;
  if (!canCreateChat(permissions)) return false;
  if (scope.isSuperAdmin) return true;
  if (!scope.locationAllowed) return false;
  return permissions.canViewAll || scope.assignedToClass;
}

export function canRemoveChatMember(permissions: ChatPermissionFlags, isSuperAdmin = false): boolean {
  return isSuperAdmin || (permissions.canDelete && hasChatViewScope(permissions));
}

export function canEditChatMessage(
  permissions: Pick<ChatPermissionFlags, "canEdit">,
  isOwnMessage: boolean,
  isSuperAdmin = false,
): boolean {
  return isOwnMessage && (isSuperAdmin || permissions.canEdit);
}
