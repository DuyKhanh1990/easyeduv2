import type { Config } from "drizzle-kit";

export default {
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.GATEWAY_DATABASE_URL || process.env.DATABASE_URL || "",
  },
} satisfies Config;
