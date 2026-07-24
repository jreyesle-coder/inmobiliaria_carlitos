import { createHash } from "node:crypto";
import { config } from "dotenv";
import XLSX from "xlsx";
import postgres from "postgres";

/**
 * Sprint 7 · Migración del Excel de OASIS DE MACHIN.
 *
 *   node scripts/importar-excel.mjs "<ruta.xlsx>"            (ensayo: rollback)
 *   node scripts/importar-excel.mjs "<ruta.xlsx>" --commit   (aplica de verdad)
 *
 * Qué hace, y qué NO:
 *   - Carga los 84 solares, los clientes (cédula pendiente), los vendedores y
 *     una venta por cada solar vendido, en estado `separado` y SIN plan de
 *     cuotas: los plazos reales no están en el Excel y no se inventan.
 *   - NO carga pagos. El dinero histórico no cuadra entre las hojas y los pagos
 *     sueltos no se pueden amarrar a un solar: todo eso va a
 *     `migracion_novedades` para que Julio lo reconcilie y registre los pagos
 *     reales por el sistema (que es lo que hace el Sprint 5).
 *   - NO decide qué cifra es correcta: cada discrepancia queda listada.
 *
 * Es idempotente: los ids se derivan de claves estables (uuid v5), así que
 * re-ejecutarlo no duplica nada.
 *
 * Corre por la conexión directa (`DATABASE_URL`), que es dueña de las tablas y
 * se salta RLS. `auth.uid()` es null: las funciones lo tratan como sesión de
 * mantenimiento.
 */

config({ path: ".env.local", quiet: true });

const ruta = process.argv[2];
const commit = process.argv.includes("--commit");
if (!ruta) {
  console.error('Uso: node scripts/importar-excel.mjs "<ruta.xlsx>" [--commit]');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en .env.local.");
  process.exit(1);
}

// --- utilidades -------------------------------------------------------------

/** uuid v5 determinista: misma clave → mismo id, para que re-importar no duplique. */
const NS = Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex");
function uuid5(clave) {
  const h = createHash("sha1");
  h.update(NS);
  h.update(Buffer.from(clave, "utf8"));
  const b = h.digest().subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = b.toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

const txt = (v) => (v === null || v === undefined ? null : String(v).trim() || null);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const money = (v) => (isNum(v) ? Math.round(v * 100) / 100 : null);
const canon = (s) => (s ? s.toUpperCase().replace(/\s+/g, " ").trim() : "");

/** Estado suelto del Excel → etiqueta del pipeline (solo para la novedad). */
function estadoPipeline(crudo) {
  const e = canon(crudo);
  if (!e) return "libre";
  if (e === "AREA COMERCIAL") return "area_comercial";
  if (e === "LIBRE") return "libre";
  if (e.includes("CAPITAL") || e === "ABO/CAP") return "capital";
  if (e.includes("INICIAL")) return "inicial";
  if (e.startsWith("SEPARA")) return "separado";
  if (e === "COMPLETADP" || e === "COMPLETADO") return "saldado";
  return "separado";
}

// --- lectura del Excel ------------------------------------------------------

const wb = XLSX.readFile(ruta);
const filas = (hoja) =>
  XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, blankrows: false, defval: null });

// CONTROL DE SOLARES (fuente principal). Col A=0: B=SOLAR, C=MANZANA, ...
function leerPrincipal() {
  const out = new Map();
  for (const r of filas("CONTROL DE SOLARES")) {
    const solar = r[1];
    const manz = txt(r[2]);
    if (!isNum(solar) || !["B", "C", "D", "E"].includes(manz)) continue;
    out.set(solar, {
      solar,
      manzana: manz,
      area: money(r[3]),
      estado: txt(r[4]),
      valor_m2: money(r[5]),
      comprador: txt(r[6]),
      total: money(r[7]),
      abonado: money(r[10]),
      balance: money(r[11]),
    });
  }
  return out;
}

function leerHoja1() {
  const out = new Map();
  for (const r of filas("Hoja1")) {
    const solar = r[1];
    const manz = txt(r[2]);
    if (!isNum(solar) || !["B", "C", "D", "E"].includes(manz)) continue;
    out.set(solar, { estado: txt(r[4]), comprador: txt(r[6]), total: money(r[7]), abonado: money(r[10]) });
  }
  return out;
}

