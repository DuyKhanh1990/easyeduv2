import type { Express, Request } from "express";
import multer from "multer";
import fs from "node:fs";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { insertStaffProfileFileCategorySchema, staff, staffProfileFileCategories, staffProfileFileTypes } from "@shared/schema";
import { downloadPrivateStaffProfileFile, uploadPrivateStaffProfileFile } from "../lib/s3";

const profileFileUpload = multer({
  dest: "/tmp",
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
});

const categoryPayloadSchema = insertStaffProfileFileCategorySchema.pick({ staffId: true, name: true }).extend({
  name: z.string().trim().min(1).max(255),
});

function getStaffId(req: Request): string {
  const value = req.params.staffId;
  return Array.isArray(value) ? value[0] ?? "" : value;
}

export function registerStaffProfileFileRoutes(app: Express): void {
  app.get("/api/staff/:staffId/profile-files/types", async (_req, res) => {
    try {
      const [savedTypes, existingCategories] = await Promise.all([
        db.select({ name: staffProfileFileTypes.name }).from(staffProfileFileTypes),
        db.select({ name: staffProfileFileCategories.name }).from(staffProfileFileCategories),
      ]);
      const names = [...new Set([...savedTypes, ...existingCategories].map((item) => item.name.trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "vi"));
      res.json(names);
    } catch (error) {
      console.error("[Staff profile files] shared type list failed", error);
      res.status(500).json({ message: "Không thể tải tên danh mục dùng chung" });
    }
  });

  app.get("/api/staff/:staffId/profile-files/categories", async (req, res) => {
    try {
      const staffId = getStaffId(req);
      if (!staffId) return res.status(400).json({ message: "Thiếu mã nhân sự" });
      const categories = await db.select().from(staffProfileFileCategories)
        .where(eq(staffProfileFileCategories.staffId, staffId))
        .orderBy(desc(staffProfileFileCategories.createdAt));
      res.json(categories);
    } catch (error) {
      console.error("[Staff profile files] category list failed", error);
      res.status(500).json({ message: "Không thể tải danh mục hồ sơ" });
    }
  });

  app.post("/api/staff/:staffId/profile-files/categories", async (req, res) => {
    try {
      const staffId = getStaffId(req);
      if (!staffId) return res.status(400).json({ message: "Thiếu mã nhân sự" });
      const parsed = categoryPayloadSchema.parse({ ...req.body, staffId });
      const [staffRow] = await db.select({ id: staff.id }).from(staff).where(eq(staff.id, staffId)).limit(1);
      if (!staffRow) return res.status(404).json({ message: "Không tìm thấy nhân sự" });
      await db.insert(staffProfileFileTypes).values({ name: parsed.name }).onConflictDoNothing();
      const [category] = await db.insert(staffProfileFileCategories).values(parsed).returning();
      res.status(201).json(category);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Tên danh mục chưa hợp lệ", errors: error.errors });
      if ((error as any)?.code === "23505") return res.status(409).json({ message: "Tên danh mục đã tồn tại" });
      console.error("[Staff profile files] category create failed", error);
      res.status(500).json({ message: "Không thể tạo danh mục hồ sơ" });
    }
  });

  app.post("/api/staff/:staffId/profile-files/categories/:categoryId/files", profileFileUpload.array("files", 10), async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    try {
      const staffId = getStaffId(req);
      const categoryId = typeof req.params.categoryId === "string" ? req.params.categoryId : "";
      if (!staffId || !categoryId) return res.status(400).json({ message: "Thiếu thông tin nhân sự hoặc danh mục" });
      if (!files.length) return res.status(400).json({ message: "Chưa chọn tệp" });
      const [category] = await db.select().from(staffProfileFileCategories)
        .where(eq(staffProfileFileCategories.id, categoryId)).limit(1);
      if (!category || category.staffId !== staffId) return res.status(404).json({ message: "Không tìm thấy danh mục hồ sơ" });

      const uploadedFiles = [];
      for (const file of files) {
        const name = Buffer.from(file.originalname, "latin1").toString("utf8");
        const url = await uploadPrivateStaffProfileFile(file.path, staffId, name, file.mimetype);
        uploadedFiles.push({ name, url });
      }
      await db.update(staffProfileFileCategories)
        .set({
          attachments: sql`${staffProfileFileCategories.attachments} || ${JSON.stringify(uploadedFiles)}::jsonb`,
          updatedAt: new Date(),
        })
        .where(eq(staffProfileFileCategories.id, categoryId));
      res.json({ files: uploadedFiles });
    } catch (error) {
      console.error("[Staff profile files] upload failed", error);
      res.status(500).json({ message: "Không thể tải tệp hồ sơ lên" });
    } finally {
      for (const file of files) fs.unlink(file.path, () => {});
    }
  });

  app.get("/api/staff/:staffId/profile-files/file", async (req, res) => {
    try {
      const staffId = getStaffId(req);
      if (!staffId) return res.sendStatus(400);
      const key = typeof req.query.key === "string" ? req.query.key : "";
      const categories = await db.select().from(staffProfileFileCategories)
        .where(eq(staffProfileFileCategories.staffId, staffId));
      const attachment = categories.flatMap((category) => category.attachments ?? []).find((file) => file.url === key);
      if (!attachment) return res.sendStatus(404);
      const file = await downloadPrivateStaffProfileFile(key, staffId);
      const safeName = attachment.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      res.setHeader("Content-Type", file.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(attachment.name)}`);
      res.setHeader("Cache-Control", "private, no-store");
      res.send(file.body);
    } catch (error) {
      console.error("[Staff profile files] file download failed", error);
      res.status(404).json({ message: "Không tìm thấy tệp hồ sơ" });
    }
  });
}
