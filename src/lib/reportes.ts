/**
 * Helpers puros de los reportes (Sprint 8): tipos de las filas que devuelven
 * las vistas `reporte_*`, etiquetas y armado de CSV. Sin dependencias de
 * servidor: los importa tanto el tablero como el route handler de exportación.
 *
 * El dinero llega como string desde `numeric(14,2)` y así se queda: para el CSV
 * no se convierte a `number` (regla dura del proyecto), solo se formatea.
 */

import { formatearMoneda, monto, Decimal, type MontoEntrada } from "@/lib/moneda";
import type { EstadoVenta, EstadoContrato, TipoCuota } from "@/lib/ventas";
import type { EstadoSolar } from "@/lib/solares";

// --- Filas de las vistas -----------------------------------------------------

export type FilaInventario = {
  estado: EstadoSolar;
  cantidad: number;
  valor_total: string;
};

export type FilaReporteVenta = {
  venta_id: string;
  fecha_venta: string;
  estado: EstadoVenta;
  estado_contrato: EstadoContrato;
  precio_pactado: string;
  vendedor_id: string | null;
  vendedor_nombre: string | null;
  cliente_id: string;
  cliente_nombre: string | null;
  solar_id: string;
  solar_numero: string | null;
  manzana_codigo: string | null;
  total_recibido: string | null;
  total_aplicado: string | null;
  saldo_a_favor: string | null;
  balance_pendiente: string | null;
  vencido_pendiente: string | null;
};

export type FilaRecaudoMes = {
  mes: string; // "YYYY-MM-01"
  recaudo_neto: string;
  pagos: number;
  reversos: number;
};

export type FilaCuotaVencida = {
  cuota_id: string;
  venta_id: string;
  tipo: TipoCuota;
  numero: number;
  fecha_vencimiento: string;
  monto_esperado: string;
  monto_aplicado: string;
  saldo: string;
  dias_vencida: number;
  vendedor_id: string | null;
  vendedor_nombre: string | null;
  cliente_nombre: string | null;
  solar_numero: string | null;
  manzana_codigo: string | null;
};

// --- Etiquetas ---------------------------------------------------------------

const MESES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
] as const;

/** "2026-03-01" → "marzo 2026". Se parsea el string, sin `Date`, para no
 * arriesgar un corrimiento por zona horaria. */
export function etiquetaMes(mesISO: string): string {
  const [anio, mes] = mesISO.split("-");
  const i = Number(mes) - 1;
  const nombre = MESES_ES[i] ?? mes;
  return `${nombre} ${anio}`;
}

/** Etiqueta de solar "R · 12" a partir de manzana y número. */
export function etiquetaSolar(
  manzana: string | null,
  numero: string | null,
): string {
  if (!numero) return "—";
  return `${manzana ?? "—"} · ${numero}`;
}

// --- Sumas para los tableros -------------------------------------------------

/** Suma una columna de montos (strings numeric) devolviendo Decimal exacto. */
export function sumarMontos(valores: (string | null | undefined)[]): Decimal {
  return valores.reduce<Decimal>(
    (acc, v) => (v == null ? acc : acc.plus(monto(v))),
    new Decimal(0),
  );
}

// --- CSV ---------------------------------------------------------------------

export type ColumnaCSV<T> = {
  titulo: string;
  valor: (fila: T) => string | number | null | undefined;
};

/** Escapa un campo de CSV: comillas dobles si trae coma, comilla o salto. */
function campoCSV(valor: string | number | null | undefined): string {
  const s = valor == null ? "" : String(valor);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Arma un CSV con BOM UTF-8 al frente para que Excel lo abra con los acentos
 * bien. Separador coma; los montos van sin símbolo para que Excel los tome
 * como número (`1234.56`, no `RD$ 1,234.56`).
 */
export function armarCSV<T>(filas: T[], columnas: ColumnaCSV<T>[]): string {
  const encabezado = columnas.map((c) => campoCSV(c.titulo)).join(",");
  const cuerpo = filas.map((f) =>
    columnas.map((c) => campoCSV(c.valor(f))).join(","),
  );
  return "﻿" + [encabezado, ...cuerpo].join("\r\n");
}

/** Monto para una celda de CSV: número plano de 2 decimales, sin símbolo. */
export function montoCSV(valor: MontoEntrada | null | undefined): string {
  if (valor == null) return "0.00";
  return monto(valor).toFixed(2);
}

/** Reexport cómodo para el tablero. */
export { formatearMoneda };
