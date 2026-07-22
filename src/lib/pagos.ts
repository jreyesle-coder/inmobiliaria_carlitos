import Decimal from "decimal.js";
import { aNumeric, monto, type MontoEntrada } from "@/lib/moneda";

/**
 * Reglas de los pagos, sin dependencias de servidor: las importan tanto las
 * Server Actions como el formulario de cobro, que muestra cómo se va a repartir
 * el pago ANTES de guardarlo.
 *
 * La versión que manda es la de la base de datos (`public.registrar_pago` en
 * `supabase/sql/09_pagos.sql`): ahí el pago, sus aplicaciones y el recibo entran
 * en una sola transacción. Lo de aquí es para explicar y para no ofrecer
 * repartos imposibles. Si se cambia una, se cambia la otra y se corre
 * `10_pruebas_pagos.sql`.
 */

export type MetodoPago = "efectivo" | "transferencia";

export const METODOS_PAGO: MetodoPago[] = ["efectivo", "transferencia"];

export const ETIQUETAS_METODO_PAGO: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
};

export const esMetodoPago = (valor: string): valor is MetodoPago =>
  (METODOS_PAGO as string[]).includes(valor);

export type TipoRecibo = "pago" | "nota_credito";

export const ETIQUETAS_TIPO_RECIBO: Record<TipoRecibo, string> = {
  pago: "Recibo de pago",
  nota_credito: "Nota de crédito",
};

/**
 * Número de recibo como se imprime: la secuencia limpia del sistema, a seis
 * dígitos. Los números viejos del Excel viven aparte
 * (`recibos.numero_referencia_excel`) y nunca se mezclan con este.
 */
export function formatearNumeroRecibo(numero: number | string): string {
  return `REC-${String(numero).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// Reparto del pago entre las cuotas
// ---------------------------------------------------------------------------

export type CuotaCobrable = {
  id: string;
  tipo: "separacion" | "inicial" | "capital";
  numero: number;
  monto_esperado: string;
  monto_aplicado: string;
  fecha_vencimiento: string;
};

/** Lo que le falta a una cuota para quedar pagada. Nunca negativo. */
export function saldoCuota(cuota: CuotaCobrable): Decimal {
  const saldo = monto(cuota.monto_esperado).minus(monto(cuota.monto_aplicado));
  return saldo.isNegative() ? new Decimal(0) : saldo;
}

const ORDEN_TIPO = { separacion: 1, inicial: 2, capital: 3 } as const;

/** Orden de cobro: la cuota más vieja primero. Igual que en la base. */
export function ordenarCuotasPorCobro(cuotas: CuotaCobrable[]): CuotaCobrable[] {
  return [...cuotas].sort((a, b) => {
    if (a.fecha_vencimiento !== b.fecha_vencimiento) {
      return a.fecha_vencimiento < b.fecha_vencimiento ? -1 : 1;
    }
    if (a.tipo !== b.tipo) return ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo];
    return a.numero - b.numero;
  });
}

export type Aplicacion = { cuota_id: string; monto: string };

export type RepartoPago = {
  aplicaciones: Aplicacion[];
  aplicado: Decimal;
  /** Lo que el pago no alcanzó a cubrir: queda como saldo a favor. */
  saldo_a_favor: Decimal;
};

/**
 * Reparte el pago entre las cuotas pendientes, la más vieja primero, hasta
 * donde alcance. Lo que sobre NO infla ninguna cuota: queda como saldo a favor
 * del pago, que es lo que hace verificable el balance.
 */
export function repartirPago(
  montoPago: MontoEntrada,
  cuotas: CuotaCobrable[],
): RepartoPago {
  let restante = monto(montoPago);
  const aplicaciones: Aplicacion[] = [];

  for (const cuota of ordenarCuotasPorCobro(cuotas)) {
    if (!restante.greaterThan(0)) break;
    const saldo = saldoCuota(cuota);
    if (!saldo.greaterThan(0)) continue;
    const aplicar = Decimal.min(restante, saldo);
    aplicaciones.push({ cuota_id: cuota.id, monto: aNumeric(aplicar) });
    restante = restante.minus(aplicar);
  }

  return {
    aplicaciones,
    aplicado: monto(montoPago).minus(restante),
    saldo_a_favor: restante,
  };
}

/**
 * Revisa un reparto hecho a mano contra el pago y las cuotas. Devuelve el
 * mensaje en español o `null` si todo cuadra. Las mismas reglas las impide la
 * base; aquí se explican antes de intentarlo.
 */
export function revisarReparto(
  montoPago: MontoEntrada,
  aplicaciones: Aplicacion[],
  cuotas: CuotaCobrable[],
): string | null {
  const pago = monto(montoPago);
  if (!pago.greaterThan(0)) {
    return "El monto del pago debe ser mayor que cero.";
  }

  let suma = new Decimal(0);
  const vistas = new Set<string>();

  for (const ap of aplicaciones) {
    const cuota = cuotas.find((c) => c.id === ap.cuota_id);
    if (!cuota) return "Hay una cuota del reparto que no es de esta venta.";
    if (vistas.has(ap.cuota_id)) {
      return "Una cuota aparece dos veces en el reparto.";
    }
    vistas.add(ap.cuota_id);

    const m = monto(ap.monto);
    if (!m.greaterThan(0)) {
      return "Cada cuota del reparto debe llevar un monto mayor que cero.";
    }
    if (m.greaterThan(saldoCuota(cuota))) {
      return "A una cuota se le está aplicando más de lo que se le espera.";
    }
    suma = suma.plus(m);
  }

  if (suma.greaterThan(pago)) {
    return "Se está repartiendo más de lo que se recibió.";
  }
  return null;
}

/** Balance de la venta: lo esperado menos lo efectivamente aplicado. */
export function balancePendiente(
  precioPactado: MontoEntrada,
  totalAplicado: MontoEntrada,
): Decimal {
  return monto(precioPactado).minus(monto(totalAplicado));
}
