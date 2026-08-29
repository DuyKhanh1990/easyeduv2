import type { Express } from "express";
import { z } from "zod";
import { db } from "../db";
import { systemSettings } from "@shared/schema";
import { DEFAULT_CUSTOMER_GUIDE, type CustomerGuide } from "@shared/customer-guide";
import { eq } from "drizzle-orm";

const GUIDE_SETTING_KEY = "customerGuide";
const PAGE_GUIDE_SETTING_PREFIX = "pageGuide:";
const CUSTOMER_GUIDE_MASTER_HOST = "easyeduv2.easyedu.vn";
const CUSTOMER_GUIDE_MASTER_URL = `https://${CUSTOMER_GUIDE_MASTER_HOST}`;
const pageGuidePathSchema = z.string().trim().regex(/^\/[A-Za-z0-9/_-]*$/).max(80);

const guideSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(1000),
  groups: z.array(z.object({
    id: z.string().min(1).max(100),
    title: z.string().trim().min(1).max(200),
    sections: z.array(z.object({
      id: z.string().min(1).max(100),
      title: z.string().trim().min(1).max(200),
      content: z.string().max(1_000_000),
    })).min(1).max(50),
  })).min(1).max(30),
});

function cloneDefault(): CustomerGuide {
  return JSON.parse(JSON.stringify(DEFAULT_CUSTOMER_GUIDE)) as CustomerGuide;
}

function clonePageGuide(pageTitle: string): CustomerGuide {
  return {
    title: `Tài liệu hướng dẫn — ${pageTitle}`,
    description: `Hướng dẫn sử dụng các chức năng trên trang ${pageTitle}.`,
    groups: [
      {
        id: "general",
        title: "Hướng dẫn chung",
        sections: [
          {
            id: "overview",
            title: "Tổng quan",
            content: "<p>Chưa có nội dung hướng dẫn cho trang này.</p>",
          },
        ],
      },
    ],
  };
}

function pageGuideSettingKey(pagePath: string) {
  return `${PAGE_GUIDE_SETTING_PREFIX}${pagePath}`;
}

async function readPageGuide(pagePath: string, pageTitle: string): Promise<CustomerGuide> {
  const [row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, pageGuideSettingKey(pagePath)))
    .limit(1);

  if (!row) return clonePageGuide(pageTitle);
  try {
    return guideSchema.parse(JSON.parse(row.value));
  } catch {
    console.warn(`[PageGuide] Invalid saved content for ${pagePath}, using defaults`);
    return clonePageGuide(pageTitle);
  }
}

type CustomerGuideRequest = {
  hostname?: string;
  user?: { username?: string };
  isSuperAdmin?: boolean;
  get(name: string): string | undefined;
};

function requestHostnames(req: CustomerGuideRequest) {
  const forwardedHosts = req.get("x-forwarded-host")?.split(",") ?? [];
  const hosts = [...forwardedHosts, req.get("host") ?? "", req.hostname ?? ""];
  return hosts
    .map((host) => host.trim().toLowerCase().replace(/\.$/, "").replace(/:\d+$/, ""))
    .filter(Boolean);
}

function isMasterRequest(req: CustomerGuideRequest) {
  return requestHostnames(req).includes(CUSTOMER_GUIDE_MASTER_HOST);
}

function isSuperAdminRequest(req: CustomerGuideRequest) {
  // GET /api/customer-guide intentionally bypasses locationAccessMiddleware so
  // other domains can read the master guide. In that case req.isSuperAdmin has
  // not been populated yet, so fall back to the authenticated user identity.
  return req.isSuperAdmin === true || req.user?.username === "admin";
}

async function readLocalGuide(): Promise<CustomerGuide> {
  const [row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, GUIDE_SETTING_KEY))
    .limit(1);

  if (!row) return cloneDefault();
  try {
    return guideSchema.parse(JSON.parse(row.value));
  } catch {
    console.warn("[CustomerGuide] Invalid saved content, using defaults");
    return cloneDefault();
  }
}

