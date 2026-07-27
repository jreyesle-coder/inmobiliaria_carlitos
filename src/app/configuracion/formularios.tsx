"use client";

import { useActionState } from "react";
import { guardarConfiguracion, type EstadoConfig } from "./acciones";

const campo =
  "border-input h-9 w-32 rounded-md border bg-transparent px-2 text-sm";
const boton = "h-9 rounded-md border px-3 text-sm disabled:opacity-60";
const etiqueta = "text-muted-foreground block text-xs";

export type CampoConfig = {
  clave: string;
  etiqueta: string;
  ayuda: string;
  tipo: "porcentaje" | "entero";
  /** Lo que se muestra en el input: "3" para 3%, "6" para 6 cuotas. */
  valorMostrado: string;
};

/** Una fila del formulario de configuración: una clave, su valor y "Guardar". */
export function FormularioClave({ campo: c }: { campo: CampoConfig }) {
  const [estado, accion, pendiente] = useActionState<EstadoConfig, FormData>(
    guardarConfiguracion,
    {},
  );

  return (
    <form action={accion} className="space-y-2 border-b px-4 py-4 last:border-b-0">
      <input type="hidden" name="clave" value={c.clave} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <span className="text-sm font-medium">{c.etiqueta}</span>
          <p className="text-muted-foreground text-xs">{c.ayuda}</p>
        </div>
        <div className="flex items-end gap-2">
          <label className="space-y-1">
            <span className={etiqueta}>
              {c.tipo === "porcentaje" ? "Porcentaje (%)" : "Cuotas"}
            </span>
            <div className="flex items-center gap-1">
              <input
                name="valor"
                defaultValue={c.valorMostrado}
                inputMode="decimal"
                className={campo}
              />
              {c.tipo === "porcentaje" ? (
                <span className="text-muted-foreground text-sm">%</span>
              ) : null}
            </div>
          </label>
          <button type="submit" disabled={pendiente} className={boton}>
            {pendiente ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
      {estado.error ? (
        <p className="text-sm text-destructive">{estado.error}</p>
      ) : null}
      {estado.mensaje ? (
        <p className="text-sm text-primary">{estado.mensaje}</p>
      ) : null}
    </form>
  );
}
