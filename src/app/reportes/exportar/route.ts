import { obtenerPerfil } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import {
  ETIQUETAS_ESTADO_VENTA,
  ETIQUETAS_ESTADO_CONTRATO,
  ETIQUETAS_TIPO_CUOTA,
  formatearFecha,
} from "@/lib/ventas";
import { ETIQUETAS_ESTADO_SOLAR } from "@/lib/solares";
import {
  armarCSV,
  montoCSV,
  etiquetaMes,
  etiquetaSolar,
  type ColumnaCSV,
  type FilaInventario,
  type FilaReporteVenta,
  type FilaRecaudoMes,
  type FilaCuotaVencida,
} from "@/lib/reportes";

/**
 * Exportación de reportes a CSV (abrible en Excel). Un solo endpoint,
 * `?tipo=cartera|ventas|cuotas-vencidas|recaudo|inventario`.
 *
 * Lee las mismas vistas `reporte_*` que el tablero, con el cliente de servidor
 * (llave anónima): la RLS scopea el archivo al rol que lo pide, igual que la
 * pantalla. Un vendedor exporta solo sus ventas.
 */

type Config = {
  vista: string;
  columnas: ColumnaCSV<Record<string, unknown>>[];
  orden?: { columna: string; asc: boolean };
};

// Cada reporte: de qué vista sale, en qué orden y con qué columnas. Los montos
// van con `montoCSV` (número plano, sin símbolo) para que Excel los sume.
function config(tipo: string): Config | null {
  switch (tipo) {
    case "inventario":
      return {
        vista: "reporte_inventario",
        orden: { columna: "estado", asc: true },
        columnas: colsInventario(),
      };
    case "cartera":
    case "ventas":
      return {
        vista: "reporte_ventas",
        orden: { columna: "fecha_venta", asc: false },
        columnas: colsVentas(),
      };
    case "cuotas-vencidas":
      return {
        vista: "reporte_cuotas_vencidas",
        orden: { columna: "dias_vencida", asc: false },
        columnas: colsCuotasVencidas(),
      };
    case "recaudo":
      return {
        vista: "reporte_recaudo_mensual",
        orden: { columna: "mes", asc: false },
        columnas: colsRecaudo(),
      };
    default:
      return null;
  }
}

const c =
  <T,>(titulo: string, valor: (f: T) => string | number | null | undefined): ColumnaCSV<T> => ({
    titulo,
    valor,
  });

function colsInventario(): ColumnaCSV<Record<string, unknown>>[] {
  const cols: ColumnaCSV<FilaInventario>[] = [
    c("Estado", (f) => ETIQUETAS_ESTADO_SOLAR[f.estado] ?? f.estado),
    c("Solares", (f) => f.cantidad),
    c("Valor total", (f) => montoCSV(f.valor_total)),
  ];
  return cols as unknown as ColumnaCSV<Record<string, unknown>>[];
}

function colsVentas(): ColumnaCSV<Record<string, unknown>>[] {
  const cols: ColumnaCSV<FilaReporteVenta>[] = [
    c("Solar", (f) => etiquetaSolar(f.manzana_codigo, f.solar_numero)),
    c("Cliente", (f) => f.cliente_nombre ?? ""),
    c("Vendedor", (f) => f.vendedor_nombre ?? ""),
    c("Fecha", (f) => formatearFecha(f.fecha_venta)),
    c("Estado", (f) => ETIQUETAS_ESTADO_VENTA[f.estado] ?? f.estado),
    c("Contrato", (f) => ETIQUETAS_ESTADO_CONTRATO[f.estado_contrato] ?? f.estado_contrato),
    c("Precio pactado", (f) => montoCSV(f.precio_pactado)),
    c("Recibido", (f) => montoCSV(f.total_recibido)),
    c("Saldo a favor", (f) => montoCSV(f.saldo_a_favor)),
    c("Balance pendiente", (f) => montoCSV(f.balance_pendiente)),
    c("Vencido sin pagar", (f) => montoCSV(f.vencido_pendiente)),
  ];
  return cols as unknown as ColumnaCSV<Record<string, unknown>>[];
}

function colsCuotasVencidas(): ColumnaCSV<Record<string, unknown>>[] {
  const cols: ColumnaCSV<FilaCuotaVencida>[] = [
    c("Solar", (f) => etiquetaSolar(f.manzana_codigo, f.solar_numero)),
    c("Cliente", (f) => f.cliente_nombre ?? ""),
    c("Vendedor", (f) => f.vendedor_nombre ?? ""),
    c("Cuota", (f) => `${ETIQUETAS_TIPO_CUOTA[f.tipo] ?? f.tipo} #${f.numero}`),
    c("Vencía", (f) => formatearFecha(f.fecha_vencimiento)),
    c("Días de atraso", (f) => f.dias_vencida),
    c("Monto esperado", (f) => montoCSV(f.monto_esperado)),
    c("Aplicado", (f) => montoCSV(f.monto_aplicado)),
    c("Saldo", (f) => montoCSV(f.saldo)),
  ];
  return cols as unknown as ColumnaCSV<Record<string, unknown>>[];
}

function colsRecaudo(): ColumnaCSV<Record<string, unknown>>[] {
  const cols: ColumnaCSV<FilaRecaudoMes>[] = [
    c("Mes", (f) => etiquetaMes(f.mes)),
    c("Recaudo neto", (f) => montoCSV(f.recaudo_neto)),
    c("Pagos", (f) => f.pagos),
    c("Reversos", (f) => f.reversos),
  ];
  return cols as unknown as ColumnaCSV<Record<string, unknown>>[];
}

export async function GET(peticion: Request) {
  const perfil = await obtenerPerfil();
  if (!perfil) {
    return new Response("Inicie sesión para exportar el reporte.", {
      status: 401,
    });
  }

  const tipo = new URL(peticion.url).searchParams.get("tipo") ?? "";
  const cfg = config(tipo);
  if (!cfg) {
    return new Response("Reporte desconocido.", { status: 400 });
  }

  const supabase = await crearClienteServidor();
  let consulta = supabase.from(cfg.vista).select("*");
  if (cfg.orden) {
    consulta = consulta.order(cfg.orden.columna, { ascending: cfg.orden.asc });
  }
  const { data, error } = await consulta;
  if (error) {
    return new Response(`No se pudo generar el reporte: ${error.message}`, {
      status: 500,
    });
  }

  let filas = (data ?? []) as Record<string, unknown>[];
  // "cartera" es "ventas" filtrado a las activas con balance pendiente.
  if (tipo === "cartera") {
    filas = filas.filter(
      (f) =>
        f.estado !== "cancelada" && Number(f.balance_pendiente ?? 0) > 0,
    );
  }

  const csv = armarCSV(filas, cfg.columnas);
  const hoy = new Date().toISOString().slice(0, 10);
  const nombre = `reporte-${tipo}-${hoy}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
