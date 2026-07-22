"use server";

import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { requerirRol } from "@/lib/auth";
import { aNumeric, parsearMonto } from "@/lib/moneda";

/**
 * Alta y edición de proyectos y manzanas. Escribir es de administración y
 * gerencia; `requerirRol` solo evita la pantalla, la barrera real son las
 * políticas `proyectos_escribe` y `manzanas_escribe` en la base.
 */

export type EstadoFormulario = { error?: string; mensaje?: string };

const texto = (datos: FormData, campo: string) =>
  String(datos.get(campo) ?? "").trim();

/** Campo de dinero opcional: vacío es null, mal escrito es error. */
function montoOpcional(
  datos: FormData,
  campo: string,
): { valor: string | null } | { error: string } {
  const bruto = texto(datos, campo);
  if (bruto === "") return { valor: null };
  const d = parsearMonto(bruto);
  if (!d || d.isNegative()) return { error: "El valor por m² no es válido." };
  return { valor: aNumeric(d) };
}

export async function crearProyecto(
  _estado: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  await requerirRol("administracion", "gerencia");

  const nombre = texto(datos, "nombre");
  if (!nombre) return { error: "El nombre del proyecto es obligatorio." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("proyectos").insert({
    nombre,
    descripcion: texto(datos, "descripcion") || null,
    ubicacion: texto(datos, "ubicacion") || null,
  });

  if (error) {
    return {
      error: error.code === "23505"
        ? "Ya existe un proyecto con ese nombre."
        : error.message,
    };
  }

  revalidatePath("/proyectos");
  return { mensaje: "Proyecto creado." };
}

export async function actualizarProyecto(
  _estado: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  await requerirRol("administracion", "gerencia");

  const id = texto(datos, "id");
  const nombre = texto(datos, "nombre");
  if (!id || !nombre) return { error: "Datos inválidos." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("proyectos")
    .update({
      nombre,
      descripcion: texto(datos, "descripcion") || null,
      ubicacion: texto(datos, "ubicacion") || null,
      activo: datos.get("activo") === "on",
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/proyectos");
  return { mensaje: "Proyecto actualizado." };
}

export async function crearManzana(
  _estado: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  await requerirRol("administracion", "gerencia");

  const proyecto_id = texto(datos, "proyecto_id");
  const codigo = texto(datos, "codigo").toUpperCase();
  if (!proyecto_id || !codigo) {
    return { error: "El código de la manzana es obligatorio." };
  }

  const valor = montoOpcional(datos, "valor_m2_referencia");
  if ("error" in valor) return valor;

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("manzanas").insert({
    proyecto_id,
    codigo,
    descripcion: texto(datos, "descripcion") || null,
    valor_m2_referencia: valor.valor,
  });

  if (error) {
    return {
      error: error.code === "23505"
        ? `Ya existe la manzana ${codigo} en este proyecto.`
        : error.message,
    };
  }

  revalidatePath("/proyectos");
  revalidatePath("/solares");
  return { mensaje: `Manzana ${codigo} creada.` };
}

export async function actualizarManzana(
  _estado: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  await requerirRol("administracion", "gerencia");

  const id = texto(datos, "id");
  const codigo = texto(datos, "codigo").toUpperCase();
  if (!id || !codigo) return { error: "Datos inválidos." };

  const valor = montoOpcional(datos, "valor_m2_referencia");
  if ("error" in valor) return valor;

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("manzanas")
    .update({
      codigo,
      descripcion: texto(datos, "descripcion") || null,
      valor_m2_referencia: valor.valor,
    })
    .eq("id", id);

  if (error) {
    return {
      error: error.code === "23505"
        ? `Ya existe la manzana ${codigo} en este proyecto.`
        : error.message,
    };
  }

  revalidatePath("/proyectos");
  revalidatePath("/solares");
  return { mensaje: "Manzana actualizada." };
}
