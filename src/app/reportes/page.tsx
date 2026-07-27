import type { Metadata } from "next";
import Link from "next/link";
import { requerirPerfil, esAdminOGerencia } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatearMoneda, Decimal } from "@/lib/moneda";
import {
  COLORES_ESTADO_VENTA,
  ETIQUETAS_ESTADO_VENTA,
  ETIQUETAS_TIPO_CUOTA,
  formatearFecha,
} from "@/lib/ventas";
import {
  ETIQUETAS_ESTADO_SOLAR,
  COLORES_ESTADO_SOLAR,
  ESTADOS_SOLAR,
} from "@/lib/solares";
import {
  etiquetaMes,
  etiquetaSolar,
  sumarMontos,
  type FilaInventario,
  type FilaReporteVenta,
  type FilaRecaudoMes,
  type FilaCuotaVencida,
} from "@/lib/reportes";

export const metadata: Metadata = { title: "Reportes — ERP Solares" };

const th = "px-4 py-2 font-medium";
const thR = "px-4 py-2 text-right font-medium";
const td = "px-4 py-2";
const tdR = "px-4 py-2 text-right whitespace-nowrap";

function Kpi({
  titulo,
  valor,
  detalle,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-muted-foreground text-xs">{titulo}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">{valor}</div>
      {detalle ? (
        <div className="text-muted-foreground mt-0.5 text-xs">{detalle}</div>
      ) : null}
    </div>
  );
}

function BotonExportar({ tipo }: { tipo: string }) {
  return (
    <a
      href={`/reportes/exportar?tipo=${tipo}`}
      className="hover:bg-muted rounded-md border px-3 py-1.5 text-xs"
    >
      Exportar a Excel (CSV)
    </a>
  );
}

