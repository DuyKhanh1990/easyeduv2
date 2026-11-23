import type { Express } from "express";
import type { Request, Response } from "express";
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

function proxyMedia(req: Request, res: Response): void {
  const url = req.query.url as string;
  if (!url) {
    res.status(400).send("Missing url");
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    res.status(400).send("Invalid url");
    return;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    res.status(400).send("Invalid url protocol");
    return;
  }
  if (!parsed.hostname.includes(S3_HOSTNAME) && S3_HOSTNAME) {
    res.status(403).send("Forbidden");
    return;
  }

  const transport = parsed.protocol === "https:" ? https : http;
  const requestHeaders: Record<string, string> = {};
  for (const headerName of ["range", "if-range"] as const) {
    const headerValue = req.headers[headerName];
    if (typeof headerValue === "string") requestHeaders[headerName] = headerValue;
  }

  const upstreamReq = transport.request(
    parsed,
    { method: req.method === "HEAD" ? "HEAD" : "GET", headers: requestHeaders },
    (upstreamRes) => {
      res.status(upstreamRes.statusCode || 502);

      // Forward range and representation metadata so browsers can seek within
      // large video files without downloading the entire object first.
      for (const headerName of [
        "accept-ranges",
        "content-length",
        "content-range",
        "content-type",
        "etag",
        "last-modified",
      ]) {
        const headerValue = upstreamRes.headers[headerName];
        if (headerValue !== undefined) res.setHeader(headerName, headerValue);
      }
      if (!res.hasHeader("content-type")) {
        res.setHeader("content-type", "application/octet-stream");
      }
      if (!res.hasHeader("cache-control")) {
        res.setHeader("cache-control", "public, max-age=86400");
      }
      if (upstreamRes.statusCode === 206 && !res.hasHeader("accept-ranges")) {
        res.setHeader("accept-ranges", "bytes");
      }

      if (req.method === "HEAD") {
        upstreamRes.resume();
        res.end();
        return;
      }
      upstreamRes.pipe(res);
    },
  );

  const abortUpstream = () => {
    if (!upstreamReq.destroyed) upstreamReq.destroy();
  };
  res.once("close", abortUpstream);
  upstreamReq.once("error", (err) => {
    res.off("close", abortUpstream);
    console.error("[Media Proxy Error]", err);
    if (!res.headersSent) {
      res.status(502).send("Failed to fetch from S3");
    } else {
      res.destroy(err);
    }
  });
  upstreamReq.end();
}

export function registerUploadRoutes(app: Express) {
  /** Proxy S3 objects through the server so private buckets are accessible. */
  app.get("/api/media/proxy", proxyMedia);
  app.head("/api/media/proxy", proxyMedia);

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
