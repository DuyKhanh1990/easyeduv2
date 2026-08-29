/**
 * chat-sync.ts
 *
 * Helpers to automatically sync newly-active students into custom chat groups
 * that are linked to their class via chatGroups.classId.
 *
 * These functions are fire-and-forget safe (they don't throw; errors are logged).
 */

import { db } from "../db";
import { students, users, chatGroups, chatGroupMembers, studentClasses } from "@shared/schema";
import { eq, and, inArray, isNotNull } from "drizzle-orm";

/**
 * Sync a list of students (students.id values) into every chat group
 * that has classId = the given classId.  Skips students already in the group.
 * Idempotent — safe to call multiple times; uses ON CONFLICT DO NOTHING.
 */
export async function syncStudentsToClassChatGroups(
  classId: string,
  studentIds: string[],
): Promise<void> {
  if (!studentIds.length) return;

  // Find all custom chat groups linked to this class
  const groups = await db
    .select({ id: chatGroups.id, tinodeTopicId: chatGroups.tinodeTopicId })
    .from(chatGroups)
    .where(eq(chatGroups.classId, classId));
  if (!groups.length) return;

  // Resolve student IDs → userId + tinodeUserId
  const studentRows = await db
    .select({
      studentId: students.id,
      userId: students.userId,
      tinodeUserId: users.tinodeUserId,
    })
    .from(students)
    .leftJoin(users, eq(students.userId, users.id))
    .where(and(inArray(students.id, studentIds), isNotNull(students.userId)));
  if (!studentRows.length) return;

  // Batch-fetch ALL existing memberships for all groups at once (avoids N+1)
  const groupIds = groups.map((g) => g.id);
  const existingRows = await db
    .select({ groupId: chatGroupMembers.groupId, userId: chatGroupMembers.userId })
    .from(chatGroupMembers)
    .where(inArray(chatGroupMembers.groupId, groupIds));
  const existingByGroup = new Map<string, Set<string>>();
  for (const r of existingRows) {
    if (!existingByGroup.has(r.groupId)) existingByGroup.set(r.groupId, new Set());
    existingByGroup.get(r.groupId)!.add(r.userId);
  }

  const { addMemberToTopic, ensureUserInTinode, isTinodeConfigured } = await import("./tinode.service");
  const tinodeOn = isTinodeConfigured();

  for (const group of groups) {
    const existingSet = existingByGroup.get(group.id) ?? new Set<string>();
    const newStudents = studentRows.filter((s) => s.userId && !existingSet.has(s.userId));
    if (!newStudents.length) continue;

    // Insert with ON CONFLICT DO NOTHING for DB-level dedup under concurrency
    await db
      .insert(chatGroupMembers)
      .values(newStudents.map((s) => ({ groupId: group.id, userId: s.userId! })))
      .onConflictDoNothing();

    // Add to Tinode topic
    if (group.tinodeTopicId && tinodeOn) {
      await Promise.allSettled(
        newStudents.map(async (s) => {
          try {
            let tinodeUid = s.tinodeUserId;
            if (!tinodeUid) {
              const result = await ensureUserInTinode(s.userId!);
              tinodeUid = result.tinodeUid;
              if (tinodeUid) {
                await db
                  .update(users)
                  .set({ tinodeUserId: tinodeUid } as any)
                  .where(eq(users.id, s.userId!));
              }
            }
            if (tinodeUid) await addMemberToTopic(group.tinodeTopicId!, tinodeUid);
          } catch (err) {
            console.error(`[ChatSync] Tinode add failed for user ${s.userId}:`, err);
          }
        }),
      );
    }
  }
}

/**
 * Sync ALL currently-active students of a class into its linked chat groups.
 * Used after scheduleClassStudents which bulk-activates students at once.
 */
export async function syncAllActiveStudentsToChatGroups(classId: string): Promise<void> {
  const activeRows = await db
    .select({ studentId: studentClasses.studentId })
    .from(studentClasses)
    .where(and(eq(studentClasses.classId, classId), eq(studentClasses.status, "active")));
  if (!activeRows.length) return;
  await syncStudentsToClassChatGroups(classId, activeRows.map((r) => r.studentId));
}
