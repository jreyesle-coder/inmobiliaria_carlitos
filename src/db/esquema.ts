import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Esquema de la base de datos. Tablas y columnas en español, snake_case.
 *
 * Reglas que no se negocian (ver CLAUDE.md):
 *  - Todo monto va en `numeric(14,2)`. Nunca `float` ni `real`.
 *  - La cuota (lo esperado) y el pago (lo recibido) son entidades distintas y
 *    se enlazan por `pago_aplicaciones`.
 *  - Los recibos son inmutables: no hay rutas de UPDATE ni DELETE sobre ellos.
 *  - Interés, mora y NCF quedan como estructura preparada pero desactivada.
 *
 * Las políticas RLS y los triggers de auditoría viven en `supabase/sql/`,
 * porque Drizzle no los modela.
 */

/** Helper: columna de dinero. Un solo lugar para no equivocarse. */
const dinero = (nombre: string) => numeric(nombre, { precision: 14, scale: 2 });

/** Helper: porcentaje con 4 decimales (0.0500 = 5%). */
const porcentaje = (nombre: string) =>
  numeric(nombre, { precision: 7, scale: 4 });

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const rolUsuario = pgEnum("rol_usuario", [
  "vendedor",
  "administracion",
  "gerencia",
]);

/**
 * Pipeline único del solar: Libre → Separado → Inicial → Capital → Saldado.
 * `area_comercial` está fuera del flujo de venta residencial.
 */
export const estadoSolar = pgEnum("estado_solar", [
  "libre",
  "separado",
  "inicial",
  "capital",
  "saldado",
  "area_comercial",
]);

export const estadoVenta = pgEnum("estado_venta", [
  "separado",
  "inicial",
  "capital",
  "saldado",
  "cancelada",
]);

export const estadoContrato = pgEnum("estado_contrato", ["pendiente", "listo"]);

export const tipoCuota = pgEnum("tipo_cuota", [
  "separacion",
  "inicial",
  "capital",
]);

export const estadoCuota = pgEnum("estado_cuota", [
  "pendiente",
  "parcial",
  "pagada",
]);

export const metodoPago = pgEnum("metodo_pago", ["efectivo", "transferencia"]);

export const tipoRecibo = pgEnum("tipo_recibo", ["pago", "nota_credito"]);

export const estadoComision = pgEnum("estado_comision", [
  "pendiente",
  "pagada",
]);

export const accionAuditoria = pgEnum("accion_auditoria", [
  "insert",
  "update",
  "delete",
]);

/** Preparado y desactivado: modelo de interés. Hoy siempre `ninguno`. */
export const tipoInteres = pgEnum("tipo_interes", [
  "ninguno",
  "simple",
  "amortizado",
]);

// ---------------------------------------------------------------------------
// Usuarios y configuración
// ---------------------------------------------------------------------------

/**
 * Perfil de aplicación. El `id` es el mismo de `auth.users`: un trigger en
 * Supabase crea la fila al registrarse el usuario (ver `supabase/sql/`).
 * El rol vive aquí, no en el token, y las políticas RLS lo consultan.
 */
