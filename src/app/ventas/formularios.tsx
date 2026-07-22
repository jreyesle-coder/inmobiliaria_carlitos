"use client";

import { useActionState, useMemo, useState } from "react";
import { formatearMoneda, parsearMonto } from "@/lib/moneda";
import {
  ETIQUETAS_ESTADO_VENTA,
  ETIQUETAS_TIPO_CUOTA,
  calcularCapital,
  calcularSeparacionSugerida,
  formatearFecha,
  generarPlan,
  hoyISO,
  parsearCuotas,
  revisarMontosVenta,
  totalDelPlan,
  type EstadoVenta,
} from "@/lib/ventas";
import {
  actualizarVenta,
  cambiarEstadoContrato,
  cambiarEstadoVenta,
  cancelarVenta,
  crearVenta,
  regenerarPlan,
  type EstadoVentaForm,
} from "./acciones";

/** Estilos compartidos: la app todavía no tiene componentes de formulario. */
const campo =
  "border-input h-9 w-full rounded-md border bg-transparent px-2 text-sm";
const boton = "h-9 rounded-md border px-3 text-sm disabled:opacity-60";
const etiqueta = "text-muted-foreground block text-xs";

function Aviso({ estado }: { estado: EstadoVentaForm }) {
  if (estado.error) return <p className="text-sm text-red-700">{estado.error}</p>;
  if (estado.mensaje)
    return <p className="text-sm text-emerald-700">{estado.mensaje}</p>;
  return null;
}

export type OpcionSolar = {
  id: string;
  numero: string;
  manzana: string;
  valor_total: string;
};

export type OpcionSimple = { id: string; nombre: string };

export type VentaEditable = {
  id: string;
  solar_id: string;
  cliente_id: string;
  vendedor_id: string | null;
  fecha_venta: string;
  precio_pactado: string;
  monto_separacion: string;
  monto_inicial: string;
  cuotas_inicial: number;
  cuotas_capital: number;
  estado_contrato: "pendiente" | "listo";
  notas: string | null;
};

/**
 * Alta y edición de la venta. Muestra el plan de pagos **antes** de guardarlo,
 * con las mismas reglas que después aplica la base (`generar_plan_pagos`): lo
 * que se ve aquí es lo que se va a guardar.
 */
