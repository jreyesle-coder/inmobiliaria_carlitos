import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirPerfil, esGerencia } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Decimal, monto } from "@/lib/moneda";
import { formatRD } from "@/lib/format";
import { ETIQUETAS_TIPO_CUOTA, formatearFecha, type TipoCuota } from "@/lib/ventas";
import {
  ETIQUETAS_METODO_PAGO,
  ETIQUETAS_TIPO_RECIBO,
  formatearNumeroRecibo,
  type MetodoPago,
  type TipoRecibo,
} from "@/lib/pagos";
import { BotonReversarPago } from "../formularios";

export const metadata: Metadata = { title: "Pago — ERP Solares" };

type Pago = {
  id: string;
  venta_id: string;
  fecha_pago: string;
  monto: string;
  metodo: MetodoPago;
  referencia: string | null;
  notas: string | null;
  es_reverso: boolean;
  pago_reversado_id: string | null;
  motivo_reverso: string | null;
  creado_en: string;
  venta: {
    id: string;
    precio_pactado: string;
    solar: { numero: string; manzana: { codigo: string } | null } | null;
    cliente: { nombre_completo: string } | null;
  } | null;
};

type Aplicacion = {
  id: string;
  monto: string;
  cuota: {
    tipo: TipoCuota;
    numero: number;
    fecha_vencimiento: string;
    monto_esperado: string;
    monto_aplicado: string;
  } | null;
};

