import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirPerfil, esAdminOGerencia, esGerencia } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { configuracionDeVentas } from "@/lib/configuracion";
import { formatearCedula } from "@/lib/personas";
import { Decimal, formatearMoneda, monto } from "@/lib/moneda";
import {
  COLORES_ESTADO_VENTA,
  ETIQUETAS_ESTADO_CUOTA,
  ETIQUETAS_ESTADO_VENTA,
  ETIQUETAS_TIPO_CUOTA,
  calcularCapital,
  formatearFecha,
  transicionesVentaDesde,
  type EstadoCuota,
  type EstadoVenta,
  type TipoCuota,
} from "@/lib/ventas";
import { ETIQUETAS_METODO_PAGO, type MetodoPago } from "@/lib/pagos";
import {
  BotonCancelarVenta,
  BotonRegenerarPlan,
  FormularioContrato,
  FormularioEstadoVenta,
  FormularioVenta,
  type OpcionSolar,
} from "../formularios";

export const metadata: Metadata = { title: "Venta — ERP Solares" };

type Venta = {
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
  estado: EstadoVenta;
  estado_contrato: "pendiente" | "listo";
  notas: string | null;
  fecha_cancelacion: string | null;
  motivo_cancelacion: string | null;
  creado_en: string;
  solar: {
    id: string;
    numero: string;
    valor_total: string;
    manzana: { codigo: string } | null;
  } | null;
  cliente: { id: string; nombre_completo: string; cedula: string | null } | null;
  vendedor: { id: string; nombre_completo: string } | null;
};

type Cuota = {
  id: string;
  tipo: TipoCuota;
  numero: number;
  monto_esperado: string;
  monto_aplicado: string;
  fecha_vencimiento: string;
  estado: EstadoCuota;
};

type Pago = {
  id: string;
  fecha_pago: string;
  monto: string;
  metodo: MetodoPago;
  referencia: string | null;
  es_reverso: boolean;
  pago_reversado_id: string | null;
};