export function registerCustomerGuideRoutes(app: Express) {
  app.get("/api/customer-guide", async (req, res) => {
    try {
      if (!isMasterRequest(req)) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const upstream = await fetch(`${CUSTOMER_GUIDE_MASTER_URL}/api/customer-guide`, {
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });
          if (upstream.ok) {
            const upstreamGuide = guideSchema.parse(await upstream.json());
            return res.json({ ...upstreamGuide, canEdit: false });
          }
          console.warn(`[CustomerGuide] Master returned ${upstream.status}; using local fallback`);
        } finally {
          clearTimeout(timeout);
        }
      }

      const guide = await readLocalGuide();
      return res.json({ ...guide, canEdit: isMasterRequest(req) && isSuperAdminRequest(req) });
    } catch (err: any) {
      console.error("[CustomerGuide] Read failed:", err?.message || err);
      return res.json({ ...cloneDefault(), canEdit: false });
    }
  });

  app.put("/api/customer-guide", async (req, res) => {
    if (!isMasterRequest(req) || !isSuperAdminRequest(req)) {
      return res.status(403).json({ message: "Chỉ Super Admin của trang gốc mới có quyền sửa tài liệu hướng dẫn." });
    }

    try {
      const guide = guideSchema.parse(req.body);
      const value = JSON.stringify(guide);
      await db
        .insert(systemSettings)
        .values({ key: GUIDE_SETTING_KEY, value, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value, updatedAt: new Date() },
        });
      return res.json({ ...guide, canEdit: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Nội dung tài liệu chưa hợp lệ", issues: err.issues });
      }
      console.error("[CustomerGuide] Save failed:", err);
      return res.status(500).json({ message: "Không thể lưu tài liệu hướng dẫn" });
    }
  });

  app.get("/api/page-guide", async (req, res) => {
    const parsedPath = pageGuidePathSchema.safeParse(req.query.path);
    if (!parsedPath.success) {
      return res.status(400).json({ message: "Đường dẫn trang tài liệu không hợp lệ" });
    }

    const pagePath = parsedPath.data;
    const pageTitle = typeof req.query.title === "string" && req.query.title.trim()
      ? req.query.title.trim().slice(0, 200)
      : pagePath;

    try {
      if (!isMasterRequest(req)) {
        const params = new URLSearchParams({ path: pagePath, title: pageTitle });
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const upstream = await fetch(`${CUSTOMER_GUIDE_MASTER_URL}/api/page-guide?${params}`, {
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });
          if (upstream.ok) {
            const upstreamGuide = guideSchema.parse(await upstream.json());
            return res.json({ ...upstreamGuide, canEdit: false, path: pagePath });
          }
          console.warn(`[PageGuide] Master returned ${upstream.status}; using local fallback`);
        } finally {
          clearTimeout(timeout);
        }
      }

      const guide = await readPageGuide(pagePath, pageTitle);
      return res.json({
        ...guide,
        canEdit: isMasterRequest(req) && isSuperAdminRequest(req),
        path: pagePath,
      });
    } catch (err: any) {
      console.error(`[PageGuide] Read failed for ${pagePath}:`, err?.message || err);
      return res.json({ ...clonePageGuide(pageTitle), canEdit: false, path: pagePath });
    }
  });

  app.put("/api/page-guide", async (req, res) => {
    if (!isMasterRequest(req) || !isSuperAdminRequest(req)) {
      return res.status(403).json({ message: "Chỉ Super Admin của trang gốc mới có quyền sửa tài liệu hướng dẫn." });
    }

    const parsedPath = pageGuidePathSchema.safeParse(req.body?.path);
    const parsedGuide = guideSchema.safeParse(req.body?.guide);
    if (!parsedPath.success || !parsedGuide.success) {
      return res.status(400).json({ message: "Nội dung tài liệu chưa hợp lệ" });
    }

    try {
      await db
        .insert(systemSettings)
        .values({
          key: pageGuideSettingKey(parsedPath.data),
          value: JSON.stringify(parsedGuide.data),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: JSON.stringify(parsedGuide.data), updatedAt: new Date() },
        });
      return res.json({ ...parsedGuide.data, canEdit: true, path: parsedPath.data });
    } catch (err: any) {
      console.error(`[PageGuide] Save failed for ${parsedPath.data}:`, err);
      return res.status(500).json({ message: "Không thể lưu tài liệu hướng dẫn" });
    }
  });
}