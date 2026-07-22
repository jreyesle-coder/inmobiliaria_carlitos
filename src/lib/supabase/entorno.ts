/**
 * Las dos variables que necesita Supabase, leídas en un solo lugar y con un
 * error que se entiende.
 *
 * Antes se escribía `process.env.NEXT_PUBLIC_SUPABASE_URL!`: el `!` calla a
 * TypeScript pero no crea la variable. Si falta en el despliegue,
 * `createServerClient` lanza dentro del proxy —antes de cualquier página— y
 * toda la app responde un «Internal Server Error» pelado que no dice nada.
 *
 * Ojo: son `NEXT_PUBLIC_`, así que Next las incrusta **al construir**. Cargarlas
 * en Vercel después de un despliegue no arregla ese despliegue: hay que volver
 * a desplegar.
 */
export function leerEntornoSupabase(): { url: string; anon: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const faltan = [
    url ? null : "NEXT_PUBLIC_SUPABASE_URL",
    anon ? null : "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ].filter(Boolean);

  if (faltan.length > 0 || !url || !anon) {
    throw new Error(
      `Falta configurar ${faltan.join(" y ")} en el entorno. ` +
        "En local van en .env.local; en Vercel, en Settings → Environment " +
        "Variables, y hay que volver a desplegar para que tomen efecto.",
    );
  }

  return { url, anon };
}
