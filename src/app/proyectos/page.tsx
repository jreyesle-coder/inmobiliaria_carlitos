import type { Metadata } from "next";
import Link from "next/link";
import { requerirPerfil, esAdminOGerencia } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatRD } from "@/lib/format";
import {
  FormularioEditarManzana,
  FormularioEditarProyecto,
  FormularioManzana,
  FormularioProyecto,
} from "./formularios";

export const metadata: Metadata = { title: "Proyectos y manzanas — ERP Solares" };

type Manzana = {
  id: string;
  codigo: string;
  descripcion: string | null;
  valor_m2_referencia: string | null;
};

type Proyecto = {
  id: string;
  nombre: string;
  descripcion: string | null;
  ubicacion: string | null;
  activo: boolean;
  manzanas: Manzana[];
};

export default async function Proyectos() {
  const perfil = await requerirPerfil();
  const puedeEscribir = esAdminOGerencia(perfil);

  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .from("proyectos")
    .select(
      "id, nombre, descripcion, ubicacion, activo, manzanas(id, codigo, descripcion, valor_m2_referencia)",
    )
    .order("nombre")
    .order("codigo", { referencedTable: "manzanas" });

  const proyectos = (data ?? []) as Proyecto[];

  // Cuántos solares tiene cada manzana, para no dejar borrar a ciegas.
  const { data: filas } = await supabase.from("solares").select("manzana_id");
  const solaresPorManzana = new Map<string, number>();
  for (const f of (filas ?? []) as { manzana_id: string }[]) {
    solaresPorManzana.set(
      f.manzana_id,
      (solaresPorManzana.get(f.manzana_id) ?? 0) + 1,
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            Proyectos y manzanas
          </h1>
          <p className="text-muted-foreground text-sm">
            La manzana define el valor por m² de referencia; cada solar puede
            tener el suyo. {puedeEscribir ? null : "Solo administración y gerencia pueden modificar."}
          </p>
        </div>
        {puedeEscribir ? <FormularioProyecto /> : null}
      </div>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      ) : null}

      {proyectos.map((p) => (
        <section key={p.id} className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-medium">
                {p.nombre}
                {p.activo ? null : (
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    (inactivo)
                  </span>
                )}
              </h2>
              <p className="text-muted-foreground text-sm">
                {[p.ubicacion, p.descripcion].filter(Boolean).join(" · ") ||
                  "Sin descripción."}
              </p>
            </div>
            {puedeEscribir ? <FormularioEditarProyecto proyecto={p} /> : null}
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Manzana</th>
                  <th className="px-3 py-2 font-medium">Valor por m²</th>
                  <th className="px-3 py-2 font-medium">Solares</th>
                  <th className="px-3 py-2 font-medium">Descripción</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {p.manzanas.map((m) => (
                  <tr key={m.id}>
                    <td className="px-3 py-2 font-medium">{m.codigo}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {m.valor_m2_referencia
                        ? formatRD(m.valor_m2_referencia)
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/solares?manzana=${m.id}`}
                        className="underline underline-offset-4"
                      >
                        {solaresPorManzana.get(m.id) ?? 0}
                      </Link>
                    </td>
                    <td className="text-muted-foreground px-3 py-2">
                      {m.descripcion ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {puedeEscribir ? (
                        <FormularioEditarManzana manzana={m} />
                      ) : null}
                    </td>
                  </tr>
                ))}
                {p.manzanas.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="text-muted-foreground px-3 py-4 text-sm"
                    >
                      Este proyecto todavía no tiene manzanas.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {puedeEscribir ? <FormularioManzana proyectoId={p.id} /> : null}
        </section>
      ))}

      {proyectos.length === 0 && !error ? (
        <p className="text-muted-foreground rounded-lg border px-4 py-6 text-sm">
          Todavía no hay proyectos registrados.
        </p>
      ) : null}
    </div>
  );
}
