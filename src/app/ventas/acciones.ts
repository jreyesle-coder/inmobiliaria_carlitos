"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { requerirRol } from "@/lib/auth";
import { aNumeric, parsearMonto } from "@/lib/moneda";
import {
  esEstadoVenta,
  esFechaISO,
  esTransicionVentaValida,
  parsearCuotas,
  revisarMontosVenta,
} from "@/lib/ventas";

/**
 * Alta, edición, plan de pagos, cambio de estado y cancelación de ventas.
 *
 * Quién puede qué lo manda RLS, no esta capa: registrar y corregir es de
 * administración y gerencia; cancelar es de gerencia (función
 * `cancelar_venta`); el vendedor solo lee lo suyo.
 *
 * El plan de cuotas NO se arma aquí: lo genera `public.generar_plan_pagos` en
 * una sola transacción, que es la que garantiza que la suma cuadre con el
 * precio pactado.
 */

export type EstadoVentaForm = { error?: string; mensaje?: string };

const texto = (datos: FormData, campo: string) =>
  String(datos.get(campo) ?? "").trim();

type Campos = {
  solar_id: string;
  cliente_id: string;
  vendedor_id: string | null;
  fecha_venta: string;
  precio_pactado: string;
  monto_separacion: string;
  monto_inicial: string;
  cuotas_inicial: number;
  cuotas_capital: number;
  estado_contrato: "pendiente" | "listo";
  notas: string | null;
};

function leerCampos(datos: FormData): { campos: Campos } | { error: string } {
  const solar_id = texto(datos, "solar_id");
  const cliente_id = texto(datos, "cliente_id");
  if (!solar_id) return { error: "Seleccione el solar." };
  if (!cliente_id) return { error: "Seleccione el cliente." };

  const fecha_venta = texto(datos, "fecha_venta");
  if (!esFechaISO(fecha_venta)) return { error: "La fecha de la venta no es válida." };

  const precio = parsearMonto(texto(datos, "precio_pactado"));
  if (!precio) return { error: "El precio pactado no es un monto válido." };

  const separacionBruta = texto(datos, "monto_separacion");
  const separacion = separacionBruta === "" ? parsearMonto("0") : parsearMonto(separacionBruta);
  if (!separacion) return { error: "La separación no es un monto válido." };

  const inicialBruta = texto(datos, "monto_inicial");
  const inicial = inicialBruta === "" ? parsearMonto("0") : parsearMonto(inicialBruta);
  if (!inicial) return { error: "La inicial no es un monto válido." };

  const cuotas_inicial = parsearCuotas(texto(datos, "cuotas_inicial"));
  const cuotas_capital = parsearCuotas(texto(datos, "cuotas_capital"));
  if (!cuotas_inicial || cuotas_inicial < 1) {
    return { error: "Las cuotas de la inicial deben ser al menos 1." };
  }
  if (!cuotas_capital || cuotas_capital < 1) {
    return { error: "Las cuotas del capital deben ser al menos 1." };
  }

  const problema = revisarMontosVenta({
    precio_pactado: precio,
    monto_separacion: separacion,
    monto_inicial: inicial,
    cuotas_inicial,
    cuotas_capital,
  });
  if (problema) return { error: problema };

  const contrato = texto(datos, "estado_contrato");

  return {
    campos: {
      solar_id,
      cliente_id,
      vendedor_id: texto(datos, "vendedor_id") || null,
      fecha_venta,
      precio_pactado: aNumeric(precio),
      monto_separacion: aNumeric(separacion),
      monto_inicial: aNumeric(inicial),
      cuotas_inicial,
      cuotas_capital,
      estado_contrato: contrato === "listo" ? "listo" : "pendiente",
      notas: texto(datos, "notas") || null,
    },
  };
}

function mensajeError(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    return "Ese solar ya tiene una venta activa.";
  }
  if (error.code === "42501" || /row-level security/i.test(error.message)) {
    return "No tiene permiso para esta operación.";
  }
  return error.message;
}

export async function crearVenta(
  _estado: EstadoVentaForm,
  datos: FormData,
): Promise<EstadoVentaForm> {
  const perfil = await requerirRol("administracion", "gerencia");

  const leido = leerCampos(datos);
  if ("error" in leido) return leido;

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("ventas")
    .insert({ ...leido.campos, creado_por: perfil.id })
    .select("id")
    .single();

  if (error) return { error: mensajeError(error) };

  // El plan se arma en la base, en su propia transacción: si no cuadrara con el
  // precio pactado, no se guardaría ninguna cuota.
  const { error: errorPlan } = await supabase.rpc("generar_plan_pagos", {
    p_venta_id: data.id,
  });
  if (errorPlan) {
    return {
      error: `La venta se registró, pero el plan de pagos no: ${errorPlan.message}`,
    };
  }

  revalidatePath("/ventas");
  revalidatePath("/solares");
  redirect(`/ventas/${data.id}`);
}

