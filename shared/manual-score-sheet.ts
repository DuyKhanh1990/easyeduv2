import { z } from "zod";
import { scoreSheetAssessmentAttemptValuesSchema } from "./score-sheet-assessment-scoring";

export const manualScoreSheetPayloadSchema = z.object({
  templateId: z.string().uuid(),
  selectionMode: z.enum(["class", "students"]),
  classId: z.string().uuid().nullable(),
  studentIds: z.array(z.string().uuid()).min(1).max(500),
  scoresByStudent: z.record(
    z.string().uuid(),
    scoreSheetAssessmentAttemptValuesSchema,
  ).default({}),
}).strict().superRefine((payload, context) => {
  if (new Set(payload.studentIds).size !== payload.studentIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Học viên bị trùng trong bảng điểm.",
      path: ["studentIds"],
    });
  }
  if (payload.selectionMode === "class" && !payload.classId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Chọn lớp trước khi tạo bảng điểm.",
      path: ["classId"],
    });
  }
  if (payload.selectionMode === "students" && payload.classId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Không chọn lớp khi nhập học viên riêng lẻ.",
      path: ["classId"],
    });
  }
  const selectedIds = new Set(payload.studentIds);
  if (Object.keys(payload.scoresByStudent).some((studentId) => !selectedIds.has(studentId))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Có điểm thuộc học viên không nằm trong danh sách đã chọn.",
      path: ["scoresByStudent"],
    });
  }
});

export type ManualScoreSheetPayload = z.infer<typeof manualScoreSheetPayloadSchema>;
