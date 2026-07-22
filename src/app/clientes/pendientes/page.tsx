import type { Metadata } from "next";
import Link from "next/link";
import { requerirPerfil } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatearTelefono } from "@/lib/personas";
import { FormularioCargarCedula } from "../formularios";

export const metadata: Metadata = {
  title: "Cédulas pendientes — ERP Solares",
};

type FilaPendiente = {
  id: string;
  nombre_completo: string;
  telefono: string | null;
  correo: string | null;
  creado_en: string;
};

/**
 * Bandeja de trabajo: los clientes que entraron sin cédula (sobre todo los que
 * traerá la migración del Excel, Sprint 7) para completarlos de un tirón.
 */
export default async function CedulasPendientes() {
  await requerirPerfil();

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("clientes")
    .select("id, nombre_completo, telefono, correo, creado_en")
    .eq("cedula_pendiente", true)
    .order("nombre_completo");

  const pendientes = (data ?? []) as FilaPendiente[];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">
          Clientes con cédula pendiente
        </h1>
        <p className="text-muted-foreground text-sm">
          {pendientes.length} por completar ·{" "}
          <Link href="/clientes" className="underline underline-offset-4">
            Volver a clientes
          </Link>
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
              <th className="px-4 py-2 font-medium">Cliente</th>
              <th className="px-4 py-2 font-medium">Contacto</th>
              <th className="px-4 py-2 font-medium">Cédula</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pendientes.map((c) => (
              <tr key={c.id} className="align-top">
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/clientes/${c.id}`}
                    className="underline underline-offset-4"
                  >
                    {c.nombre_completo}
                  </Link>
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {formatearTelefono(c.telefono) || c.correo || "—"}
                </td>
                <td className="px-4 py-3">
                  <FormularioCargarCedula clienteId={c.id} />
                </td>
              </tr>
            ))}
            {pendientes.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-muted-foreground px-4 py-6 text-sm">
                  Ningún cliente tiene la cédula pendiente.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
