import { defineConfig } from "drizzle-kit";

const url = process.env.APP_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("APP_DATABASE_URL or DATABASE_URL is required.");

export default defineConfig({
  schema: "./schema.invoice.tmp.ts",
  dialect: "postgresql",
  dbCredentials: { url },
});
