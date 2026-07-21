# PLAN.md — ERP Inmobiliario (Solares) · OASIS DE MACHIN

Un sprint por sesión. No se avanza al siguiente hasta que el actual funcione de punta a punta, esté probado, commiteado y desplegando en el preview de Vercel.

## Estado actual

| Sprint | Nombre | Estado |
|---|---|---|
| 0 | Fundaciones y despliegue | ✅ hecho (falta conectar Vercel) |
| 1 | Esquema, auth, roles, RLS y bitácora | ⏳ pendiente |
| 2 | Proyectos, manzanas e inventario de solares | ⏳ pendiente |
| 3 | Clientes y vendedores | ⏳ pendiente |
| 4 | Ventas, contrato y plan de pagos (cuotas) | ⏳ pendiente |
| 5 | Pagos, aplicaciones y recibos inmutables (PDF) | ⏳ pendiente |
| 6 | Comisiones | ⏳ pendiente |
| 7 | Migración del Excel y `novedades-a-aclarar` | ⏳ pendiente |
| 8 | Reportes y tableros por rol | ⏳ pendiente |
| 9 | Endurecimiento y entrega | ⏳ pendiente |

---

## Sprint 0 — Fundaciones y despliegue

**Objetivo:** un esqueleto vacío pero desplegado, con la tubería completa funcionando.

- Next.js (App Router) + TypeScript + TailwindCSS + shadcn/ui.
- Drizzle ORM configurado contra Supabase Postgres.
- Cliente Supabase (browser + server) y `.env.local` (nunca commiteado); `.env.example` sí.
- Layout base en español, formato de moneda `RD$ 1,500.00` en un helper único (`lib/moneda.ts`, decimal exacto).
- Repo en GitHub + proyecto en Vercel con preview y producción.

**Hecho:** Next.js 16 (Turbopack) + TS + Tailwind v4 + shadcn/ui; clientes Supabase
(navegador y servidor) con refresco de sesión en `src/proxy.ts`; Drizzle configurado;
`src/lib/moneda.ts` con Decimal y formato `RD$ 1,500.00`; layout en español; repo
`jreyesle-coder/inmobiliaria_carlitos` en `main`.

**Nota de versión:** en Next.js 16 `middleware.ts` se llama `proxy.ts`, corre en Node.js
y no admite runtime edge. Consultar `node_modules/next/dist/docs/` antes de asumir APIs.

**Pendiente:** `SUPABASE_SERVICE_ROLE_KEY` y `DATABASE_URL` en `.env.local`; conectar el
repo a Vercel y cargar ahí las mismas variables.

**Listo cuando:** la app carga en el preview de Vercel y conecta a Supabase.

---

## Sprint 1 — Esquema, auth, roles, RLS y bitácora

**Objetivo:** la base de datos completa y segura antes de escribir pantallas.

- Migración Drizzle con todas las tablas en español/snake_case: `proyectos`, `manzanas`, `solares`, `clientes`, `vendedores`, `ventas`, `cuotas`, `pagos`, `pago_aplicaciones`, `recibos`, `comisiones`, `perfiles`, `bitacora_auditoria`, `configuracion`.
- Todo monto en `numeric(14,2)`. Enums del pipeline: `libre | separado | inicial | capital | saldado` + `area_comercial` aparte.
- Campos preparados-desactivados: tasa/tipo de interés, mora, amortización; NCF/secuencia fiscal en `recibos`.
- Supabase Auth + tabla `perfiles` con rol (`vendedor | administracion | gerencia`).
- Políticas RLS por rol en cada tabla; `recibos` sin políticas de UPDATE ni DELETE.
- Triggers de auditoría que escriben en `bitacora_auditoria` (antes/después) en dinero, ventas, recibos, comisiones y cambios de estado.

**Listo cuando:** login funciona, un vendedor no puede leer ni tocar lo que no le corresponde (probado con SQL, no solo con la UI) y la bitácora registra cambios.

---

## Sprint 2 — Proyectos, manzanas e inventario de solares

**Objetivo:** el inventario, que es el corazón del sistema.

- CRUD de proyectos y manzanas (B, C, D, E en OASIS DE MACHIN).
- CRUD de solares: número, manzana, área m², valor por m², total valor (calculado y verificable), estado.
- Listado con filtros (manzana, estado, rango de precio) y vista de detalle.
- Transiciones de estado válidas según el pipeline; toda transición a bitácora.
- `area_comercial` visible pero fuera del flujo de venta residencial.

**Listo cuando:** se pueden dar de alta y consultar los 84 solares con sus estados.

---

## Sprint 3 — Clientes y vendedores

- CRUD de clientes con cédula como identificador: se permite crear con cédula "pendiente", se valida formato y unicidad al cargarla, y no se permiten dos clientes con la misma cédula.
- Bandeja de "clientes con cédula pendiente" para completar la data.
- CRUD de vendedores y su vínculo con usuarios (`perfiles`) cuando aplique.