function leerVend() {
  const out = new Map();
  for (const r of filas("CONTROL VEND COM.")) {
    const solar = r[1];
    const manz = txt(r[2]);
    if (!isNum(solar) || !["B", "C", "D", "E"].includes(manz)) continue;
    out.set(solar, {
      estado: txt(r[4]),
      comprador: txt(r[6]),
      total: money(r[7]),
      vendedor: txt(r[8]),
      abonado: money(r[11]),
      contrato: txt(r[13]),
      comision: txt(r[14]),
    });
  }
  return out;
}

// FORMA DE PAGOS: efectivo (A:C) y transferencia (D:F). Solo referencia histórica.
function leerPagos() {
  const out = [];
  const f = filas("FORMA DE PAGOS");
  for (const r of f) {
    const ef = txt(r[0]);
    if (ef && ef !== "NOMBRE" && ef !== "EFECTIVO" && ef !== "FORMAS DE PAGOS") {
      out.push({ metodo: "efectivo", nombre: ef, recibo: txt(r[1]), monto: money(r[2]) });
    }
    const tr = txt(r[3]);
    if (tr && tr !== "NOMBRE" && tr !== "TRANSFERENCIAS") {
      out.push({ metodo: "transferencia", nombre: tr, recibo: txt(r[4]), monto: money(r[5]) });
    }
  }
  return out;
}

const principal = leerPrincipal();
const hoja1 = leerHoja1();
const vend = leerVend();
const pagos = leerPagos();

// --- vendedor canónico ------------------------------------------------------
// «YUNEYSI» y «YUNEYSI MATEO» son la misma persona.
function vendedorCanonico(nombre) {
  const c = canon(nombre);
  if (!c) return null;
  if (c === "YUNEYSI") return "YUNEYSI MATEO";
  return c;
}

// --- armado -----------------------------------------------------------------

const solares = [];
const clientesPorNombre = new Map();
const vendedoresPorNombre = new Map();
const ventas = [];
const novedades = [];

const nov = (solar, manzana, campo, valores, motivo) =>
  novedades.push({ solar, manzana, campo, valores, motivo });

for (const [n, p] of [...principal].sort((a, b) => a[0] - b[0])) {
  const h = hoja1.get(n);
  const v = vend.get(n);
  const pipeline = estadoPipeline(p.estado);
  const esComercial = pipeline === "area_comercial";

  // ---- solar (inventario) ----
  // valor_total se guarda tal cual el Excel; para libres sin precio va 0.
  const valorTotal = p.total ?? (p.valor_m2 && p.area ? Math.round(p.valor_m2 * p.area * 100) / 100 : 0);
  solares.push({
    numero: String(n),
    manzana: p.manzana,
    area: p.area && p.area > 0 ? p.area : 0.01, // el área debe ser > 0
    valor_m2: p.valor_m2 ?? 0,
    valor_total: valorTotal,
    estado: esComercial ? "area_comercial" : "libre", // el estado real lo pone la venta
  });
  if (!p.area || p.area <= 0) {
    nov(n, p.manzana, "area", { control: p.area }, "El solar no trae área en el Excel; se cargó 0.01 para poder registrarlo.");
  }

  const comprador = p.comprador;
  if (esComercial || !comprador) {
    // Sin comprador en la hoja principal, pero otra hoja dice que está vendido.
    if (!esComercial && (h?.comprador || v?.comprador)) {
      nov(n, p.manzana, "comprador",
        { control: p.comprador, hoja1: h?.comprador, vend: v?.comprador },
        "La hoja principal no trae comprador pero otra hoja sí: no se creó la venta. Revisar.");
    }
    continue;
  }

  if (!valorTotal || valorTotal <= 0) {
    nov(n, p.manzana, "total_valor", { control: p.total }, "Solar con comprador pero sin precio en la hoja principal: no se creó la venta.");
    continue;
  }

  // ---- cliente (cédula pendiente) ----
  const claveCli = canon(comprador);
  if (!clientesPorNombre.has(claveCli)) {
    clientesPorNombre.set(claveCli, { id: uuid5(`cliente:${claveCli}`), nombre: comprador });
  }
  const cliente = clientesPorNombre.get(claveCli);
  if (comprador.includes("/") || / Y /.test(` ${comprador} `)) {
    nov(n, p.manzana, "comprador", { control: comprador }, "Compra a dos nombres: se cargó como un solo cliente; separar si aplica.");
  }
  if (comprador.includes("�")) {
    nov(n, p.manzana, "comprador", { control: comprador }, "El nombre trae un carácter dañado (probable Ñ): revisar la ortografía.");
  }

  // ---- vendedor ----
  let vendedorId = null;
  const vc = vendedorCanonico(v?.vendedor);
  if (vc) {
    if (!vendedoresPorNombre.has(vc)) {
      vendedoresPorNombre.set(vc, { id: uuid5(`vendedor:${vc}`), nombre: vc });
    }
    vendedorId = vendedoresPorNombre.get(vc).id;
  }

  // ---- venta (separado, sin plan) ----
  const contratoListo = canon(v?.contrato) === "LISTO";
  ventas.push({
    id: uuid5(`venta:${n}`),
    numero: n,
    manzana: p.manzana,
    cliente_id: cliente.id,
    vendedor_id: vendedorId,
    precio_pactado: valorTotal,
    estado_contrato: contratoListo ? "listo" : "pendiente",
    estado_excel: pipeline,
  });

  // ---- novedades de dinero y clasificación ----
  if (pipeline !== "separado") {
    nov(n, p.manzana, "estado", { control: p.estado, hoja1: h?.estado, vend: v?.estado },
      `El Excel clasifica esta venta como «${pipeline}»; en el sistema entra como «separado» hasta cargar los pagos reales, que la harán avanzar.`);
  }

  const totales = [p.total, h?.total, v?.total].filter((x) => x !== null && x !== undefined);
  if (new Set(totales).size > 1) {
    nov(n, p.manzana, "total_valor", { control: p.total, hoja1: h?.total, vend: v?.total },
      "El precio total no cuadra entre las hojas: se cargó el de la hoja principal.");
  }

  const abonados = [p.abonado, h?.abonado, v?.abonado].filter((x) => x !== null && x !== undefined);
  if (abonados.length > 0) {
    const distintos = new Set(abonados).size > 1;
    nov(n, p.manzana, "abonado", { control: p.abonado, hoja1: h?.abonado, vend: v?.abonado },
      distintos
        ? "Lo abonado no cuadra entre las hojas. No se cargó ningún pago: registrar los pagos reales por el sistema."
        : "El Excel registra un abono; no se cargó como pago. Registrar el pago real por el sistema para que el balance y el estado avancen.");
  }

  if (v?.comision) {
    nov(n, p.manzana, "comision", { vend: v.comision },
      `El Excel marca la comisión como «${v.comision}»; el módulo de comisiones es el Sprint 6 y aún no tiene regla confirmada.`);
  }
}

