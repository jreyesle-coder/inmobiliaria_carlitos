import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/esquema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // El esquema `public` es el nuestro; `auth` lo maneja Supabase.
  schemaFilter: ["public"],
  verbose: true,
  strict: true,
});
