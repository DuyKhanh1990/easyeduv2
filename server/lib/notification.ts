import nodemailer from "nodemailer";
import { db } from "../storage/base";
import { notifications } from "@shared/schema";
import { emitToUser } from "./ws-hub";

export interface SendNotificationOptions {
  userId: string;
  title: string;
  content: string;
  category?: string;
  referenceId?: string;
  referenceType?: string;
  email?: string;
}

async function saveNotification(opts: SendNotificationOptions) {
  const [row] = await db.insert(notifications).values({
    userId: opts.userId,
    title: opts.title,
    content: opts.content,
    type: "in-app",
    category: opts.category ?? "general",
    referenceId: opts.referenceId,
    referenceType: opts.referenceType,
    isRead: false,
    createdAt: new Date(),
  }).returning();
  return row;
}

function emitRealtime(userId: string, notification: object) {
  emitToUser(userId, { type: "notification", data: notification });
}

async function sendEmail(to: string, subject: string, content: string) {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.log("[Notification] SMTP not configured, skipping email to", to);
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port: port ? parseInt(port) : 587,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || user,
    to,
    subject,
    text: content,
    html: `<p>${content.replace(/\n/g, "<br>")}</p>`,
  });
}

export async function sendNotification(opts: SendNotificationOptions) {
  const saved = await saveNotification(opts);
  emitRealtime(opts.userId, saved);
  if (opts.email) {
    sendEmail(opts.email, opts.title, opts.content).catch((err) => {
      console.error("[Notification] Email send error:", err.message);
    });
  }
  return saved;
}

export async function sendNotificationToMany(userIds: string[], opts: Omit<SendNotificationOptions, "userId">) {
  const results = await Promise.all(userIds.map((uid) => sendNotification({ ...opts, userId: uid })));
  return results;
}
