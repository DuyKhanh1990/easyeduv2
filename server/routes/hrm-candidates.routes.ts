import type { Express } from "express";
import { z } from "zod";
import { createHrmCandidate, deleteHrmCandidate, listHrmCandidates, updateHrmCandidate } from "../storage/hrm-candidates.storage";

const fileSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(255),
  url: z.string().url().refine((url) => url.startsWith("https://"), "URL tệp không hợp lệ"),
});
const scoresSchema = z.object({
  expertise: z.string().max(10),
  experience: z.string().max(10),
  communication: z.string().max(10),
  attitude: z.string().max(10),
});
const candidateFields = {
  name: z.string().trim().min(1).max(255),
  position: z.string().trim().min(1).max(255),
  phone: z.string().trim().max(60),
  email: z.string().trim().max(254),
  address: z.string().trim().max(4000),
  interviewMode: z.enum(["offline", "online"]),
  skills: z.string().max(10000),
  result: z.enum(["", "interviewed", "pass", "fail"]),
  interviewScheduledAt: z.string().max(40).nullable().optional(),
  evaluation: z.string().max(20000),
  files: z.array(fileSchema).max(30),
  scores: scoresSchema,
};
const createSchema = z.object(candidateFields);
const updateSchema = createSchema.partial().refine((data) => Object.keys(data).length > 0);

export function registerHrmCandidateRoutes(app: Express) {
  app.get("/api/hrm/candidates", async (_req, res) => {
    try {
      res.json({ candidates: await listHrmCandidates() });
    } catch (error) {
      console.error("[HRM Candidates] list failed", error);
      res.status(500).json({ message: "Không thể tải danh sách ứng viên." });
    }
  });

  app.post("/api/hrm/candidates", async (req, res) => {
    try {
      const candidate = await createHrmCandidate(createSchema.parse(req.body));
      res.status(201).json(candidate);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Thông tin ứng viên chưa hợp lệ." });
      console.error("[HRM Candidates] create failed", error);
      res.status(500).json({ message: "Không thể lưu ứng viên." });
    }
  });

  app.patch("/api/hrm/candidates/:id", async (req, res) => {
    try {
      const updates = updateSchema.parse(req.body);
      const candidate = await updateHrmCandidate(String(req.params.id), updates);
      if (!candidate) return res.status(404).json({ message: "Không tìm thấy ứng viên." });
      res.json(candidate);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Thông tin cập nhật chưa hợp lệ." });
      console.error("[HRM Candidates] update failed", error);
      res.status(500).json({ message: "Không thể cập nhật ứng viên." });
    }
  });

  app.delete("/api/hrm/candidates/:id", async (req, res) => {
    try {
      const candidate = await deleteHrmCandidate(String(req.params.id));
      if (!candidate) return res.status(404).json({ message: "Không tìm thấy ứng viên." });
      res.json({ ok: true });
    } catch (error) {
      console.error("[HRM Candidates] delete failed", error);
      res.status(500).json({ message: "Không thể xóa ứng viên." });
    }
  });
}