export function FormularioVenta({
  solares,
  clientes,
  vendedores,
  configuracion,
  venta,
}: {
  solares: OpcionSolar[];
  clientes: OpcionSimple[];
  vendedores: OpcionSimple[];
  configuracion: {
    cuotasInicial: number;
    separacionPorcentaje: string;
    cuotasCapital: number;
  };
  venta?: VentaEditable;
}) {
  const [estado, accion, pendiente] = useActionState<EstadoVentaForm, FormData>(
    venta ? actualizarVenta : crearVenta,
    {},
  );

  const [solarId, setSolarId] = useState(venta?.solar_id ?? "");
  const [fecha, setFecha] = useState(venta?.fecha_venta ?? hoyISO());
  const [precio, setPrecio] = useState(venta?.precio_pactado ?? "");
  const [separacion, setSeparacion] = useState(venta?.monto_separacion ?? "");
  const [inicial, setInicial] = useState(venta?.monto_inicial ?? "");
  const [cuotasInicial, setCuotasInicial] = useState(
    String(venta?.cuotas_inicial ?? configuracion.cuotasInicial),
  );
  const [cuotasCapital, setCuotasCapital] = useState(
    String(venta?.cuotas_capital ?? configuracion.cuotasCapital),
  );

  const solar = solares.find((s) => s.id === solarId);

  /** Al elegir el solar se proponen precio y separación; se pueden cambiar. */
  function elegirSolar(id: string) {
    setSolarId(id);
    const elegido = solares.find((s) => s.id === id);
    if (!elegido || venta) return;
    setPrecio(elegido.valor_total);
    setSeparacion(
      calcularSeparacionSugerida(
        elegido.valor_total,
        configuracion.separacionPorcentaje,
      ),
    );
  }

  const previa = useMemo(() => {
    const p = parsearMonto(precio);
    const s = parsearMonto(separacion || "0");
    const i = parsearMonto(inicial || "0");
    const ci = parsearCuotas(cuotasInicial);
    const cc = parsearCuotas(cuotasCapital);
    if (!p || !s || !i || !ci || !cc) return null;

    const problema = revisarMontosVenta({
      precio_pactado: p,
      monto_separacion: s,
      monto_inicial: i,
      cuotas_inicial: ci,
      cuotas_capital: cc,
    });
    if (problema) return { problema };

    const plan = generarPlan({
      fecha_venta: fecha,
      precio_pactado: p,
      monto_separacion: s,
      monto_inicial: i,
      cuotas_inicial: ci,
      cuotas_capital: cc,
    });
    return {
      plan,
      total: totalDelPlan(plan),
      capital: calcularCapital(p, s, i),
    };
  }, [precio, separacion, inicial, cuotasInicial, cuotasCapital, fecha]);

  return (
    <form action={accion} className="space-y-6">
      {venta ? <input type="hidden" name="id" value={venta.id} /> : null}

      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={etiqueta}>Solar</span>
          <select
            name="solar_id"
            required
            value={solarId}
            onChange={(e) => elegirSolar(e.target.value)}
            className={campo}
          >
            <option value="">Seleccione…</option>
            {solares.map((s) => (
              <option key={s.id} value={s.id}>
                {s.manzana} · {s.numero} — {formatearMoneda(s.valor_total)}
              </option>
            ))}
          </select>
          {solares.length === 0 ? (
            <span className="text-xs text-amber-700">
              No hay solares libres en el inventario.
            </span>
          ) : null}
        </label>

        <label className="space-y-1">
          <span className={etiqueta}>Cliente</span>
          <select
            name="cliente_id"
            required
            defaultValue={venta?.cliente_id ?? ""}
            className={campo}
          >
            <option value="">Seleccione…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className={etiqueta}>Vendedor</span>
          <select
            name="vendedor_id"
            defaultValue={venta?.vendedor_id ?? ""}
            className={campo}
          >
            <option value="">Sin vendedor asignado</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className={etiqueta}>Fecha de la venta</span>
          <input
            name="fecha_venta"
            type="date"
            required
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={campo}
          />
        </label>

        <label className="space-y-1">
          <span className={etiqueta}>
            Precio pactado
            {solar ? ` · solar: ${formatearMoneda(solar.valor_total)}` : ""}
          </span>
          <input
            name="precio_pactado"
            inputMode="decimal"
            required
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            className={campo}
          />
        </label>

        <label className="space-y-1">
          <span className={etiqueta}>
            Separación (sugerida:{" "}
            {(Number(configuracion.separacionPorcentaje) * 100).toFixed(2)}%)
          </span>
          <input
            name="monto_separacion"
            inputMode="decimal"
            value={separacion}
            onChange={(e) => setSeparacion(e.target.value)}
            className={campo}
          />
        </label>

        <label className="space-y-1">
          <span className={etiqueta}>Inicial</span>
          <input
            name="monto_inicial"
            inputMode="decimal"
            value={inicial}
            onChange={(e) => setInicial(e.target.value)}
            className={campo}
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className={etiqueta}>Cuotas de la inicial</span>
            <input
              name="cuotas_inicial"
              inputMode="numeric"
              value={cuotasInicial}
              onChange={(e) => setCuotasInicial(e.target.value)}
              className={campo}
            />
          </label>
          <label className="space-y-1">
            <span className={etiqueta}>Cuotas del capital</span>
            <input
              name="cuotas_capital"
              inputMode="numeric"
              value={cuotasCapital}
              onChange={(e) => setCuotasCapital(e.target.value)}
              className={campo}
            />
          </label>
        </div>

        <label className="space-y-1">
          <span className={etiqueta}>Contrato</span>
          <select
            name="estado_contrato"
            defaultValue={venta?.estado_contrato ?? "pendiente"}
            className={campo}
          >
            <option value="pendiente">Pendiente</option>
            <option value="listo">Listo</option>
          </select>
        </label>

        <label className="space-y-1 sm:col-span-2">
          <span className={etiqueta}>Notas</span>
          <textarea
            name="notas"
            rows={2}
            defaultValue={venta?.notas ?? ""}
            className="border-input w-full rounded-md border bg-transparent px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <PlanPrevio previa={previa} />

      <Aviso estado={estado} />
      <button type="submit" disabled={pendiente} className={boton}>
        {pendiente
          ? "Guardando…"
          : venta
            ? "Guardar cambios"
            : "Registrar venta y generar el plan"}
      </button>
      {venta ? (
        <p className="text-muted-foreground text-xs">
          Cambiar montos o plazos no rehace el plan por sí solo: use «Rehacer el
          plan de pagos» abajo.
        </p>
      ) : null}
    </form>
  );
}

type Previa =
  | { problema: string }
  | {
      plan: ReturnType<typeof generarPlan>;
      total: ReturnType<typeof totalDelPlan>;
      capital: ReturnType<typeof calcularCapital>;
    }
  | null;

