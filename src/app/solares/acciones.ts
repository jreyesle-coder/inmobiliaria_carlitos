"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { requerirRol } from "@/lib/auth";
import { aNumeric, parsearMonto } from "@/lib/moneda";
import {
  calcularValorTotal,
  esEstadoSolar,
  esTransicionValida,
  parsearArea,
  type EstadoSolar,
} from "@/lib/solares";

/**
 * Alta, edición y cambio de estado de solares.
 *
 * El dinero se valida y se serializa con los helpers de `lib/moneda`: nunca
 * llega un `number` de punto flotante a la base. Las transiciones de estado se
 * comprueban aquí para dar un mensaje claro, pero el trigger
 * `tr_validar_solar` es el que manda.
 */

export type EstadoSolarForm = { error?: string; mensaje?: string };

const texto = (datos: FormData, campo: string) =>
  String(datos.get(campo) ?? "").trim();

type Campos = {
  manzana_id: string;
  numero: string;
  area_m2: string;
  valor_m2: string;
  valor_total: string;
  notas: string | null;
};

/** Valida los campos comunes de alta y edición. */
function leerCampos(datos: FormData): { campos: Campos } | { error: string } {
  const manzana_id = texto(datos, "manzana_id");
  const numero = texto(datos, "numero");
  if (!manzana_id) return { error: "Seleccione la manzana." };
  if (!numero) return { error: "El número del solar es obligatorio." };

  const area = parsearArea(texto(datos, "area_m2"));
  if (!area) return { error: "El área en m² debe ser un número mayor que cero." };

  const valorM2 = parsearMonto(texto(datos, "valor_m2"));
  if (!valorM2 || valorM2.isNegative()) {
    return { error: "El valor por m² no es válido." };
  }

  // Si no escriben el total, se usa el calculado; si lo escriben, se respeta
  // (el Excel trae totales que no cuadran y se registran como están).
  const totalBruto = texto(datos, "valor_total");
  let valor_total: string;
  if (totalBruto === "") {
    valor_total = calcularValorTotal(area, valorM2);
  } else {
    const total = parsearMonto(totalBruto);
    if (!total || total.isNegative()) {
      return { error: "El valor total no es válido." };
    }
    valor_total = aNumeric(total);
  }

  return {
    campos: {
      manzana_id,
      numero,
      area_m2: aNumeric(area),
      valor_m2: aNumeric(valorM2),
      valor_total,
      notas: texto(datos, "notas") || null,
    },
  };
}

function mensajeError(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    return "Ya existe un solar con ese número en esa manzana.";
  }
  return error.message;
}

export async function crearSolar(
  _estado: EstadoSolarForm,
  datos: FormData,
): Promise<EstadoSolarForm> {
  await requerirRol("administracion", "gerencia");

  const leido = leerCampos(datos);
  if ("error" in leido) return leido;

  const estadoInicial = texto(datos, "estado");
  if (estadoInicial && !esEstadoSolar(estadoInicial)) {
    return { error: "Estado inválido." };
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("solares")
    .insert({
      ...leido.campos,
      estado: (estadoInicial || "libre") as EstadoSolar,
    })
    .select("id")
    .single();

  if (error) return { error: mensajeError(error) };

  revalidatePath("/solares");
  redirect(`/solares/${data.id}`);
}

export async function actualizarSolar(
  _estado: EstadoSolarForm,
  datos: FormData,
): Promise<EstadoSolarForm> {
  await requerirRol("administracion", "gerencia");

  const id = texto(datos, "id");
  if (!id) return { error: "Datos inválidos." };

  const leido = leerCampos(datos);
  if ("error" in leido) return leido;

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("solares")
    .update(leido.campos)
    .eq("id", id);

  if (error) return { error: mensajeError(error) };

  revalidatePath("/solares");
  revalidatePath(`/solares/${id}`);
  return { mensaje: "Solar actualizado." };
}

/**
 * Cambio de estado por el pipeline. Queda en la bitácora por el trigger
 * `tr_auditar`, con el estado anterior y el nuevo.
 */
export async function cambiarEstadoSolar(
  _estado: EstadoSolarForm,
  datos: FormData,
): Promise<EstadoSolarForm> {
  await requerirRol("administracion", "gerencia");

  const id = texto(datos, "id");
  const actual = texto(datos, "estado_actual");
  const nuevo = texto(datos, "estado_nuevo");

  if (!id || !esEstadoSolar(actual) || !esEstadoSolar(nuevo)) {
    return { error: "Datos inválidos." };
  }
  if (!esTransicionValida(actual, nuevo)) {
    return { error: "Esa transición de estado no está permitida." };
  }

  const supabase = await crearClienteServidor();
  // `eq("estado", actual)` evita pisar un cambio hecho por otro usuario.
  const { data, error } = await supabase
    .from("solares")
    .update({ estado: nuevo })
    .eq("id", id)
    .eq("estado", actual)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "El solar cambió de estado mientras tanto. Recargue." };
  }

  revalidatePath("/solares");
  revalidatePath(`/solares/${id}`);
  return { mensaje: "Estado actualizado." };
}
