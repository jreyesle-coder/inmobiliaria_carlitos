import type { Metadata } from "next";
import { requerirRol, type Perfil } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { FilaUsuario } from "./fila-usuario";

export const metadata: Metadata = { title: "Usuarios y roles — ERP Solares" };

export default async function Usuarios() {
  const perfil = await requerirRol("gerencia");

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("perfiles")
    .select("id, nombre_completo, correo, rol, activo")
    .order("correo");

  const perfiles = (data ?? []) as Perfil[];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">
          Usuarios y roles
        </h1>
        <p className="text-muted-foreground text-sm">
          Los usuarios se crean desde Supabase (Authentication → Users) y
          entran como <strong>Vendedor</strong>. Aquí gerencia les asigna el rol
          definitivo. Nadie puede cambiar su propio rol.
        </p>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          {error.message}
        </p>
      ) : null}

      <div className="rounded-lg border">
        <ul className="divide-y">
          {perfiles.map((p) => (
            <FilaUsuario
              key={p.id}
              perfil={p}
              esUsuarioActual={p.id === perfil.id}
            />
          ))}
          {perfiles.length === 0 ? (
            <li className="text-muted-foreground px-4 py-6 text-sm">
              No hay usuarios registrados todavía.
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
