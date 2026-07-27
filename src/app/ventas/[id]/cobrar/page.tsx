import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirRol } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatRD } from "@/lib/format";
import { formatearFecha } from "@/lib/ventas";
import type { CuotaCobrable } from "@/lib/pagos";
import { FormularioPago } from "@/app/pagos/formularios";

export const metadata: Metadata = { title: "Registrar pago — ERP Solares" };

export default async function CobrarVenta({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requerirRol("administracion", "gerencia");

  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("ventas")
    .select(
      "id, estado, fecha_venta, precio_pactado, " +
        "solar:solares(numero, manzana:manzanas(codigo)), " +
        "cliente:clientes(nombre_completo)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const venta = data as unknown as {
    id: string;
    estado: string;
    fecha_venta: string;
    precio_pactado: string;
    solar: { numero: string; manzana: { codigo: string } | null } | null;
    cliente: { nombre_completo: string } | null;
  };

  const { data: cuotasData } = await supabase
    .from("cuotas")
    .select("id, tipo, numero, monto_esperado, monto_aplicado, fecha_vencimiento")
    .eq("venta_id", id);
  const cuotas = (cuotasData ?? []) as unknown as CuotaCobrable[];

  const { data: resumen } = await supabase
    .from("ventas_resumen_cobros")
    .select("total_aplicado, balance_pendiente, vencido_pendiente")
    .eq("venta_id", id)
    .maybeSingle();

  const bloqueada = venta.estado === "cancelada" || venta.estado === "saldado";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">
          Registrar pago · Solar {venta.solar?.manzana?.codigo ?? "—"} ·{" "}
          {venta.solar?.numero ?? "—"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {venta.cliente?.nombre_completo ?? "—"} · venta del{" "}
          {formatearFecha(venta.fecha_venta)}
        </p>
        <p className="text-muted-foreground text-sm">
          <Link href={`/ventas/${id}`} className="underline underline-offset-4">
            Volver a la venta
          </Link>
        </p>
      </div>

      <dl className="grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground text-xs">Precio pactado</dt>
          <dd className="font-medium">{formatRD(venta.precio_pactado)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Abonado</dt>
          <dd className="font-medium">
            {formatRD(resumen?.total_aplicado ?? "0")}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Balance pendiente</dt>
          <dd className="font-medium">
            {formatRD(resumen?.balance_pendiente ?? venta.precio_pactado)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Vencido sin pagar</dt>
          <dd className="font-medium">
            {formatRD(resumen?.vencido_pendiente ?? "0")}
          </dd>
        </div>
      </dl>

      {bloqueada ? (
        <p className="rounded-md bg-estado-separado px-3 py-2 text-sm text-estado-separado-foreground">
          {venta.estado === "cancelada"
            ? "La venta está cancelada: no admite pagos."
            : "La venta ya está saldada: no queda nada por cobrar."}
        </p>
      ) : (
        <FormularioPago ventaId={id} cuotas={cuotas} />
      )}
    </div>
  );
}
