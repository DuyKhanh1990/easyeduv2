import { defineConfig } from "drizzle-kit";

// This config is for generating the EasyEdu app's versioned migrations only.
// `generate` needs no database connection and must not mutate a database.
export default defineConfig({
  schema: "./shared/schema.ts",
  out: "./migrations/easyedu",
  dialect: "postgresql",
});
