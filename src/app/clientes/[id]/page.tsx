import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirPerfil, esAdminOGerencia, esGerencia } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatearCedula, formatearTelefono } from "@/lib/personas";
import { BotonEliminarCliente, FormularioCliente } from "../formularios";

export const metadata: Metadata = { title: "Cliente — ERP Solares" };

type Cliente = {
  id: string;
  nombre_completo: string;
  cedula: string | null;
  cedula_pendiente: boolean;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  notas: string | null;
  creado_por: string | null;
  creado_en: string;
  actualizado_en: string;
};

export default async function DetalleCliente({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const perfil = await requerirPerfil();

  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("clientes")
    .select(
      "id, nombre_completo, cedula, cedula_pendiente, telefono, correo, direccion, notas, creado_por, creado_en, actualizado_en",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const cliente = data as Cliente;

  // Las mismas condiciones de la política `clientes_update`: si no las cumple,
  // no tiene sentido mostrarle el formulario.
  const puedeEditar =
    esAdminOGerencia(perfil) || cliente.creado_por === perfil.id;

  // La bitácora solo la lee gerencia (política `bitacora_select`).
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
      .eq("tabla", "clientes")
      .eq("registro_id", cliente.id)
      .order("ocurrido_en", { ascending: false })
      .limit(20);
    historial = filas ?? [];
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {cliente.nombre_completo}
          </h1>
          <p className="text-muted-foreground text-sm">
            <Link href="/clientes" className="underline underline-offset-4">
              Volver a clientes
            </Link>
          </p>
        </div>
        {cliente.cedula_pendiente ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Cédula pendiente
          </span>
        ) : null}
      </div>

      <dl className="grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground text-xs">Cédula</dt>
          <dd className="font-medium">
            {formatearCedula(cliente.cedula) || "Pendiente"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Teléfono</dt>
          <dd className="font-medium">
            {formatearTelefono(cliente.telefono) || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Correo</dt>
          <dd className="font-medium break-all">{cliente.correo ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Registrado</dt>
          <dd className="font-medium">
            {new Date(cliente.creado_en).toLocaleDateString("es-DO")}
          </dd>
        </div>
        {cliente.direccion ? (
          <div className="sm:col-span-4">
            <dt className="text-muted-foreground text-xs">Dirección</dt>
            <dd>{cliente.direccion}</dd>
          </div>
        ) : null}
      </dl>

      {cliente.notas ? (
        <p className="text-sm whitespace-pre-line">{cliente.notas}</p>
      ) : null}

      {puedeEditar ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Editar cliente</h2>
          <FormularioCliente
            cliente={{
              id: cliente.id,
              nombre_completo: cliente.nombre_completo,
              cedula: cliente.cedula,
              telefono: cliente.telefono,
              correo: cliente.correo,
              direccion: cliente.direccion,
              notas: cliente.notas,
            }}
          />
        </section>
      ) : (
        <p className="text-muted-foreground text-sm">
          Solo administración, gerencia o quien registró al cliente pueden
          corregir sus datos.
        </p>
      )}

      {esGerencia(perfil) ? (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-medium">Historial de este cliente</h2>
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
                      <td className="px-4 py-2">
                        {h.usuario_correo ?? "sistema"}
                      </td>
                      <td className="px-4 py-2">{h.accion}</td>
                    </tr>
                  ))}
                  {historial.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="text-muted-foreground px-4 py-4 text-sm"
                      >
                        Sin movimientos registrados.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <BotonEliminarCliente clienteId={cliente.id} />
        </>
      ) : null}
    </div>
  );
}
