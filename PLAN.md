# PLAN.md — ERP Inmobiliario (Solares) · OASIS DE MACHIN

Un sprint por sesión. No se avanza al siguiente hasta que el actual funcione de punta a punta, esté probado, commiteado y desplegando en el preview de Vercel.

## Estado actual

| Sprint | Nombre | Estado |
|---|---|---|
| 0 | Fundaciones y despliegue | ✅ hecho (falta conectar Vercel) |
| 1 | Esquema, auth, roles, RLS y bitácora | ✅ hecho (SQL aplicado, 11/11 pruebas en PASA) |
| 2 | Proyectos, manzanas e inventario de solares | ✅ hecho (SQL aplicado, 14/14 pruebas en PASA) |
| 3 | Clientes y vendedores | ✅ hecho (falta aplicar el SQL y correr las pruebas) |
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

**Hecho:** las 14 tablas en `src/db/esquema.ts` con la migración generada en
`drizzle/0000_esquema_completo.sql`; RLS, triggers de auditoría, inmutabilidad y
funciones de rol en `supabase/sql/01_seguridad_y_auditoria.sql`; pruebas de RLS
por SQL (con `rollback`) en `supabase/sql/02_pruebas_rls.sql`; login en
`/acceso` con Server Action y errores en español; protección de rutas en
`src/proxy.ts`; helpers `requerirPerfil` / `requerirRol`; pantallas de gerencia
`/usuarios` (asignar roles vía la función `asignar_rol`) y `/bitacora`.

Decisiones que quedaron fijadas en la base:

- **Pagos y aplicaciones también son inmutables**, no solo los recibos: un
  movimiento de dinero no se edita, se reversa. Bloqueado por trigger, así que
  ni el `service_role` puede saltárselo.
- **El rol vive en `perfiles`, no en el token**, y solo se cambia por la función
  `asignar_rol`, que exige gerencia. Nadie cambia su propio rol.
- **Un usuario nuevo entra como `vendedor`** (trigger sobre `auth.users`);
  gerencia lo promueve.
- **Un vendedor ve solo lo suyo** por el vínculo `vendedores.perfil_id`.

**Verificado:** `npm run build` y `npm run lint` limpios; el login rechaza
credenciales malas contra el Supabase real y muestra el error en español; sin
sesión, cualquier ruta redirige a `/acceso`.

**SQL aplicado el 22 de julio de 2026**, con las 11 pruebas de RLS en `PASA`:
el vendedor ve solo su venta y su recibo, no crea ni modifica ventas, no lee la
bitácora; gerencia ve todo pero no puede editar ni borrar un recibo ni tocar la
bitácora; y el pago quedó registrado en la auditoría.

**Pendiente (requiere a Julio):** crear el primer usuario en Supabase
(Authentication → Users) y promoverlo a gerencia con el `update` de
`supabase/sql/README.md`; cargar `SUPABASE_SERVICE_ROLE_KEY` y `DATABASE_URL`;
conectar el repo a Vercel.

**Listo cuando:** login funciona, un vendedor no puede leer ni tocar lo que no le corresponde (probado con SQL, no solo con la UI) y la bitácora registra cambios.

---

## Sprint 2 — Proyectos, manzanas e inventario de solares

**Objetivo:** el inventario, que es el corazón del sistema.

- CRUD de proyectos y manzanas (B, C, D, E en OASIS DE MACHIN).
- CRUD de solares: número, manzana, área m², valor por m², total valor (calculado y verificable), estado.
- Listado con filtros (manzana, estado, rango de precio) y vista de detalle.
- Transiciones de estado válidas según el pipeline; toda transición a bitácora.
- `area_comercial` visible pero fuera del flujo de venta residencial.

**Hecho:** `/proyectos` (alta y edición de proyectos y manzanas, con valor por m²
de referencia y conteo de solares), `/solares` (listado con filtros de manzana,
estado, número y rango de valor, más resumen por estado), `/solares/nuevo`,
`/solares/[id]` (detalle, edición, cambio de estado e historial de bitácora para
gerencia). Reglas puras en `src/lib/solares.ts`; reglas de base en
`supabase/sql/03_inventario.sql` y pruebas en `supabase/sql/04_pruebas_inventario.sql`.

Decisiones de este sprint:

