import Decimal from "decimal.js";
import { aNumeric, monto, type MontoEntrada } from "@/lib/moneda";

/**
 * Reglas de la venta y del plan de pagos, sin dependencias de servidor: las
 * importan tanto las Server Actions como el formulario que muestra el plan
 * antes de guardarlo.
 *
 * El plan también se genera en la base de datos
 * (`public.generar_plan_pagos` en `supabase/sql/07_ventas.sql`), que es la
 * versión que manda: la migración del Excel (Sprint 7) no pasa por esta capa.
 * Las dos tienen que dar exactamente lo mismo; si se cambia una, se cambia la
 * otra y se corre `08_pruebas_ventas.sql`.
 */

export type EstadoVenta =
  | "separado"
  | "inicial"
  | "capital"
  | "saldado"
  | "cancelada";

export const ESTADOS_VENTA: EstadoVenta[] = [
  "separado",
  "inicial",
  "capital",
  "saldado",
  "cancelada",
];

export const ETIQUETAS_ESTADO_VENTA: Record<EstadoVenta, string> = {
  separado: "Separado",
  inicial: "Inicial",
  capital: "Capital",
  saldado: "Saldado",
  cancelada: "Cancelada",
};

export const COLORES_ESTADO_VENTA: Record<EstadoVenta, string> = {
  separado: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  inicial: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  capital:
    "bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200",
  saldado: "bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100",
  cancelada: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
};

/**
 * La venta recorre el mismo pipeline que el solar, sin saltos y con vuelta
 * atrás de un paso. `cancelada` se puede pedir desde cualquier estado que no
 * sea `saldado`, y de ahí no se vuelve: una venta caída se registra de nuevo.
 */
const TRANSICIONES_VENTA: Record<EstadoVenta, EstadoVenta[]> = {
  separado: ["inicial", "cancelada"],
  inicial: ["capital", "separado", "cancelada"],
  capital: ["saldado", "inicial", "cancelada"],
  saldado: [],
  cancelada: [],
};

export function transicionesVentaDesde(estado: EstadoVenta): EstadoVenta[] {
  return TRANSICIONES_VENTA[estado] ?? [];
}

export function esTransicionVentaValida(
  desde: EstadoVenta,
  hasta: EstadoVenta,
): boolean {
  return transicionesVentaDesde(desde).includes(hasta);
}

export const esEstadoVenta = (valor: string): valor is EstadoVenta =>
  (ESTADOS_VENTA as string[]).includes(valor);

export type EstadoContrato = "pendiente" | "listo";

export const ETIQUETAS_ESTADO_CONTRATO: Record<EstadoContrato, string> = {
  pendiente: "Contrato pendiente",
  listo: "Contrato listo",
};

export type TipoCuota = "separacion" | "inicial" | "capital";

export const ETIQUETAS_TIPO_CUOTA: Record<TipoCuota, string> = {
  separacion: "Separación",
  inicial: "Inicial",
  capital: "Capital",
};

export type EstadoCuota = "pendiente" | "parcial" | "pagada";

export const ETIQUETAS_ESTADO_CUOTA: Record<EstadoCuota, string> = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  pagada: "Pagada",
};

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

/**
 * Suma meses a una fecha `YYYY-MM-DD` trabajando con los números del string,
 * no con `Date`: un `new Date("2026-01-31")` se interpreta en UTC y al
 * formatearlo en horario local puede retroceder un día. Aquí no hay zonas
 * horarias de por medio.
 *
 * Si el día no existe en el mes destino (31 de enero + 1 mes) se recorta al
 * último día del mes, que es como se cobra en la práctica.
 */
export function sumarMeses(fechaISO: string, meses: number): string {
  const [a, m, d] = fechaISO.split("-").map((n) => Number(n));
  const total = (a * 12 + (m - 1)) + meses;
  const anioDestino = Math.floor(total / 12);
  const mesDestino = (total % 12) + 1;
  const ultimoDia = new Date(Date.UTC(anioDestino, mesDestino, 0)).getUTCDate();
  const dia = Math.min(d, ultimoDia);
  return [
    String(anioDestino).padStart(4, "0"),
    String(mesDestino).padStart(2, "0"),
    String(dia).padStart(2, "0"),
  ].join("-");
}

/** `YYYY-MM-DD` → `dd/mm/aaaa`, sin pasar por `Date`. */
export function formatearFecha(fechaISO: string): string {
  const [a, m, d] = fechaISO.split("-");
  return `${d}/${m}/${a}`;
}

export const esFechaISO = (valor: string) => /^\d{4}-\d{2}-\d{2}$/.test(valor);

/** Hoy en `YYYY-MM-DD`, en hora local (que es la del usuario, no UTC). */
export function hoyISO(): string {
  const ahora = new Date();
  return [
    String(ahora.getFullYear()).padStart(4, "0"),
    String(ahora.getMonth() + 1).padStart(2, "0"),
    String(ahora.getDate()).padStart(2, "0"),
  ].join("-");
}

// ---------------------------------------------------------------------------
// Montos
// ---------------------------------------------------------------------------

/** Separación sugerida = valor del solar × porcentaje de `configuracion`. */
export function calcularSeparacionSugerida(
  valorSolar: MontoEntrada,
  porcentaje: MontoEntrada,
): string {
  return aNumeric(monto(valorSolar).times(monto(porcentaje)));
}

