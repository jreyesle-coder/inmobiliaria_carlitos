"use client";

import { useActionState } from "react";
import { marcarComision, type EstadoComision } from "./acciones";

const boton = "h-8 rounded-md border px-2.5 text-xs disabled:opacity-60";

/**
 * Botón para que gerencia marque una comisión pagada, o la devuelva a
 * pendiente. `pagada` es el estado ACTUAL de la comisión: el botón hace lo
 * contrario.
 */
export function BotonMarcarComision({
  comisionId,
  pagada,
}: {
  comisionId: string;
  pagada: boolean;
}) {
  const [estado, accion, pendiente] = useActionState<EstadoComision, FormData>(
    marcarComision,
    {},
  );

  return (
    <form action={accion} className="flex flex-col items-end gap-1">
      <input type="hidden" name="comision_id" value={comisionId} />
      <input type="hidden" name="pagada" value={pagada ? "false" : "true"} />
      <button type="submit" disabled={pendiente} className={boton}>
        {pendiente
          ? "Guardando…"
          : pagada
            ? "Devolver a pendiente"
            : "Marcar pagada"}
      </button>
      {estado.error ? (
        <span className="text-xs text-destructive">{estado.error}</span>
      ) : null}
    </form>
  );
}
