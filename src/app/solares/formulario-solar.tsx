"use client";

import { useActionState, useState } from "react";
import { actualizarSolar, crearSolar, type EstadoSolarForm } from "./acciones";
import { parsearMonto } from "@/lib/moneda";
import { formatRD } from "@/lib/format";
import {
  calcularValorTotal,
  ESTADOS_SOLAR,
  ETIQUETAS_ESTADO_SOLAR,
  parsearArea,
} from "@/lib/solares";

const campo =
  "border-input h-9 w-full rounded-md border bg-transparent px-2 text-sm";
const boton = "h-9 rounded-md border px-3 text-sm disabled:opacity-60";
const etiqueta = "text-muted-foreground block text-xs";

export type OpcionManzana = {
  id: string;
  codigo: string;
  proyecto: string;
  valor_m2_referencia: string | null;
};

export type SolarEditable = {
  id: string;
  manzana_id: string;
  numero: string;
  area_m2: string;
  valor_m2: string;
  valor_total: string;
  notas: string | null;
};

/**
 * Formulario de alta y edición. El total se sugiere en vivo (área × valor m²)
 * pero se puede sobrescribir: la data del Excel trae totales que no cuadran y
 * la regla es registrar lo que hay, no corregirlo aquí.
 */
export function FormularioSolar({
  manzanas,
  solar,
  manzanaPorDefecto,
}: {
  manzanas: OpcionManzana[];
  solar?: SolarEditable;
  manzanaPorDefecto?: string;
}) {
  const esEdicion = Boolean(solar);
  const [estado, accion, pendiente] = useActionState<EstadoSolarForm, FormData>(
    esEdicion ? actualizarSolar : crearSolar,
    {},
  );

  const [manzanaId, setManzanaId] = useState(
    solar?.manzana_id ?? manzanaPorDefecto ?? manzanas[0]?.id ?? "",
  );
  const [area, setArea] = useState(solar?.area_m2 ?? "");
  const [valorM2, setValorM2] = useState(solar?.valor_m2 ?? "");
  const [valorTotal, setValorTotal] = useState(solar?.valor_total ?? "");

  const areaDecimal = parsearArea(area);
  const valorDecimal = parsearMonto(valorM2);
  const sugerido =
    areaDecimal && valorDecimal && !valorDecimal.isNegative()
      ? calcularValorTotal(areaDecimal, valorDecimal)
      : null;

  const totalEscrito = parsearMonto(valorTotal);
  const difiere =
    sugerido !== null &&
    totalEscrito !== null &&
    !totalEscrito.equals(sugerido);

  const referencia = manzanas.find((m) => m.id === manzanaId)
    ?.valor_m2_referencia;

  return (
    <form action={accion} className="space-y-4 rounded-lg border p-4">
      {solar ? <input type="hidden" name="id" value={solar.id} /> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={etiqueta}>Manzana</span>
          <select
            name="manzana_id"
            required
            value={manzanaId}
            onChange={(e) => setManzanaId(e.target.value)}
            className={campo}
          >
            {manzanas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.proyecto} · Manzana {m.codigo}
              </option>
            ))}
          </select>
          {referencia ? (
            <span className="text-muted-foreground text-xs">
              Referencia de la manzana: {formatRD(referencia)} por m²
            </span>
          ) : null}
        </label>

        <label className="space-y-1">
          <span className={etiqueta}>Número del solar</span>
          <input
            name="numero"
            required
            defaultValue={solar?.numero}
            className={campo}
          />
        </label>

        <label className="space-y-1">
          <span className={etiqueta}>Área (m²)</span>
          <input
            name="area_m2"
            required
            inputMode="decimal"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="300.00"
            className={campo}
          />
        </label>

        <label className="space-y-1">
          <span className={etiqueta}>Valor por m²</span>
          <input
            name="valor_m2"
            required
            inputMode="decimal"
            value={valorM2}
            onChange={(e) => setValorM2(e.target.value)}
            placeholder="2,500.00"
            className={campo}
          />
        </label>

        <label className="space-y-1">
          <span className={etiqueta}>
            Valor total (vacío = calculado)
          </span>
          <input
            name="valor_total"
            inputMode="decimal"
            value={valorTotal}
            onChange={(e) => setValorTotal(e.target.value)}
            placeholder={sugerido ?? "0.00"}
            className={campo}
          />
          {sugerido ? (
            <span
              className={
                difiere
                  ? "block text-xs text-estado-separado-foreground"
                  : "text-muted-foreground block text-xs"
              }
            >
              Calculado: {formatRD(sugerido)}
              {difiere ? " — no coincide con lo escrito." : null}
            </span>
          ) : null}
        </label>

        {esEdicion ? null : (
          <label className="space-y-1">
            <span className={etiqueta}>Estado inicial</span>
            <select name="estado" defaultValue="libre" className={campo}>
              {ESTADOS_SOLAR.map((e) => (
                <option key={e} value={e}>
                  {ETIQUETAS_ESTADO_SOLAR[e]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <label className="block space-y-1">
        <span className={etiqueta}>Notas</span>
        <textarea
          name="notas"
          rows={2}
          defaultValue={solar?.notas ?? ""}
          className="border-input w-full rounded-md border bg-transparent px-2 py-1.5 text-sm"
        />
      </label>

      {estado.error ? (
        <p className="text-sm text-destructive">{estado.error}</p>
      ) : null}
      {estado.mensaje ? (
        <p className="text-sm text-primary">{estado.mensaje}</p>
      ) : null}

      <button type="submit" disabled={pendiente} className={boton}>
        {pendiente ? "Guardando…" : esEdicion ? "Guardar cambios" : "Crear solar"}
      </button>
    </form>
  );
}
