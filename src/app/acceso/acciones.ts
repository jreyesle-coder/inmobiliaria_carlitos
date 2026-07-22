"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoAcceso = { error?: string };

/** Traduce los errores de Supabase Auth, que vienen en inglés. */
function traducirError(mensaje: string): string {
  if (/invalid login credentials/i.test(mensaje)) {
    return "Correo o contraseña incorrectos.";
  }
  if (/email not confirmed/i.test(mensaje)) {
    return "El correo aún no ha sido confirmado.";
  }
  if (/rate limit|too many/i.test(mensaje)) {
    return "Demasiados intentos. Espere un momento y vuelva a probar.";
  }
  return mensaje;
}

export async function iniciarSesion(
  _estado: EstadoAcceso,
  datos: FormData,
): Promise<EstadoAcceso> {
  const correo = String(datos.get("correo") ?? "").trim();
  const contrasena = String(datos.get("contrasena") ?? "");

  if (!correo || !contrasena) {
    return { error: "Escriba su correo y su contraseña." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: correo,
    password: contrasena,
  });

  if (error) return { error: traducirError(error.message) };

  revalidatePath("/", "layout");
  redirect("/");
}

export async function cerrarSesion() {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/acceso");
}
