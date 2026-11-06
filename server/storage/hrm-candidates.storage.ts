import { asc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  hrmCandidateCodeSequences,
  hrmCandidates,
  type InsertHrmCandidate,
} from "@shared/schema";
import { deletePortalUploadFromUrl } from "../lib/s3";

export async function listHrmCandidates() {
  return db.select().from(hrmCandidates).orderBy(asc(hrmCandidates.createdAt));
}

export async function createHrmCandidate(input: Omit<InsertHrmCandidate, "id" | "code" | "createdAt" | "updatedAt">) {
  return db.transaction(async (tx) => {
    const [sequence] = await tx.insert(hrmCandidateCodeSequences)
      .values({ key: "candidates", currentValue: 1 })
      .onConflictDoUpdate({
        target: hrmCandidateCodeSequences.key,
        set: { currentValue: sql`${hrmCandidateCodeSequences.currentValue} + 1` },
      })
      .returning({ currentValue: hrmCandidateCodeSequences.currentValue });
    const code = `UV-${String(sequence.currentValue).padStart(2, "0")}`;
    const [candidate] = await tx.insert(hrmCandidates).values({ ...input, code }).returning();
    return candidate;
  });
}

export async function updateHrmCandidate(
  id: string,
  updates: Partial<Omit<InsertHrmCandidate, "id" | "code" | "createdAt" | "updatedAt">>,
) {
  const [candidate] = await db.update(hrmCandidates)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(hrmCandidates.id, id))
    .returning();
  return candidate ?? null;
}

export async function deleteHrmCandidate(id: string) {
  const [existing] = await db.select().from(hrmCandidates).where(eq(hrmCandidates.id, id));
  if (!existing) return null;

  const results = await Promise.allSettled(
    (existing.files ?? []).map((file) => deletePortalUploadFromUrl(file.url)),
  );
  if (results.some((result) => result.status === "rejected")) {
    throw new Error("Không thể xóa toàn bộ tệp đính kèm trên S3; hồ sơ vẫn được giữ lại.");
  }

  const [candidate] = await db.delete(hrmCandidates)
    .where(eq(hrmCandidates.id, id))
    .returning({ id: hrmCandidates.id });
  return candidate ?? null;
}
