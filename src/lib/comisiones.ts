import Decimal from "decimal.js";

/**
 * Helpers puros de comisiones (sin dependencias de servidor: los importan
 * componentes de cliente). La regla y el cálculo viven en la base
 * (`generar_comision` en supabase/sql/12_comisiones.sql); acá solo se da formato.
 */

export type EstadoComision = "pendiente" | "pagada";

export const ETIQUETAS_ESTADO_COMISION: Record<EstadoComision, string> = {
  pendiente: "Pendiente",
  pagada: "Pagada",
};

/**
 * Muestra una fracción de configuración como porcentaje: "0.0300" → "3%",
 * "0.0325" → "3.25%". Sin ceros de relleno a la derecha.
 */
export function formatearPorcentaje(fraccion: string | number): string {
  const pct = new Decimal(fraccion).times(100);
  const texto = pct
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toString(); // Decimal ya quita los ceros a la derecha
  return `${texto}%`;
}

/**
 * Convierte lo que gerencia escribe en el formulario ("3", "3.25", "3%") a la
 * fracción que guarda la base ("0.0300"). Devuelve null si no es un porcentaje
 * válido entre 0 y 100 (exclusivo).
 */
export function porcentajeAFraccion(entrada: string): string | null {
  const limpio = entrada.replace(/%/g, "").trim();
  if (limpio === "" || !/^\d+(\.\d+)?$/.test(limpio)) return null;
  const pct = new Decimal(limpio);
  if (pct.lessThan(0) || pct.greaterThanOrEqualTo(100)) return null;
  return pct.dividedBy(100).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);
}
