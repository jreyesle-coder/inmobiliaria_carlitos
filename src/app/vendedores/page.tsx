import type { Metadata } from "next";
import Link from "next/link";
import { requerirPerfil, esGerencia } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatearCedula, formatearTelefono } from "@/lib/personas";
import {
  FormularioEditarVendedor,
  FormularioVendedor,
  type OpcionPerfil,
} from "./formularios";

export const metadata: Metadata = { title: "Vendedores — ERP Solares" };

type FilaVendedor = {
  id: string;
  nombre_completo: string;
  cedula: string | null;
  telefono: string | null;
  correo: string | null;
  perfil_id: string | null;
  activo: boolean;
  perfil: { correo: string; nombre_completo: string; rol: string } | null;
};

export default async function Vendedores() {
  const perfil = await requerirPerfil();
  const puedeEscribir = esGerencia(perfil);

  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .from("vendedores")
    .select(
      "id, nombre_completo, cedula, telefono, correo, perfil_id, activo, perfil:perfiles(correo, nombre_completo, rol)",
    )
    .order("nombre_completo");
  const vendedores = (data ?? []) as unknown as FilaVendedor[];

  // Solo gerencia lee todos los perfiles (política `perfiles_select`), y solo
  // gerencia puede vincularlos, así que no se piden si no hace falta.
  let perfiles: OpcionPerfil[] = [];
  if (puedeEscribir) {
    const { data: filas } = await supabase
      .from("perfiles")
      .select("id, correo, nombre_completo, rol")
      .eq("activo", true)
      .order("correo");
    perfiles = (filas ?? []) as OpcionPerfil[];
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Vendedores</h1>
          <p className="text-muted-foreground text-sm">
            {vendedores.length} registrado
            {vendedores.length === 1 ? "" : "s"} ·{" "}
            <Link href="/clientes" className="underline underline-offset-4">
              Ir a clientes
            </Link>
          </p>
        </div>
        {puedeEscribir ? <FormularioVendedor perfiles={perfiles} /> : null}
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
              <th className="px-4 py-2 font-medium">Vendedor</th>
              <th className="px-4 py-2 font-medium">Cédula</th>
              <th className="px-4 py-2 font-medium">Contacto</th>
              <th className="px-4 py-2 font-medium">Usuario vinculado</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              {puedeEscribir ? <th className="px-4 py-2" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {vendedores.map((v) => (
              <tr key={v.id} className="align-top">
                <td className="px-4 py-3 font-medium">{v.nombre_completo}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatearCedula(v.cedula) || "—"}
                </td>
                <td className="px-4 py-3">
                  {formatearTelefono(v.telefono) || v.correo || "—"}
                </td>
                <td className="px-4 py-3">
                  {v.perfil_id ? (
                    (v.perfil?.correo ?? "usuario vinculado")
                  ) : (
                    <span className="text-muted-foreground">
                      Sin usuario: no entra al sistema
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {v.activo ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                      Activo
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-100">
                      Inactivo
                    </span>
                  )}
                </td>
                {puedeEscribir ? (
                  <td className="px-4 py-3">
                    <FormularioEditarVendedor
                      vendedor={{
                        id: v.id,
                        nombre_completo: v.nombre_completo,
                        cedula: v.cedula,
                        telefono: v.telefono,
                        correo: v.correo,
                        perfil_id: v.perfil_id,
                        activo: v.activo,
                      }}
                      perfiles={perfiles}
                    />
                  </td>
                ) : null}
              </tr>
            ))}
            {vendedores.length === 0 ? (
              <tr>
                <td
                  colSpan={puedeEscribir ? 6 : 5}
                  className="text-muted-foreground px-4 py-6 text-sm"
                >
                  Todavía no hay vendedores registrados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {puedeEscribir ? (
        <p className="text-muted-foreground text-xs">
          Un vendedor sin usuario vinculado sirve para registrar ventas
          históricas; uno vinculado ve en el sistema sus ventas y comisiones, y
          solo las suyas. Desactivarlo le quita ese acceso sin borrar su
          historia.
        </p>
      ) : null}
    </div>
  );
}
