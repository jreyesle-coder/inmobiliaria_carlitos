import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Esquema de la base de datos. Tablas y columnas en español, snake_case.
 *
 * El esquema completo (proyectos, solares, clientes, ventas, cuotas, pagos,
 * pago_aplicaciones, recibos, comisiones, perfiles, bitacora_auditoria) entra
 * en el Sprint 1. Por ahora solo `configuracion`, que el Sprint 0 usa para
 * verificar que la conexión y las migraciones funcionan de punta a punta.
 *
 * Recordatorio: todo monto va en `numeric(14,2)`.
 */
export const configuracion = pgTable("configuracion", {
  id: uuid("id").primaryKey().defaultRandom(),
  clave: text("clave").notNull().unique(),
  valor: text("valor").notNull(),
  descripcion: text("descripcion"),
  creado_en: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  actualizado_en: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
});
