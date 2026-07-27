import type { Metadata } from "next";
import Link from "next/link";
import { requerirPerfil } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatRD } from "@/lib/format";
import { esFechaISO, formatearFecha } from "@/lib/ventas";
import {
  ETIQUETAS_TIPO_RECIBO,
  formatearNumeroRecibo,
  type TipoRecibo,
} from "@/lib/pagos";

export const metadata: Metadata = { title: "Recibos — ERP Solares" };

/**
 * Recibos emitidos, con su numeración limpia y propia. Los números viejos del
 * Excel entran en `numero_referencia_excel` y se muestran aparte: nunca se
 * mezclan con la secuencia del sistema.
 */

type FilaRecibo = {
  id: string;
  numero: number;
  tipo: TipoRecibo;
  monto: string;
  concepto: string;
  emitido_en: string;
  numero_referencia_excel: string | null;
  venta_id: string;
  cliente: { nombre_completo: string } | null;
  venta: {
    solar: { numero: string; manzana: { codigo: string } | null } | null;
  } | null;
};

const campo =
  "border-input h-9 w-full rounded-md border bg-transparent px-2 text-sm";
const etiqueta = "text-muted-foreground block text-xs";

const uno = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export default async function Recibos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirPerfil();
  const params = await searchParams;

  const desde = esFechaISO(uno(params.desde)) ? uno(params.desde) : "";
  const hasta = esFechaISO(uno(params.hasta)) ? uno(params.hasta) : "";
  const tipo = uno(params.tipo);
  const filtroCliente = uno(params.cliente);

  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from("recibos")
    .select(
      "id, numero, tipo, monto, concepto, emitido_en, numero_referencia_excel, " +
        "venta_id, cliente:clientes(nombre_completo), " +
        "venta:ventas(solar:solares(numero, manzana:manzanas(codigo)))",
    );

  if (desde) consulta = consulta.gte("emitido_en", `${desde}T00:00:00`);
  if (hasta) consulta = consulta.lte("emitido_en", `${hasta}T23:59:59`);
  if (tipo === "pago" || tipo === "nota_credito") {
    consulta = consulta.eq("tipo", tipo);
  }

  const { data, error } = await consulta.order("numero", { ascending: false });

  let recibos = (data ?? []) as unknown as FilaRecibo[];

  if (filtroCliente) {
    const buscado = filtroCliente.toLowerCase();
    recibos = recibos.filter((r) =>
      (r.cliente?.nombre_completo ?? "").toLowerCase().includes(buscado),
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Recibos</h1>
          <p className="text-muted-foreground text-sm">
            {recibos.length} recibo{recibos.length === 1 ? "" : "s"} según los
            filtros aplicados.
          </p>
        </div>
        <Link
          href="/pagos"
          className="hover:bg-muted rounded-md border px-3 py-2 text-sm"
        >
          Ver pagos
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
          <span className={etiqueta}>Tipo</span>
          <select name="tipo" defaultValue={tipo} className={campo}>
            <option value="">Todos</option>
            <option value="pago">Recibo de pago</option>
            <option value="nota_credito">Nota de crédito</option>
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
            href="/recibos"
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
              <th className="px-4 py-2 font-medium">Número</th>
              <th className="px-4 py-2 font-medium">Emitido</th>
              <th className="px-4 py-2 font-medium">Cliente</th>
              <th className="px-4 py-2 font-medium">Solar</th>
              <th className="px-4 py-2 font-medium">Concepto</th>
              <th className="px-4 py-2 text-right font-medium">Monto</th>
              <th className="px-4 py-2 font-medium">PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {recibos.map((r) => (
              <tr key={r.id} className="hover:bg-muted/40">
                <td className="px-4 py-2 font-medium whitespace-nowrap">
                  {formatearNumeroRecibo(r.numero)}
                  {r.tipo === "nota_credito" ? (
                    <span className="block text-xs text-destructive">
                      {ETIQUETAS_TIPO_RECIBO.nota_credito}
                    </span>
                  ) : null}
                  {r.numero_referencia_excel ? (
                    <span className="text-muted-foreground block text-xs">
                      Excel: {r.numero_referencia_excel}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {formatearFecha(r.emitido_en.slice(0, 10))}
                </td>
                <td className="px-4 py-2">{r.cliente?.nombre_completo ?? "—"}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  <Link
                    href={`/ventas/${r.venta_id}`}
                    className="underline underline-offset-4"
                  >
                    {r.venta?.solar?.manzana?.codigo ?? "—"} ·{" "}
                    {r.venta?.solar?.numero ?? "—"}
                  </Link>
                </td>
                <td className="px-4 py-2">{r.concepto}</td>
                <td
                  className={`px-4 py-2 text-right tabular-nums whitespace-nowrap ${
                    r.tipo === "nota_credito" ? "text-destructive" : ""
                  }`}
                >
                  {r.tipo === "nota_credito" ? "−" : ""}
                  {formatRD(r.monto)}
                </td>
                <td className="px-4 py-2">
                  <a
                    href={`/recibos/${r.id}/pdf`}
                    className="underline underline-offset-4"
                  >
                    Descargar
                  </a>
                </td>
              </tr>
            ))}
            {recibos.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-muted-foreground px-4 py-6 text-sm">
                  No hay recibos que cumplan con los filtros.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
