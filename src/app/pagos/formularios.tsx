"use client";

import { useActionState, useMemo, useState } from "react";
import { Decimal, formatearMoneda, parsearMonto } from "@/lib/moneda";
import { ETIQUETAS_TIPO_CUOTA, formatearFecha, hoyISO } from "@/lib/ventas";
import {
  ETIQUETAS_METODO_PAGO,
  METODOS_PAGO,
  ordenarCuotasPorCobro,
  repartirPago,
  revisarReparto,
  saldoCuota,
  type Aplicacion,
  type CuotaCobrable,
} from "@/lib/pagos";
import { registrarPago, reversarPago, type EstadoPagoForm } from "./acciones";

/** Estilos compartidos: la app todavía no tiene componentes de formulario. */
const campo =
  "border-input h-9 w-full rounded-md border bg-transparent px-2 text-sm";
const boton = "h-9 rounded-md border px-3 text-sm disabled:opacity-60";
const etiqueta = "text-muted-foreground block text-xs";

function Aviso({ estado }: { estado: EstadoPagoForm }) {
  if (estado.error) return <p className="text-sm text-red-700">{estado.error}</p>;
  if (estado.mensaje)
    return <p className="text-sm text-emerald-700">{estado.mensaje}</p>;
  return null;
}

/**
 * Cobro. Muestra cómo se va a repartir el pago **antes** de guardarlo, con las
 * mismas reglas que aplica la base: de la cuota más vieja a la más nueva, sin
 * pasarse de lo que se le espera a cada una, y lo que sobre queda como saldo a
 * favor de la venta.
 *
 * Quien cobra puede ajustar el reparto a mano (un cliente que paga una cuota
 * específica). Si no lo toca, no se manda nada y reparte la base.
 */
