"use client";

import { useActionState } from "react";
import { cambiarEstadoSolar, type EstadoSolarForm } from "../acciones";
import {
  ETIQUETAS_ESTADO_SOLAR,
  transicionesDesde,
  type EstadoSolar,
} from "@/lib/solares";

/**
 * Solo ofrece las transiciones que el pipeline permite desde el estado actual.
 * El trigger `tr_validar_solar` vuelve a comprobarlo en la base de datos.
 */
export function CambiarEstado({
  solarId,
  estadoActual,
}: {
  solarId: string;
  estadoActual: EstadoSolar;
}) {
  const [estado, accion, pendiente] = useActionState<EstadoSolarForm, FormData>(
    cambiarEstadoSolar,
    {},
  );

  const posibles = transicionesDesde(estadoActual);

  if (posibles.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {ETIQUETAS_ESTADO_SOLAR[estadoActual]} es un estado final: no admite más
        cambios.
      </p>
    );
  }

  return (
    <form action={accion} className="space-y-2">
      <input type="hidden" name="id" value={solarId} />
      <input type="hidden" name="estado_actual" value={estadoActual} />
      <div className="flex flex-wrap items-center gap-2">
        <select
          name="estado_nuevo"
          className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
        >
          {posibles.map((e) => (
            <option key={e} value={e}>
              {ETIQUETAS_ESTADO_SOLAR[e]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pendiente}
          className="h-9 rounded-md border px-3 text-sm disabled:opacity-60"
        >
          {pendiente ? "Cambiando…" : "Cambiar estado"}
        </button>
      </div>
      {estado.error ? (
        <p className="text-sm text-red-700">{estado.error}</p>
      ) : null}
      {estado.mensaje ? (
        <p className="text-sm text-emerald-700">{estado.mensaje}</p>
      ) : null}
    </form>
  );
}
