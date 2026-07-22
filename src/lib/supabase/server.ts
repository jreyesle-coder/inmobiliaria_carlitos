import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { leerEntornoSupabase } from "./entorno";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 * Usa la llave anónima: las políticas RLS deciden qué ve cada rol.
 */
export async function crearClienteServidor() {
  const almacenCookies = await cookies();
  const { url, anon } = leerEntornoSupabase();

  return createServerClient(
    url,
    anon,
    {
      cookies: {
        getAll() {
          return almacenCookies.getAll();
        },
        setAll(cookiesNuevas) {
          try {
            for (const { name, value, options } of cookiesNuevas) {
              almacenCookies.set(name, value, options);
            }
          } catch {
            // Llamado desde un Server Component: el refresco de sesión lo hace
            // `proxy.ts`, así que aquí se puede ignorar.
          }
        },
      },
    },
  );
}
