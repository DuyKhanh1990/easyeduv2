import express from "express";
import request from "supertest";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const videoBytes = Buffer.from("0123456789");
let upstreamServer: Server;
let upstreamUrl = "";
let registerUploadRoutes: (app: express.Express) => void;
let originalS3Hostname: string | undefined;

beforeAll(async () => {
  originalS3Hostname = process.env.S3_HOSTNAME;
  process.env.S3_HOSTNAME = "127.0.0.1";
  ({ registerUploadRoutes } = await import("../server/routes/upload.routes"));

  upstreamServer = createServer((req, res) => {
    const range = req.headers.range;
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", "video/mp4");

    if (range === "bytes=2-5") {
      const chunk = videoBytes.subarray(2, 6);
      res.writeHead(206, {
        "Content-Length": chunk.length,
        "Content-Range": `bytes 2-5/${videoBytes.length}`,
      });
      res.end(req.method === "HEAD" ? undefined : chunk);
      return;
    }

    res.writeHead(200, { "Content-Length": videoBytes.length });
    res.end(req.method === "HEAD" ? undefined : videoBytes);
  });

  await new Promise<void>((resolve) => upstreamServer.listen(0, "127.0.0.1", resolve));
  const address = upstreamServer.address();
  if (!address || typeof address === "string") throw new Error("Test server failed to bind");
  upstreamUrl = `http://127.0.0.1:${address.port}/bucket/video.mp4`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    upstreamServer.close((error) => error ? reject(error) : resolve());
  });

  if (originalS3Hostname === undefined) delete process.env.S3_HOSTNAME;
  else process.env.S3_HOSTNAME = originalS3Hostname;
});

function createApp() {
  const app = express();
  registerUploadRoutes(app);
  return app;
}

describe("S3 media proxy byte ranges", () => {
  it("passes Range through and relays partial-content headers and bytes", async () => {
    const response = await request(createApp())
      .get("/api/media/proxy")
      .query({ url: upstreamUrl })
      .set("Range", "bytes=2-5");

    expect(response.status).toBe(206);
    expect(response.headers["accept-ranges"]).toBe("bytes");
    expect(response.headers["content-range"]).toBe("bytes 2-5/10");
    expect(response.headers["content-length"]).toBe("4");
    expect(response.headers["content-type"]).toBe("video/mp4");
    expect(response.body).toEqual(videoBytes.subarray(2, 6));
  });

  it("keeps ordinary full-file requests working for existing media", async () => {
    const response = await request(createApp())
      .get("/api/media/proxy")
      .query({ url: upstreamUrl });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("video/mp4");
    expect(response.body).toEqual(videoBytes);
  });

  it("supports HEAD metadata requests without returning a body", async () => {
    const response = await request(createApp())
      .head("/api/media/proxy")
      .query({ url: upstreamUrl })
      .set("Range", "bytes=2-5");

    expect(response.status).toBe(206);
    expect(response.headers["content-range"]).toBe("bytes 2-5/10");
    expect(response.headers["content-length"]).toBe("4");
    expect(Object.keys(response.body)).toHaveLength(0);
  });
});