export default async function Reportes() {
  const perfil = await requerirPerfil();
  const verGlobal = esAdminOGerencia(perfil);

  const supabase = await crearClienteServidor();

  const [inv, ven, rec, venc] = await Promise.all([
    supabase.from("reporte_inventario").select("estado, cantidad, valor_total"),
    supabase
      .from("reporte_ventas")
      .select(
        "venta_id, fecha_venta, estado, estado_contrato, precio_pactado, " +
          "vendedor_nombre, cliente_nombre, solar_numero, manzana_codigo, " +
          "total_recibido, saldo_a_favor, balance_pendiente, vencido_pendiente",
      )
      .order("fecha_venta", { ascending: false }),
    supabase
      .from("reporte_recaudo_mensual")
      .select("mes, recaudo_neto, pagos, reversos")
      .order("mes", { ascending: false }),
    supabase
      .from("reporte_cuotas_vencidas")
      .select(
        "cuota_id, venta_id, tipo, numero, fecha_vencimiento, monto_esperado, " +
          "monto_aplicado, saldo, dias_vencida, vendedor_nombre, cliente_nombre, " +
          "solar_numero, manzana_codigo",
      )
      .order("dias_vencida", { ascending: false }),
  ]);

  const inventario = (inv.data ?? []) as unknown as FilaInventario[];
  const ventas = (ven.data ?? []) as unknown as FilaReporteVenta[];
  const recaudo = (rec.data ?? []) as unknown as FilaRecaudoMes[];
  const vencidas = (venc.data ?? []) as unknown as FilaCuotaVencida[];
  const error = inv.error ?? ven.error ?? rec.error ?? venc.error ?? null;

  // Cartera = ventas activas con balance pendiente. Las canceladas no cuentan;
  // las saldadas tienen balance 0 y se caen solas del filtro.
  const cartera = ventas.filter(
    (v) => v.estado !== "cancelada" && new Decimal(v.balance_pendiente ?? "0").gt(0),
  );

  // KPIs
  const invPorEstado = new Map(inventario.map((i) => [i.estado, i]));
  const libres = invPorEstado.get("libre")?.cantidad ?? 0;
  const vendidos = ["separado", "inicial", "capital", "saldado"].reduce(
    (n, e) => n + (invPorEstado.get(e as FilaInventario["estado"])?.cantidad ?? 0),
    0,
  );
  const carteraTotal = sumarMontos(cartera.map((v) => v.balance_pendiente));
  const vencidoTotal = sumarMontos(ventas.map((v) => v.vencido_pendiente));

  const mesActual = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const recaudoMes = recaudo.find((r) => r.mes.slice(0, 7) === mesActual);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">
          Reportes y tableros
        </h1>
        <p className="text-muted-foreground text-sm">
          {verGlobal
            ? "Resumen de todo el proyecto."
            : "Su cartera: ventas, cobros pendientes y recaudo de las ventas que usted atiende."}
        </p>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          {error.message}
        </p>
      ) : null}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {verGlobal ? (
          <>
            <Kpi titulo="Solares libres" valor={String(libres)} />
            <Kpi titulo="Solares vendidos" valor={String(vendidos)} />
          </>
        ) : null}
        <Kpi
          titulo="Cartera pendiente"
          valor={formatearMoneda(carteraTotal)}
          detalle={`${cartera.length} venta${cartera.length === 1 ? "" : "s"} con balance`}
        />
        <Kpi
          titulo="Vencido sin pagar"
          valor={formatearMoneda(vencidoTotal)}
          detalle={`${vencidas.length} cuota${vencidas.length === 1 ? "" : "s"} vencida${vencidas.length === 1 ? "" : "s"}`}
        />
        <Kpi
          titulo={`Recaudo de ${etiquetaMes(`${mesActual}-01`)}`}
          valor={formatearMoneda(recaudoMes?.recaudo_neto ?? "0")}
          detalle={recaudoMes ? `${recaudoMes.pagos} pago(s)` : "sin movimientos"}
        />
      </div>

      {/* Inventario por estado — global, solo administración y gerencia */}
      {verGlobal ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Inventario por estado</h2>
            <BotonExportar tipo="inventario" />
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className={th}>Estado</th>
                  <th className={thR}>Solares</th>
                  <th className={thR}>Valor total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ESTADOS_SOLAR.filter((e) => invPorEstado.get(e)).map((e) => {
                  const fila = invPorEstado.get(e)!;
                  return (
                    <tr key={e}>
                      <td className={td}>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${COLORES_ESTADO_SOLAR[e]}`}
                        >
                          {ETIQUETAS_ESTADO_SOLAR[e]}
                        </span>
                      </td>
                      <td className={tdR}>{fila.cantidad}</td>
                      <td className={tdR}>{formatearMoneda(fila.valor_total)}</td>
                    </tr>
                  );
                })}
                {inventario.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-muted-foreground px-4 py-6">
                      No hay solares cargados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Cartera pendiente */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Cartera pendiente</h2>
          <BotonExportar tipo="cartera" />
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className={th}>Solar</th>
                <th className={th}>Cliente</th>
                {verGlobal ? <th className={th}>Vendedor</th> : null}
                <th className={th}>Estado</th>
                <th className={thR}>Precio</th>
                <th className={thR}>Recibido</th>
                <th className={thR}>Balance</th>
                <th className={thR}>Vencido</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {cartera.map((v) => (
                <tr key={v.venta_id} className="hover:bg-muted/40">
                  <td className={`${td} font-medium whitespace-nowrap`}>
                    <Link
                      href={`/ventas/${v.venta_id}`}
                      className="underline underline-offset-4"
                    >
                      {etiquetaSolar(v.manzana_codigo, v.solar_numero)}
                    </Link>
                  </td>
                  <td className={td}>{v.cliente_nombre ?? "—"}</td>
                  {verGlobal ? (
                    <td className={td}>{v.vendedor_nombre ?? "—"}</td>
                  ) : null}
                  <td className={td}>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${COLORES_ESTADO_VENTA[v.estado]}`}
                    >
                      {ETIQUETAS_ESTADO_VENTA[v.estado]}
                    </span>
                  </td>
                  <td className={tdR}>{formatearMoneda(v.precio_pactado)}</td>
                  <td className={`${tdR} text-muted-foreground`}>
                    {formatearMoneda(v.total_recibido ?? "0")}
                  </td>
                  <td className={`${tdR} font-medium`}>
                    {formatearMoneda(v.balance_pendiente ?? "0")}
                  </td>
                  <td className={tdR}>
                    {new Decimal(v.vencido_pendiente ?? "0").gt(0) ? (
                      <span className="text-red-700 dark:text-red-400">
                        {formatearMoneda(v.vencido_pendiente ?? "0")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {cartera.length === 0 ? (
                <tr>
                  <td
                    colSpan={verGlobal ? 8 : 7}
                    className="text-muted-foreground px-4 py-6"
                  >
                    No hay ventas con balance pendiente.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Cuotas vencidas */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Cuotas vencidas</h2>
          <BotonExportar tipo="cuotas-vencidas" />
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className={th}>Solar</th>
                <th className={th}>Cliente</th>
                {verGlobal ? <th className={th}>Vendedor</th> : null}
                <th className={th}>Cuota</th>
                <th className={th}>Vencía</th>
                <th className={thR}>Atraso</th>
                <th className={thR}>Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {vencidas.map((c) => (
                <tr key={c.cuota_id} className="hover:bg-muted/40">
                  <td className={`${td} font-medium whitespace-nowrap`}>
                    <Link
                      href={`/ventas/${c.venta_id}`}
                      className="underline underline-offset-4"
                    >
                      {etiquetaSolar(c.manzana_codigo, c.solar_numero)}
                    </Link>
                  </td>
                  <td className={td}>{c.cliente_nombre ?? "—"}</td>
                  {verGlobal ? (
                    <td className={td}>{c.vendedor_nombre ?? "—"}</td>
                  ) : null}
                  <td className={`${td} text-xs`}>
                    {ETIQUETAS_TIPO_CUOTA[c.tipo]} #{c.numero}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    {formatearFecha(c.fecha_vencimiento)}
                  </td>
                  <td className={tdR}>
                    <span className="text-red-700 dark:text-red-400">
                      {c.dias_vencida} día{c.dias_vencida === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td className={`${tdR} font-medium`}>
                    {formatearMoneda(c.saldo)}
                  </td>
                </tr>
              ))}
              {vencidas.length === 0 ? (
                <tr>
                  <td
                    colSpan={verGlobal ? 7 : 6}
                    className="text-muted-foreground px-4 py-6"
                  >
                    No hay cuotas vencidas. 🎉
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recaudo mensual */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Recaudo por mes</h2>
          <BotonExportar tipo="recaudo" />
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className={th}>Mes</th>
                <th className={thR}>Recaudo neto</th>
                <th className={thR}>Pagos</th>
                <th className={thR}>Reversos</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {recaudo.map((r) => (
                <tr key={r.mes}>
                  <td className={`${td} font-medium whitespace-nowrap`}>
                    {etiquetaMes(r.mes)}
                  </td>
                  <td className={tdR}>{formatearMoneda(r.recaudo_neto)}</td>
                  <td className={`${tdR} text-muted-foreground`}>{r.pagos}</td>
                  <td className={`${tdR} text-muted-foreground`}>
                    {r.reversos || "—"}
                  </td>
                </tr>
              ))}
              {recaudo.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-muted-foreground px-4 py-6">
                    Todavía no hay pagos registrados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-muted-foreground text-xs">
        Las comisiones por vendedor están en{" "}
        <Link href="/comisiones" className="underline underline-offset-4">
          Comisiones
        </Link>
        . Cada reporte respeta su rol: usted ve lo mismo que en el resto del
        sistema, ni más ni menos.
      </p>
    </div>
  );
}
