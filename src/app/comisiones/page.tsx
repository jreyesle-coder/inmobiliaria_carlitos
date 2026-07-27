import type { Metadata } from "next";
import Link from "next/link";
import { requerirPerfil, esGerencia, esAdminOGerencia } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { leerConfiguracion } from "@/lib/configuracion";
import { formatearMoneda, monto, Decimal } from "@/lib/moneda";
import {
  formatearPorcentaje,
  ETIQUETAS_ESTADO_COMISION,
  type EstadoComision,
} from "@/lib/comisiones";
import { BotonMarcarComision } from "./formularios";

export const metadata: Metadata = { title: "Comisiones — ERP Solares" };

type FilaComision = {
  id: string;
  base_calculo: string;
  porcentaje: string;
  monto: string;
  estado: EstadoComision;
  fecha_generacion: string;
  fecha_pago: string | null;
  vendedor: { nombre_completo: string } | null;
  venta: {
    estado: string;
    cliente: { nombre_completo: string } | null;
    solar: { numero: string; manzana: { codigo: string } | null } | null;
  } | null;
};

const badgeEstado: Record<EstadoComision, string> = {
  pendiente:
    "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  pagada:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
};

function solarEtiqueta(v: FilaComision["venta"]): string {
  if (!v?.solar) return "—";
  const mz = v.solar.manzana?.codigo ?? "";
  return `${mz}·${v.solar.numero}`;
}

export default async function Comisiones() {
  const perfil = await requerirPerfil();
  const puedeMarcar = esGerencia(perfil);
  const verTodo = esAdminOGerencia(perfil);

  const supabase = await crearClienteServidor();

  const [{ data, error }, config] = await Promise.all([
    supabase
      .from("comisiones")
      .select(
        "id, base_calculo, porcentaje, monto, estado, fecha_generacion, fecha_pago, " +
          "vendedor:vendedores(nombre_completo), " +
          "venta:ventas(estado, cliente:clientes(nombre_completo), solar:solares(numero, manzana:manzanas(codigo)))",
      )
      .order("fecha_generacion", { ascending: false }),
    leerConfiguracion(["comision_porcentaje"]),
  ]);

  const comisiones = (data ?? []) as unknown as FilaComision[];

  // Resumen por vendedor: cuánto se le debe (pendiente) y cuánto ya se le pagó.
  const porVendedor = new Map<
    string,
    { pendiente: Decimal; pagada: Decimal; n: number }
  >();
  for (const c of comisiones) {
    const nombre = c.vendedor?.nombre_completo ?? "Sin vendedor";
    const acc = porVendedor.get(nombre) ?? {
      pendiente: new Decimal(0),
      pagada: new Decimal(0),
      n: 0,
    };
    if (c.estado === "pagada") acc.pagada = acc.pagada.plus(monto(c.monto));
    else acc.pendiente = acc.pendiente.plus(monto(c.monto));
    acc.n += 1;
    porVendedor.set(nombre, acc);
  }
  const resumen = [...porVendedor.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], "es"),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Comisiones</h1>
          <p className="text-muted-foreground text-sm">
            {comisiones.length} comisión
            {comisiones.length === 1 ? "" : "es"} · porcentaje vigente{" "}
            <strong>
              {formatearPorcentaje(config.comision_porcentaje)}
            </strong>{" "}
            del precio pactado.
            {puedeMarcar ? (
              <>
                {" "}
                <Link
                  href="/configuracion"
                  className="underline underline-offset-4"
                >
                  Cambiar porcentaje
                </Link>
              </>
            ) : null}
          </p>
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        La comisión se genera sola cuando la venta completa la inicial (pasa a
        capital). Generarla no es pagarla: nace pendiente y{" "}
        {puedeMarcar ? "usted la marca" : "gerencia la marca"} pagada cuando se
        liquida.
      </p>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          {error.message}
        </p>
      ) : null}

      {verTodo && resumen.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="bg-muted/50 px-4 py-2 text-left font-medium">
              Por vendedor
            </caption>
            <thead className="bg-muted/30 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Vendedor</th>
                <th className="px-4 py-2 text-right font-medium">Pendiente</th>
                <th className="px-4 py-2 text-right font-medium">Pagado</th>
                <th className="px-4 py-2 text-right font-medium">Comisiones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {resumen.map(([nombre, r]) => (
                <tr key={nombre}>
                  <td className="px-4 py-2 font-medium">{nombre}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {formatearMoneda(r.pendiente)}
                  </td>
                  <td className="text-muted-foreground px-4 py-2 text-right whitespace-nowrap">
                    {formatearMoneda(r.pagada)}
                  </td>
                  <td className="px-4 py-2 text-right">{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Solar</th>
              <th className="px-4 py-2 font-medium">Cliente</th>
              <th className="px-4 py-2 font-medium">Vendedor</th>
              <th className="px-4 py-2 text-right font-medium">Base</th>
              <th className="px-4 py-2 text-right font-medium">%</th>
              <th className="px-4 py-2 text-right font-medium">Monto</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Generada</th>
              {puedeMarcar ? <th className="px-4 py-2" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {comisiones.map((c) => (
              <tr key={c.id} className="align-top">
                <td className="px-4 py-3 font-medium whitespace-nowrap">
                  {solarEtiqueta(c.venta)}
                </td>
                <td className="px-4 py-3">
                  {c.venta?.cliente?.nombre_completo ?? "—"}
                </td>
                <td className="px-4 py-3">
                  {c.vendedor?.nombre_completo ?? "—"}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {formatearMoneda(c.base_calculo)}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {formatearPorcentaje(c.porcentaje)}
                </td>
                <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                  {formatearMoneda(c.monto)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeEstado[c.estado]}`}
                  >
                    {ETIQUETAS_ESTADO_COMISION[c.estado]}
                  </span>
                  {c.estado === "pagada" && c.fecha_pago ? (
                    <div className="text-muted-foreground mt-1 text-xs">
                      {c.fecha_pago}
                    </div>
                  ) : null}
                </td>
                <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">
                  {c.fecha_generacion}
                </td>
                {puedeMarcar ? (
                  <td className="px-4 py-3">
                    <BotonMarcarComision
                      comisionId={c.id}
                      pagada={c.estado === "pagada"}
                    />
                  </td>
                ) : null}
              </tr>
            ))}
            {comisiones.length === 0 ? (
              <tr>
                <td
                  colSpan={puedeMarcar ? 9 : 8}
                  className="text-muted-foreground px-4 py-6 text-sm"
                >
                  Todavía no hay comisiones. Aparecen solas cuando una venta
                  completa su inicial.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
