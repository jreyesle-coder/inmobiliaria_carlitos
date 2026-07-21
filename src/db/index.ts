import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as esquema from "./esquema";

/**
 * Conexión directa a Postgres para migraciones y scripts (importación del
 * Excel, reportes pesados). El acceso normal de la aplicación va por Supabase,
 * para que RLS aplique. Nunca importar esto desde un componente de cliente.
 */
const url = process.env.DATABASE_URL;

export const cliente = url ? postgres(url, { prepare: false }) : null;

export const db = cliente ? drizzle(cliente, { schema: esquema }) : null;

/** Igual que `db`, pero falla claro si falta `DATABASE_URL`. */
export function requerirDb() {
  if (!db) {
    throw new Error("Falta DATABASE_URL en el entorno.");
  }
  return db;
}
