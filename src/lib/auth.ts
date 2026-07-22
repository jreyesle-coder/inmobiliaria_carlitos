import "server-only";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Perfil, Rol } from "@/lib/roles";

export type { Perfil, Rol } from "@/lib/roles";
export { ETIQUETAS_ROL, ROLES, esGerencia, esAdminOGerencia } from "@/lib/roles";

/**
 * Perfil del usuario de la sesión actual, o `null` si no hay sesión.
 * La política RLS `perfiles_select` ya limita la fila que se puede leer.
 */
export async function obtenerPerfil(): Promise<Perfil | null> {
  const supabase = await crearClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("perfiles")
    .select("id, nombre_completo, correo, rol, activo")
    .eq("id", user.id)
    .maybeSingle();

  return (data as Perfil | null) ?? null;
}

/** Igual que `obtenerPerfil`, pero manda al login si no hay sesión válida. */
export async function requerirPerfil(): Promise<Perfil> {
  const perfil = await obtenerPerfil();
  if (!perfil) redirect("/acceso");
  if (!perfil.activo) redirect("/acceso?motivo=inactivo");
  return perfil;
}

/**
 * Exige uno de los roles indicados. La UI no es la barrera de seguridad —de eso
 * se encarga RLS—, pero evita mostrar pantallas que el rol no puede usar.
 */
export async function requerirRol(...roles: Rol[]): Promise<Perfil> {
  const perfil = await requerirPerfil();
  if (!roles.includes(perfil.rol)) redirect("/sin-permiso");
  return perfil;
}
