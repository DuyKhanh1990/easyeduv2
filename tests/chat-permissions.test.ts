import { describe, expect, it } from "vitest";
import {
  canCreateChat,
  canCreateClassChat,
  canEditChatMessage,
  canRemoveChatMember,
  canViewConversation,
  hasChatViewScope,
  type ChatPermissionFlags,
} from "../shared/chat-permissions";

const permissions = (overrides: Partial<ChatPermissionFlags> = {}): ChatPermissionFlags => ({
  canView: false,
  canViewAll: false,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  ...overrides,
});

describe("Chat permission model", () => {
  it("limits View to conversations the staff member belongs to", () => {
    const view = permissions({ canView: true });
    expect(hasChatViewScope(view)).toBe(true);
    expect(canViewConversation(view, true)).toBe(true);
    expect(canViewConversation(view, false)).toBe(false);
  });

  it("lets View all see non-member conversations", () => {
    const viewAll = permissions({ canViewAll: true });
    expect(canViewConversation(viewAll, false)).toBe(true);
  });

  it("requires a view scope along with Create", () => {
    expect(canCreateChat(permissions({ canCreate: true }))).toBe(false);
    expect(canCreateChat(permissions({ canView: true, canCreate: true }))).toBe(true);
    expect(canCreateChat(permissions({ canViewAll: true, canCreate: true }))).toBe(true);
  });

  it("limits View-only class creation to assigned classes and allowed locations", () => {
    const viewAndCreate = permissions({ canView: true, canCreate: true });
    expect(canCreateClassChat(viewAndCreate, {
      isStudent: false, isSuperAdmin: false, locationAllowed: true, assignedToClass: true,
    })).toBe(true);
    expect(canCreateClassChat(viewAndCreate, {
      isStudent: false, isSuperAdmin: false, locationAllowed: true, assignedToClass: false,
    })).toBe(false);
    expect(canCreateClassChat(viewAndCreate, {
      isStudent: false, isSuperAdmin: false, locationAllowed: false, assignedToClass: true,
    })).toBe(false);
  });

  it("lets View all create from any class in an allowed location, but never for students", () => {
    const viewAllAndCreate = permissions({ canViewAll: true, canCreate: true });
    expect(canCreateClassChat(viewAllAndCreate, {
      isStudent: false, isSuperAdmin: false, locationAllowed: true, assignedToClass: false,
    })).toBe(true);
    expect(canCreateClassChat(viewAllAndCreate, {
      isStudent: true, isSuperAdmin: false, locationAllowed: true, assignedToClass: true,
    })).toBe(false);
  });

  it("allows deleting members only with Delete and a view scope", () => {
    expect(canRemoveChatMember(permissions({ canDelete: true }))).toBe(false);
    expect(canRemoveChatMember(permissions({ canView: true, canDelete: true }))).toBe(true);
  });

  it("allows editing only one's own messages when Edit is granted", () => {
    const edit = permissions({ canEdit: true });
    expect(canEditChatMessage(edit, true)).toBe(true);
    expect(canEditChatMessage(edit, false)).toBe(false);
    expect(canEditChatMessage(permissions({ canView: true }), true)).toBe(false);
  });
});
