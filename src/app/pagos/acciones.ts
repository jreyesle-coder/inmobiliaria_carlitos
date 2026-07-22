"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { requerirRol } from "@/lib/auth";
import { aNumeric, parsearMonto } from "@/lib/moneda";
import { esFechaISO } from "@/lib/ventas";
import { esMetodoPago, type Aplicacion } from "@/lib/pagos";

/**
 * Registro y reverso de pagos.
 *
 * Ninguna de las dos operaciones escribe en las tablas: las dos llaman a una
 * función de la base (`registrar_pago`, `reversar_pago`) que hace todo en una
 * transacción. Esa es la razón de que no exista forma de que quede dinero sin
 * recibo, ni una cuota con más aplicado de lo que se le espera.
 *
 * Pagos, aplicaciones y recibos son inmutables desde el Sprint 1: aquí no hay
 * —ni puede haber— una acción de editar o borrar.
 */

export type EstadoPagoForm = { error?: string; mensaje?: string };

const texto = (datos: FormData, campo: string) =>
  String(datos.get(campo) ?? "").trim();

function mensajeError(error: { code?: string; message: string }): string {
  if (error.code === "42501" || /row-level security/i.test(error.message)) {
    return "No tiene permiso para esta operación.";
  }
  return error.message;
}

/**
 * Cobra. El reparto entre cuotas viaja explícito cuando quien cobra lo ajustó
 * en la pantalla; si viene vacío, la base aplica de la cuota más vieja a la más
 * nueva.
 */
export async function registrarPago(
  _estado: EstadoPagoForm,
  datos: FormData,
): Promise<EstadoPagoForm> {
  await requerirRol("administracion", "gerencia");

  const venta_id = texto(datos, "venta_id");
  if (!venta_id) return { error: "Datos inválidos." };

  const fecha = texto(datos, "fecha_pago");
  if (!esFechaISO(fecha)) return { error: "La fecha del pago no es válida." };

  const montoPago = parsearMonto(texto(datos, "monto"));
  if (!montoPago || !montoPago.greaterThan(0)) {
    return { error: "El monto del pago debe ser mayor que cero." };
  }

  const metodo = texto(datos, "metodo");
  if (!esMetodoPago(metodo)) return { error: "Indique el método de pago." };

  // El reparto llega serializado desde el formulario, que ya lo mostró.
  let aplicaciones: Aplicacion[] | null = null;
  const repartoBruto = texto(datos, "reparto");
  if (repartoBruto) {
    try {
      const crudo = JSON.parse(repartoBruto) as unknown;
      if (!Array.isArray(crudo)) throw new Error("formato");
      aplicaciones = crudo.map((fila) => {
        const f = fila as { cuota_id?: unknown; monto?: unknown };
        const m = parsearMonto(String(f.monto ?? ""));
        if (typeof f.cuota_id !== "string" || !m) throw new Error("formato");
        return { cuota_id: f.cuota_id, monto: aNumeric(m) };
      });
      if (aplicaciones.length === 0) aplicaciones = null;
    } catch {
      return { error: "El reparto del pago no es válido. Vuelva a intentarlo." };
    }
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("registrar_pago", {
    p_venta_id: venta_id,
    p_fecha: fecha,
    p_monto: aNumeric(montoPago),
    p_metodo: metodo,
    p_referencia: texto(datos, "referencia") || null,
    p_notas: texto(datos, "notas") || null,
    p_aplicaciones: aplicaciones,
  });

  if (error) return { error: mensajeError(error) };

  const resultado = data as { pago_id: string };

  revalidatePath("/pagos");
  revalidatePath("/recibos");
  revalidatePath("/ventas");
  revalidatePath("/solares");
  revalidatePath(`/ventas/${venta_id}`);
  redirect(`/pagos/${resultado.pago_id}`);
}

/**
 * Reversar: solo gerencia, con motivo obligatorio. No borra nada — registra el
 * movimiento contrario y emite la nota de crédito contra el recibo original.
 */
export async function reversarPago(
  _estado: EstadoPagoForm,
  datos: FormData,
): Promise<EstadoPagoForm> {
  await requerirRol("gerencia");

  const id = texto(datos, "id");
  const motivo = texto(datos, "motivo");
  if (!id) return { error: "Datos inválidos." };
  if (!motivo) return { error: "Escriba el motivo del reverso." };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("reversar_pago", {
    p_pago_id: id,
    p_motivo: motivo,
  });

  if (error) return { error: mensajeError(error) };

  const resultado = data as { nota_credito_numero: number };

  revalidatePath("/pagos");
  revalidatePath("/recibos");
  revalidatePath("/ventas");
  revalidatePath(`/pagos/${id}`);
  return {
    mensaje: `Pago reversado. Se emitió la nota de crédito ${resultado.nota_credito_numero}.`,
  };
}