**Listo cuando:** se puede registrar un cliente sin cédula, completarla después y el sistema rechaza duplicados.

---

## Sprint 4 — Ventas, contrato y plan de pagos (cuotas)

- Crear venta: solar + cliente + vendedor + precio pactado + fecha; el solar cambia de estado.
- Estado de contrato (listo / pendiente).
- Generación del plan de pagos: separación/apartado, inicial (en N cuotas, por defecto 12 — **confirmar con el cliente**) y capital.
- `cuotas` como montos esperados con fecha de vencimiento; sin interés ni mora (desactivados).

**Listo cuando:** una venta genera su plan de cuotas completo y el balance esperado cuadra con el total.

---

## Sprint 5 — Pagos, aplicaciones y recibos inmutables

- Registrar pago: monto, fecha, método (efectivo / transferencia), referencia.
- Aplicar el pago a una o varias cuotas vía `pago_aplicaciones`; soporta pago parcial y sobrepago.
- Emisión de recibo con numeración secuencial nueva y limpia; campo aparte `numero_referencia_excel` para los números viejos.
- Recibo inmutable: sin edición ni borrado. Corrección = nota de crédito / reverso que referencia el recibo original.
- PDF del recibo con pdf-lib guardado en Supabase Storage.
- Recálculo de total abonado y balance pendiente del solar/venta.

**Listo cuando:** un pago produce un recibo en PDF descargable, el balance se actualiza y no existe forma de editar el recibo.

---

## Sprint 6 — Comisiones

- Regla de comisión por venta (monto o porcentaje) con estado pagada / pendiente.
- Generación de la comisión al cumplirse el hito acordado (**confirmar el hito con el cliente**).
- Vista de comisiones por vendedor y marcado de pago (registrado en bitácora).

**Listo cuando:** gerencia ve lo que se debe a cada vendedor y puede marcarlo pagado con rastro de auditoría.

---

## Sprint 7 — Migración del Excel y `novedades-a-aclarar`

Fuente: `OASIS DE MACHIN VENTA DE SOLARES.xlsx`. Hojas relevantes y lo que ya se sabe:

| Hoja | Contenido | Observación |
|---|---|---|
| `CONTROL DE SOLARES` | 84 solares (B:16, C:20, D:22, E:26) | fuente principal del inventario |
| `Hoja1` | mismo inventario por manzana | difiere en algunas filas frente a la anterior |
| `CONTROL VEND COM.` | 44 filas con vendedor, contrato y comisión | única fuente de vendedor/comisión; montos que no cuadran |
| `FORMA DE PAGOS` | pagos en efectivo y transferencia con número de recibo | numeración inconsistente (`0.0007`, `1`, marcas "NULO") |
| `GASTOS URBANIZACION`, `CLIENTES Y PAGOS` | vacías | ignorar |

- Script de importación idempotente y re-ejecutable.
- Normalizar estados sueltos (`SEPARACION`, `ABO/CAP`, `INICIAL/CAPITAL`, `SEPARADO/*INICIAL`, `COMPLETADP`, vacíos) al pipeline único.
- Clientes creados con cédula pendiente.
- Recibos viejos entran como referencia histórica, no como recibos emitidos por el sistema.
- **La migración no decide qué cifra es correcta.** Toda discrepancia (área, valor, abonado, balance, estado, comprador, comisión, recibo duplicado o nulo) se registra en `novedades-a-aclarar` con solar, campo, valor en cada hoja y motivo.

**Listo cuando:** la data está cargada, es reproducible, y existe el reporte de novedades para que el cliente lo resuelva.

---

## Sprint 8 — Reportes y tableros por rol

- Gerencia: ventas por período, recaudo, cartera pendiente, inventario por estado, comisiones.
- Administración: cobros del día, cuotas vencidas, recibos emitidos.
- Vendedor: sus solares, sus clientes, sus comisiones.
- Exportación a Excel/PDF de los principales listados.

---

## Sprint 9 — Endurecimiento y entrega

- Pruebas de RLS por rol (SQL, no UI) y de los cálculos de dinero.
- Revisión de la bitácora: que ninguna operación de dinero quede sin rastro.
- Respaldos, variables de entorno de producción, dominio.
- Manual corto en español y entrega a los usuarios.

---

## Decisiones abiertas (preguntar a Julio, no inventar)

1. Número de cuotas de la inicial (¿12 por defecto?).
2. Regla de comisión: ¿porcentaje o monto fijo? ¿Sobre qué base y en qué momento se genera?
3. Monto/porcentaje estándar de la separación (apartado).
4. ¿El "valor por m²" varía por cliente negociado o es fijo por manzana? (el Excel muestra 2500 y 3500 en solares vecinos).
5. Llaves de Supabase, repo de GitHub y dominio de producción.
