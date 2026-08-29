import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // JS/CSS/images có content-hash trong tên file (do Vite tạo) → cache 1 năm
  // Khi build mới, tên file thay đổi → browser tự download lại, không bao giờ dùng cache cũ
  app.use(express.static(distPath, {
    maxAge: "1y",
    immutable: true,
  }));

  // index.html KHÔNG có hash trong tên → phải no-cache
  // Browser hỏi server mỗi lần, server trả 304 Not Modified nếu không đổi (nhanh, không tốn băng thông)
  // Khi deploy mới, server trả index.html mới → browser load bundle mới ngay lập tức
  app.use("/{*path}", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
