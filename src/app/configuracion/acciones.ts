"use server";

import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CLAVES_EDITABLES, type ClaveEditable } from "@/lib/configuracion";
import { porcentajeAFraccion } from "@/lib/comisiones";

/**
 * Cambiar una clave de negocio desde el sistema. La comprobación de gerencia y
 * la validación de fondo las hace `establecer_configuracion` en Postgres; acá
 * solo se traduce lo que escribe el usuario (un porcentaje "3" → la fracción
 * "0.0300" que guarda la base) y se dan mensajes en español.
 */

export type EstadoConfig = { error?: string; mensaje?: string };

const PORCENTAJES: ClaveEditable[] = [
  "comision_porcentaje",
  "separacion_porcentaje",
];

export async function guardarConfiguracion(
  _estado: EstadoConfig,
  datos: FormData,
): Promise<EstadoConfig> {
  const clave = String(datos.get("clave") ?? "") as ClaveEditable;
  const entrada = String(datos.get("valor") ?? "").trim();

  if (!CLAVES_EDITABLES.includes(clave)) {
    return { error: "Esa clave no se puede cambiar desde aquí." };
  }
  if (entrada === "") return { error: "Escriba un valor." };

  let valor: string;
  if (PORCENTAJES.includes(clave)) {
    const fraccion = porcentajeAFraccion(entrada);
    if (fraccion === null) {
      return { error: "El porcentaje debe ir entre 0 y 100 (por ejemplo, 3)." };
    }
    valor = fraccion;
  } else {
    // Cuotas: un entero mayor que cero.
    if (!/^\d+$/.test(entrada) || Number(entrada) < 1) {
      return { error: "El número de cuotas debe ser un entero mayor que cero." };
    }
    valor = entrada;
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("establecer_configuracion", {
    p_clave: clave,
    p_valor: valor,
  });

  if (error) return { error: error.message };

  // La separación y las cuotas alimentan el formulario de venta; el porcentaje
  // de comisión, la pantalla de comisiones.
  revalidatePath("/configuracion");
  revalidatePath("/comisiones");
  revalidatePath("/ventas/nueva");
  return { mensaje: "Configuración guardada." };
}
