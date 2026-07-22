import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { Decimal, formatearMoneda, monto } from "@/lib/moneda";
import { formatearCedula } from "@/lib/personas";
import { formatearFecha } from "@/lib/ventas";
import {
  ETIQUETAS_METODO_PAGO,
  formatearNumeroRecibo,
  type MetodoPago,
  type TipoRecibo,
} from "@/lib/pagos";

/**
 * PDF del recibo. Se genera a partir de lo que ya está guardado —el recibo es
 * inmutable— así que dos generaciones del mismo recibo dan el mismo documento.
 * El archivo se sube a Supabase Storage la primera vez que alguien lo descarga,
 * en la ruta que el propio recibo trae escrita (`recibos.ruta_pdf`).
 *
 * Hoy es un documento de control interno: la estructura para comprobantes
 * fiscales (NCF) está preparada y desactivada, y por eso el pie lo dice.
 */

export type DatosRecibo = {
  numero: number;
  tipo: TipoRecibo;
  emitido_en: string;
  monto: string;
  concepto: string;
  numero_recibo_original: number | null;
  ncf: string | null;
  cliente: { nombre_completo: string; cedula: string | null };
  solar: { manzana: string; numero: string };
  pago: {
    fecha_pago: string;
    metodo: MetodoPago;
    referencia: string | null;
  } | null;
  venta: {
    precio_pactado: string;
    total_aplicado: string;
  };
  aplicaciones: {
    concepto: string;
    vence: string;
    monto: string;
  }[];
  emitido_por: string | null;
};

// ---------------------------------------------------------------------------
// Monto en letras
// ---------------------------------------------------------------------------

const UNIDADES = [
  "", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho",
  "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis",
  "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós",
  "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete",
  "veintiocho", "veintinueve",
];

const DECENAS = [
  "", "diez", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta",
  "setenta", "ochenta", "noventa",
];

const CENTENAS = [
  "", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos",
  "seiscientos", "setecientos", "ochocientos", "novecientos",
];

function hasta99(n: number): string {
  if (n < 30) return UNIDADES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  return u === 0 ? DECENAS[d] : `${DECENAS[d]} y ${UNIDADES[u]}`;
}

function hasta999(n: number): string {
  if (n === 100) return "cien";
  const c = Math.floor(n / 100);
  const r = n % 100;
  if (c === 0) return hasta99(r);
  return r === 0 ? CENTENAS[c] : `${CENTENAS[c]} ${hasta99(r)}`;
}

/** "uno" y "veintiuno" se apocopan delante de "mil" y "millones". */
const apocopar = (texto: string) =>
  texto.replace(/veintiuno$/, "veintiún").replace(/(^|\s)uno$/, "$1un");

function enteroEnLetras(n: number): string {
  if (n === 0) return "cero";

  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];

  if (millones > 0) {
    partes.push(
      millones === 1 ? "un millón" : `${apocopar(hasta999(millones))} millones`,
    );
  }
  if (miles > 0) {
    partes.push(miles === 1 ? "mil" : `${apocopar(hasta999(miles))} mil`);
  }
  if (resto > 0) partes.push(hasta999(resto));

  return partes.join(" ");
}

/**
 * "1,500.50" → "MIL QUINIENTOS PESOS DOMINICANOS CON 50/100".
 * Los centavos van en números, que es como se escriben en un recibo.
 */
export function montoEnLetras(valor: string | Decimal): string {
  const d = monto(valor).abs().toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const entero = d.floor().toNumber();
  const centavos = d.minus(d.floor()).times(100).round().toNumber();

  const letras = apocopar(enteroEnLetras(entero));
  const moneda = entero === 1 ? "peso dominicano" : "pesos dominicanos";
  // "un millón DE pesos", pero "un millón quinientos mil pesos".
  const de = entero >= 1_000_000 && entero % 1_000_000 === 0 ? " de" : "";

  return `${letras}${de} ${moneda} con ${String(centavos).padStart(2, "0")}/100`.toUpperCase();
}