/** Vista previa del plan; es exactamente lo que va a generar la base. */
function PlanPrevio({ previa }: { previa: Previa }) {
  if (!previa) {
    return (
      <p className="text-muted-foreground text-sm">
        Complete el solar, el precio y los plazos para ver el plan de pagos.
      </p>
    );
  }
  if ("problema" in previa) {
    return <p className="text-sm text-amber-700">{previa.problema}</p>;
  }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">
          Plan de pagos ({previa.plan.length} cuota
          {previa.plan.length === 1 ? "" : "s"})
        </h2>
        <p className="text-muted-foreground text-xs">
          Capital a financiar: {formatearMoneda(previa.capital)} · Total del
          plan: {formatearMoneda(previa.total)}
        </p>
      </div>
      <div className="max-h-72 overflow-y-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Concepto</th>
              <th className="px-4 py-2 font-medium">Vence</th>
              <th className="px-4 py-2 text-right font-medium">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {previa.plan.map((c) => (
              <tr key={`${c.tipo}-${c.numero}`}>
                <td className="px-4 py-1.5">
                  {ETIQUETAS_TIPO_CUOTA[c.tipo]} {c.numero}
                </td>
                <td className="px-4 py-1.5 whitespace-nowrap">
                  {formatearFecha(c.fecha_vencimiento)}
                </td>
                <td className="px-4 py-1.5 text-right whitespace-nowrap">
                  {formatearMoneda(c.monto_esperado)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Rehacer el plan: la base lo frena si alguna cuota ya tiene dinero. */
export function BotonRegenerarPlan({ ventaId }: { ventaId: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoVentaForm, FormData>(
    regenerarPlan,
    {},
  );

  return (
    <form action={accion} className="space-y-2">
      <input type="hidden" name="id" value={ventaId} />
      <button type="submit" disabled={pendiente} className={boton}>
        {pendiente ? "Rehaciendo…" : "Rehacer el plan de pagos"}
      </button>
      <Aviso estado={estado} />
    </form>
  );
}

export function FormularioEstadoVenta({
  ventaId,
  estadoActual,
  destinos,
}: {
  ventaId: string;
  estadoActual: EstadoVenta;
  destinos: EstadoVenta[];
}) {
  const [estado, accion, pendiente] = useActionState<EstadoVentaForm, FormData>(
    cambiarEstadoVenta,
    {},
  );

  if (destinos.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        La venta está en un estado final: no admite más cambios.
      </p>
    );
  }

  return (
    <form action={accion} className="space-y-2">
      <input type="hidden" name="id" value={ventaId} />
      <input type="hidden" name="estado_actual" value={estadoActual} />
      <div className="flex flex-wrap items-center gap-2">
        <select name="estado_nuevo" defaultValue={destinos[0]} className={campo + " w-48"}>
          {destinos.map((e) => (
            <option key={e} value={e}>
              {ETIQUETAS_ESTADO_VENTA[e]}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pendiente} className={boton}>
          {pendiente ? "Cambiando…" : "Cambiar estado"}
        </button>
      </div>
      <Aviso estado={estado} />
    </form>
  );
}

export function FormularioContrato({
  ventaId,
  actual,
}: {
  ventaId: string;
  actual: "pendiente" | "listo";
}) {
  const [estado, accion, pendiente] = useActionState<EstadoVentaForm, FormData>(
    cambiarEstadoContrato,
    {},
  );
  const destino = actual === "listo" ? "pendiente" : "listo";

  return (
    <form action={accion} className="space-y-2">
      <input type="hidden" name="id" value={ventaId} />
      <input type="hidden" name="estado_contrato" value={destino} />
      <button type="submit" disabled={pendiente} className={boton}>
        {pendiente
          ? "Guardando…"
          : destino === "listo"
            ? "Marcar contrato listo"
            : "Marcar contrato pendiente"}
      </button>
      <Aviso estado={estado} />
    </form>
  );
}

/** Cancelar: gerencia, con motivo obligatorio. Libera el solar. */
export function BotonCancelarVenta({ ventaId }: { ventaId: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoVentaForm, FormData>(
    cancelarVenta,
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
        Cancelar esta venta
      </button>
    );
  }

  return (
    <form action={accion} className="max-w-md space-y-2">
      <input type="hidden" name="id" value={ventaId} />
      <p className="text-sm">
        Cancelar devuelve el solar al inventario y retira el plan de cuotas. No
        se puede si la venta ya tiene pagos registrados.
      </p>
      <label className="space-y-1">
        <span className={etiqueta}>Motivo</span>
        <input name="motivo" required className={campo} />
      </label>
      <Aviso estado={estado} />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pendiente}
          className="h-9 rounded-md border border-red-300 px-3 text-sm text-red-700 disabled:opacity-60"
        >
          {pendiente ? "Cancelando…" : "Sí, cancelar la venta"}
        </button>
        <button type="button" className={boton} onClick={() => setConfirmando(false)}>
          Volver
        </button>
      </div>
    </form>
  );
}
