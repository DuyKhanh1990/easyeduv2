import { defineConfig } from "drizzle-kit";

const url = process.env.APP_DATABASE_URL || process.env.DATABASE_URL;

if (!url) {
  throw new Error("APP_DATABASE_URL must be set. Please add your database URL as the APP_DATABASE_URL secret.");
}

export default defineConfig({
  out: "./migrations",
  schema: ["./shared/schema.ts", "./gateway/src/schema.ts", "./shared/models/chat.ts"],
  dialect: "postgresql",
  dbCredentials: { url },
});
