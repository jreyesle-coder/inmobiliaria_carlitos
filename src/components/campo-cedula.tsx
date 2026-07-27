"use client";

import { useState } from "react";
import { formatearCedula, revisarCedula } from "@/lib/personas";

/**
 * Campo de cédula con la advertencia del dígito verificador en vivo. Lo usan
 * los formularios de clientes y de vendedores.
 *
 * La casilla "guardar igual" solo aparece cuando hace falta: si el dígito no
 * cuadra, la Server Action rechaza el guardado hasta que la marquen. Se hizo
 * así porque hay cédulas viejas legítimas que no pasan el cálculo y la regla
 * del proyecto es registrar lo que hay, no lo que debería ser.
 */
export function CampoCedula({
  defaultValue = "",
  etiqueta = "Cédula (opcional; queda pendiente)",
}: {
  defaultValue?: string;
  etiqueta?: string;
}) {
  const [valor, setValor] = useState(defaultValue);
  const revision = revisarCedula(valor);

  return (
    <div className="space-y-1">
      <label className="space-y-1">
        <span className="text-muted-foreground block text-xs">{etiqueta}</span>
        <input
          name="cedula"
          inputMode="numeric"
          placeholder="031-0123456-9"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="border-input h-9 w-full rounded-md border bg-transparent px-2 text-sm"
        />
      </label>
      {revision.estado === "invalida" ? (
        <p className="text-xs text-destructive">{revision.mensaje}</p>
      ) : null}
      {revision.estado === "dudosa" ? (
        <label className="flex items-start gap-2 text-xs text-estado-separado-foreground">
          <input type="checkbox" name="forzar_cedula" className="mt-0.5" />
          <span>
            El dígito verificador no cuadra. Márquelo para guardarla igual.
          </span>
        </label>
      ) : null}
      {revision.estado === "ok" ? (
        <p className="text-muted-foreground text-xs">
          Se guardará como {formatearCedula(revision.cedula)}.
        </p>
      ) : null}
    </div>
  );
}