export default async function DetallePago({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const perfil = await requerirPerfil();

  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("pagos")
    .select(
      "id, venta_id, fecha_pago, monto, metodo, referencia, notas, es_reverso, " +
        "pago_reversado_id, motivo_reverso, creado_en, " +
        "venta:ventas(id, precio_pactado, " +
        "solar:solares(numero, manzana:manzanas(codigo)), " +
        "cliente:clientes(nombre_completo))",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const pago = data as unknown as Pago;

  const { data: aplicacionesData } = await supabase
    .from("pago_aplicaciones")
    .select(
      "id, monto, cuota:cuotas(tipo, numero, fecha_vencimiento, monto_esperado, monto_aplicado)",
    )
    .eq("pago_id", pago.id);
  const aplicaciones = (aplicacionesData ?? []) as unknown as Aplicacion[];

  const aplicado = aplicaciones.reduce(
    (s, a) => s.plus(monto(a.monto)),
    new Decimal(0),
  );
  const saldoAFavor = monto(pago.monto).minus(aplicado);

  const { data: recibosData } = await supabase
    .from("recibos")
    .select("id, numero, tipo, monto, concepto, emitido_en")
    .eq("pago_id", pago.id)
    .order("numero");
  const recibos = (recibosData ?? []) as unknown as {
    id: string;
    numero: number;
    tipo: TipoRecibo;
    monto: string;
    concepto: string;
    emitido_en: string;
  }[];

  // ¿Este pago ya fue reversado? (Lo dice el reverso, no el pago original: los
  // pagos son inmutables y no se marcan.)
  const { data: reversoData } = await supabase
    .from("pagos")
    .select("id, fecha_pago, motivo_reverso")
    .eq("pago_reversado_id", pago.id)
    .maybeSingle();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {pago.es_reverso ? "Reverso de pago" : "Pago"} ·{" "}
            {formatRD(pago.monto)}
          </h1>
          <p className="text-muted-foreground text-sm">
            {pago.venta?.cliente?.nombre_completo ?? "—"} · Solar{" "}
            {pago.venta?.solar?.manzana?.codigo ?? "—"} ·{" "}
            {pago.venta?.solar?.numero ?? "—"}
          </p>
          <p className="text-muted-foreground text-sm">
            <Link href="/pagos" className="underline underline-offset-4">
              Volver a pagos
            </Link>
            {" · "}
            <Link
              href={`/ventas/${pago.venta_id}`}
              className="underline underline-offset-4"
            >
              Ver la venta
            </Link>
          </p>
        </div>
        {pago.es_reverso ? (
          <span className="rounded-full bg-estado-vencido px-3 py-1 text-sm font-medium text-estado-vencido-foreground">
            Reverso
          </span>
        ) : null}
      </div>

      {pago.es_reverso ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Este movimiento anula un pago anterior:{" "}
          {pago.motivo_reverso ?? "sin motivo registrado"}.{" "}
          {pago.pago_reversado_id ? (
            <Link
              href={`/pagos/${pago.pago_reversado_id}`}
              className="underline underline-offset-4"
            >
              Ver el pago anulado
            </Link>
          ) : null}
        </p>
      ) : null}

      {reversoData ? (
        <p className="rounded-md bg-estado-separado px-3 py-2 text-sm text-estado-separado-foreground">
          Este pago fue reversado el {formatearFecha(reversoData.fecha_pago)}:{" "}
          {reversoData.motivo_reverso ?? "sin motivo registrado"}.{" "}
          <Link
            href={`/pagos/${reversoData.id}`}
            className="underline underline-offset-4"
          >
            Ver el reverso
          </Link>
        </p>
      ) : null}

      <dl className="grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground text-xs">Fecha</dt>
          <dd className="font-medium">{formatearFecha(pago.fecha_pago)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Método</dt>
          <dd className="font-medium">{ETIQUETAS_METODO_PAGO[pago.metodo]}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Referencia</dt>
          <dd className="font-medium">{pago.referencia ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Aplicado a cuotas</dt>
          <dd className="font-medium">{formatRD(aplicado)}</dd>
        </div>
      </dl>

      {saldoAFavor.greaterThan(0) ? (
        <p className="rounded-md bg-estado-inicial px-3 py-2 text-sm text-estado-inicial-foreground">
          Quedaron {formatRD(saldoAFavor)} como saldo a favor: se
          recibieron pero no se aplicaron a ninguna cuota. Aparecen en el
          resumen de la venta.
        </p>
      ) : null}

      {pago.notas ? (
        <p className="text-sm whitespace-pre-line">{pago.notas}</p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-medium">
          Cuotas que cubre ({aplicaciones.length})
        </h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Cuota</th>
                <th className="px-4 py-2 font-medium">Vence</th>
                <th className="px-4 py-2 text-right font-medium">Esperado</th>
                <th className="px-4 py-2 text-right font-medium">
                  {pago.es_reverso ? "Devuelve" : "Aplica"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {aplicaciones.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-2">
                    {a.cuota
                      ? `${ETIQUETAS_TIPO_CUOTA[a.cuota.tipo]} ${a.cuota.numero}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {a.cuota ? formatearFecha(a.cuota.fecha_vencimiento) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
                    {a.cuota ? formatRD(a.cuota.monto_esperado) : "—"}
                  </td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums whitespace-nowrap ${
                      pago.es_reverso ? "text-destructive" : ""
                    }`}
                  >
                    {pago.es_reverso ? "−" : ""}
                    {formatRD(a.monto)}
                  </td>
                </tr>
              ))}
              {aplicaciones.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-muted-foreground px-4 py-6 text-sm">
                    Este pago no se aplicó a ninguna cuota: quedó completo como
                    saldo a favor.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Recibo</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Número</th>
                <th className="px-4 py-2 font-medium">Tipo</th>
                <th className="px-4 py-2 font-medium">Concepto</th>
                <th className="px-4 py-2 text-right font-medium">Monto</th>
                <th className="px-4 py-2 font-medium">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {recibos.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 font-medium whitespace-nowrap">
                    {formatearNumeroRecibo(r.numero)}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {ETIQUETAS_TIPO_RECIBO[r.tipo]}
                  </td>
                  <td className="px-4 py-2">{r.concepto}</td>
                  <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
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
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground text-xs">
          El recibo es inmutable: no se edita ni se borra. El PDF se genera a
          partir de lo guardado, así que siempre sale igual.
        </p>
      </section>

      {esGerencia(perfil) && !pago.es_reverso && !reversoData ? (
        <BotonReversarPago pagoId={pago.id} />
      ) : null}
    </div>
  );
}
