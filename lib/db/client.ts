import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { z } from "zod";

import * as schema from "./schema";

/**
 * Dashboard and query paths only need the database URL. Full env
 * validation (GitHub App key, QStash, …) stays at pipeline boundaries.
 */
function getDatabaseUrl(): string {
  const parsed = z
    .object({ DATABASE_URL: z.string().url() })
    .safeParse({ DATABASE_URL: process.env.DATABASE_URL });
  if (!parsed.success) {
    throw new Error("DATABASE_URL is required and must be a valid URL.");
  }
  return parsed.data.DATABASE_URL;
}

const sql = neon(getDatabaseUrl());

export const db = drizzle(sql, { schema });
