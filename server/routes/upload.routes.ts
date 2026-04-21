import type { Express } from "express";
import multer from "multer";
import { uploadFileToS3 } from "../lib/s3";

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
});

export function registerUploadRoutes(app: Express) {
  app.post("/api/upload", upload.array("files"), async (req, res) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    try {
      const results = await Promise.all(
        files.map(async (f) => {
          const url = await uploadFileToS3(f.buffer, f.originalname, f.mimetype);
          return {
            name: f.originalname,
            url,
            size: f.size,
            mimetype: f.mimetype,
          };
        })
      );
      res.json({ files: results });
    } catch (err) {
      console.error("[S3 Upload Error]", err);
      res.status(500).json({ error: "Failed to upload file to S3" });
    }
  });
}