/** Lo que queda a financiar: precio − separación − inicial. */
export function calcularCapital(
  precio_pactado: MontoEntrada,
  monto_separacion: MontoEntrada,
  monto_inicial: MontoEntrada,
): Decimal {
  return monto(precio_pactado)
    .minus(monto(monto_separacion))
    .minus(monto(monto_inicial));
}

/**
 * Reparte un monto en `n` cuotas iguales de centavo exacto. El residuo del
 * redondeo va **en la última**, así la suma siempre cuadra con el total: es la
 * regla que hace verificable el plan de pagos.
 */
export function repartirMonto(total: MontoEntrada, n: number): string[] {
  const t = monto(total);
  if (n < 1) return [];
  if (t.isZero()) return Array.from({ length: n }, () => "0.00");

  const base = t.dividedBy(n).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  const cuotas = Array.from({ length: n }, () => aNumeric(base));
  const acumulado = base.times(n - 1);
  cuotas[n - 1] = aNumeric(t.minus(acumulado));
  return cuotas;
}

// ---------------------------------------------------------------------------
// Plan de pagos
// ---------------------------------------------------------------------------

export type CuotaPlan = {
  tipo: TipoCuota;
  numero: number;
  monto_esperado: string;
  fecha_vencimiento: string;
};

export type DatosPlan = {
  fecha_venta: string;
  precio_pactado: MontoEntrada;
  monto_separacion: MontoEntrada;
  monto_inicial: MontoEntrada;
  cuotas_inicial: number;
  cuotas_capital: number;
};

/**
 * Arma el plan completo de una venta:
 *
 *   * **Separación**: una cuota que vence el mismo día de la venta (es lo que
 *     se paga para apartar el solar). Si la separación es 0 no se genera.
 *   * **Inicial**: `cuotas_inicial` cuotas mensuales; la primera vence al mes
 *     de la venta.
 *   * **Capital**: `cuotas_capital` cuotas mensuales que arrancan al mes
 *     siguiente de la última de la inicial.
 *
 * Sin interés ni mora: están preparados y desactivados (ver CLAUDE.md).
 * La suma de todas las cuotas es exactamente `precio_pactado`.
 */
export function generarPlan(datos: DatosPlan): CuotaPlan[] {
  const separacion = monto(datos.monto_separacion);
  const inicial = monto(datos.monto_inicial);
  const capital = calcularCapital(
    datos.precio_pactado,
    separacion,
    inicial,
  );

  const plan: CuotaPlan[] = [];

  if (separacion.greaterThan(0)) {
    plan.push({
      tipo: "separacion",
      numero: 1,
      monto_esperado: aNumeric(separacion),
      fecha_vencimiento: datos.fecha_venta,
    });
  }

  if (inicial.greaterThan(0) && datos.cuotas_inicial > 0) {
    repartirMonto(inicial, datos.cuotas_inicial).forEach((m, i) => {
      plan.push({
        tipo: "inicial",
        numero: i + 1,
        monto_esperado: m,
        fecha_vencimiento: sumarMeses(datos.fecha_venta, i + 1),
      });
    });
  }

  if (capital.greaterThan(0) && datos.cuotas_capital > 0) {
    // El capital arranca donde termina la inicial, no antes.
    const desplazamiento = inicial.greaterThan(0) ? datos.cuotas_inicial : 0;
    repartirMonto(capital, datos.cuotas_capital).forEach((m, i) => {
      plan.push({
        tipo: "capital",
        numero: i + 1,
        monto_esperado: m,
        fecha_vencimiento: sumarMeses(
          datos.fecha_venta,
          desplazamiento + i + 1,
        ),
      });
    });
  }

  return plan;
}

export function totalDelPlan(plan: CuotaPlan[]): Decimal {
  return plan.reduce(
    (suma, c) => suma.plus(monto(c.monto_esperado)),
    new Decimal(0),
  );
}

/**
 * Revisa los montos antes de guardar. Devuelve el mensaje en español o `null`
 * si todo cuadra. Las mismas reglas están como `check` en la base
 * (`07_ventas.sql`): aquí son para explicar, allá para impedir.
 */
export function revisarMontosVenta(datos: {
  precio_pactado: MontoEntrada;
  monto_separacion: MontoEntrada;
  monto_inicial: MontoEntrada;
  cuotas_inicial: number;
  cuotas_capital: number;
}): string | null {
  const precio = monto(datos.precio_pactado);
  const separacion = monto(datos.monto_separacion);
  const inicial = monto(datos.monto_inicial);

  if (!precio.greaterThan(0)) {
    return "El precio pactado debe ser mayor que cero.";
  }
  if (separacion.isNegative() || inicial.isNegative()) {
    return "La separación y la inicial no pueden ser negativas.";
  }
  if (separacion.plus(inicial).greaterThan(precio)) {
    return "La separación más la inicial no pueden superar el precio pactado.";
  }
  if (inicial.greaterThan(0) && datos.cuotas_inicial < 1) {
    return "La inicial necesita al menos una cuota.";
  }

  const capital = precio.minus(separacion).minus(inicial);
  if (capital.greaterThan(0) && datos.cuotas_capital < 1) {
    return "Queda capital por financiar: indique en cuántas cuotas se paga.";
  }
  return null;
}

/** Lee un entero de cuotas escrito por el usuario. `null` si no es válido. */
export function parsearCuotas(entrada: string): number | null {
  const limpio = entrada.trim();
  if (!/^\d+$/.test(limpio)) return null;
  const n = Number(limpio);
  return n >= 0 && n <= 600 ? n : null;
}
