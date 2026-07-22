import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirPerfil, esAdminOGerencia, esGerencia } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatearMoneda } from "@/lib/moneda";
import {
  COLORES_ESTADO_SOLAR,
  ETIQUETAS_ESTADO_SOLAR,
  calcularValorTotal,
  diferenciaValorTotal,
  type EstadoSolar,
} from "@/lib/solares";
import { FormularioSolar, type OpcionManzana } from "../formulario-solar";
import { CambiarEstado } from "./cambiar-estado";

export const metadata: Metadata = { title: "Solar — ERP Solares" };

type Solar = {
  id: string;
  manzana_id: string;
  numero: string;
  area_m2: string;
  valor_m2: string;
  valor_total: string;
  estado: EstadoSolar;
  notas: string | null;
  creado_en: string;
  actualizado_en: string;
  manzana: {
    id: string;
    codigo: string;
    proyecto: { nombre: string } | null;
  } | null;
};

export default async function DetalleSolar({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const perfil = await requerirPerfil();
  const puedeEscribir = esAdminOGerencia(perfil);

  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("solares")
    .select(
      "id, manzana_id, numero, area_m2, valor_m2, valor_total, estado, notas, creado_en, actualizado_en, manzana:manzanas(id, codigo, proyecto:proyectos(nombre))",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const solar = data as unknown as Solar;

  const calculado = calcularValorTotal(solar.area_m2, solar.valor_m2);
  const diferencia = diferenciaValorTotal(
    solar.area_m2,
    solar.valor_m2,
    solar.valor_total,
  );

  let manzanas: OpcionManzana[] = [];
  if (puedeEscribir) {
    const { data: filas } = await supabase
      .from("manzanas")
      .select("id, codigo, valor_m2_referencia, proyecto:proyectos(nombre)")
      .order("codigo");
    manzanas = (
      (filas ?? []) as unknown as {
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
  }

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
      .eq("tabla", "solares")
      .eq("registro_id", solar.id)
      .order("ocurrido_en", { ascending: false })
      .limit(20);
    historial = filas ?? [];
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            Solar {solar.numero} · Manzana {solar.manzana?.codigo ?? "—"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {solar.manzana?.proyecto?.nombre ?? "Sin proyecto"} ·{" "}
            <Link href="/solares" className="underline underline-offset-4">
              Volver al inventario
            </Link>
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${COLORES_ESTADO_SOLAR[solar.estado]}`}
        >
          {ETIQUETAS_ESTADO_SOLAR[solar.estado]}
        </span>
      </div>

      <dl className="grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground text-xs">Área</dt>
          <dd className="font-medium">
            {formatearMoneda(solar.area_m2, { conSimbolo: false })} m²
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Valor por m²</dt>
          <dd className="font-medium">{formatearMoneda(solar.valor_m2)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Valor total</dt>
          <dd className="font-medium">{formatearMoneda(solar.valor_total)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">
            Calculado (área × m²)
          </dt>
          <dd
            className={
              diferencia.isZero() ? "font-medium" : "font-medium text-amber-700"
            }
          >
            {formatearMoneda(calculado)}
            {diferencia.isZero() ? null : (
              <span className="block text-xs">
                Diferencia: {formatearMoneda(diferencia)}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {solar.notas ? (
        <p className="text-sm whitespace-pre-line">{solar.notas}</p>
      ) : null}

      {puedeEscribir ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Estado</h2>
          <CambiarEstado solarId={solar.id} estadoActual={solar.estado} />
          <p className="text-muted-foreground text-xs">
            Pipeline: Libre → Separado → Inicial → Capital → Saldado. Se puede
            volver un paso atrás; Saldado es final. Todo cambio queda en la
            bitácora.
          </p>
        </section>
      ) : null}

      {puedeEscribir ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Editar solar</h2>
          <FormularioSolar
            manzanas={manzanas}
            solar={{
              id: solar.id,
              manzana_id: solar.manzana_id,
              numero: solar.numero,
              area_m2: solar.area_m2,
              valor_m2: solar.valor_m2,
              valor_total: solar.valor_total,
              notas: solar.notas,
            }}
          />
        </section>
      ) : null}

      {esGerencia(perfil) ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Historial de este solar</h2>
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
                    <td className="px-4 py-2">{h.usuario_correo ?? "sistema"}</td>
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
      ) : null}
    </div>
  );
}