/**
 * Corregir la venta. No toca el plan: regenerarlo es una decisión aparte
 * (botón «Rehacer el plan»), porque rehace todas las cuotas.
 */
export async function actualizarVenta(
  _estado: EstadoVentaForm,
  datos: FormData,
): Promise<EstadoVentaForm> {
  await requerirRol("administracion", "gerencia");

  const id = texto(datos, "id");
  if (!id) return { error: "Datos inválidos." };

  const leido = leerCampos(datos);
  if ("error" in leido) return leido;

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("ventas")
    .update(leido.campos)
    .eq("id", id)
    .select("id");

  if (error) return { error: mensajeError(error) };
  if (!data || data.length === 0) {
    return { error: "No tiene permiso para modificar esta venta." };
  }

  revalidatePath("/ventas");
  revalidatePath(`/ventas/${id}`);
  return {
    mensaje:
      "Venta actualizada. Si cambió montos o plazos, rehaga el plan de pagos.",
  };
}

/** Rehace todas las cuotas. La base lo frena si alguna ya tiene dinero. */
export async function regenerarPlan(
  _estado: EstadoVentaForm,
  datos: FormData,
): Promise<EstadoVentaForm> {
  await requerirRol("administracion", "gerencia");

  const id = texto(datos, "id");
  if (!id) return { error: "Datos inválidos." };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("generar_plan_pagos", {
    p_venta_id: id,
  });

  if (error) return { error: mensajeError(error) };

  revalidatePath(`/ventas/${id}`);
  return { mensaje: `Plan rehecho: ${data} cuotas.` };
}

export async function cambiarEstadoVenta(
  _estado: EstadoVentaForm,
  datos: FormData,
): Promise<EstadoVentaForm> {
  await requerirRol("administracion", "gerencia");

  const id = texto(datos, "id");
  const actual = texto(datos, "estado_actual");
  const nuevo = texto(datos, "estado_nuevo");

  if (!id || !esEstadoVenta(actual) || !esEstadoVenta(nuevo)) {
    return { error: "Datos inválidos." };
  }
  if (nuevo === "cancelada") {
    return { error: "Para cancelar una venta use el botón de cancelación." };
  }
  if (!esTransicionVentaValida(actual, nuevo)) {
    return { error: "Esa transición de estado no está permitida." };
  }

  const supabase = await crearClienteServidor();
  // `eq("estado", actual)` evita pisar un cambio hecho por otro usuario.
  const { data, error } = await supabase
    .from("ventas")
    .update({ estado: nuevo })
    .eq("id", id)
    .eq("estado", actual)
    .select("id");

  if (error) return { error: mensajeError(error) };
  if (!data || data.length === 0) {
    return { error: "La venta cambió de estado mientras tanto. Recargue." };
  }

  revalidatePath("/ventas");
  revalidatePath("/solares");
  revalidatePath(`/ventas/${id}`);
  return { mensaje: "Estado actualizado. El solar quedó en el mismo punto." };
}

export async function cambiarEstadoContrato(
  _estado: EstadoVentaForm,
  datos: FormData,
): Promise<EstadoVentaForm> {
  await requerirRol("administracion", "gerencia");

  const id = texto(datos, "id");
  const nuevo = texto(datos, "estado_contrato");
  if (!id || (nuevo !== "listo" && nuevo !== "pendiente")) {
    return { error: "Datos inválidos." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("ventas")
    .update({ estado_contrato: nuevo })
    .eq("id", id);

  if (error) return { error: mensajeError(error) };

  revalidatePath(`/ventas/${id}`);
  return {
    mensaje: nuevo === "listo" ? "Contrato marcado listo." : "Contrato pendiente.",
  };
}

/**
 * Cancelar: solo gerencia. Va por la función de la base, que devuelve el solar
 * al inventario, retira las cuotas y deja el motivo escrito, todo junto.
 */
export async function cancelarVenta(
  _estado: EstadoVentaForm,
  datos: FormData,
): Promise<EstadoVentaForm> {
  await requerirRol("gerencia");

  const id = texto(datos, "id");
  const motivo = texto(datos, "motivo");
  if (!id) return { error: "Datos inválidos." };
  if (!motivo) return { error: "Escriba el motivo de la cancelación." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("cancelar_venta", {
    p_venta_id: id,
    p_motivo: motivo,
  });

  if (error) return { error: mensajeError(error) };

  revalidatePath("/ventas");
  revalidatePath("/solares");
  revalidatePath(`/ventas/${id}`);
  return { mensaje: "Venta cancelada y solar liberado." };
}
