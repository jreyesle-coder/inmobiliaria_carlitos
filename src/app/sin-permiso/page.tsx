import Link from "next/link";
import type { Metadata } from "next";
import { requerirPerfil, ETIQUETAS_ROL } from "@/lib/auth";

export const metadata: Metadata = { title: "Sin permiso — ERP Solares" };

export default async function SinPermiso() {
  const perfil = await requerirPerfil();

  return (
    <div className="mx-auto max-w-md space-y-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">
        No tiene acceso a esta sección
      </h1>
      <p className="text-muted-foreground text-sm">
        Su rol es <strong>{ETIQUETAS_ROL[perfil.rol]}</strong>. Si necesita
        entrar aquí, pida a gerencia que le cambie el rol.
      </p>
      <Link href="/" className="text-sm underline underline-offset-4">
        Volver al inicio
      </Link>
    </div>
  );
}
