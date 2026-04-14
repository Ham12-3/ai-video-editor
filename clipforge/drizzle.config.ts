import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Use standard pg driver for drizzle-kit (local dev)
  // The app itself uses @neondatabase/serverless for production
  driver: undefined,
});
