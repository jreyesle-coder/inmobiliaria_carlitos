"use client";

import { useActionState, useState } from "react";
import {
  actualizarManzana,
  actualizarProyecto,
  crearManzana,
  crearProyecto,
  type EstadoFormulario,
} from "./acciones";

/** Estilos compartidos: la app todavía no tiene componentes de formulario. */
const campo =
  "border-input h-9 w-full rounded-md border bg-transparent px-2 text-sm";
const boton = "h-9 rounded-md border px-3 text-sm disabled:opacity-60";
const etiqueta = "text-muted-foreground block text-xs";

function Aviso({ estado }: { estado: EstadoFormulario }) {
  if (estado.error) return <p className="text-sm text-red-700">{estado.error}</p>;
  if (estado.mensaje)
    return <p className="text-sm text-emerald-700">{estado.mensaje}</p>;
  return null;
}

export function FormularioProyecto() {
  const [estado, accion, pendiente] = useActionState<EstadoFormulario, FormData>(
    crearProyecto,
    {},
  );
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <button type="button" className={boton} onClick={() => setAbierto(true)}>
        Nuevo proyecto
      </button>
    );
  }

  return (
    <form action={accion} className="w-full space-y-3 rounded-lg border p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1">
          <span className={etiqueta}>Nombre</span>
          <input name="nombre" required className={campo} />
        </label>
        <label className="space-y-1">
          <span className={etiqueta}>Ubicación</span>
          <input name="ubicacion" className={campo} />
        </label>
        <label className="space-y-1">
          <span className={etiqueta}>Descripción</span>
          <input name="descripcion" className={campo} />
        </label>
      </div>
      <Aviso estado={estado} />
      <div className="flex gap-2">
        <button type="submit" disabled={pendiente} className={boton}>
          {pendiente ? "Guardando…" : "Guardar proyecto"}
        </button>
        <button type="button" className={boton} onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function FormularioEditarProyecto({
  proyecto,
}: {
  proyecto: {
    id: string;
    nombre: string;
    descripcion: string | null;
    ubicacion: string | null;
    activo: boolean;
  };
}) {
  const [estado, accion, pendiente] = useActionState<EstadoFormulario, FormData>(
    actualizarProyecto,
    {},
  );
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <button type="button" className={boton} onClick={() => setAbierto(true)}>
        Editar
      </button>
    );
  }

  return (
    <form action={accion} className="w-full space-y-3 rounded-md border p-3">
      <input type="hidden" name="id" value={proyecto.id} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1">
          <span className={etiqueta}>Nombre</span>
          <input
            name="nombre"
            required
            defaultValue={proyecto.nombre}
            className={campo}
          />
        </label>
        <label className="space-y-1">
          <span className={etiqueta}>Ubicación</span>
          <input
            name="ubicacion"
            defaultValue={proyecto.ubicacion ?? ""}
            className={campo}
          />
        </label>
        <label className="space-y-1">
          <span className={etiqueta}>Descripción</span>
          <input
            name="descripcion"
            defaultValue={proyecto.descripcion ?? ""}
            className={campo}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="activo" defaultChecked={proyecto.activo} />
        Proyecto activo
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

export function FormularioManzana({ proyectoId }: { proyectoId: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoFormulario, FormData>(
    crearManzana,
    {},
  );
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <button type="button" className={boton} onClick={() => setAbierto(true)}>
        Agregar manzana
      </button>
    );
  }

  return (
    <form action={accion} className="w-full space-y-3 rounded-md border p-3">
      <input type="hidden" name="proyecto_id" value={proyectoId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1">
          <span className={etiqueta}>Código (B, C, D…)</span>
          <input name="codigo" required maxLength={10} className={campo} />
        </label>
        <label className="space-y-1">
          <span className={etiqueta}>Valor por m² de referencia</span>
          <input
            name="valor_m2_referencia"
            inputMode="decimal"
            placeholder="2,500.00"
            className={campo}
          />
        </label>
        <label className="space-y-1">
          <span className={etiqueta}>Descripción</span>
          <input name="descripcion" className={campo} />
        </label>
      </div>
      <Aviso estado={estado} />
      <div className="flex gap-2">
        <button type="submit" disabled={pendiente} className={boton}>
          {pendiente ? "Guardando…" : "Guardar manzana"}
        </button>
        <button type="button" className={boton} onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function FormularioEditarManzana({
  manzana,
}: {
  manzana: {
    id: string;
    codigo: string;
    descripcion: string | null;
    valor_m2_referencia: string | null;
  };
}) {
  const [estado, accion, pendiente] = useActionState<EstadoFormulario, FormData>(
    actualizarManzana,
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
    <form action={accion} className="w-full space-y-3 rounded-md border p-3">
      <input type="hidden" name="id" value={manzana.id} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1">
          <span className={etiqueta}>Código</span>
          <input
            name="codigo"
            required
            defaultValue={manzana.codigo}
            className={campo}
          />
        </label>
        <label className="space-y-1">
          <span className={etiqueta}>Valor por m² de referencia</span>
          <input
            name="valor_m2_referencia"
            inputMode="decimal"
            defaultValue={manzana.valor_m2_referencia ?? ""}
            className={campo}
          />
        </label>
        <label className="space-y-1">
          <span className={etiqueta}>Descripción</span>
          <input
            name="descripcion"
            defaultValue={manzana.descripcion ?? ""}
            className={campo}
          />
        </label>
      </div>
      <Aviso estado={estado} />
      <div className="flex gap-2">
        <button type="submit" disabled={pendiente} className={boton}>
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" className={boton} onClick={() => setAbierto(false)}>
          Cerrar
        </button>
      </div>
    </form>
  );
}
