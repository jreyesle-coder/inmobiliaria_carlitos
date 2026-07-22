import type { Metadata } from "next";
import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { configuracionDeVentas } from "@/lib/configuracion";
import { formatearCedula } from "@/lib/personas";
import { FormularioVenta, type OpcionSolar } from "../formularios";

export const metadata: Metadata = { title: "Nueva venta — ERP Solares" };

export default async function NuevaVenta() {
  await requerirRol("administracion", "gerencia");

  const supabase = await crearClienteServidor();
  const configuracion = await configuracionDeVentas();

  // Solo solares libres: el resto ya tiene venta o está fuera del flujo
  // residencial, y el trigger `tr_validar_venta` los rechazaría igual.
  const { data: solaresData } = await supabase
    .from("solares")
    .select("id, numero, valor_total, manzana:manzanas(codigo)")
    .eq("estado", "libre")
    .order("numero");

  const solares: OpcionSolar[] = (
    (solaresData ?? []) as unknown as {
      id: string;
      numero: string;
      valor_total: string;
      manzana: { codigo: string } | null;
    }[]
  ).map((s) => ({
    id: s.id,
    numero: s.numero,
    manzana: s.manzana?.codigo ?? "—",
    valor_total: s.valor_total,
  }));

  const { data: clientesData } = await supabase
    .from("clientes")
    .select("id, nombre_completo, cedula")
    .order("nombre_completo");

  const clientes = (clientesData ?? []).map((c) => ({
    id: c.id as string,
    nombre: formatearCedula(c.cedula as string | null)
      ? `${c.nombre_completo} · ${formatearCedula(c.cedula as string | null)}`
      : `${c.nombre_completo} · cédula pendiente`,
  }));

  const { data: vendedoresData } = await supabase
    .from("vendedores")
    .select("id, nombre_completo")
    .eq("activo", true)
    .order("nombre_completo");

  const vendedores = (vendedoresData ?? []).map((v) => ({
    id: v.id as string,
    nombre: v.nombre_completo as string,
  }));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Nueva venta</h1>
        <p className="text-muted-foreground text-sm">
          <Link href="/ventas" className="underline underline-offset-4">
            Volver a ventas
          </Link>
        </p>
      </div>

      <FormularioVenta
        solares={solares}
        clientes={clientes}
        vendedores={vendedores}
        configuracion={configuracion}
      />
    </div>
  );
}
