import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { parseScoreConversionTemplatesJson } from "@shared/score-conversion";
import { scoreSheetAssessmentSchema } from "@shared/score-sheet-assessment";
import { scoreSheetTemplateSchema } from "@shared/score-sheet-template";

const SCORE_CONVERSION_SETTINGS_KEY = "scoreConversionTemplates";
const SCORE_SHEET_TEMPLATE_SETTINGS_KEY = "scoreSheetTemplates";
const SCORE_SHEET_ASSESSMENTS_SETTINGS_KEY = "scoreSheetAssessments";

export async function createScoreSheetAssessmentForTemplate(options: {
  templateId: string;
  reuseAssessmentId: string | null;
  classCode: string;
  fromSessionIndex: number;
  toSessionIndex: number;
}) {
  const { systemSettings } = await import("@shared/schema");
  return db.transaction(async (tx) => {
    await tx.insert(systemSettings)
      .values({ key: SCORE_SHEET_ASSESSMENTS_SETTINGS_KEY, value: "[]" })
      .onConflictDoNothing();

    const [assessmentsRow] = await tx
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, SCORE_SHEET_ASSESSMENTS_SETTINGS_KEY))
      .for("update")
      .limit(1);
    if (!assessmentsRow) throw new Error("Không thể tải danh sách bảng điểm.");

    const assessments = z.array(scoreSheetAssessmentSchema).parse(JSON.parse(assessmentsRow.value));
    const reusableAssessment = options.reuseAssessmentId
      ? assessments.find((assessment) =>
        assessment.id === options.reuseAssessmentId
        && assessment.scoreSheetTemplateId === options.templateId)
      : undefined;
    if (reusableAssessment) return reusableAssessment;

    const [templatesRow] = await tx
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, SCORE_SHEET_TEMPLATE_SETTINGS_KEY))
      .limit(1);
    const templates = templatesRow
      ? z.array(scoreSheetTemplateSchema).parse(JSON.parse(templatesRow.value))
      : [];
    const template = templates.find((item) => item.id === options.templateId);
    if (!template) {
      const error: any = new Error("Không tìm thấy bảng điểm mẫu đã chọn.");
      error.status = 404;
      throw error;
    }

    let conversionTemplateSnapshot = null;
    if (template.scoreConversionTemplateId) {
      const [conversionRow] = await tx
        .select({ value: systemSettings.value })
        .from(systemSettings)
        .where(eq(systemSettings.key, SCORE_CONVERSION_SETTINGS_KEY))
        .limit(1);
      conversionTemplateSnapshot = conversionRow
        ? parseScoreConversionTemplatesJson(conversionRow.value)
          .find((item) => item.id === template.scoreConversionTemplateId) ?? null
        : null;
      if (!conversionTemplateSnapshot) {
        const error: any = new Error("Không tìm thấy bảng quy đổi của bảng điểm mẫu.");
        error.status = 409;
        throw error;
      }
    }

    const classToken = options.classCode
      .toLocaleUpperCase()
      .replace(/[^A-Z0-9]+/g, "")
      .slice(0, 8) || "CLASS";
    const suffixBase = `-${classToken}-S${options.fromSessionIndex}-${options.toSessionIndex}`;
    let code = "";
    for (let sequence = 1; sequence <= 1000; sequence += 1) {
      const suffix = `${suffixBase}${sequence === 1 ? "" : `-${sequence}`}`;
      const prefixLength = Math.max(0, 40 - suffix.length);
      const candidate = `${template.code.toLocaleUpperCase().slice(0, prefixLength)}${suffix}`;
      if (!assessments.some((assessment) =>
        assessment.code.toLocaleLowerCase() === candidate.toLocaleLowerCase())) {
        code = candidate;
        break;
      }
    }
    if (!code) throw new Error("Không thể tạo mã duy nhất cho bảng điểm áp dụng.");

    const now = new Date().toISOString();
    const assessment = scoreSheetAssessmentSchema.parse({
      id: randomUUID(),
      code,
      name: template.name,
      scoreSheetTemplateId: template.id,
      scoreDeadlineAt: null,
      attemptCount: template.attemptCount,
      scoringPolicy: template.scoringPolicy,
      templateSnapshot: template,
      conversionTemplateSnapshot,
      createdAt: now,
      updatedAt: now,
    });
    await tx.update(systemSettings)
      .set({
        value: JSON.stringify([assessment, ...assessments]),
        updatedAt: new Date(),
      })
      .where(eq(systemSettings.key, SCORE_SHEET_ASSESSMENTS_SETTINGS_KEY));
    return assessment;
  });
}