import type { Express, Request } from "express";
import multer from "multer";
import fs from "node:fs";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { insertStaffContractSchema, staffContracts, staff } from "@shared/schema";
import { downloadPrivateStaffContractFile, uploadPrivateStaffContractFile } from "../lib/s3";

const contractUpload = multer({
  dest: "/tmp",
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
});

const contractPayloadSchema = insertStaffContractSchema.pick({
  staffId: true,
  code: true,
  name: true,
  contractType: true,
  durationMonths: true,
  startDate: true,
  workType: true,
  attachments: true,
}).extend({
  contractType: z.enum(["Thử việc", "Xác định thời hạn", "Không xác định thời hạn"]),
  durationMonths: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(6), z.literal(12), z.literal(18), z.literal(24), z.literal(36)]).nullable(),
  workType: z.enum(["Toàn thời gian", "Bán thời gian"]),
  code: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(255),
  attachments: z.array(z.object({ name: z.string().max(255), url: z.string().max(2048) })).max(30),
});

function calculateEndDate(startDate: string, months: number | null): string | null {
  if (!months) return null;
  const [year, month, day] = startDate.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay) - 1);
  return target.toISOString().slice(0, 10);
}

function getStaffId(req: Request): string {
  const value = req.params.staffId;
  return Array.isArray(value) ? value[0] ?? "" : value;
}

export function registerStaffContractRoutes(app: Express): void {
  app.post("/api/staff/:staffId/contracts/files", contractUpload.array("files", 10), async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const staffId = getStaffId(req);
    try {
      if (!staffId) return res.status(400).json({ message: "Thiếu mã nhân sự" });
      if (!files.length) return res.status(400).json({ message: "Chưa chọn tệp" });
      const [staffRow] = await db.select({ id: staff.id }).from(staff).where(eq(staff.id, staffId)).limit(1);
      if (!staffRow) return res.status(404).json({ message: "Không tìm thấy nhân sự" });
      const attachments = [];
      for (const file of files) {
        const name = Buffer.from(file.originalname, "latin1").toString("utf8");
        const key = await uploadPrivateStaffContractFile(file.path, staffId, name, file.mimetype);
        attachments.push({ name, url: key });
      }
      res.json({ files: attachments });
    } catch (error) {
      console.error("[Staff contracts] private file upload failed", error);
      res.status(500).json({ message: "Không thể tải tệp hồ sơ lên" });
    } finally {
      for (const file of files) fs.unlink(file.path, () => {});
    }
  });

  app.get("/api/staff/:staffId/contracts/file", async (req, res) => {
    try {
      const staffId = getStaffId(req);
      if (!staffId) return res.sendStatus(400);
      const key = typeof req.query.key === "string" ? req.query.key : "";
      const rows = await db.select().from(staffContracts).where(eq(staffContracts.staffId, staffId));
      const attachment = rows.flatMap((row) => row.attachments ?? []).find((item) => item.url === key);
      if (!attachment) return res.sendStatus(404);
      const file = await downloadPrivateStaffContractFile(key, staffId);
      const safeName = attachment.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      res.setHeader("Content-Type", file.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(attachment.name)}`);
      res.setHeader("Cache-Control", "private, no-store");
      res.send(file.body);
    } catch (error) {
      console.error("[Staff contracts] private file download failed", error);
      res.status(404).json({ message: "Không tìm thấy tệp hồ sơ" });
    }
  });

  app.get("/api/staff/:staffId/contracts", async (req, res) => {
    try {
      const staffId = getStaffId(req);
      if (!staffId) return res.status(400).json({ message: "Thiếu mã nhân sự" });
      const rows = await db.select().from(staffContracts)
        .where(eq(staffContracts.staffId, staffId))
        .orderBy(desc(staffContracts.startDate), desc(staffContracts.createdAt));
      res.json(rows);
    } catch (error) {
      console.error("[Staff contracts] list failed", error);
      res.status(500).json({ message: "Không thể tải danh sách hợp đồng" });
    }
  });

  app.post("/api/staff/:staffId/contracts", async (req, res) => {
    try {
      const staffId = getStaffId(req);
      if (!staffId) return res.status(400).json({ message: "Thiếu mã nhân sự" });
      const parsed = contractPayloadSchema.parse({ ...req.body, staffId });
      const [staffRow] = await db.select({ id: staff.id }).from(staff).where(eq(staff.id, staffId)).limit(1);
      if (!staffRow) return res.status(404).json({ message: "Không tìm thấy nhân sự" });
      const [created] = await db.insert(staffContracts).values({
        ...parsed,
        endDate: calculateEndDate(parsed.startDate, parsed.durationMonths),
      }).returning();
      res.status(201).json(created);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Thông tin hợp đồng chưa hợp lệ", errors: error.errors });
      if ((error as any)?.code === "23505") return res.status(409).json({ message: "Mã hợp đồng đã tồn tại cho nhân sự này" });
      console.error("[Staff contracts] create failed", error);
      res.status(500).json({ message: "Không thể lưu hợp đồng" });
    }
  });
}
