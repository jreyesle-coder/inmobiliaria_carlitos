import type { Metadata } from "next";
import Link from "next/link";
import { requerirPerfil } from "@/lib/auth";
import { FormularioCliente } from "../formularios";

export const metadata: Metadata = { title: "Nuevo cliente — ERP Solares" };

export default async function NuevoCliente() {
  // Cualquier usuario con sesión registra clientes: un vendedor necesita dar de
  // alta al suyo. La política `clientes_insert` dice lo mismo en la base.
  await requerirPerfil();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Nuevo cliente</h1>
        <p className="text-muted-foreground text-sm">
          La cédula puede quedar pendiente y cargarse después.{" "}
          <Link href="/clientes" className="underline underline-offset-4">
            Volver a clientes
          </Link>
        </p>
      </div>

      <FormularioCliente />
    </div>
  );
}
