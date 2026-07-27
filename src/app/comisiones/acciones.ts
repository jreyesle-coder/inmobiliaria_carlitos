"use server";

import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Marcar una comisión pagada o devolverla a pendiente. La comprobación de que
 * quien llama es gerencia la hace la función `marcar_comision` en Postgres, no
 * esta capa. La comisión la genera sola la base al completarse la inicial: aquí
 * no se crean ni se borran comisiones a mano.
 */

export type EstadoComision = { error?: string; mensaje?: string };

export async function marcarComision(
  _estado: EstadoComision,
  datos: FormData,
): Promise<EstadoComision> {
  const comision_id = String(datos.get("comision_id") ?? "");
  const pagada = datos.get("pagada") === "true";

  if (!comision_id) return { error: "Datos inválidos." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("marcar_comision", {
    p_comision_id: comision_id,
    p_pagada: pagada,
  });

  if (error) return { error: error.message };

  revalidatePath("/comisiones");
  return {
    mensaje: pagada ? "Comisión marcada pagada." : "Comisión devuelta a pendiente.",
  };
}
