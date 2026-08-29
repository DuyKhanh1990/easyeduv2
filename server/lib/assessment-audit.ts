import { createAssessmentAuditLog } from "../storage/assessment-audit-log.storage";
import type { InsertAssessmentAuditLog } from "@shared/schema";

type AssessmentAuditData = Omit<InsertAssessmentAuditLog, "userId">;

export async function recordAssessmentAudit(
  req: any,
  data: AssessmentAuditData,
): Promise<void> {
  try {
    await createAssessmentAuditLog({
      ...data,
      userId: req.user?.id ?? null,
      oldContent: data.oldContent ?? null,
      newContent: data.newContent ?? null,
    });
  } catch (error) {
    // Audit failures must never turn a successful assessment mutation into an error.
    console.error("[assessment-audit] failed to record:", error);
  }
}