// ---------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------

const ANCHO = 612; // carta, en puntos
const ALTO = 792;
const MARGEN = 56;
const TINTA = rgb(0.09, 0.09, 0.11);
const SUAVE = rgb(0.42, 0.42, 0.47);
const LINEA = rgb(0.8, 0.8, 0.84);

export async function generarPdfRecibo(datos: DatosRecibo): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${formatearNumeroRecibo(datos.numero)} — Carlitos Inmobiliaria`);
  pdf.setCreator("ERP Solares · Carlitos Inmobiliaria");

  const pagina = pdf.addPage([ANCHO, ALTO]);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = ALTO - MARGEN;

  const texto = (
    contenido: string,
    opciones: {
      x?: number;
      tamano?: number;
      fuente?: PDFFont;
      color?: ReturnType<typeof rgb>;
      derecha?: boolean;
    } = {},
  ) => {
    const {
      x = MARGEN,
      tamano = 10,
      fuente = normal,
      color = TINTA,
      derecha = false,
    } = opciones;
    const ancho = fuente.widthOfTextAtSize(contenido, tamano);
    pagina.drawText(contenido, {
      x: derecha ? ANCHO - MARGEN - ancho : x,
      y,
      size: tamano,
      font: fuente,
      color,
    });
  };

  const regla = () => {
    pagina.drawLine({
      start: { x: MARGEN, y },
      end: { x: ANCHO - MARGEN, y },
      thickness: 0.75,
      color: LINEA,
    });
  };

  // --- Encabezado -----------------------------------------------------------
  texto("CARLITOS INMOBILIARIA", { tamano: 16, fuente: negrita });
  texto(
    datos.tipo === "nota_credito" ? "NOTA DE CRÉDITO" : "RECIBO DE PAGO",
    { tamano: 12, fuente: negrita, derecha: true },
  );

  y -= 16;
  texto("Proyecto OASIS DE MACHIN · Venta de solares", {
    tamano: 9,
    color: SUAVE,
  });
  texto(formatearNumeroRecibo(datos.numero), {
    tamano: 12,
    fuente: negrita,
    derecha: true,
  });

  y -= 14;
  texto(`Emitido el ${formatearFecha(datos.emitido_en.slice(0, 10))}`, {
    tamano: 9,
    color: SUAVE,
    derecha: true,
  });

  y -= 18;
  regla();

  // --- Recibimos de ---------------------------------------------------------
  y -= 26;
  texto("RECIBIMOS DE", { tamano: 8, fuente: negrita, color: SUAVE });
  y -= 15;
  texto(datos.cliente.nombre_completo, { tamano: 13, fuente: negrita });
  y -= 14;
  texto(
    datos.cliente.cedula
      ? `Cédula ${formatearCedula(datos.cliente.cedula)}`
      : "Cédula pendiente",
    { tamano: 9, color: SUAVE },
  );

  y -= 26;
  texto("LA SUMA DE", { tamano: 8, fuente: negrita, color: SUAVE });
  y -= 18;
  texto(formatearMoneda(datos.monto), { tamano: 20, fuente: negrita });
  y -= 16;
  texto(montoEnLetras(datos.monto), { tamano: 9, color: SUAVE });

  // --- Detalle --------------------------------------------------------------
  y -= 26;
  regla();
  y -= 20;

  /** Recorta lo que no cabe: el detalle completo está en la pantalla. */
  const recortar = (contenido: string, ancho: number, tamano: number) => {
    if (normal.widthOfTextAtSize(contenido, tamano) <= ancho) return contenido;
    let corto = contenido;
    while (
      corto.length > 1 &&
      normal.widthOfTextAtSize(`${corto}…`, tamano) > ancho
    ) {
      corto = corto.slice(0, -1);
    }
    return `${corto}…`;
  };

  const X_VALOR = MARGEN + 150;
  const ANCHO_VALOR = ANCHO - MARGEN - X_VALOR;

  const fila = (etiqueta: string, valor: string) => {
    texto(etiqueta, { tamano: 8, fuente: negrita, color: SUAVE });
    texto(recortar(valor, ANCHO_VALOR, 10), { tamano: 10, x: X_VALOR });
    y -= 16;
  };

  fila("Solar", `Manzana ${datos.solar.manzana} · Solar ${datos.solar.numero}`);
  fila("Concepto", datos.concepto);
  if (datos.pago) {
    fila("Fecha del pago", formatearFecha(datos.pago.fecha_pago));
    fila(
      "Método",
      datos.pago.referencia
        ? `${ETIQUETAS_METODO_PAGO[datos.pago.metodo]} · ref. ${datos.pago.referencia}`
        : ETIQUETAS_METODO_PAGO[datos.pago.metodo],
    );
  }
  if (datos.numero_recibo_original !== null) {
    fila(
      "Anula el recibo",
      formatearNumeroRecibo(datos.numero_recibo_original),
    );
  }
  if (datos.ncf) fila("NCF", datos.ncf);

  // --- Aplicación a las cuotas ---------------------------------------------
  if (datos.aplicaciones.length > 0) {
    y -= 10;
    texto("APLICADO A", { tamano: 8, fuente: negrita, color: SUAVE });
    y -= 6;
    regla();
    y -= 15;

    // Se listan hasta 12 para que el recibo no se desborde de la página; el
    // detalle completo está siempre en la pantalla del pago.
    const visibles = datos.aplicaciones.slice(0, 12);
    for (const ap of visibles) {
      texto(ap.concepto, { tamano: 9 });
      texto(`vence ${formatearFecha(ap.vence)}`, {
        tamano: 9,
        x: MARGEN + 200,
        color: SUAVE,
      });
      texto(formatearMoneda(ap.monto), { tamano: 9, derecha: true });
      y -= 14;
    }
    if (datos.aplicaciones.length > visibles.length) {
      texto(
        `y ${datos.aplicaciones.length - visibles.length} cuota(s) más`,
        { tamano: 9, color: SUAVE },
      );
      y -= 14;
    }
    y -= 2;
    regla();
  }

  // --- Estado de la venta ---------------------------------------------------
  y -= 24;
  const balance = monto(datos.venta.precio_pactado).minus(
    monto(datos.venta.total_aplicado),
  );
  texto("Precio pactado", { tamano: 9, color: SUAVE });
  texto(formatearMoneda(datos.venta.precio_pactado), { tamano: 9, derecha: true });
  y -= 14;
  texto("Total abonado a la fecha", { tamano: 9, color: SUAVE });
  texto(formatearMoneda(datos.venta.total_aplicado), { tamano: 9, derecha: true });
  y -= 14;
  texto("Balance pendiente", { tamano: 10, fuente: negrita });
  texto(formatearMoneda(balance), { tamano: 10, fuente: negrita, derecha: true });

  // --- Firmas y pie ---------------------------------------------------------
  y = MARGEN + 90;
  pagina.drawLine({
    start: { x: MARGEN, y },
    end: { x: MARGEN + 190, y },
    thickness: 0.75,
    color: LINEA,
  });
  pagina.drawLine({
    start: { x: ANCHO - MARGEN - 190, y },
    end: { x: ANCHO - MARGEN, y },
    thickness: 0.75,
    color: LINEA,
  });
  y -= 12;
  texto("Recibido por (Carlitos Inmobiliaria)", { tamano: 8, color: SUAVE });
  texto("Cliente", { tamano: 8, color: SUAVE, derecha: true });

  y = MARGEN + 34;
  texto(
    datos.emitido_por
      ? `Emitido por ${datos.emitido_por} · documento de control interno`
      : "Documento de control interno",
    { tamano: 8, color: SUAVE },
  );
  y -= 11;
  texto(
    "No es un comprobante fiscal (NCF). Este recibo es inmutable: se corrige con una nota de crédito.",
    { tamano: 8, color: SUAVE },
  );

  return pdf.save();
}
