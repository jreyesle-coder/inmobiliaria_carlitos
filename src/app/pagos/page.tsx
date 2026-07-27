import type { Metadata } from "next";
import Link from "next/link";
import { requerirPerfil } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Decimal, monto } from "@/lib/moneda";
import { formatRD } from "@/lib/format";
import { esFechaISO, formatearFecha } from "@/lib/ventas";
import {
  ETIQUETAS_METODO_PAGO,
  METODOS_PAGO,
  esMetodoPago,
  type MetodoPago,
} from "@/lib/pagos";

export const metadata: Metadata = { title: "Pagos — ERP Solares" };

/**
 * Cobros registrados. RLS ya limita lo que ve cada rol: el vendedor solo los de
 * sus ventas. Los reversos se muestran junto a los pagos, en rojo y restando:
 * un movimiento de dinero no desaparece del listado, se corrige.
 */

type FilaPago = {
  id: string;
  fecha_pago: string;
  monto: string;
  metodo: MetodoPago;
  referencia: string | null;
  es_reverso: boolean;
  pago_reversado_id: string | null;
  venta: {
    id: string;
    solar: { numero: string; manzana: { codigo: string } | null } | null;
    cliente: { nombre_completo: string } | null;
  } | null;
};

const campo =
  "border-input h-9 w-full rounded-md border bg-transparent px-2 text-sm";
const etiqueta = "text-muted-foreground block text-xs";

const uno = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export default async function Pagos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirPerfil();
  const params = await searchParams;

  const desde = esFechaISO(uno(params.desde)) ? uno(params.desde) : "";
  const hasta = esFechaISO(uno(params.hasta)) ? uno(params.hasta) : "";
  const metodoBruto = uno(params.metodo);
  const metodo = esMetodoPago(metodoBruto) ? metodoBruto : "";
  const filtroCliente = uno(params.cliente);

  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from("pagos")
    .select(
      "id, fecha_pago, monto, metodo, referencia, es_reverso, pago_reversado_id, " +
        "venta:ventas(id, solar:solares(numero, manzana:manzanas(codigo)), " +
        "cliente:clientes(nombre_completo))",
    );

  if (desde) consulta = consulta.gte("fecha_pago", desde);
  if (hasta) consulta = consulta.lte("fecha_pago", hasta);
  if (metodo) consulta = consulta.eq("metodo", metodo);

  const { data, error } = await consulta
    .order("fecha_pago", { ascending: false })
    .order("creado_en", { ascending: false });

  let pagos = (data ?? []) as unknown as FilaPago[];

  // El filtro por cliente va aquí porque es sobre una tabla relacionada y son
  // decenas de pagos, no miles.
  if (filtroCliente) {
    const buscado = filtroCliente.toLowerCase();
    pagos = pagos.filter((p) =>
      (p.venta?.cliente?.nombre_completo ?? "").toLowerCase().includes(buscado),
    );
  }

  // Neto: los reversos restan. Es el mismo criterio de `ventas_resumen_cobros`.
  const neto = pagos.reduce(
    (s, p) => (p.es_reverso ? s.minus(monto(p.monto)) : s.plus(monto(p.monto))),
    new Decimal(0),
  );
  const reversados = new Set(
    pagos.filter((p) => p.pago_reversado_id).map((p) => p.pago_reversado_id),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Pagos</h1>
          <p className="text-muted-foreground text-sm">
            {pagos.length} movimiento{pagos.length === 1 ? "" : "s"} · neto
            recibido {formatRD(neto)}
          </p>
        </div>
        <Link
          href="/recibos"
          className="hover:bg-muted rounded-md border px-3 py-2 text-sm"
        >
          Recibos emitidos
        </Link>
      </div>

      <form className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="space-y-1">
          <span className={etiqueta}>Desde</span>
          <input name="desde" type="date" defaultValue={desde} className={campo} />
        </label>
        <label className="space-y-1">
          <span className={etiqueta}>Hasta</span>
          <input name="hasta" type="date" defaultValue={hasta} className={campo} />
        </label>
        <label className="space-y-1">
          <span className={etiqueta}>Método</span>
          <select name="metodo" defaultValue={metodo} className={campo}>
            <option value="">Todos</option>
            {METODOS_PAGO.map((m) => (
              <option key={m} value={m}>
                {ETIQUETAS_METODO_PAGO[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className={etiqueta}>Cliente</span>
          <input name="cliente" defaultValue={filtroCliente} className={campo} />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="h-9 rounded-md border px-3 text-sm">
            Filtrar
          </button>
          <Link
            href="/pagos"
            className="text-muted-foreground flex h-9 items-center text-sm underline underline-offset-4"
          >
            Limpiar
          </Link>
        </div>
      </form>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Solar</th>
              <th className="px-4 py-2 font-medium">Cliente</th>
              <th className="px-4 py-2 font-medium">Método</th>
              <th className="px-4 py-2 font-medium">Referencia</th>
              <th className="px-4 py-2 text-right font-medium">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pagos.map((p) => (
              <tr key={p.id} className="hover:bg-muted/40">
                <td className="px-4 py-2 whitespace-nowrap">
                  <Link
                    href={`/pagos/${p.id}`}
                    className="underline underline-offset-4"
                  >
                    {formatearFecha(p.fecha_pago)}
                  </Link>
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {p.venta ? (
                    <Link
                      href={`/ventas/${p.venta.id}`}
                      className="underline underline-offset-4"
                    >
                      {p.venta.solar?.manzana?.codigo ?? "—"} ·{" "}
                      {p.venta.solar?.numero ?? "—"}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2">
                  {p.venta?.cliente?.nombre_completo ?? "—"}
                </td>
                <td className="px-4 py-2 text-xs">
                  {ETIQUETAS_METODO_PAGO[p.metodo]}
                </td>
                <td className="text-muted-foreground px-4 py-2 text-xs">
                  {p.referencia ?? "—"}
                </td>
                <td
                  className={`px-4 py-2 text-right tabular-nums whitespace-nowrap ${
                    p.es_reverso ? "text-destructive" : ""
                  }`}
                >
                  {p.es_reverso ? "−" : ""}
                  {formatRD(p.monto)}
                  {p.es_reverso ? (
                    <span className="block text-xs">reverso</span>
                  ) : reversados.has(p.id) ? (
                    <span className="text-muted-foreground block text-xs">
                      reversado
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
            {pagos.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted-foreground px-4 py-6 text-sm">
                  No hay pagos que cumplan con los filtros.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="text-muted-foreground text-xs">
        Un pago no se edita ni se borra. Para corregirlo, gerencia lo reversa
        desde el detalle y el sistema emite una nota de crédito contra el recibo
        original.
      </p>
    </div>
  );
}