- **El pipeline se hace cumplir en la base**, no en la UI: la función
  `transicion_solar_valida` y el trigger `tr_validar_solar` rechazan saltos
  (`separado → saldado`) y dejan `saldado` como estado final. Se permite volver
  **un** paso atrás (se cae una separación, se revierte una inicial).
  `area_comercial` solo entra y sale desde `libre`.
- **`valor_total` NO se obliga a ser `area × valor_m2`.** El Excel trae totales
  que no cuadran y la regla del proyecto es registrar lo que hay: el formulario
  sugiere el calculado y el detalle muestra la diferencia en ámbar.
- **Un solar con ventas no se borra** y no se le cambia la manzana si tiene
  venta activa: manzana + número es lo que aparece en contratos y recibos.
- Escribir el inventario es de administración y gerencia; el vendedor lo lee
  completo (necesita saber qué hay disponible).

**Verificado:** `npm run build` y `npm run lint` limpios; sin sesión, `/solares`
redirige a `/acceso`.

**SQL aplicado el 22 de julio de 2026**, con las 14 pruebas de inventario en
`PASA`: el pipeline rechaza saltos y deja `saldado` como final; el número de
solar es único por manzana; no se acepta área negativa; una manzana con solares
no se borra; el vendedor lee el inventario pero no lo crea ni lo modifica;
administración sí, aunque el trigger del pipeline también la frena; y el cambio
de estado queda en la bitácora con el antes y el después.

**Pendiente (requiere a Julio):** crear el primer usuario para recorrer las
pantallas y cargar los 84 solares.

**Listo cuando:** se pueden dar de alta y consultar los 84 solares con sus estados.

---

## Sprint 3 — Clientes y vendedores

- CRUD de clientes con cédula como identificador: se permite crear con cédula "pendiente", se valida formato y unicidad al cargarla, y no se permiten dos clientes con la misma cédula.
- Bandeja de "clientes con cédula pendiente" para completar la data.
- CRUD de vendedores y su vínculo con usuarios (`perfiles`) cuando aplique.

**Hecho:** `/clientes` (listado con filtros de nombre, cédula y "solo
pendientes", más el contador de pendientes), `/clientes/nuevo`,
`/clientes/[id]` (detalle, edición, historial de bitácora y borrado para
gerencia), `/clientes/pendientes` (bandeja para cargar cédulas de un tirón) y
`/vendedores` (alta, edición y vínculo con usuarios, solo gerencia). Reglas
puras en `src/lib/personas.ts` y el campo compartido
`src/components/campo-cedula.tsx`; reglas de base en
`supabase/sql/05_personas.sql` y pruebas en `supabase/sql/06_pruebas_personas.sql`.

Decisiones de este sprint:

- **La cédula se guarda normalizada: 11 dígitos, sin guiones.** El trigger
  `tr_normalizar_cliente` la limpia antes de escribirla, así el índice único
  parcial del Sprint 1 sirve de verdad (`031-0123456-9` y `03101234569` son la
  misma cédula y la segunda se rechaza). Se muestra formateada.
- **`cedula_pendiente` es un campo derivado, no un dato suelto.** Lo calcula el
  trigger a partir de la cédula: nadie puede dejar el registro incoherente,
  ni desde la UI ni desde SQL.
- **El dígito verificador advierte, no bloquea.** Hay cédulas viejas legítimas
  que no lo pasan; el formulario avisa y exige marcar «guardar igual», y la
  base no lo valida. Los 11 dígitos sí son obligatorios.
- **Un cliente lo registra cualquiera** (un vendedor necesita dar de alta al
  suyo) **y lo corrige administración, gerencia o quien lo creó**
  (`creado_por`). Borrar es de gerencia y la base lo frena si ya hay ventas.
- **El vendedor es un catálogo de gerencia, no de administración**, porque
  `perfil_id` decide qué ventas y comisiones ve cada persona: es una decisión
  de permisos. Un vendedor sin usuario vinculado sirve para las ventas
  históricas del Excel; uno con historia se desactiva, no se borra.

**Verificado:** `npm run build` y `npm run lint` limpios; sin sesión,
`/clientes` redirige a `/acceso`.

**Pendiente (requiere a Julio):** aplicar `05_personas.sql` y correr
`06_pruebas_personas.sql` en el SQL Editor de Supabase.

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
