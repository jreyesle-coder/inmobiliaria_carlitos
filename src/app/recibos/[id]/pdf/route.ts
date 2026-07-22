import { obtenerPerfil } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatearNumeroRecibo, type MetodoPago, type TipoRecibo } from "@/lib/pagos";
import { ETIQUETAS_TIPO_CUOTA, type TipoCuota } from "@/lib/ventas";
import { generarPdfRecibo, type DatosRecibo } from "@/lib/recibo-pdf";

/**
 * PDF del recibo.
 *
 * Se genera la primera vez que alguien lo pide y se guarda en el bucket privado
 * `recibos`, en la ruta que el propio recibo trae escrita (`ruta_pdf`): el
 * recibo es inmutable, así que esa ruta se fijó al emitirlo y no cambia.
 *
 * Quién puede verlo lo decide RLS: la consulta de abajo no devuelve nada si el
 * usuario no puede ver esa venta, y la política del bucket dice lo mismo.
 *
 * Si el archivo aún no está subido y quien lo pide es un vendedor (no tiene
 * permiso de subida), el PDF se devuelve igual sin guardarlo: el documento sale
 * del dato guardado, no del archivo.
 */

const BUCKET = "recibos";

export async function GET(
  _peticion: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const perfil = await obtenerPerfil();
  if (!perfil) {
    return new Response("Inicie sesión para ver el recibo.", { status: 401 });
  }

  const supabase = await crearClienteServidor();

  const { data } = await supabase
    .from("recibos")
    .select(
      "id, numero, tipo, monto, concepto, emitido_en, ncf, ruta_pdf, " +
        "recibo_original_id, pago_id, venta_id, " +
        "cliente:clientes(nombre_completo, cedula), " +
        "venta:ventas(precio_pactado, solar:solares(numero, manzana:manzanas(codigo))), " +
        "pago:pagos(fecha_pago, metodo, referencia), " +
        "emisor:perfiles!recibos_emitido_por_perfiles_id_fk(nombre_completo, correo)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) {
    return new Response("Recibo no encontrado.", { status: 404 });
  }

  const recibo = data as unknown as {
    id: string;
    numero: number;
    tipo: TipoRecibo;
    monto: string;
    concepto: string;
    emitido_en: string;
    ncf: string | null;
    ruta_pdf: string | null;
    recibo_original_id: string | null;
    pago_id: string | null;
    venta_id: string;
    cliente: { nombre_completo: string; cedula: string | null } | null;
    venta: {
      precio_pactado: string;
      solar: { numero: string; manzana: { codigo: string } | null } | null;
    } | null;
    pago: {
      fecha_pago: string;
      metodo: MetodoPago;
      referencia: string | null;
    } | null;
    emisor: { nombre_completo: string; correo: string } | null;
  };

  const nombreArchivo = `${formatearNumeroRecibo(recibo.numero)}.pdf`;
  const ruta = recibo.ruta_pdf ?? `recibo-${recibo.id}.pdf`;

  // 1. ¿Ya está guardado? Entonces se sirve tal cual se emitió.
  const { data: guardado } = await supabase.storage.from(BUCKET).download(ruta);
  if (guardado) {
    return respuestaPdf(await guardado.arrayBuffer(), nombreArchivo);
  }

  // 2. No está: se arma con lo que hay en la base.
  const { data: aplicacionesData } = recibo.pago_id
    ? await supabase
        .from("pago_aplicaciones")
        .select("monto, cuota:cuotas(tipo, numero, fecha_vencimiento)")
        .eq("pago_id", recibo.pago_id)
    : { data: [] };

  const aplicaciones = (
    (aplicacionesData ?? []) as unknown as {
      monto: string;
      cuota: {
        tipo: TipoCuota;
        numero: number;
        fecha_vencimiento: string;
      } | null;
    }[]
  )
    .filter((a) => a.cuota !== null)
    .map((a) => ({
      concepto: `${ETIQUETAS_TIPO_CUOTA[a.cuota!.tipo]} ${a.cuota!.numero}`,
      vence: a.cuota!.fecha_vencimiento,
      monto: a.monto,
    }))
    .sort((a, b) => (a.vence < b.vence ? -1 : a.vence > b.vence ? 1 : 0));

  const { data: resumen } = await supabase
    .from("ventas_resumen_cobros")
    .select("total_aplicado")
    .eq("venta_id", recibo.venta_id)
    .maybeSingle();

  let numeroOriginal: number | null = null;
  if (recibo.recibo_original_id) {
    const { data: original } = await supabase
      .from("recibos")
      .select("numero")
      .eq("id", recibo.recibo_original_id)
      .maybeSingle();
    numeroOriginal = (original?.numero as number | undefined) ?? null;
  }

  const datos: DatosRecibo = {
    numero: recibo.numero,
    tipo: recibo.tipo,
    emitido_en: recibo.emitido_en,
    monto: recibo.monto,
    concepto: recibo.concepto,
    numero_recibo_original: numeroOriginal,
    ncf: recibo.ncf,
    cliente: {
      nombre_completo: recibo.cliente?.nombre_completo ?? "—",
      cedula: recibo.cliente?.cedula ?? null,
    },
    solar: {
      manzana: recibo.venta?.solar?.manzana?.codigo ?? "—",
      numero: recibo.venta?.solar?.numero ?? "—",
    },
    pago: recibo.pago,
    venta: {
      precio_pactado: recibo.venta?.precio_pactado ?? "0",
      total_aplicado: (resumen?.total_aplicado as string | undefined) ?? "0",
    },
    aplicaciones,
    // Los perfiles ajenos solo los lee gerencia: si no viene, no se imprime.
    emitido_por:
      recibo.emisor?.nombre_completo || recibo.emisor?.correo || null,
  };

  const pdf = await generarPdfRecibo(datos);

  // 3. Se guarda para que la próxima vez salga del archivo. Si no hay permiso
  //    de subida (un vendedor consultando el suyo), se sirve sin guardar.
  await supabase.storage
    .from(BUCKET)
    .upload(ruta, pdf, { contentType: "application/pdf", upsert: false });

  return respuestaPdf(pdf, nombreArchivo);
}

function respuestaPdf(contenido: ArrayBuffer | Uint8Array, nombre: string) {
  const cuerpo =
    contenido instanceof Uint8Array
      ? contenido.slice().buffer
      : contenido;
  return new Response(new Blob([cuerpo], { type: "application/pdf" }), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${nombre}"`,
      "cache-control": "private, max-age=0, must-revalidate",
    },
  });
}