// Pagos sueltos: no se pueden amarrar a un solar (solo nombre, mal escrito, sin #).
for (const pg of pagos) {
  nov(null, null, "pago_suelto",
    { nombre: pg.nombre, metodo: pg.metodo, recibo: pg.recibo, monto: pg.monto },
    "Pago del Excel sin número de solar: no se pudo amarrar a una venta. Registrar el pago real sobre la venta que corresponda.");
}

// --- resumen ----------------------------------------------------------------
console.log("Leído del Excel:");
console.log(`  solares:      ${solares.length}`);
console.log(`  clientes:     ${clientesPorNombre.size}`);
console.log(`  vendedores:   ${vendedoresPorNombre.size}  (${[...vendedoresPorNombre.keys()].join(", ")})`);
console.log(`  ventas:       ${ventas.length}`);
console.log(`  novedades:    ${novedades.length}`);
const porCampo = {};
for (const x of novedades) porCampo[x.campo] = (porCampo[x.campo] ?? 0) + 1;
console.log("  novedades por tipo:", porCampo);

// --- carga ------------------------------------------------------------------

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

try {
  await sql.begin(async (t) => {
    const [proy] = await t`select id from public.proyectos where nombre = 'OASIS DE MACHIN'`;
    if (!proy) throw new Error("No existe el proyecto OASIS DE MACHIN. Corra 03_inventario.sql.");
    const manz = await t`select id, codigo from public.manzanas where proyecto_id = ${proy.id}`;
    const manzId = Object.fromEntries(manz.map((m) => [m.codigo, m.id]));
    for (const c of ["B", "C", "D", "E"]) {
      if (!manzId[c]) throw new Error(`Falta la manzana ${c} en el proyecto.`);
    }

    // Solares: idempotente por (manzana, numero).
    for (const s of solares) {
      await t`
        insert into public.solares (manzana_id, numero, area_m2, valor_m2, valor_total, estado)
        values (${manzId[s.manzana]}, ${s.numero}, ${s.area}, ${s.valor_m2}, ${s.valor_total}, ${s.estado})
        on conflict (manzana_id, numero) do update
          set area_m2 = excluded.area_m2, valor_m2 = excluded.valor_m2,
              valor_total = excluded.valor_total`;
    }

    // Clientes (cédula pendiente): id determinista.
    for (const c of clientesPorNombre.values()) {
      await t`
        insert into public.clientes (id, nombre_completo, notas)
        values (${c.id}, ${c.nombre}, 'Migrado del Excel OASIS DE MACHIN')
        on conflict (id) do update set nombre_completo = excluded.nombre_completo`;
    }

    // Vendedores (sin usuario vinculado): id determinista.
    for (const v of vendedoresPorNombre.values()) {
      await t`
        insert into public.vendedores (id, nombre_completo)
        values (${v.id}, ${v.nombre})
        on conflict (id) do update set nombre_completo = excluded.nombre_completo`;
    }

    // Ventas: entran como 'separado' sobre el solar libre. Sin plan de cuotas.
    for (const v of ventas) {
      const solarId = (
        await t`select id from public.solares where manzana_id = ${manzId[v.manzana]} and numero = ${String(v.numero)}`
      )[0].id;
      await t`
        insert into public.ventas
          (id, solar_id, cliente_id, vendedor_id, fecha_venta, precio_pactado, estado_contrato)
        values (${v.id}, ${solarId}, ${v.cliente_id}, ${v.vendedor_id}, current_date,
                ${v.precio_pactado}, ${v.estado_contrato})
        on conflict (id) do nothing`;
    }

    // Novedades: se rehace el lote de este origen.
    await t`delete from public.migracion_novedades where origen = 'excel-oasis'`;
    for (const x of novedades) {
      await t`
        insert into public.migracion_novedades (origen, solar_numero, manzana, campo, valores, motivo)
        values ('excel-oasis', ${x.solar}, ${x.manzana}, ${x.campo}, ${JSON.stringify(x.valores)}, ${x.motivo})`;
    }

    // Conteos dentro de la transacción, para verificar antes de decidir.
    const cuenta = async (q) => Number((await q)[0].n);
    console.log("\nEn la base (dentro de la transacción):");
    console.log("  solares:   ", await cuenta(t`select count(*) n from public.solares`));
    console.log("  clientes:  ", await cuenta(t`select count(*) n from public.clientes`));
    console.log("  vendedores:", await cuenta(t`select count(*) n from public.vendedores`));
    console.log("  ventas:    ", await cuenta(t`select count(*) n from public.ventas`));
    console.log("  novedades: ", await cuenta(t`select count(*) n from public.migracion_novedades`));
    const porEstado = await t`select estado, count(*) n from public.solares group by estado order by estado`;
    console.log("  solares por estado:", Object.fromEntries(porEstado.map((r) => [r.estado, Number(r.n)])));

    if (!commit) {
      throw new Error("__ENSAYO__");
    }
  });
  console.log(commit ? "\n✅ Migración aplicada." : "");
} catch (e) {
  if (e.message === "__ENSAYO__") {
    console.log("\n🟡 Ensayo (rollback): no se guardó nada. Vuelva a correr con --commit para aplicar.");
  } else {
    console.error(`\nERROR: ${e.message}`);
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}

// --- reporte de novedades para Julio ---------------------------------------
if (commit) {
  const wbOut = XLSX.utils.book_new();
  const filasRep = novedades.map((x) => ({
    Solar: x.solar ?? "",
    Manzana: x.manzana ?? "",
    Campo: x.campo,
    "CONTROL DE SOLARES": x.valores?.control ?? "",
    Hoja1: x.valores?.hoja1 ?? "",
    "VEND COM.": x.valores?.vend ?? "",
    Nombre: x.valores?.nombre ?? "",
    Recibo: x.valores?.recibo ?? "",
    Monto: x.valores?.monto ?? "",
    Motivo: x.motivo,
  }));
  const ws = XLSX.utils.json_to_sheet(filasRep);
  ws["!cols"] = [
    { wch: 6 }, { wch: 8 }, { wch: 14 }, { wch: 20 }, { wch: 14 },
    { wch: 14 }, { wch: 26 }, { wch: 10 }, { wch: 12 }, { wch: 70 },
  ];
  XLSX.utils.book_append_sheet(wbOut, ws, "Novedades");
  const salida = "novedades-a-aclarar.xlsx";
  XLSX.writeFile(wbOut, salida);
  console.log(`📄 Reporte de novedades escrito en ${salida}`);
}
