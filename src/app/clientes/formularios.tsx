"use client";

import { useActionState, useState } from "react";
import { CampoCedula } from "@/components/campo-cedula";
import {
  actualizarCliente,
  cargarCedula,
  crearCliente,
  eliminarCliente,
  type EstadoCliente,
} from "./acciones";

/** Estilos compartidos: la app todavía no tiene componentes de formulario. */
const campo =
  "border-input h-9 w-full rounded-md border bg-transparent px-2 text-sm";
const boton = "h-9 rounded-md border px-3 text-sm disabled:opacity-60";
const etiqueta = "text-muted-foreground block text-xs";

function Aviso({ estado }: { estado: EstadoCliente }) {
  if (estado.error) return <p className="text-sm text-red-700">{estado.error}</p>;
  if (estado.mensaje)
    return <p className="text-sm text-emerald-700">{estado.mensaje}</p>;
  return null;
}

export type ClienteEditable = {
  id: string;
  nombre_completo: string;
  cedula: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  notas: string | null;
};

/** Alta y edición comparten los mismos campos; cambia la acción y el botón. */
export function FormularioCliente({ cliente }: { cliente?: ClienteEditable }) {
  const [estado, accion, pendiente] = useActionState<EstadoCliente, FormData>(
    cliente ? actualizarCliente : crearCliente,
    {},
  );

  return (
    <form action={accion} className="space-y-4 rounded-lg border p-4">
      {cliente ? <input type="hidden" name="id" value={cliente.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={etiqueta}>Nombre completo</span>
          <input
            name="nombre_completo"
            required
            defaultValue={cliente?.nombre_completo ?? ""}
            className={campo}
          />
        </label>
        <CampoCedula defaultValue={cliente?.cedula ?? ""} />
        <label className="space-y-1">
          <span className={etiqueta}>Teléfono</span>
          <input
            name="telefono"
            inputMode="tel"
            placeholder="809-555-1234"
            defaultValue={cliente?.telefono ?? ""}
            className={campo}
          />
        </label>
        <label className="space-y-1">
          <span className={etiqueta}>Correo</span>
          <input
            name="correo"
            type="email"
            defaultValue={cliente?.correo ?? ""}
            className={campo}
          />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className={etiqueta}>Dirección</span>
          <input
            name="direccion"
            defaultValue={cliente?.direccion ?? ""}
            className={campo}
          />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className={etiqueta}>Notas</span>
          <textarea
            name="notas"
            rows={2}
            defaultValue={cliente?.notas ?? ""}
            className="border-input w-full rounded-md border bg-transparent px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <Aviso estado={estado} />
      <button type="submit" disabled={pendiente} className={boton}>
        {pendiente
          ? "Guardando…"
          : cliente
            ? "Guardar cambios"
            : "Registrar cliente"}
      </button>
    </form>
  );
}

/** Fila de la bandeja de pendientes: solo carga la cédula que falta. */
export function FormularioCargarCedula({
  clienteId,
}: {
  clienteId: string;
}) {
  const [estado, accion, pendiente] = useActionState<EstadoCliente, FormData>(
    cargarCedula,
    {},
  );

  return (
    <form action={accion} className="space-y-1">
      <input type="hidden" name="id" value={clienteId} />
      <div className="flex items-start gap-2">
        <div className="w-52">
          <CampoCedula etiqueta="Cédula" />
        </div>
        <button type="submit" disabled={pendiente} className={boton}>
          {pendiente ? "Guardando…" : "Cargar"}
        </button>
      </div>
      <Aviso estado={estado} />
    </form>
  );
}

/** Borrar cliente: gerencia, y la base lo frena si ya tiene ventas. */
export function BotonEliminarCliente({ clienteId }: { clienteId: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoCliente, FormData>(
    eliminarCliente,
    {},
  );
  const [confirmando, setConfirmando] = useState(false);

  if (!confirmando) {
    return (
      <button
        type="button"
        className="text-sm text-red-700 underline underline-offset-4"
        onClick={() => setConfirmando(true)}
      >
        Eliminar cliente
      </button>
    );
  }

  return (
    <form action={accion} className="space-y-2">
      <input type="hidden" name="id" value={clienteId} />
      <p className="text-sm">
        ¿Eliminar este cliente? No se puede si ya tiene ventas registradas.
      </p>
      <Aviso estado={estado} />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pendiente}
          className="h-9 rounded-md border border-red-300 px-3 text-sm text-red-700 disabled:opacity-60"
        >
          {pendiente ? "Eliminando…" : "Sí, eliminar"}
        </button>
        <button
          type="button"
          className={boton}
          onClick={() => setConfirmando(false)}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
