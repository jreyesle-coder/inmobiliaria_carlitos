"use client";

import { useActionState, useState } from "react";
import { CampoCedula } from "@/components/campo-cedula";
import {
  actualizarVendedor,
  crearVendedor,
  type EstadoVendedor,
} from "./acciones";

const campo =
  "border-input h-9 w-full rounded-md border bg-transparent px-2 text-sm";
const boton = "h-9 rounded-md border px-3 text-sm disabled:opacity-60";
const etiqueta = "text-muted-foreground block text-xs";

function Aviso({ estado }: { estado: EstadoVendedor }) {
  if (estado.error) return <p className="text-sm text-destructive">{estado.error}</p>;
  if (estado.mensaje)
    return <p className="text-sm text-primary">{estado.mensaje}</p>;
  return null;
}

/** Usuarios del sistema disponibles para vincular. */
export type OpcionPerfil = {
  id: string;
  correo: string;
  nombre_completo: string;
  rol: string;
};

export type VendedorEditable = {
  id: string;
  nombre_completo: string;
  cedula: string | null;
  telefono: string | null;
  correo: string | null;
  perfil_id: string | null;
  activo: boolean;
};

function SelectorPerfil({
  perfiles,
  valor,
}: {
  perfiles: OpcionPerfil[];
  valor: string | null;
}) {
  return (
    <label className="space-y-1">
      <span className={etiqueta}>Usuario del sistema (opcional)</span>
      <select name="perfil_id" defaultValue={valor ?? ""} className={campo}>
        <option value="">Sin usuario vinculado</option>
        {perfiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre_completo || p.correo} · {p.correo}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FormularioVendedor({ perfiles }: { perfiles: OpcionPerfil[] }) {
  const [estado, accion, pendiente] = useActionState<EstadoVendedor, FormData>(
    crearVendedor,
    {},
  );
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <button type="button" className={boton} onClick={() => setAbierto(true)}>
        Nuevo vendedor
      </button>
    );
  }

  return (
    <form action={accion} className="w-full space-y-4 rounded-lg border p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={etiqueta}>Nombre completo</span>
          <input name="nombre_completo" required className={campo} />
        </label>
        <CampoCedula etiqueta="Cédula (opcional)" />
        <label className="space-y-1">
          <span className={etiqueta}>Teléfono</span>
          <input
            name="telefono"
            inputMode="tel"
            placeholder="809-555-1234"
            className={campo}
          />
        </label>
        <label className="space-y-1">
          <span className={etiqueta}>Correo</span>
          <input name="correo" type="email" className={campo} />
        </label>
        <SelectorPerfil perfiles={perfiles} valor={null} />
      </div>
      <p className="text-muted-foreground text-xs">
        Vincular un usuario es lo que le permite a esa persona ver sus ventas y
        sus comisiones, y solo las suyas.
      </p>
      <Aviso estado={estado} />
      <div className="flex gap-2">
        <button type="submit" disabled={pendiente} className={boton}>
          {pendiente ? "Guardando…" : "Guardar vendedor"}
        </button>
        <button type="button" className={boton} onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function FormularioEditarVendedor({
  vendedor,
  perfiles,
}: {
  vendedor: VendedorEditable;
  perfiles: OpcionPerfil[];
}) {
  const [estado, accion, pendiente] = useActionState<EstadoVendedor, FormData>(
    actualizarVendedor,
    {},
  );
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <button
        type="button"
        className="text-sm underline underline-offset-4"
        onClick={() => setAbierto(true)}
      >
        Editar
      </button>
    );
  }

  return (
    <form action={accion} className="w-full space-y-4 rounded-md border p-3">
      <input type="hidden" name="id" value={vendedor.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={etiqueta}>Nombre completo</span>
          <input
            name="nombre_completo"
            required
            defaultValue={vendedor.nombre_completo}
            className={campo}
          />
        </label>
        <CampoCedula
          etiqueta="Cédula (opcional)"
          defaultValue={vendedor.cedula ?? ""}
        />
        <label className="space-y-1">
          <span className={etiqueta}>Teléfono</span>
          <input
            name="telefono"
            inputMode="tel"
            defaultValue={vendedor.telefono ?? ""}
            className={campo}
          />
        </label>
        <label className="space-y-1">
          <span className={etiqueta}>Correo</span>
          <input
            name="correo"
            type="email"
            defaultValue={vendedor.correo ?? ""}
            className={campo}
          />
        </label>
        <SelectorPerfil perfiles={perfiles} valor={vendedor.perfil_id} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="activo" defaultChecked={vendedor.activo} />
        Vendedor activo
      </label>
      <Aviso estado={estado} />
      <div className="flex gap-2">
        <button type="submit" disabled={pendiente} className={boton}>
          {pendiente ? "Guardando…" : "Guardar cambios"}
        </button>
        <button type="button" className={boton} onClick={() => setAbierto(false)}>
          Cerrar
        </button>
      </div>
    </form>
  );
}
