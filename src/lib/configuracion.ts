import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Valores de negocio que viven en la tabla `configuracion`, no en el código.
 *
 * Julio confirmó las cifras "por el momento" (inicial en 6 cuotas, separación
 * del 5%): por eso se leen de la base y se cambian ahí, sin desplegar. Los
 * respaldos que hay aquí son la red por si falta la clave, no la fuente.
 */

const RESPALDOS: Record<string, string> = {
  cuotas_inicial_por_defecto: "6",
  separacion_porcentaje: "0.0500",
  cuotas_capital_por_defecto: "1",
  comision_porcentaje: "0.0300",
};

/**
 * Las claves de negocio que gerencia puede cambiar desde `/configuracion`.
 * Coinciden con la whitelist de `establecer_configuracion` en la base: si se
 * agrega una acá, hay que agregarla también allá.
 */
export const CLAVES_EDITABLES = [
  "comision_porcentaje",
  "separacion_porcentaje",
  "cuotas_inicial_por_defecto",
  "cuotas_capital_por_defecto",
] as const;

export type ClaveEditable = (typeof CLAVES_EDITABLES)[number];

export async function leerConfiguracion(
  claves: string[],
): Promise<Record<string, string>> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("configuracion")
    .select("clave, valor")
    .in("clave", claves);

  const valores: Record<string, string> = {};
  for (const clave of claves) {
    const fila = (data ?? []).find((c) => c.clave === clave);
    valores[clave] = fila?.valor ?? RESPALDOS[clave] ?? "";
  }
  return valores;
}

/** Las tres claves que usa el formulario de venta. */
export async function configuracionDeVentas() {
  const valores = await leerConfiguracion([
    "cuotas_inicial_por_defecto",
    "separacion_porcentaje",
    "cuotas_capital_por_defecto",
  ]);
  return {
    cuotasInicial: Number(valores.cuotas_inicial_por_defecto) || 6,
    separacionPorcentaje: valores.separacion_porcentaje || "0.0500",
    cuotasCapital: Number(valores.cuotas_capital_por_defecto) || 1,
  };
}
