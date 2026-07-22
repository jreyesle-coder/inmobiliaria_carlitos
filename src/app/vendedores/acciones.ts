"use server";

import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { requerirRol } from "@/lib/auth";
import { correoValido, revisarCedula } from "@/lib/personas";

/**
 * Alta y edición de vendedores. Escribir es solo de gerencia (política
 * `vendedores_escribe`): el vínculo `perfil_id` decide qué ventas y comisiones
 * ve cada usuario, así que es una decisión de permisos, no de catálogo.
 */

export type EstadoVendedor = { error?: string; mensaje?: string };

const texto = (datos: FormData, campo: string) =>
  String(datos.get(campo) ?? "").trim();

type Campos = {
  nombre_completo: string;
  cedula: string | null;
  telefono: string | null;
  correo: string | null;
  perfil_id: string | null;
};

function leerCampos(datos: FormData): { campos: Campos } | { error: string } {
  const nombre_completo = texto(datos, "nombre_completo");
  if (!nombre_completo) {
    return { error: "El nombre del vendedor es obligatorio." };
  }

  const revision = revisarCedula(texto(datos, "cedula"));
  if (revision.estado === "invalida") return { error: revision.mensaje };
  if (revision.estado === "dudosa" && datos.get("forzar_cedula") !== "on") {
    return { error: revision.mensaje };
  }

  const correo = texto(datos, "correo");
  if (correo && !correoValido(correo)) {
    return { error: "El correo no tiene un formato válido." };
  }

  const telefono = texto(datos, "telefono").replace(/\D/g, "");

  return {
    campos: {
      nombre_completo,
      cedula: revision.estado === "vacia" ? null : revision.cedula,
      telefono: telefono || null,
      correo: correo || null,
      perfil_id: texto(datos, "perfil_id") || null,
    },
  };
}

function mensajeError(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    return "Ese usuario o esa cédula ya están asignados a otro vendedor.";
  }
  return error.message;
}

export async function crearVendedor(
  _estado: EstadoVendedor,
  datos: FormData,
): Promise<EstadoVendedor> {
  await requerirRol("gerencia");

  const leido = leerCampos(datos);
  if ("error" in leido) return leido;

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("vendedores").insert(leido.campos);

  if (error) return { error: mensajeError(error) };

  revalidatePath("/vendedores");
  return { mensaje: "Vendedor registrado." };
}

export async function actualizarVendedor(
  _estado: EstadoVendedor,
  datos: FormData,
): Promise<EstadoVendedor> {
  await requerirRol("gerencia");

  const id = texto(datos, "id");
  if (!id) return { error: "Datos inválidos." };

  const leido = leerCampos(datos);
  if ("error" in leido) return leido;

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("vendedores")
    .update({ ...leido.campos, activo: datos.get("activo") === "on" })
    .eq("id", id);

  if (error) return { error: mensajeError(error) };

  revalidatePath("/vendedores");
  return { mensaje: "Vendedor actualizado." };
}
