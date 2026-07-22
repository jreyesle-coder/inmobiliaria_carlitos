import type { Metadata } from "next";
import Link from "next/link";
import { requerirPerfil, esAdminOGerencia } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatearMoneda } from "@/lib/moneda";
import {
  COLORES_ESTADO_VENTA,
  ESTADOS_VENTA,
  ETIQUETAS_ESTADO_VENTA,
  esEstadoVenta,
  formatearFecha,
  type EstadoVenta,
} from "@/lib/ventas";

export const metadata: Metadata = { title: "Ventas — ERP Solares" };

type FilaVenta = {
  id: string;
  fecha_venta: string;
  precio_pactado: string;
  estado: EstadoVenta;
  estado_contrato: "pendiente" | "listo";
  solar: { numero: string; manzana: { codigo: string } | null } | null;
  cliente: { nombre_completo: string } | null;
  vendedor: { nombre_completo: string } | null;
};

const campo =
  "border-input h-9 w-full rounded-md border bg-transparent px-2 text-sm";
const etiqueta = "text-muted-foreground block text-xs";

const uno = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export default async function Ventas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const perfil = await requerirPerfil();
  const puedeEscribir = esAdminOGerencia(perfil);
  const params = await searchParams;

  const filtroEstadoBruto = uno(params.estado);
  const filtroEstado = esEstadoVenta(filtroEstadoBruto) ? filtroEstadoBruto : "";
  const filtroContrato = uno(params.contrato);
  const filtroCliente = uno(params.cliente);

  const supabase = await crearClienteServidor();

  // RLS ya limita lo que ve cada rol: el vendedor solo sus ventas.
  let consulta = supabase
    .from("ventas")
    .select(
      "id, fecha_venta, precio_pactado, estado, estado_contrato, " +
        "solar:solares(numero, manzana:manzanas(codigo)), " +
        "cliente:clientes(nombre_completo), vendedor:vendedores(nombre_completo)",
    );

  if (filtroEstado) consulta = consulta.eq("estado", filtroEstado);
  if (filtroContrato === "pendiente" || filtroContrato === "listo") {
    consulta = consulta.eq("estado_contrato", filtroContrato);
  }

  const { data, error } = await consulta
    .order("fecha_venta", { ascending: false })
    .order("creado_en", { ascending: false });

  let ventas = (data ?? []) as unknown as FilaVenta[];

  // El filtro por cliente se aplica aquí porque es sobre una tabla relacionada
  // y son decenas de ventas, no miles.
  if (filtroCliente) {
    const buscado = filtroCliente.toLowerCase();
    ventas = ventas.filter((v) =>
      (v.cliente?.nombre_completo ?? "").toLowerCase().includes(buscado),
    );
  }

  const conteo = new Map<EstadoVenta, number>();
  for (const v of ventas) conteo.set(v.estado, (conteo.get(v.estado) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Ventas</h1>
          <p className="text-muted-foreground text-sm">
            {ventas.length} venta{ventas.length === 1 ? "" : "s"} según los
            filtros aplicados.
          </p>
        </div>
        {puedeEscribir ? (
          <Link
            href="/ventas/nueva"
            className="hover:bg-muted rounded-md border px-3 py-2 text-sm"
          >
            Nueva venta
          </Link>
        ) : null}
      </div>

      <form className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1">
          <span className={etiqueta}>Estado</span>
          <select name="estado" defaultValue={filtroEstado} className={campo}>
            <option value="">Todos</option>
            {ESTADOS_VENTA.map((e) => (
              <option key={e} value={e}>
                {ETIQUETAS_ESTADO_VENTA[e]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className={etiqueta}>Contrato</span>
          <select name="contrato" defaultValue={filtroContrato} className={campo}>
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="listo">Listo</option>
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
            href="/ventas"
            className="text-muted-foreground flex h-9 items-center text-sm underline underline-offset-4"
          >
            Limpiar
          </Link>
        </div>
      </form>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          {error.message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 text-xs">
        {ESTADOS_VENTA.filter((e) => conteo.get(e)).map((e) => (
          <span
            key={e}
            className={`rounded-full px-2.5 py-1 font-medium ${COLORES_ESTADO_VENTA[e]}`}
          >
            {ETIQUETAS_ESTADO_VENTA[e]}: {conteo.get(e)}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Solar</th>
              <th className="px-4 py-2 font-medium">Cliente</th>
              <th className="px-4 py-2 font-medium">Vendedor</th>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 text-right font-medium">Precio</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Contrato</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {ventas.map((v) => (
              <tr key={v.id} className="hover:bg-muted/40">
                <td className="px-4 py-2 font-medium whitespace-nowrap">
                  <Link
                    href={`/ventas/${v.id}`}
                    className="underline underline-offset-4"
                  >
                    {v.solar?.manzana?.codigo ?? "—"} · {v.solar?.numero ?? "—"}
                  </Link>
                </td>
                <td className="px-4 py-2">{v.cliente?.nombre_completo ?? "—"}</td>
                <td className="px-4 py-2">
                  {v.vendedor?.nombre_completo ?? "—"}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {formatearFecha(v.fecha_venta)}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {formatearMoneda(v.precio_pactado)}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${COLORES_ESTADO_VENTA[v.estado]}`}
                  >
                    {ETIQUETAS_ESTADO_VENTA[v.estado]}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs">
                  {v.estado_contrato === "listo" ? (
                    "Listo"
                  ) : (
                    <span className="text-amber-700">Pendiente</span>
                  )}
                </td>
              </tr>
            ))}
            {ventas.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-muted-foreground px-4 py-6 text-sm">
                  No hay ventas que cumplan con los filtros.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