export function FormularioPago({
  ventaId,
  cuotas,
}: {
  ventaId: string;
  cuotas: CuotaCobrable[];
}) {
  const [estado, accion, pendiente] = useActionState<EstadoPagoForm, FormData>(
    registrarPago,
    {},
  );

  const [montoPago, setMontoPago] = useState("");
  const [manual, setManual] = useState(false);
  const [montos, setMontos] = useState<Record<string, string>>({});

  const cobrables = useMemo(
    () => ordenarCuotasPorCobro(cuotas).filter((c) => saldoCuota(c).greaterThan(0)),
    [cuotas],
  );

  const previa = useMemo(() => {
    const m = parsearMonto(montoPago);
    if (!m || !m.greaterThan(0)) return null;

    if (!manual) {
      const reparto = repartirPago(m, cobrables);
      return { ...reparto, problema: null as string | null };
    }

    const aplicaciones: Aplicacion[] = [];
    for (const c of cobrables) {
      const valor = parsearMonto(montos[c.id] ?? "");
      if (valor && valor.greaterThan(0)) {
        aplicaciones.push({ cuota_id: c.id, monto: valor.toFixed(2) });
      }
    }

    const problema = revisarReparto(m, aplicaciones, cobrables);
    const aplicado = aplicaciones.reduce(
      (s, a) => s.plus(new Decimal(a.monto)),
      new Decimal(0),
    );
    return {
      aplicaciones,
      aplicado,
      saldo_a_favor: m.minus(aplicado),
      problema,
    };
  }, [montoPago, manual, montos, cobrables]);

  /** Precarga el reparto automático para que se pueda ajustar desde ahí. */
  function cambiarAManual() {
    const m = parsearMonto(montoPago);
    const inicial: Record<string, string> = {};
    if (m && m.greaterThan(0)) {
      for (const a of repartirPago(m, cobrables).aplicaciones) {
        inicial[a.cuota_id] = a.monto;
      }
    }
    setMontos(inicial);
    setManual(true);
  }

  const nombreCuota = (c: CuotaCobrable) =>
    `${ETIQUETAS_TIPO_CUOTA[c.tipo]} ${c.numero}`;

  return (
    <form action={accion} className="space-y-6">
      <input type="hidden" name="venta_id" value={ventaId} />
      <input
        type="hidden"
        name="reparto"
        value={
          manual && previa && !previa.problema
            ? JSON.stringify(previa.aplicaciones)
            : ""
        }
      />

      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={etiqueta}>Monto recibido</span>
          <input
            name="monto"
            inputMode="decimal"
            required
            value={montoPago}
            onChange={(e) => setMontoPago(e.target.value)}
            className={campo}
          />
        </label>

        <label className="space-y-1">
          <span className={etiqueta}>Fecha del pago</span>
          <input
            name="fecha_pago"
            type="date"
            required
            defaultValue={hoyISO()}
            className={campo}
          />
        </label>

        <label className="space-y-1">
          <span className={etiqueta}>Método</span>
          <select name="metodo" defaultValue="efectivo" className={campo}>
            {METODOS_PAGO.map((m) => (
              <option key={m} value={m}>
                {ETIQUETAS_METODO_PAGO[m]}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className={etiqueta}>
            Referencia (transferencia, cheque, comprobante)
          </span>
          <input name="referencia" className={campo} />
        </label>

        <label className="space-y-1 sm:col-span-2">
          <span className={etiqueta}>Notas</span>
          <textarea
            name="notas"
            rows={2}
            className="border-input w-full rounded-md border bg-transparent px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">Aplicación del pago</h2>
          {manual ? (
            <button
              type="button"
              className="text-xs underline underline-offset-4"
              onClick={() => setManual(false)}
            >
              Volver al reparto automático
            </button>
          ) : (
            <button
              type="button"
              className="text-xs underline underline-offset-4"
              onClick={cambiarAManual}
              disabled={cobrables.length === 0}
            >
              Elegir las cuotas a mano
            </button>
          )}
        </div>

        {cobrables.length === 0 ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Esta venta no tiene cuotas pendientes. Lo que se cobre quedará
            completo como saldo a favor.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Cuota</th>
                  <th className="px-4 py-2 font-medium">Vence</th>
                  <th className="px-4 py-2 text-right font-medium">Falta</th>
                  <th className="px-4 py-2 text-right font-medium">Se aplica</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cobrables.map((c) => {
                  const aplicado = previa?.aplicaciones.find(
                    (a) => a.cuota_id === c.id,
                  )?.monto;
                  return (
                    <tr key={c.id}>
                      <td className="px-4 py-2">{nombreCuota(c)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {formatearFecha(c.fecha_vencimiento)}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        {formatearMoneda(saldoCuota(c))}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        {manual ? (
                          <input
                            inputMode="decimal"
                            value={montos[c.id] ?? ""}
                            onChange={(e) =>
                              setMontos((previos) => ({
                                ...previos,
                                [c.id]: e.target.value,
                              }))
                            }
                            className="border-input h-8 w-32 rounded-md border bg-transparent px-2 text-right text-sm"
                          />
                        ) : aplicado ? (
                          formatearMoneda(aplicado)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {previa?.problema ? (
          <p className="text-sm text-amber-700">{previa.problema}</p>
        ) : null}

        {previa && !previa.problema ? (
          <p className="text-muted-foreground text-xs">
            Se aplican {formatearMoneda(previa.aplicado)} a{" "}
            {previa.aplicaciones.length} cuota
            {previa.aplicaciones.length === 1 ? "" : "s"}
            {previa.saldo_a_favor.greaterThan(0)
              ? ` · quedan ${formatearMoneda(previa.saldo_a_favor)} como saldo a favor`
              : ""}
            .
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Escriba el monto recibido para ver cómo se reparte.
          </p>
        )}
      </section>

      <Aviso estado={estado} />
      <button
        type="submit"
        disabled={pendiente || Boolean(previa?.problema)}
        className={boton}
      >
        {pendiente ? "Registrando…" : "Registrar el pago y emitir el recibo"}
      </button>
      <p className="text-muted-foreground text-xs">
        El pago y su recibo son inmutables: si algo sale mal, gerencia lo reversa
        con una nota de crédito.
      </p>
    </form>
  );
}

/** Reversar: gerencia, con motivo obligatorio. No borra: emite el contrario. */
export function BotonReversarPago({ pagoId }: { pagoId: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoPagoForm, FormData>(
    reversarPago,
    {},
  );
  const [confirmando, setConfirmando] = useState(false);

  if (estado.mensaje) return <Aviso estado={estado} />;

  if (!confirmando) {
    return (
      <button
        type="button"
        className="text-sm text-red-700 underline underline-offset-4"
        onClick={() => setConfirmando(true)}
      >
        Reversar este pago
      </button>
    );
  }

  return (
    <form action={accion} className="max-w-md space-y-2">
      <input type="hidden" name="id" value={pagoId} />
      <p className="text-sm">
        Reversar no borra nada: registra el movimiento contrario, devuelve las
        cuotas a como estaban y emite una nota de crédito contra el recibo
        original. Los dos movimientos quedan visibles.
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
          {pendiente ? "Reversando…" : "Sí, reversar el pago"}
        </button>
        <button type="button" className={boton} onClick={() => setConfirmando(false)}>
          Volver
        </button>
      </div>
    </form>
  );
}
