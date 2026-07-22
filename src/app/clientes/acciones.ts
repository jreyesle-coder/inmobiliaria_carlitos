"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { requerirPerfil, requerirRol } from "@/lib/auth";
import { correoValido, revisarCedula } from "@/lib/personas";

/**
 * Alta, edición y carga de cédula de clientes.
 *
 * Quién puede qué (lo manda RLS, no esta capa):
 *   * Crear: cualquier usuario con sesión —un vendedor registra a su cliente—.
 *   * Corregir: administración, gerencia, o quien lo creó (`clientes_update`).
 *   * Borrar: solo gerencia, y nunca si tiene ventas.
 */

export type EstadoCliente = { error?: string; mensaje?: string };

const texto = (datos: FormData, campo: string) =>
  String(datos.get(campo) ?? "").trim();

type Campos = {
  nombre_completo: string;
  cedula: string | null;
  cedula_pendiente: boolean;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  notas: string | null;
};

/**
 * Valida los campos comunes de alta y edición. La cédula puede quedar vacía
 * (cliente pendiente); si viene con dígito verificador malo se exige que
 * marquen la casilla, para no perder cédulas viejas legítimas.
 */
function leerCampos(datos: FormData): { campos: Campos } | { error: string } {
  const nombre_completo = texto(datos, "nombre_completo");
  if (!nombre_completo) {
    return { error: "El nombre del cliente es obligatorio." };
  }

  const revision = revisarCedula(texto(datos, "cedula"));
  if (revision.estado === "invalida") return { error: revision.mensaje };
  if (revision.estado === "dudosa" && datos.get("forzar_cedula") !== "on") {
    return { error: revision.mensaje };
  }
  const cedula = revision.estado === "vacia" ? null : revision.cedula;

  const correo = texto(datos, "correo");
  if (correo && !correoValido(correo)) {
    return { error: "El correo no tiene un formato válido." };
  }

  const telefono = texto(datos, "telefono").replace(/\D/g, "");

  return {
    campos: {
      nombre_completo,
      cedula,
      cedula_pendiente: cedula === null,
      telefono: telefono || null,
      correo: correo || null,
      direccion: texto(datos, "direccion") || null,
      notas: texto(datos, "notas") || null,
    },
  };
}

function mensajeError(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    return "Ya existe un cliente registrado con esa cédula.";
  }
  if (error.code === "42501" || /row-level security/i.test(error.message)) {
    return "No tiene permiso para modificar este cliente.";
  }
  return error.message;
}

export async function crearCliente(
  _estado: EstadoCliente,
  datos: FormData,
): Promise<EstadoCliente> {
  const perfil = await requerirPerfil();

  const leido = leerCampos(datos);
  if ("error" in leido) return leido;

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("clientes")
    // `creado_por` es lo que le permite al vendedor corregir después su propio
    // registro (política `clientes_update`).
    .insert({ ...leido.campos, creado_por: perfil.id })
    .select("id")
    .single();

  if (error) return { error: mensajeError(error) };

  revalidatePath("/clientes");
  redirect(`/clientes/${data.id}`);
}

export async function actualizarCliente(
  _estado: EstadoCliente,
  datos: FormData,
): Promise<EstadoCliente> {
  await requerirPerfil();

  const id = texto(datos, "id");
  if (!id) return { error: "Datos inválidos." };

  const leido = leerCampos(datos);
  if ("error" in leido) return leido;

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("clientes")
    .update(leido.campos)
    .eq("id", id)
    .select("id");

  if (error) return { error: mensajeError(error) };
  if (!data || data.length === 0) {
    return { error: "No tiene permiso para modificar este cliente." };
  }

  revalidatePath("/clientes");
  revalidatePath("/clientes/pendientes");
  revalidatePath(`/clientes/${id}`);
  return { mensaje: "Cliente actualizado." };
}

/**
 * Bandeja de pendientes: cargar solo la cédula, sin tocar el resto del
 * registro. Es la acción que más se va a usar cuando llegue la data del Excel.
 */
export async function cargarCedula(
  _estado: EstadoCliente,
  datos: FormData,
): Promise<EstadoCliente> {
  await requerirPerfil();

  const id = texto(datos, "id");
  if (!id) return { error: "Datos inválidos." };

  const revision = revisarCedula(texto(datos, "cedula"));
  if (revision.estado === "vacia") {
    return { error: "Escriba la cédula." };
  }
  if (revision.estado === "invalida") return { error: revision.mensaje };
  if (revision.estado === "dudosa" && datos.get("forzar_cedula") !== "on") {
    return { error: revision.mensaje };
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("clientes")
    .update({ cedula: revision.cedula, cedula_pendiente: false })
    .eq("id", id)
    .select("id");

  if (error) return { error: mensajeError(error) };
  if (!data || data.length === 0) {
    return { error: "No tiene permiso para modificar este cliente." };
  }

  revalidatePath("/clientes");
  revalidatePath("/clientes/pendientes");
  revalidatePath(`/clientes/${id}`);
  return { mensaje: "Cédula cargada." };
}

/** Solo gerencia, y la base lo frena si el cliente tiene ventas. */
export async function eliminarCliente(
  _estado: EstadoCliente,
  datos: FormData,
): Promise<EstadoCliente> {
  await requerirRol("gerencia");

  const id = texto(datos, "id");
  if (!id) return { error: "Datos inválidos." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("clientes").delete().eq("id", id);

  if (error) return { error: mensajeError(error) };

  revalidatePath("/clientes");
  redirect("/clientes");
}
