import Decimal from "decimal.js";

/**
 * Todo el dinero del sistema pasa por aquí.
 *
 * Regla dura del proyecto: NUNCA usar `float` ni el `number` de punto flotante
 * para montos. En la base son `numeric(14,2)` y viajan como string; en el
 * código son Decimal. Si un monto entra como `number` es un error de tipo,
 * no una conveniencia.
 */

// 14 dígitos totales, 2 decimales: el máximo representable es 999,999,999,999.99
export const MAX_MONTO = new Decimal("999999999999.99");

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type MontoEntrada = string | Decimal;

/** Convierte un valor de la base (string de `numeric`) a Decimal. */
export function monto(valor: MontoEntrada): Decimal {
  const d = valor instanceof Decimal ? valor : new Decimal(valor);
  if (!d.isFinite()) {
    throw new Error(`Monto inválido: ${String(valor)}`);
  }
  return d;
}

/** Serializa un Decimal para guardarlo en una columna `numeric(14,2)`. */
export function aNumeric(valor: MontoEntrada): string {
  const d = monto(valor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (d.abs().greaterThan(MAX_MONTO)) {
    throw new Error(`Monto fuera de rango para numeric(14,2): ${d.toString()}`);
  }
  return d.toFixed(2);
}

/**
 * Formato dominicano: `RD$ 1,500.00` — coma para miles, punto para centavos.
 * Se usa `es-DO`, que ya agrupa así.
 */
export function formatearMoneda(
  valor: MontoEntrada,
  opciones: { conSimbolo?: boolean } = {},
): string {
  const { conSimbolo = true } = opciones;
  const d = monto(valor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const numero = new Intl.NumberFormat("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(d.toFixed(2)));
  return conSimbolo ? `RD$ ${numero}` : numero;
}

/**
 * Lee lo que el usuario escribió en un campo de monto ("1,500.00", "RD$ 1500").
 * Devuelve null si no es un monto válido, para que la UI muestre el error.
 */
export function parsearMonto(entrada: string): Decimal | null {
  const limpio = entrada.replace(/RD\$/gi, "").replace(/,/g, "").trim();
  if (limpio === "" || !/^-?\d+(\.\d+)?$/.test(limpio)) return null;
  try {
    return monto(limpio);
  } catch {
    return null;
  }
}

export { Decimal };