export default async function DetalleVenta({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const perfil = await requerirPerfil();
  const puedeEscribir = esAdminOGerencia(perfil);

  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("ventas")
    .select(
      "id, solar_id, cliente_id, vendedor_id, fecha_venta, precio_pactado, " +
        "monto_separacion, monto_inicial, cuotas_inicial, cuotas_capital, estado, " +
        "estado_contrato, notas, fecha_cancelacion, motivo_cancelacion, creado_en, " +
        "solar:solares(id, numero, valor_total, manzana:manzanas(codigo)), " +
        "cliente:clientes(id, nombre_completo, cedula), " +
        "vendedor:vendedores(id, nombre_completo)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const venta = data as unknown as Venta;

  const { data: cuotasData } = await supabase
    .from("cuotas")
    .select("id, tipo, numero, monto_esperado, monto_aplicado, fecha_vencimiento, estado")
    .eq("venta_id", venta.id)
    .order("fecha_vencimiento")
    .order("numero");
  const cuotas = (cuotasData ?? []) as unknown as Cuota[];

  // Lo cobrado sale de la vista, que es la única definición de "cuánto entró y
  // cuánto falta" (ver `09_pagos.sql`).
  const { data: resumen } = await supabase
    .from("ventas_resumen_cobros")
    .select(
      "total_recibido, total_aplicado, saldo_a_favor, balance_pendiente, vencido_pendiente",
    )
    .eq("venta_id", venta.id)
    .maybeSingle();

  const { data: pagosData } = await supabase
    .from("pagos")
    .select("id, fecha_pago, monto, metodo, referencia, es_reverso, pago_reversado_id")
    .eq("venta_id", venta.id)
    .order("fecha_pago", { ascending: false })
    .order("creado_en", { ascending: false });
  const pagos = (pagosData ?? []) as unknown as Pago[];
  const reversados = new Set(
    pagos.filter((p) => p.pago_reversado_id).map((p) => p.pago_reversado_id),
  );

  const totalPlan = cuotas.reduce(
    (s, c) => s.plus(monto(c.monto_esperado)),
    new Decimal(0),
  );
  const totalAplicado = cuotas.reduce(
    (s, c) => s.plus(monto(c.monto_aplicado)),
    new Decimal(0),
  );
  const planCuadra = totalPlan.equals(monto(venta.precio_pactado));
  const capital = calcularCapital(
    venta.precio_pactado,
    venta.monto_separacion,
    venta.monto_inicial,
  );

  // Para el formulario de edición: los catálogos y el solar actual, que ya no
  // está libre y por eso no vendría en la lista de disponibles.
  let solares: OpcionSolar[] = [];
  let clientes: { id: string; nombre: string }[] = [];
  let vendedores: { id: string; nombre: string }[] = [];
  const configuracion = await configuracionDeVentas();

  if (puedeEscribir && venta.estado !== "cancelada") {
    const { data: libres } = await supabase
      .from("solares")
      .select("id, numero, valor_total, manzana:manzanas(codigo)")
      .eq("estado", "libre")
      .order("numero");

    solares = (
      (libres ?? []) as unknown as {
        id: string;
        numero: string;
        valor_total: string;
        manzana: { codigo: string } | null;
      }[]
    ).map((s) => ({
      id: s.id,
      numero: s.numero,
      manzana: s.manzana?.codigo ?? "—",
      valor_total: s.valor_total,
    }));

    if (venta.solar) {
      solares.unshift({
        id: venta.solar.id,
        numero: venta.solar.numero,
        manzana: venta.solar.manzana?.codigo ?? "—",
        valor_total: venta.solar.valor_total,
      });
    }

    const { data: clientesData } = await supabase
      .from("clientes")
      .select("id, nombre_completo, cedula")
      .order("nombre_completo");
    clientes = (clientesData ?? []).map((c) => ({
      id: c.id as string,
      nombre: `${c.nombre_completo}${
        c.cedula ? ` · ${formatearCedula(c.cedula as string)}` : " · cédula pendiente"
      }`,
    }));

    const { data: vendedoresData } = await supabase
      .from("vendedores")
      .select("id, nombre_completo")
      .eq("activo", true)
      .order("nombre_completo");
    vendedores = (vendedoresData ?? []).map((v) => ({
      id: v.id as string,
      nombre: v.nombre_completo as string,
    }));
  }

  let historial: {
    id: number;
    accion: string;
    usuario_correo: string | null;
    ocurrido_en: string;
  }[] = [];
  if (esGerencia(perfil)) {
    const { data: filas } = await supabase
      .from("bitacora_auditoria")
      .select("id, accion, usuario_correo, ocurrido_en")
      .eq("tabla", "ventas")
      .eq("registro_id", venta.id)
      .order("ocurrido_en", { ascending: false })
      .limit(20);
    historial = filas ?? [];
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            Solar {venta.solar?.manzana?.codigo ?? "—"} ·{" "}
            {venta.solar?.numero ?? "—"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {venta.cliente?.nombre_completo ?? "—"}
            {venta.cliente?.cedula
              ? ` · ${formatearCedula(venta.cliente.cedula)}`
              : " · cédula pendiente"}
          </p>
          <p className="text-muted-foreground text-sm">
            <Link href="/ventas" className="underline underline-offset-4">
              Volver a ventas
            </Link>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${COLORES_ESTADO_VENTA[venta.estado]}`}
          >
            {ETIQUETAS_ESTADO_VENTA[venta.estado]}
          </span>
          <span className="text-xs">
            {venta.estado_contrato === "listo" ? (
              "Contrato listo"
            ) : (
              <span className="text-amber-700">Contrato pendiente</span>
            )}
          </span>
        </div>
      </div>

      {venta.estado === "cancelada" ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          Venta cancelada el{" "}
          {venta.fecha_cancelacion ? formatearFecha(venta.fecha_cancelacion) : "—"}
          : {venta.motivo_cancelacion ?? "sin motivo registrado"}. El solar
          volvió al inventario.
        </p>
      ) : null}

      <dl className="grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground text-xs">Fecha de la venta</dt>
          <dd className="font-medium">{formatearFecha(venta.fecha_venta)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Precio pactado</dt>
          <dd className="font-medium">{formatearMoneda(venta.precio_pactado)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Separación</dt>
          <dd className="font-medium">
            {formatearMoneda(venta.monto_separacion)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">
            Inicial ({venta.cuotas_inicial} cuotas)
          </dt>
          <dd className="font-medium">{formatearMoneda(venta.monto_inicial)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">
            Capital ({venta.cuotas_capital} cuotas)
          </dt>
          <dd className="font-medium">{formatearMoneda(capital)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Vendedor</dt>
          <dd className="font-medium">
            {venta.vendedor?.nombre_completo ?? "Sin asignar"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Valor del solar</dt>
          <dd className="font-medium">
            {venta.solar ? formatearMoneda(venta.solar.valor_total) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Abonado</dt>
          <dd className="font-medium">
            {formatearMoneda(resumen?.total_aplicado ?? totalAplicado)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Balance pendiente</dt>
          <dd className="font-medium">
            {formatearMoneda(resumen?.balance_pendiente ?? venta.precio_pactado)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Vencido sin pagar</dt>
          <dd
            className={`font-medium ${
              monto(resumen?.vencido_pendiente ?? "0").greaterThan(0)
                ? "text-amber-700"
                : ""
            }`}
          >
            {formatearMoneda(resumen?.vencido_pendiente ?? "0")}
          </dd>
        </div>
        {monto(resumen?.saldo_a_favor ?? "0").greaterThan(0) ? (
          <div>
            <dt className="text-muted-foreground text-xs">Saldo a favor</dt>
            <dd className="font-medium">
              {formatearMoneda(resumen?.saldo_a_favor ?? "0")}
            </dd>
          </div>
        ) : null}
      </dl>

      {venta.notas ? (
        <p className="text-sm whitespace-pre-line">{venta.notas}</p>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">
            Plan de pagos ({cuotas.length} cuota{cuotas.length === 1 ? "" : "s"})
          </h2>
          <p className="text-muted-foreground text-xs">
            Total del plan: {formatearMoneda(totalPlan)}
          </p>
        </div>

        {cuotas.length > 0 && !planCuadra ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            El plan suma {formatearMoneda(totalPlan)} y el precio pactado es{" "}
            {formatearMoneda(venta.precio_pactado)}. Rehaga el plan.
          </p>
        ) : null}

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Concepto</th>
                <th className="px-4 py-2 font-medium">Vence</th>
                <th className="px-4 py-2 text-right font-medium">Esperado</th>
                <th className="px-4 py-2 text-right font-medium">Aplicado</th>
                <th className="px-4 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {cuotas.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2">
                    {ETIQUETAS_TIPO_CUOTA[c.tipo]} {c.numero}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {formatearFecha(c.fecha_vencimiento)}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {formatearMoneda(c.monto_esperado)}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {formatearMoneda(c.monto_aplicado)}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {ETIQUETAS_ESTADO_CUOTA[c.estado]}
                  </td>
                </tr>
              ))}
              {cuotas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted-foreground px-4 py-6 text-sm">
                    Esta venta no tiene plan de pagos.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground text-xs">
          Las cuotas son montos esperados; la columna «aplicado» la llenan los
          pagos y la mantiene la base, no la pantalla.
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">
            Pagos recibidos ({pagos.length})
          </h2>
          {puedeEscribir &&
          venta.estado !== "cancelada" &&
          venta.estado !== "saldado" ? (
            <Link
              href={`/ventas/${venta.id}/cobrar`}
              className="hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
            >
              Registrar pago
            </Link>
          ) : null}
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha</th>
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
                  <td className="px-4 py-2 text-xs">
                    {ETIQUETAS_METODO_PAGO[p.metodo]}
                  </td>
                  <td className="text-muted-foreground px-4 py-2 text-xs">
                    {p.referencia ?? "—"}
                  </td>
                  <td
                    className={`px-4 py-2 text-right whitespace-nowrap ${
                      p.es_reverso ? "text-red-700" : ""
                    }`}
                  >
                    {p.es_reverso ? "−" : ""}
                    {formatearMoneda(p.monto)}
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
                  <td colSpan={4} className="text-muted-foreground px-4 py-6 text-sm">
                    Todavía no se ha recibido ningún pago de esta venta.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground text-xs">
          Cada pago emite su recibo y el estado de la venta avanza solo cuando
          se termina de pagar cada bloque del plan.
        </p>
      </section>

      {puedeEscribir && venta.estado !== "cancelada" ? (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-medium">Estado de la venta</h2>
            <FormularioEstadoVenta
              ventaId={venta.id}
              estadoActual={venta.estado}
              destinos={transicionesVentaDesde(venta.estado).filter(
                (e) => e !== "cancelada",
              )}
            />
            <p className="text-muted-foreground text-xs">
              El solar se mueve solo: sigue el estado de la venta.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium">Contrato</h2>
            <FormularioContrato
              ventaId={venta.id}
              actual={venta.estado_contrato}
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium">Corregir la venta</h2>
            <FormularioVenta
              solares={solares}
              clientes={clientes}
              vendedores={vendedores}
              configuracion={configuracion}
              venta={{
                id: venta.id,
                solar_id: venta.solar_id,
                cliente_id: venta.cliente_id,
                vendedor_id: venta.vendedor_id,
                fecha_venta: venta.fecha_venta,
                precio_pactado: venta.precio_pactado,
                monto_separacion: venta.monto_separacion,
                monto_inicial: venta.monto_inicial,
                cuotas_inicial: venta.cuotas_inicial,
                cuotas_capital: venta.cuotas_capital,
                estado_contrato: venta.estado_contrato,
                notas: venta.notas,
              }}
            />
            <BotonRegenerarPlan ventaId={venta.id} />
          </section>
        </>
      ) : null}

      {esGerencia(perfil) ? (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-medium">Historial de esta venta</h2>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-4 py-2 font-medium">Fecha</th>
                    <th className="px-4 py-2 font-medium">Usuario</th>
                    <th className="px-4 py-2 font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {historial.map((h) => (
                    <tr key={h.id}>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {new Date(h.ocurrido_en).toLocaleString("es-DO")}
                      </td>
                      <td className="px-4 py-2">{h.usuario_correo ?? "sistema"}</td>
                      <td className="px-4 py-2">{h.accion}</td>
                    </tr>
                  ))}
                  {historial.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-muted-foreground px-4 py-4 text-sm">
                        Sin movimientos registrados.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          {venta.estado !== "cancelada" && venta.estado !== "saldado" ? (
            <BotonCancelarVenta ventaId={venta.id} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
