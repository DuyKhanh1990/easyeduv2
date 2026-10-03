import { describe, expect, it } from "vitest";
import { mergeSelectedTeacherRoleIds } from "../server/storage/teacher-role-updates";

describe("mergeSelectedTeacherRoleIds", () => {
  it("keeps roles for retained teachers and drops roles for removed teachers", () => {
    expect(mergeSelectedTeacherRoleIds(
      { "teacher-a": "role-a", "teacher-removed": "role-old" },
      ["teacher-a", "teacher-b"],
    )).toEqual({ "teacher-a": "role-a" });
  });

  it("applies a chosen role to every updated session and clears a role when reset to default", () => {
    expect(mergeSelectedTeacherRoleIds(
      { "teacher-a": "old-role-a", "teacher-b": "old-role-b" },
      ["teacher-a", "teacher-b"],
      { "teacher-a": "new-role-a", "teacher-b": null },
    )).toEqual({ "teacher-a": "new-role-a" });
  });

  it("ignores invalid role map shapes and duplicate teacher IDs safely", () => {
    expect(mergeSelectedTeacherRoleIds(
      ["invalid"],
      ["teacher-a", "teacher-a"],
      {},
    )).toEqual({});
  });
});