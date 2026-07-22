import type { Metadata } from "next";
import { requerirRol } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bitácora — ERP Solares" };

type Entrada = {
  id: number;
  tabla: string;
  registro_id: string;
  accion: "insert" | "update" | "delete";
  usuario_correo: string | null;
  ocurrido_en: string;
};

const ETIQUETAS_ACCION = {
  insert: "Creó",
  update: "Modificó",
  delete: "Eliminó",
} as const;

export default async function Bitacora() {
  await requerirRol("gerencia");

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("bitacora_auditoria")
    .select("id, tabla, registro_id, accion, usuario_correo, ocurrido_en")
    .order("ocurrido_en", { ascending: false })
    .limit(200);

  const entradas = (data ?? []) as Entrada[];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">
          Bitácora de auditoría
        </h1>
        <p className="text-muted-foreground text-sm">
          Últimos 200 movimientos. La escriben los triggers de la base de
          datos; nadie puede editarla ni borrarla.
        </p>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          {error.message}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Usuario</th>
              <th className="px-4 py-2 font-medium">Acción</th>
              <th className="px-4 py-2 font-medium">Tabla</th>
              <th className="px-4 py-2 font-medium">Registro</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {entradas.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2 whitespace-nowrap">
                  {new Date(e.ocurrido_en).toLocaleString("es-DO")}
                </td>
                <td className="px-4 py-2">{e.usuario_correo ?? "sistema"}</td>
                <td className="px-4 py-2">{ETIQUETAS_ACCION[e.accion]}</td>
                <td className="px-4 py-2">{e.tabla}</td>
                <td className="text-muted-foreground px-4 py-2 font-mono text-xs">
                  {e.registro_id}
                </td>
              </tr>
            ))}
            {entradas.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="text-muted-foreground px-4 py-6 text-sm"
                >
                  Todavía no hay movimientos registrados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