export const perfiles = pgTable("perfiles", {
  id: uuid("id").primaryKey(),
  nombre_completo: text("nombre_completo").notNull().default(""),
  correo: text("correo").notNull(),
  rol: rolUsuario("rol").notNull().default("vendedor"),
  activo: boolean("activo").notNull().default(true),
  creado_en: timestamp("creado_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
  actualizado_en: timestamp("actualizado_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const configuracion = pgTable("configuracion", {
  id: uuid("id").primaryKey().defaultRandom(),
  clave: text("clave").notNull().unique(),
  valor: text("valor").notNull(),
  descripcion: text("descripcion"),
  creado_en: timestamp("creado_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
  actualizado_en: timestamp("actualizado_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Inventario
// ---------------------------------------------------------------------------

export const proyectos = pgTable("proyectos", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull().unique(),
  descripcion: text("descripcion"),
  ubicacion: text("ubicacion"),
  activo: boolean("activo").notNull().default(true),
  creado_en: timestamp("creado_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
  actualizado_en: timestamp("actualizado_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const manzanas = pgTable(
  "manzanas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proyecto_id: uuid("proyecto_id")
      .notNull()
      .references(() => proyectos.id, { onDelete: "restrict" }),
    /** B, C, D, E en OASIS DE MACHIN. */
    codigo: text("codigo").notNull(),
    descripcion: text("descripcion"),
    /** Valor por m² de referencia; la venta puede pactar otro. */
    valor_m2_referencia: dinero("valor_m2_referencia"),
    creado_en: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
    actualizado_en: timestamp("actualizado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("manzanas_proyecto_codigo").on(t.proyecto_id, t.codigo)],
);

export const solares = pgTable(
  "solares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    manzana_id: uuid("manzana_id")
      .notNull()
      .references(() => manzanas.id, { onDelete: "restrict" }),
    numero: text("numero").notNull(),
    area_m2: numeric("area_m2", { precision: 14, scale: 2 }).notNull(),
    valor_m2: dinero("valor_m2").notNull(),
    /** Guardado además de calculado: el Excel trae totales que no cuadran. */
    valor_total: dinero("valor_total").notNull(),
    estado: estadoSolar("estado").notNull().default("libre"),
    notas: text("notas"),
    creado_en: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
    actualizado_en: timestamp("actualizado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("solares_manzana_numero").on(t.manzana_id, t.numero),
    index("solares_estado_idx").on(t.estado),
  ],
);

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------

/**
 * La cédula es el identificador del cliente, pero la data inicial no la trae:
 * se permite crear con `cedula` nula (`cedula_pendiente = true`) y un índice
 * único parcial impide duplicados una vez cargada (ver `supabase/sql/`).
 */
export const clientes = pgTable("clientes", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre_completo: text("nombre_completo").notNull(),
  cedula: text("cedula"),
  cedula_pendiente: boolean("cedula_pendiente").notNull().default(true),
  telefono: text("telefono"),
  correo: text("correo"),
  direccion: text("direccion"),
  notas: text("notas"),
  creado_por: uuid("creado_por").references(() => perfiles.id, {
    onDelete: "set null",
  }),
  creado_en: timestamp("creado_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
  actualizado_en: timestamp("actualizado_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const vendedores = pgTable("vendedores", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre_completo: text("nombre_completo").notNull(),
  cedula: text("cedula"),
  telefono: text("telefono"),
  correo: text("correo"),
  /** Vínculo opcional con un usuario del sistema. RLS lo usa para "lo mío". */
  perfil_id: uuid("perfil_id")
    .unique()
    .references(() => perfiles.id, { onDelete: "set null" }),
  activo: boolean("activo").notNull().default(true),
  creado_en: timestamp("creado_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
  actualizado_en: timestamp("actualizado_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Ventas y plan de pagos
// ---------------------------------------------------------------------------

export const ventas = pgTable(
  "ventas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    solar_id: uuid("solar_id")
      .notNull()
      .references(() => solares.id, { onDelete: "restrict" }),
    cliente_id: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "restrict" }),
    vendedor_id: uuid("vendedor_id").references(() => vendedores.id, {
      onDelete: "set null",
    }),
    fecha_venta: date("fecha_venta").notNull(),
    precio_pactado: dinero("precio_pactado").notNull(),
    monto_separacion: dinero("monto_separacion").notNull().default("0"),
    monto_inicial: dinero("monto_inicial").notNull().default("0"),
    /**
     * Cuotas en que se divide la inicial. Julio confirmó **6** el 22 de julio
     * de 2026, "por el momento": el valor real lo manda la clave
     * `cuotas_inicial_por_defecto` de `configuracion`, esto es solo la red.
     */
    cuotas_inicial: integer("cuotas_inicial").notNull().default(6),
    estado: estadoVenta("estado").notNull().default("separado"),
    estado_contrato: estadoContrato("estado_contrato")
      .notNull()
      .default("pendiente"),
    notas: text("notas"),

    // --- Preparado y desactivado: interés y mora ---------------------------
    tipo_interes: tipoInteres("tipo_interes").notNull().default("ninguno"),
    tasa_interes_anual: porcentaje("tasa_interes_anual").notNull().default("0"),
    aplica_mora: boolean("aplica_mora").notNull().default(false),
    tasa_mora_mensual: porcentaje("tasa_mora_mensual").notNull().default("0"),
    meses_amortizacion: integer("meses_amortizacion"),
    // ----------------------------------------------------------------------

    creado_por: uuid("creado_por").references(() => perfiles.id, {
      onDelete: "set null",
    }),
    creado_en: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
    actualizado_en: timestamp("actualizado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ventas_solar_idx").on(t.solar_id),
    index("ventas_cliente_idx").on(t.cliente_id),
    index("ventas_vendedor_idx").on(t.vendedor_id),
  ],
);

/** Montos esperados del plan de pagos. Sin interés ni mora por ahora. */
export const cuotas = pgTable(
  "cuotas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venta_id: uuid("venta_id")
      .notNull()
      .references(() => ventas.id, { onDelete: "cascade" }),
    tipo: tipoCuota("tipo").notNull(),
    numero: integer("numero").notNull(),
    monto_esperado: dinero("monto_esperado").notNull(),
    fecha_vencimiento: date("fecha_vencimiento").notNull(),
    /** Suma de `pago_aplicaciones`; se mantiene por trigger en el Sprint 5. */
    monto_aplicado: dinero("monto_aplicado").notNull().default("0"),
    estado: estadoCuota("estado").notNull().default("pendiente"),
    creado_en: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
    actualizado_en: timestamp("actualizado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("cuotas_venta_tipo_numero").on(t.venta_id, t.tipo, t.numero)],
);

// ---------------------------------------------------------------------------
// Pagos y recibos
// ---------------------------------------------------------------------------

export const pagos = pgTable(
  "pagos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venta_id: uuid("venta_id")
      .notNull()
      .references(() => ventas.id, { onDelete: "restrict" }),
    fecha_pago: date("fecha_pago").notNull(),
    monto: dinero("monto").notNull(),
    metodo: metodoPago("metodo").notNull(),
    /** Número de transferencia, cheque o comprobante del banco. */
    referencia: text("referencia"),
    notas: text("notas"),
    registrado_por: uuid("registrado_por").references(() => perfiles.id, {
      onDelete: "set null",
    }),
    creado_en: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("pagos_venta_idx").on(t.venta_id)],
);

/** Un pago se reparte entre una o varias cuotas (parciales y sobrepagos). */
export const pagoAplicaciones = pgTable(
  "pago_aplicaciones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pago_id: uuid("pago_id")
      .notNull()
      .references(() => pagos.id, { onDelete: "restrict" }),
    cuota_id: uuid("cuota_id")
      .notNull()
      .references(() => cuotas.id, { onDelete: "restrict" }),
    monto: dinero("monto").notNull(),
    creado_en: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("pago_aplicaciones_pago_cuota").on(t.pago_id, t.cuota_id)],
);

/**
 * Recibo inmutable. No existen políticas de UPDATE ni DELETE sobre esta tabla
 * (ver `supabase/sql/`); corregir = emitir una nota de crédito que referencia
 * al recibo original.
 */
export const recibos = pgTable("recibos", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Numeración limpia del sistema, secuencial y propia. */
  numero: bigserial("numero", { mode: "number" }).notNull().unique(),
  tipo: tipoRecibo("tipo").notNull().default("pago"),
  pago_id: uuid("pago_id").references(() => pagos.id, { onDelete: "restrict" }),
  venta_id: uuid("venta_id")
    .notNull()
    .references(() => ventas.id, { onDelete: "restrict" }),
  cliente_id: uuid("cliente_id")
    .notNull()
    .references(() => clientes.id, { onDelete: "restrict" }),
  monto: dinero("monto").notNull(),
  concepto: text("concepto").notNull(),
  /** Nota de crédito: recibo que se está reversando. */
  recibo_original_id: uuid("recibo_original_id"),
  /** Número viejo del Excel; solo referencia histórica, nunca el oficial. */
  numero_referencia_excel: text("numero_referencia_excel"),

  // --- Preparado y desactivado: comprobante fiscal DGII ------------------
  ncf: text("ncf"),
  secuencia_fiscal: text("secuencia_fiscal"),
  // ----------------------------------------------------------------------

  ruta_pdf: text("ruta_pdf"),
  emitido_por: uuid("emitido_por").references(() => perfiles.id, {
    onDelete: "set null",
  }),
  emitido_en: timestamp("emitido_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Comisiones
// ---------------------------------------------------------------------------

export const comisiones = pgTable(
  "comisiones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venta_id: uuid("venta_id")
      .notNull()
      .references(() => ventas.id, { onDelete: "restrict" }),
    vendedor_id: uuid("vendedor_id")
      .notNull()
      .references(() => vendedores.id, { onDelete: "restrict" }),
    /** Monto sobre el que se calculó (regla por confirmar con el cliente). */
    base_calculo: dinero("base_calculo").notNull().default("0"),
    porcentaje: porcentaje("porcentaje").notNull().default("0"),
    monto: dinero("monto").notNull(),
    estado: estadoComision("estado").notNull().default("pendiente"),
    fecha_generacion: date("fecha_generacion").notNull(),
    fecha_pago: date("fecha_pago"),
    pagada_por: uuid("pagada_por").references(() => perfiles.id, {
      onDelete: "set null",
    }),
    notas: text("notas"),
    creado_en: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
    actualizado_en: timestamp("actualizado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("comisiones_vendedor_idx").on(t.vendedor_id)],
);

// ---------------------------------------------------------------------------
// Auditoría
// ---------------------------------------------------------------------------

/**
 * Rastro de toda operación sobre dinero, ventas, recibos, comisiones y
 * cambios de estado. La escriben triggers `security definer`; nadie tiene
 * permiso de INSERT, UPDATE ni DELETE directo.
 */
export const bitacoraAuditoria = pgTable(
  "bitacora_auditoria",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tabla: text("tabla").notNull(),
    registro_id: text("registro_id").notNull(),
    accion: accionAuditoria("accion").notNull(),
    usuario_id: uuid("usuario_id"),
    usuario_correo: text("usuario_correo"),
    datos_antes: jsonb("datos_antes"),
    datos_despues: jsonb("datos_despues"),
    ocurrido_en: timestamp("ocurrido_en", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("bitacora_tabla_registro_idx").on(t.tabla, t.registro_id),
    index("bitacora_ocurrido_idx").on(t.ocurrido_en),
  ],
);
