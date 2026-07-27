import Decimal from "decimal.js";
import { aNumeric, monto, type MontoEntrada } from "@/lib/moneda";

/**
 * Reglas del inventario sin dependencias de servidor: lo importan tanto las
 * Server Actions como los formularios de cliente.
 *
 * Las transiciones de estado están duplicadas a propósito en la base de datos
 * (`public.transicion_solar_valida` en `supabase/sql/03_inventario.sql`). Aquí
 * son para no ofrecer botones imposibles; allá son la barrera real. Si se
 * cambia una, hay que cambiar la otra.
 */

export type EstadoSolar =
  | "libre"
  | "separado"
  | "inicial"
  | "capital"
  | "saldado"
  | "area_comercial";

export const ESTADOS_SOLAR: EstadoSolar[] = [
  "libre",
  "separado",
  "inicial",
  "capital",
  "saldado",
  "area_comercial",
];

export const ETIQUETAS_ESTADO_SOLAR: Record<EstadoSolar, string> = {
  libre: "Libre",
  separado: "Separado",
  inicial: "Inicial",
  capital: "Capital",
  saldado: "Saldado",
  area_comercial: "Área comercial",
};

// El color de cada estado vive ahora en `lib/estados.ts` (tokens del tema) y se
// pinta con <EstadoBadge>. Aquí solo queda la etiqueta de texto.

/** Pipeline único: Libre → Separado → Inicial → Capital → Saldado. */
const TRANSICIONES: Record<EstadoSolar, EstadoSolar[]> = {
  libre: ["separado", "area_comercial"],
  separado: ["inicial", "libre"],
  inicial: ["capital", "separado"],
  capital: ["saldado", "inicial"],
  saldado: [],
  area_comercial: ["libre"],
};

/** Estados a los que se puede mover un solar desde el que tiene hoy. */
export function transicionesDesde(estado: EstadoSolar): EstadoSolar[] {
  return TRANSICIONES[estado] ?? [];
}

export function esTransicionValida(
  desde: EstadoSolar,
  hasta: EstadoSolar,
): boolean {
  return transicionesDesde(desde).includes(hasta);
}

export const esEstadoSolar = (valor: string): valor is EstadoSolar =>
  (ESTADOS_SOLAR as string[]).includes(valor);

/**
 * Valor total sugerido = área × valor por m². Se calcula con Decimal y se
 * devuelve como string `numeric(14,2)`.
 *
 * El total se guarda aparte porque el Excel de origen trae totales que no
 * cuadran con el producto; la pantalla muestra ambos y la diferencia.
 */
export function calcularValorTotal(
  area_m2: MontoEntrada,
  valor_m2: MontoEntrada,
): string {
  return aNumeric(monto(area_m2).times(monto(valor_m2)));
}

/** Diferencia entre lo guardado y lo calculado; 0 si cuadran. */
export function diferenciaValorTotal(
  area_m2: MontoEntrada,
  valor_m2: MontoEntrada,
  valor_total: MontoEntrada,
): Decimal {
  return monto(valor_total).minus(calcularValorTotal(area_m2, valor_m2));
}

/**
 * Lee un área escrita por el usuario ("300", "300.50"). Devuelve null si no es
 * un número positivo válido, para que la UI muestre el error.
 */
export function parsearArea(entrada: string): Decimal | null {
  const limpio = entrada.replace(/,/g, "").trim();
  if (limpio === "" || !/^\d+(\.\d+)?$/.test(limpio)) return null;
  const d = new Decimal(limpio);
  return d.isFinite() && d.greaterThan(0) ? d : null;
}
