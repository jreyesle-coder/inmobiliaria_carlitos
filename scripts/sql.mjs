import { readFileSync } from "node:fs";
import { config } from "dotenv";
import postgres from "postgres";

/**
 * Aplica un archivo de `supabase/sql/` (o un query suelto) contra la base,
 * usando `DATABASE_URL` de `.env.local`. Es el reemplazo de `psql` para este
 * proyecto, que corre en Windows sin cliente de Postgres instalado.
 *
 *   node scripts/sql.mjs supabase/sql/09_pagos.sql
 *   node scripts/sql.mjs -c "select count(*) from public.solares"
 *
 * Va por el protocolo simple a propósito: los archivos traen varias sentencias,
 * bloques `do $$ ... $$` y transacciones (`begin` … `rollback`) que tienen que
 * viajar juntos, en una sola sesión.
 */

config({ path: ".env.local", quiet: true });

const [bandera, valor] = process.argv.slice(2);

if (!bandera) {
  console.error(
    "Uso: node scripts/sql.mjs <archivo.sql>\n" +
      '     node scripts/sql.mjs -c "select 1"',
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en .env.local.");
  process.exit(1);
}

const contenido =
  bandera === "-c" ? valor : readFileSync(bandera, "utf8");

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
  // Los `raise notice` de los bloques `do $$` son la mitad de la información.
  onnotice: (aviso) => console.log(`AVISO: ${aviso.message}`),
});

try {
  const resultado = await sql.unsafe(contenido).simple();

  // Con varias sentencias viene un arreglo de resultados; interesan las que
  // devolvieron filas (la tabla de pruebas suele ser la última).
  const bloques = Array.isArray(resultado[0]) ? resultado : [resultado];
  for (const bloque of bloques) {
    if (Array.isArray(bloque) && bloque.length > 0) console.table(bloque);
  }
  console.log("OK");
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  if (error.hint) console.error(`Pista: ${error.hint}`);
  if (error.where) console.error(`Dónde: ${error.where}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
