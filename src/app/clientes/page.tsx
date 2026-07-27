import type { Metadata } from "next";
import Link from "next/link";
import { requerirPerfil } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import {
  formatearCedula,
  formatearTelefono,
  normalizarCedula,
} from "@/lib/personas";

export const metadata: Metadata = { title: "Clientes — ERP Solares" };

type FilaCliente = {
  id: string;
  nombre_completo: string;
  cedula: string | null;
  cedula_pendiente: boolean;
  telefono: string | null;
  correo: string | null;
  creado_en: string;
};

const campo =
  "border-input h-9 w-full rounded-md border bg-transparent px-2 text-sm";
const etiqueta = "text-muted-foreground block text-xs";

/** Toma el primer valor de un parámetro que puede venir repetido. */
const uno = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export default async function Clientes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirPerfil();
  const params = await searchParams;

  const filtroNombre = uno(params.nombre);
  const filtroCedula = normalizarCedula(uno(params.cedula));
  const soloPendientes = uno(params.pendientes) === "1";

  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from("clientes")
    .select(
      "id, nombre_completo, cedula, cedula_pendiente, telefono, correo, creado_en",
    );

  if (filtroNombre) consulta = consulta.ilike("nombre_completo", `%${filtroNombre}%`);
  if (filtroCedula) consulta = consulta.ilike("cedula", `%${filtroCedula}%`);
  if (soloPendientes) consulta = consulta.eq("cedula_pendiente", true);

  const { data, error } = await consulta.order("nombre_completo");
  const clientes = (data ?? []) as FilaCliente[];

  // Contador global de pendientes: no depende de los filtros de arriba.
  const { count: pendientes } = await supabase
    .from("clientes")
    .select("id", { count: "exact", head: true })
    .eq("cedula_pendiente", true);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground text-sm">
            {clientes.length} cliente{clientes.length === 1 ? "" : "s"} según los
            filtros aplicados.
          </p>
        </div>
        <div className="flex gap-2">
          {pendientes ? (
            <Link
              href="/clientes/pendientes"
              className="rounded-md border bg-estado-separado px-3 py-2 text-sm text-estado-separado-foreground"
            >
              {pendientes} con cédula pendiente
            </Link>
          ) : null}
          <Link
            href="/clientes/nuevo"
            className="hover:bg-muted rounded-md border px-3 py-2 text-sm"
          >
            Nuevo cliente
          </Link>
        </div>
      </div>

      <form className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1">
          <span className={etiqueta}>Nombre</span>
          <input name="nombre" defaultValue={filtroNombre} className={campo} />
        </label>
        <label className="space-y-1">
          <span className={etiqueta}>Cédula</span>
          <input
            name="cedula"
            inputMode="numeric"
            defaultValue={uno(params.cedula)}
            className={campo}
          />
        </label>
        <label className="flex items-end gap-2 text-sm">
          <input
            type="checkbox"
            name="pendientes"
            value="1"
            defaultChecked={soloPendientes}
            className="mb-2.5"
          />
          <span className="mb-2">Solo cédula pendiente</span>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="h-9 rounded-md border px-3 text-sm">
            Filtrar
          </button>
          <Link
            href="/clientes"
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
              <th className="px-4 py-2 font-medium">Cliente</th>
              <th className="px-4 py-2 font-medium">Cédula</th>
              <th className="px-4 py-2 font-medium">Teléfono</th>
              <th className="px-4 py-2 font-medium">Correo</th>
              <th className="px-4 py-2 font-medium">Registrado</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {clientes.map((c) => (
              <tr key={c.id} className="hover:bg-muted/40">
                <td className="px-4 py-2 font-medium">
                  <Link
                    href={`/clientes/${c.id}`}
                    className="underline underline-offset-4"
                  >
                    {c.nombre_completo}
                  </Link>
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {c.cedula_pendiente ? (
                    <span className="rounded-full bg-estado-separado px-2.5 py-0.5 text-xs font-medium text-estado-separado-foreground">
                      Pendiente
                    </span>
                  ) : (
                    formatearCedula(c.cedula)
                  )}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {formatearTelefono(c.telefono) || "—"}
                </td>
                <td className="px-4 py-2">{c.correo ?? "—"}</td>
                <td className="text-muted-foreground px-4 py-2 whitespace-nowrap">
                  {new Date(c.creado_en).toLocaleDateString("es-DO")}
                </td>
              </tr>
            ))}
            {clientes.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-muted-foreground px-4 py-6 text-sm">
                  No hay clientes que cumplan con los filtros.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
