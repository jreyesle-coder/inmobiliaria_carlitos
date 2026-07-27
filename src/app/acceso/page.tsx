import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/auth";
import { FormularioAcceso } from "./formulario";

export const metadata: Metadata = { title: "Acceso — ERP Solares" };

export default async function Acceso({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const { motivo } = await searchParams;
  const perfil = await obtenerPerfil();

  // Con sesión válida no hay nada que hacer aquí.
  if (perfil?.activo) redirect("/");

  return (
    <div className="mx-auto max-w-sm space-y-6 py-10">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Iniciar sesión</h1>
        <p className="text-muted-foreground text-sm">
          Sistema interno de OASIS DE MACHIN. Si no tiene usuario, solicítelo a
          gerencia.
        </p>
      </div>

      {motivo === "inactivo" ? (
        <p className="rounded-md bg-estado-separado px-3 py-2 text-sm text-estado-separado-foreground">
          Su usuario está desactivado. Contacte a gerencia.
        </p>
      ) : null}

      <FormularioAcceso />
    </div>
  );
}
