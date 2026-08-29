import type { Express } from "express";
import multer from "multer";
import { uploadFileToS3FromDisk } from "../lib/s3";
import { addS3Bytes, recordFileUpload } from "../lib/storage-usage";
import https from "https";
import http from "http";
import fs from "fs";

// Dùng diskStorage để file ghi ra /tmp, tránh load vào RAM gây OOM với file lớn
const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, "/tmp"),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    cb(null, `upload_${Date.now()}_${safeName}`);
  },
});

const upload = multer({
  storage: diskStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
});

const S3_HOSTNAME = process.env.S3_HOSTNAME || "";

/**
 * Base URL cho mobile API — dùng CENTER_PUBLIC_URL nếu có, fallback về request host.
 * KHÔNG dùng cho /api/upload vì browser tự resolve relative URL đúng host.
 */
function getMobileBaseUrl(req: any): string {
  return (process.env.CENTER_PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
}
export { getMobileBaseUrl as getUploadBaseUrl };

export function registerUploadRoutes(app: Express) {
  /** Proxy S3 objects through the server so private buckets are accessible */
  app.get("/api/media/proxy", async (req, res) => {
    const url = req.query.url as string;
    if (!url) return res.status(400).send("Missing url");

    // Only allow proxying our own S3 bucket
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).send("Invalid url");
    }
    if (!parsed.hostname.includes(S3_HOSTNAME) && S3_HOSTNAME) {
      return res.status(403).send("Forbidden");
    }

    const transport = parsed.protocol === "https:" ? https : http;
    transport.get(url, (s3Res) => {
      res.set("Content-Type", s3Res.headers["content-type"] || "application/octet-stream");
      res.set("Cache-Control", "public, max-age=86400");
      s3Res.pipe(res);
    }).on("error", (err) => {
      console.error("[Media Proxy Error]", err);
      res.status(502).send("Failed to fetch from S3");
    });
  });

  app.post("/api/upload", upload.array("files"), async (req, res) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const results: any[] = [];
    try {
      for (const f of files) {
        const name = Buffer.from(f.originalname, "latin1").toString("utf8");
        const s3Url = await uploadFileToS3FromDisk(f.path, f.size, name, f.mimetype);
        // Trả về S3 URL trực tiếp để lưu vào DB nhất quán.
        // Web app dùng toProxyUrl() khi hiển thị; mobile app load thẳng S3 (public-read).
        results.push({ name, url: s3Url, size: f.size, mimetype: f.mimetype });
        // Cộng dồn dung lượng — không await để không làm chậm response
        addS3Bytes(f.size).catch(() => {});
        recordFileUpload(s3Url, f.size).catch(() => {});
      }
      res.json({ files: results });
    } catch (err) {
      console.error("[S3 Upload Error]", err);
      res.status(500).json({ error: "Failed to upload file to S3" });
    } finally {
      // Xoá tất cả file tạm trên disk sau khi xử lý xong
      for (const f of files) {
        fs.unlink(f.path, (e) => { if (e) console.warn("[Upload] cleanup tmp failed:", e.message); });
      }
    }
  });
}
