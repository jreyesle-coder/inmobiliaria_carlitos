import type { Metadata } from "next";
import Link from "next/link";
import { requerirPerfil, esAdminOGerencia } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { parsearMonto, aNumeric } from "@/lib/moneda";
import { formatRD, formatM2 } from "@/lib/format";
import {
  ESTADOS_SOLAR,
  ETIQUETAS_ESTADO_SOLAR,
  esEstadoSolar,
  type EstadoSolar,
} from "@/lib/solares";
import { EstadoBadge } from "@/components/ui/estado-badge";

export const metadata: Metadata = { title: "Solares — ERP Solares" };

type FilaSolar = {
  id: string;
  numero: string;
  area_m2: string;
  valor_m2: string;
  valor_total: string;
  estado: EstadoSolar;
  manzana: { id: string; codigo: string; proyecto: { nombre: string } } | null;
};

const campo =
  "border-input h-9 w-full rounded-md border bg-transparent px-2 text-sm";
const etiqueta = "text-muted-foreground block text-xs";

/** Toma el primer valor de un parámetro que puede venir repetido. */
const uno = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export default async function Solares({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const perfil = await requerirPerfil();
  const puedeEscribir = esAdminOGerencia(perfil);
  const params = await searchParams;

  const filtroManzana = uno(params.manzana);
  const filtroEstadoBruto = uno(params.estado);
  const filtroEstado = esEstadoSolar(filtroEstadoBruto) ? filtroEstadoBruto : "";
  const filtroNumero = uno(params.numero);
  const desde = parsearMonto(uno(params.desde));
  const hasta = parsearMonto(uno(params.hasta));

  const supabase = await crearClienteServidor();

  const { data: manzanasData } = await supabase
    .from("manzanas")
    .select("id, codigo, proyecto:proyectos(nombre)")
    .order("codigo");
  const manzanas = (manzanasData ?? []) as unknown as {
    id: string;
    codigo: string;
    proyecto: { nombre: string } | null;
  }[];

  let consulta = supabase
    .from("solares")
    .select(
      "id, numero, area_m2, valor_m2, valor_total, estado, manzana:manzanas(id, codigo, proyecto:proyectos(nombre))",
    );

  if (filtroManzana) consulta = consulta.eq("manzana_id", filtroManzana);
  if (filtroEstado) consulta = consulta.eq("estado", filtroEstado);
  if (filtroNumero) consulta = consulta.ilike("numero", `%${filtroNumero}%`);
  if (desde && !desde.isNegative()) {
    consulta = consulta.gte("valor_total", aNumeric(desde));
  }
  if (hasta && !hasta.isNegative()) {
    consulta = consulta.lte("valor_total", aNumeric(hasta));
  }

  const { data, error } = await consulta.order("numero");
  const solares = (data ?? []) as unknown as FilaSolar[];

  // Resumen por estado de lo que se está viendo.
  const conteo = new Map<EstadoSolar, number>();
  for (const s of solares) {
    conteo.set(s.estado, (conteo.get(s.estado) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            Inventario de solares
          </h1>
          <p className="text-muted-foreground text-sm">
            {solares.length} solar{solares.length === 1 ? "" : "es"} según los
            filtros aplicados.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/proyectos" className="hover:bg-muted rounded-md border px-3 py-2 text-sm">
            Proyectos y manzanas
          </Link>
          {puedeEscribir ? (
            <Link
              href="/solares/nuevo"
              className="hover:bg-muted rounded-md border px-3 py-2 text-sm"
            >
              Nuevo solar
            </Link>
          ) : null}
        </div>
      </div>

      <form className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3 lg:grid-cols-6">
        <label className="space-y-1">
          <span className={etiqueta}>Manzana</span>
          <select name="manzana" defaultValue={filtroManzana} className={campo}>
            <option value="">Todas</option>
            {manzanas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.proyecto?.nombre ? `${m.proyecto.nombre} · ` : ""}
                {m.codigo}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className={etiqueta}>Estado</span>
          <select name="estado" defaultValue={filtroEstado} className={campo}>
            <option value="">Todos</option>
            {ESTADOS_SOLAR.map((e) => (
              <option key={e} value={e}>
                {ETIQUETAS_ESTADO_SOLAR[e]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className={etiqueta}>Número</span>
          <input name="numero" defaultValue={filtroNumero} className={campo} />
        </label>
        <label className="space-y-1">
          <span className={etiqueta}>Valor desde</span>
          <input
            name="desde"
            inputMode="decimal"
            defaultValue={uno(params.desde)}
            className={campo}
          />
        </label>
        <label className="space-y-1">
          <span className={etiqueta}>Valor hasta</span>
          <input
            name="hasta"
            inputMode="decimal"
            defaultValue={uno(params.hasta)}
            className={campo}
          />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="h-9 rounded-md border px-3 text-sm">
            Filtrar
          </button>
          <Link
            href="/solares"
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

      <div className="flex flex-wrap gap-2 text-xs">
        {ESTADOS_SOLAR.filter((e) => conteo.get(e)).map((e) => (
          <span key={e} className="inline-flex items-center gap-1.5">
            <EstadoBadge estado={e} />
            <span className="text-muted-foreground font-medium">
              {conteo.get(e)}
            </span>
          </span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Solar</th>
              <th className="px-4 py-2 font-medium">Manzana</th>
              <th className="px-4 py-2 text-right font-medium">Área (m²)</th>
              <th className="px-4 py-2 text-right font-medium">Valor por m²</th>
              <th className="px-4 py-2 text-right font-medium">Valor total</th>
              <th className="px-4 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {solares.map((s) => (
              <tr key={s.id} className="hover:bg-muted/40">
                <td className="px-4 py-2 font-medium">
                  <Link
                    href={`/solares/${s.id}`}
                    className="underline underline-offset-4"
                  >
                    {s.numero}
                  </Link>
                </td>
                <td className="px-4 py-2">{s.manzana?.codigo ?? "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
                  {formatM2(s.area_m2)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
                  {formatRD(s.valor_m2)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
                  {formatRD(s.valor_total)}
                </td>
                <td className="px-4 py-2">
                  <EstadoBadge estado={s.estado} />
                </td>
              </tr>
            ))}
            {solares.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted-foreground px-4 py-6 text-sm">
                  No hay solares que cumplan con los filtros.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
