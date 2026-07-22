import type { Metadata } from "next";
import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { FormularioSolar, type OpcionManzana } from "../formulario-solar";

export const metadata: Metadata = { title: "Nuevo solar — ERP Solares" };

export default async function NuevoSolar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirRol("administracion", "gerencia");
  const params = await searchParams;
  const manzanaPorDefecto = Array.isArray(params.manzana)
    ? params.manzana[0]
    : params.manzana;

  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("manzanas")
    .select("id, codigo, valor_m2_referencia, proyecto:proyectos(nombre)")
    .order("codigo");

  const manzanas: OpcionManzana[] = (
    (data ?? []) as unknown as {
      id: string;
      codigo: string;
      valor_m2_referencia: string | null;
      proyecto: { nombre: string } | null;
    }[]
  ).map((m) => ({
    id: m.id,
    codigo: m.codigo,
    valor_m2_referencia: m.valor_m2_referencia,
    proyecto: m.proyecto?.nombre ?? "",
  }));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Nuevo solar</h1>
        <p className="text-muted-foreground text-sm">
          El número es único dentro de la manzana.{" "}
          <Link href="/solares" className="underline underline-offset-4">
            Volver al inventario
          </Link>
        </p>
      </div>

      {manzanas.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border px-4 py-6 text-sm">
          Primero cree una manzana en{" "}
          <Link href="/proyectos" className="underline underline-offset-4">
            Proyectos y manzanas
          </Link>
          .
        </p>
      ) : (
        <FormularioSolar
          manzanas={manzanas}
          manzanaPorDefecto={manzanaPorDefecto}
        />
      )}
    </div>
  );
}
