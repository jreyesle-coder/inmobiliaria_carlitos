"use client";

import { useActionState } from "react";
import {
  cambiarActivo,
  cambiarRol,
  type EstadoUsuarios,
} from "./acciones";
import { ETIQUETAS_ROL, ROLES, type Perfil } from "@/lib/roles";

export function FilaUsuario({
  perfil,
  esUsuarioActual,
}: {
  perfil: Perfil;
  esUsuarioActual: boolean;
}) {
  const [estadoRol, accionRol] = useActionState<EstadoUsuarios, FormData>(
    cambiarRol,
    {},
  );
  const [estadoActivo, accionActivo] = useActionState<EstadoUsuarios, FormData>(
    cambiarActivo,
    {},
  );

  const error = estadoRol.error ?? estadoActivo.error;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
      <div className="min-w-0">
        <div className="font-medium">
          {perfil.nombre_completo || perfil.correo}
          {esUsuarioActual ? (
            <span className="text-muted-foreground font-normal"> (usted)</span>
          ) : null}
        </div>
        <div className="text-muted-foreground truncate">{perfil.correo}</div>
        {error ? <div className="text-red-700">{error}</div> : null}
      </div>

      <div className="flex items-center gap-2">
        <form action={accionRol} className="flex items-center gap-2">
          <input type="hidden" name="perfil_id" value={perfil.id} />
          <select
            name="rol"
            defaultValue={perfil.rol}
            disabled={esUsuarioActual}
            className="border-input h-9 rounded-md border px-2 text-sm disabled:opacity-60"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ETIQUETAS_ROL[r]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={esUsuarioActual}
            className="h-9 rounded-md border px-3 text-sm disabled:opacity-60"
          >
            Guardar
          </button>
        </form>

        <form action={accionActivo}>
          <input type="hidden" name="perfil_id" value={perfil.id} />
          <input type="hidden" name="activo" value={String(!perfil.activo)} />
          <button
            type="submit"
            disabled={esUsuarioActual}
            className="h-9 rounded-md border px-3 text-sm disabled:opacity-60"
          >
            {perfil.activo ? "Desactivar" : "Activar"}
          </button>
        </form>
      </div>
    </li>
  );
}
