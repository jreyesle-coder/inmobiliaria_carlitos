"use server";

import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ROLES, type Rol } from "@/lib/roles";

export type EstadoUsuarios = { error?: string; mensaje?: string };

/**
 * Cambia el rol de un usuario. La comprobación de que quien llama es gerencia
 * la hace la función `asignar_rol` en Postgres, no esta capa.
 */
export async function cambiarRol(
  _estado: EstadoUsuarios,
  datos: FormData,
): Promise<EstadoUsuarios> {
  const perfil_id = String(datos.get("perfil_id") ?? "");
  const rol = String(datos.get("rol") ?? "") as Rol;

  if (!perfil_id || !ROLES.includes(rol)) {
    return { error: "Datos inválidos." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("asignar_rol", {
    p_perfil_id: perfil_id,
    p_rol: rol,
  });

  if (error) return { error: error.message };

  revalidatePath("/usuarios");
  return { mensaje: "Rol actualizado." };
}

export async function cambiarActivo(
  _estado: EstadoUsuarios,
  datos: FormData,
): Promise<EstadoUsuarios> {
  const perfil_id = String(datos.get("perfil_id") ?? "");
  const activo = datos.get("activo") === "true";

  if (!perfil_id) return { error: "Datos inválidos." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("activar_perfil", {
    p_perfil_id: perfil_id,
    p_activo: activo,
  });

  if (error) return { error: error.message };

  revalidatePath("/usuarios");
  return { mensaje: activo ? "Usuario activado." : "Usuario desactivado." };
}
