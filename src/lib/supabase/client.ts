import { createBrowserClient } from "@supabase/ssr";
import { leerEntornoSupabase } from "./entorno";

/** Cliente de Supabase para componentes que corren en el navegador. */
export function crearClienteNavegador() {
  const { url, anon } = leerEntornoSupabase();
  return createBrowserClient(url, anon);
}
