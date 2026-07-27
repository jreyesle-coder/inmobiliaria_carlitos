# PLAN.md — ERP Inmobiliario (Solares) · OASIS DE MACHIN

Un sprint por sesión. No se avanza al siguiente hasta que el actual funcione de punta a punta, esté probado, commiteado y desplegando en el preview de Vercel.

## Estado actual

| Sprint | Nombre | Estado |
|---|---|---|
| 0 | Fundaciones y despliegue | ✅ hecho (desplegado en Vercel, login funcionando, usuario de gerencia creado) |
| 1 | Esquema, auth, roles, RLS y bitácora | ✅ hecho (SQL aplicado, 11/11 pruebas en PASA) |
| 2 | Proyectos, manzanas e inventario de solares | ✅ hecho (SQL aplicado, 14/14 pruebas en PASA) |
| 3 | Clientes y vendedores | ✅ hecho (SQL aplicado, 23/23 pruebas en PASA) |
| 4 | Ventas, contrato y plan de pagos (cuotas) | ✅ hecho (SQL aplicado, 34/34 pruebas en PASA) |
| 5 | Pagos, aplicaciones y recibos inmutables (PDF) | ✅ hecho (SQL aplicado, 43/43 pruebas en PASA) |
| 6 | Comisiones | ✅ hecho (SQL aplicado, 23/23 pruebas en PASA) |
| 7 | Migración del Excel y `novedades-a-aclarar` | ✅ hecho (aplicado: 84 solares, 50 ventas, 40 clientes, 6 vendedores, 167 novedades) |
| 8 | Reportes y tableros por rol | ✅ hecho (SQL aplicado, 17/17 pruebas en `PASA`) |
| 9 | Endurecimiento y entrega | ✅ hecho (SQL aplicado, 23/23 pruebas en `PASA`; manual y guía de entrega) |

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

**Hecho el 24 de julio de 2026:** la app está desplegada en Vercel
(`inmobiliaria-carlitos-*.vercel.app`) con las dos variables `NEXT_PUBLIC_*`
cargadas, el login funciona y existe el usuario de gerencia
(`gerencia@imbcarlitos.app`). `DATABASE_URL` quedó en `.env.local` por el
Session pooler y **verificada**: se conecta y aplica SQL con
`node scripts/sql.mjs`. `SUPABASE_SERVICE_ROLE_KEY` también cargada y probada.

**Ojo con la contraseña de la BD:** termina en `**`, que en la URL van
escapados como `%2A%2A`. Sin escapar, `URL()` corta la contraseña y la
autenticación falla con `28P01`.

**Nota de despliegue:** las variables `NEXT_PUBLIC_*` se incrustan **al
construir**. Si se cargan después de un build, hay que **redesplegar sin caché**
(destildar «Use existing Build Cache») para que tomen efecto. El proxy ahora
devuelve un 500 con el nombre de la variable que falte
(`src/lib/supabase/entorno.ts`).

**Listo cuando:** la app carga en el preview de Vercel y conecta a Supabase. ✅

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
`supabase/sql/README.md`; cargar `DATABASE_URL`; conectar el repo a Vercel.

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

**SQL aplicado el 22 de julio de 2026**, con las 23 pruebas de personas en
`PASA`: la cédula se guarda normalizada y no se repite, la que no tiene 11
dígitos se rechaza, `cedula_pendiente` no se puede desincronizar a mano, un
cliente o vendedor con ventas no se borra, el vendedor registra clientes y
completa la cédula del suyo pero no corrige ni borra los ajenos ni se vincula a
sí mismo como vendedor, gerencia sí, el usuario vinculado se reconoce por
`mi_vendedor_id()` y no ve ventas ajenas, y todo queda en la bitácora con su
autor.

**Nota de operación:** `06_pruebas_personas.sql` empieza comprobando que exista
el trigger `tr_normalizar_cliente`. Correr las pruebas sin haber aplicado
`05_personas.sql` antes fallaba con una violación de
`clientes_cedula_coherente` que no explicaba nada; ahora avisa en español.

**Listo cuando:** se puede registrar un cliente sin cédula, completarla después y el sistema rechaza duplicados.

---

## Sprint 4 — Ventas, contrato y plan de pagos (cuotas)

- Crear venta: solar + cliente + vendedor + precio pactado + fecha; el solar cambia de estado.
- Estado de contrato (listo / pendiente).
- Generación del plan de pagos: separación/apartado, inicial (en N cuotas) y capital.
- `cuotas` como montos esperados con fecha de vencimiento; sin interés ni mora (desactivados).

**Reglas confirmadas por Julio el 22 de julio de 2026** (ambas "por el
momento", así que van en `configuracion`, no en el código):

- **La inicial se paga en 6 cuotas.** Clave `cuotas_inicial_por_defecto`. El
  `default` de la columna `ventas.cuotas_inicial` se bajó de 12 a 6 en la
  migración `drizzle/0001_wise_boomerang.sql`, pero es solo la red: el valor
  que se usa se lee de `configuracion`.
- **La separación es el 5% del valor del solar.** Clave
  `separacion_porcentaje` (`0.0500`). Es un porcentaje calculado, no un monto
  fijo; `ventas.monto_separacion` guarda el resultado en pesos, porque lo
  pactado manda sobre lo calculado (misma lógica que `valor_total` del solar).

**Hecho:** `/ventas` (listado con filtros de estado, contrato y cliente, más
resumen por estado), `/ventas/nueva` (con **vista previa del plan de pagos
antes de guardar**) y `/ventas/[id]` (detalle, plan de cuotas, cambio de
estado, contrato listo/pendiente, corrección, rehacer el plan, cancelación para
gerencia e historial de bitácora). Reglas puras en `src/lib/ventas.ts`, lectura
de las claves de negocio en `src/lib/configuracion.ts`, reglas de base en
`supabase/sql/07_ventas.sql` y pruebas en `supabase/sql/08_pruebas_ventas.sql`.
Columnas nuevas (`cuotas_capital`, `fecha_cancelacion`, `motivo_cancelacion`)
en `drizzle/0002_ventas_sprint4.sql`.

Decisiones de este sprint:

- **El plan lo genera la base, no la aplicación.** `generar_plan_pagos` arma
  las cuotas en una sola transacción y termina comprobando que la suma sea
  exactamente el precio pactado: si no cuadra, no se guarda ninguna cuota. La
  migración del Excel (Sprint 7) va a usar esa misma función, no la pantalla.
- **El residuo del redondeo va en la última cuota de cada bloque.** 100,000 en
  6 cuotas son cinco de 16,666.66 y una de 16,666.70. Por eso el plan cuadra
  al centavo y es verificable.
- **El solar sigue a la venta.** Con una venta detrás, el estado del inventario
  deja de tocarse a mano: lo mueve el trigger `tr_sincronizar_solar`. Un solar
  solo admite **una venta activa** (índice único parcial); las canceladas
  quedan como historia.
- **Cancelar es de gerencia, con motivo obligatorio, y libera el solar.** La
  función `cancelar_venta` devuelve el solar a `libre` aunque venga de
  `capital`: para eso se le agregó a `fn_validar_solar` la excepción de que un
  solar sin venta activa se libera (`saldado` sigue siendo final). No se
  cancela una venta con pagos: eso se reversa en el Sprint 5.
- **Una cuota con dinero encima se congela**: no cambia de monto ni de fecha ni
  se borra, y el plan completo no se puede rehacer. Mientras no haya entrado un
  peso, rehacerlo es normal (se corrige el precio o el plazo).
- **Armar el plan es de administración y gerencia**, aunque borrar cuotas
  sueltas siga siendo solo de gerencia: `generar_plan_pagos` es la única puerta
  para eso y comprueba el rol adentro.
- **El plazo del capital se pacta por venta.** No hay un número confirmado por
  el cliente, así que el formulario lo pregunta y sugiere
  `configuracion.cuotas_capital_por_defecto` (hoy 1, es decir un pago único del
  balance). No se inventó una regla de financiamiento.

**Verificado:** `npm run build`, `npm run lint` y `tsc --noEmit` limpios; sin
sesión, `/ventas` redirige a `/acceso`; el plan calculado en TypeScript da
exactamente los mismos montos y fechas que asserta `08_pruebas_ventas.sql`
(incluido el 31 de enero + 1 mes = 28 de febrero).

**SQL aplicado el 22 de julio de 2026**, con las 34 pruebas de ventas en
`PASA`: registrar la venta deja el solar separado y un solar no admite dos
ventas activas ni se vende si no está libre; el plan da 1 separación + 6
iniciales + 1 capital, suma exactamente el precio pactado, deja el residuo en
la última cuota de la inicial, vence el 28 de febrero cuando la venta fue un 31
de enero y arranca el capital cuando termina la inicial; una cuota con pagos no
cambia de monto, no se borra y bloquea la regeneración del plan; el pipeline
rechaza `separado → saldado`, el solar sigue a la venta hasta `saldado` y ahí
es final; el vendedor no registra ventas, no arma planes y no cancela, pero ve
las suyas con su plan; administración registra y genera el plan pero no
cancela; gerencia cancela con motivo, el solar vuelve a `libre` desde
`inicial`, las cuotas se retiran y el solar se puede volver a vender; sin
motivo no se cancela y una venta saldada tampoco; las claves quedaron en 6
cuotas y 5%; y la cancelación y las cuotas quedan en la bitácora con su autor.

**Pendiente (requiere a Julio):** crear el primer usuario para recorrer las
pantallas y registrar las primeras ventas.

**Listo cuando:** una venta genera su plan de cuotas completo y el balance esperado cuadra con el total.

---

## Sprint 5 — Pagos, aplicaciones y recibos inmutables

- Registrar pago: monto, fecha, método (efectivo / transferencia), referencia.
- Aplicar el pago a una o varias cuotas vía `pago_aplicaciones`; soporta pago parcial y sobrepago.
- Emisión de recibo con numeración secuencial nueva y limpia; campo aparte `numero_referencia_excel` para los números viejos.
- Recibo inmutable: sin edición ni borrado. Corrección = nota de crédito / reverso que referencia el recibo original.
- PDF del recibo con pdf-lib guardado en Supabase Storage.
- Recálculo de total abonado y balance pendiente del solar/venta.

**Hecho:** `/ventas/[id]/cobrar` (registrar el pago, con **vista previa de cómo
se reparte entre las cuotas antes de guardarlo** y opción de repartirlo a mano),
`/pagos` (listado con filtros de fecha, método y cliente, y el neto recibido),
`/pagos/[id]` (detalle, cuotas que cubre, recibo y reverso para gerencia),
`/recibos` (listado con filtros y descarga) y `/recibos/[id]/pdf` (el PDF).
En la venta se agregaron la sección de pagos, el balance pendiente, lo vencido
sin pagar y el saldo a favor. Reglas puras en `src/lib/pagos.ts`, el documento
en `src/lib/recibo-pdf.ts`, reglas de base en `supabase/sql/09_pagos.sql` y
pruebas en `supabase/sql/10_pruebas_pagos.sql`. Columnas nuevas (`es_reverso`,
`pago_reversado_id`, `motivo_reverso`) en `drizzle/0003_pagos_sprint5.sql`.

Decisiones de este sprint:

- **El pago, sus aplicaciones y su recibo entran juntos o no entran.** Una sola
  función, `registrar_pago`, hace todo en una transacción: no existe forma de
  que quede dinero registrado sin recibo, ni un recibo sin su pago.
- **Una cuota nunca recibe más de lo que se le espera.** Lo que sobra de un pago
  queda como **saldo a favor de la venta**, visible como tal. Es lo que hace que
  el balance sea verificable: la suma de las cuotas sigue siendo el precio
  pactado, pase lo que pase con los pagos.
- **`cuotas.monto_aplicado` no lo escribe nadie a mano**: lo recalcula un
  trigger sumando las aplicaciones. Por eso no se puede desincronizar.
- **Reparto automático por defecto, manual si hace falta.** El pago cubre la
  cuota más vieja primero; quien cobra puede ajustarlo (un cliente que paga una
  cuota específica) y la pantalla muestra el reparto antes de guardar.
- **Reversar en vez de editar.** Un pago no se toca: se registra el movimiento
  contrario (`reversar_pago`, solo gerencia y con motivo) con las mismas
  aplicaciones, que al restar devuelven las cuotas a como estaban, y se emite
  una **nota de crédito** contra el recibo original. Los dos movimientos quedan
  a la vista; nada desaparece.
- **El estado de la venta sigue al dinero.** Pagado el bloque de separación pasa
  a `inicial`, pagada la inicial a `capital`, y pagado todo el plan a `saldado`
  —y el solar detrás, como siempre—. Solo avanza: si se reversa un pago, el
  estado lo corrige gerencia a mano, porque devolver un solar de estado es una
  decisión, no una consecuencia.
- **Cancelar ahora mira el neto**, no si existen pagos: `09_pagos.sql`
  **reemplaza** `cancelar_venta`. Un pago reversado no es dinero en caja, así
  que reversar y cancelar es un camino válido. Y al cancelar **solo se borran
  las cuotas que nunca vieron un pago**: una cuota que llegó a cobrarse
  conserva sus aplicaciones —el rastro del dinero no se borra— y se queda en
  cero como historia de la venta cancelada. (Lo descubrieron las pruebas: la
  versión que borraba todas chocaba con la llave foránea de
  `pago_aplicaciones`, o sea que una venta reversada no se podía cancelar.)
- **El PDF se genera la primera vez que se descarga** y se guarda en el bucket
  privado `recibos`. La ruta se fija al emitir el recibo (`recibos.ruta_pdf`),
  porque después no se le puede actualizar ningún campo. Como sale de lo
  guardado, dos generaciones dan el mismo documento.
- **El recibo lleva el monto en letras** y dice en el pie que es de control
  interno y **no un comprobante fiscal (NCF)**, que sigue preparado y
  desactivado.

**Verificado:** `npm run build`, `npm run lint` y `tsc --noEmit` limpios; el PDF
del recibo y el de la nota de crédito se generan y abren; el monto en letras se
probó con casos de borde (1 → «UN PESO DOMINICANO», 21,000 → «VEINTIÚN MIL»,
1,000,000 → «UN MILLÓN DE PESOS»).

**SQL aplicado el 22 de julio de 2026**, con las 43 pruebas de pagos en `PASA`,
y el bucket `recibos` creado con sus políticas: el vendedor no cobra ni inserta
pagos sueltos; el pago automático cubre la cuota más vieja primero, deja
parcial la que no alcanza a cubrir y se reparte entre varias sin perder
centavos; la aplicación manual manda sobre el orden automático y lo que no se
aplica queda como saldo a favor; una cuota no recibe más de lo esperado, un
pago no reparte más de lo recibido, uno de cero se rechaza y no se aplica a la
cuota de otra venta; el pago, su aplicación y el recibo no se editan ni se
borran; todo pago emite recibo con número y ruta de PDF; pagada la separación
la venta pasa a inicial y pagado el plan completo queda saldada, con el solar
detrás; el resumen cuadra lo recibido, lo aplicado y el saldo a favor;
administración no reversa y gerencia sí, con motivo, devolviendo la cuota a
como estaba, bajando lo recibido y emitiendo la nota de crédito, sin que se
pueda reversar dos veces ni reversar un reverso; no se cancela una venta con
dinero recibido pero sí después de reversarlo, conservando la cuota que llegó a
cobrarse; el vendedor ve los pagos y recibos de su venta y ninguno de los
ajenos; y todo queda en la bitácora con su autor.

**Pendiente (requiere a Julio):** crear el primer usuario para recorrer las
pantallas, y las llaves y el despliegue que arrastra el Sprint 0.

**Listo cuando:** un pago produce un recibo en PDF descargable, el balance se actualiza y no existe forma de editar el recibo.

---

## Sprint 6 — Comisiones

- Regla de comisión por venta (monto o porcentaje) con estado pagada / pendiente.
- Generación de la comisión al cumplirse el hito acordado (**confirmar el hito con el cliente**).
- Vista de comisiones por vendedor y marcado de pago (registrado en bitácora).

**Regla confirmada por Julio el 27 de julio de 2026** (por el momento, así que
vive en `configuracion`, no en el código):

- **La comisión es un porcentaje, igual para todos los vendedores.** Clave
  `comision_porcentaje` (`0.0300` = 3%). Gerencia lo cambia desde el sistema.
- **La base es el precio pactado de la venta** (`ventas.precio_pactado`), no el
  valor del solar ni lo abonado.
- **Se genera cuando se completa la inicial** (la venta pasa a `capital`).

**Hecho el 27 de julio de 2026:** `/comisiones` (listado con resumen por
vendedor de lo pendiente y lo pagado, y botón de gerencia para marcar pagada /
devolver a pendiente) y `/configuracion` (gerencia edita el porcentaje de
comisión y las otras cifras "por el momento" sin desplegar). Reglas de base en
`supabase/sql/12_comisiones.sql`, pruebas en `13_pruebas_comisiones.sql`
(23/23 en `PASA`), migración `drizzle/0004_comisiones_sprint6.sql` (restricción
única `comisiones_venta_unico`). Helpers puros en `src/lib/comisiones.ts`.

Decisiones de este sprint:

- **La comisión la genera la base, no la aplicación.** `generar_comision` la
  llama `avanzar_venta_por_pagos` (redefinida acá) en el punto exacto en que la
  venta llega a `capital`: nace sola con el pago que completa la inicial. Es
  idempotente (restricción única `comisiones_venta_unico` + chequeos), así que
  un segundo pago no crea una segunda comisión.
- **Sin vendedor no hay comisión.** Las ventas históricas del Excel sin vendedor
  no generan una comisión huérfana.
- **Generar no es pagar.** La comisión nace `pendiente`; gerencia la marca
  `pagada` (deja fecha y autor) o la devuelve a pendiente con
  `marcar_comision`. La comisión NO es inmutable —a diferencia de pagos y
  recibos—: pagarla es un acto administrativo corregible, y queda en la
  bitácora.
- **El porcentaje se cambia desde el sistema.** `establecer_configuracion`
  (gerencia, con whitelist y validación) toca solo las cuatro claves de negocio
  (`comision_porcentaje`, `separacion_porcentaje`, `cuotas_inicial_por_defecto`,
  `cuotas_capital_por_defecto`). Cambiarlo afecta lo nuevo: las comisiones y
  planes ya registrados no se recalculan.
- **Cancelar retira la comisión pendiente.** `cancelar_venta` (redefinida acá,
  reemplaza la de `09_pagos.sql`) borra la comisión `pendiente` de la venta
  cancelada —una venta cancelada no le debe comisión a nadie—; una comisión ya
  `pagada` se queda como historia, igual que una cuota que llegó a cobrarse.

**Nota de orden:** `12_comisiones.sql` REDEFINE `avanzar_venta_por_pagos` y
`cancelar_venta` (ambas de `09_pagos.sql`) para engancharles la comisión.
Aplicar `09` después de `12` revierte ese enganche: aplicar siempre en orden.

**Pendiente (requiere a Julio):** crear el primer usuario para recorrer las
pantallas y marcar comisiones.

**Listo cuando:** gerencia ve lo que se debe a cada vendedor y puede marcarlo pagado con rastro de auditoría. ✅

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

**Hecho el 24 de julio de 2026:** `scripts/importar-excel.mjs` lee el Excel
local, normaliza y carga por la conexión directa (`DATABASE_URL`), en modo
ensayo por defecto y con `--commit` para aplicar. La tabla de reporte vive en
`supabase/sql/11_migracion_excel.sql` (`migracion_novedades`). Cargado y
verificado contra el Supabase real: **84 solares** (33 libres, 50 vendidos, 1
comercial), **50 ventas**, **40 clientes** (todos con cédula pendiente), **6
vendedores**, **167 novedades**. El importador es **idempotente** (ids
deterministas uuid v5): correrlo dos veces no duplica.

Decisiones de este sprint:

- **Carga limpia, el dinero se reconcilia después** (elección de Julio). Las
  ventas entran como `separado` y **sin plan de cuotas**: los plazos reales no
  están en el Excel y no se inventan. Ningún pago se carga. Cuando Julio arme
  el plan de cada venta y registre los pagos reales por el sistema, el estado
  y el balance avanzan solos. Así se honra "la migración no decide qué cifra es
  correcta".
- **El estado del Excel se registra, no se pierde.** Un solar que el Excel da
  en `inicial`/`capital`/`saldado` entra igual como `separado` (su estado
  natural sin pagos) y su clasificación queda en `migracion_novedades`. Pre-fijar
  el estado sería incoherente: `avanzar_venta_por_pagos` solo mueve hacia
  adelante, así que un estado adelantado no se podría corregir con los pagos
  reales.
- **`CONTROL DE SOLARES` es la fuente principal**; `Hoja1` y `CONTROL VEND COM.`
  se usan solo para comparar (y `VEND` para el vendedor y el estado del
  contrato). Cada desacuerdo de total, abonado, comprador o estado queda en
  novedades. **28 de las 50 ventas** tienen un abonado distinto entre hojas.
- **Los pagos de `FORMA DE PAGOS` no se amarran** (solo nombre mal escrito, sin
  número de solar): las 73 líneas van a novedades como referencia para que
  Julio las registre sobre la venta correcta.
- **Sin comisiones** (Sprint 6, sin regla): las marcas PAGADA/PEND del Excel
  van a novedades.
- **Los datos reales no entran al repo.** Se commitea el script y la DDL; el
  Excel se lee local y el reporte `novedades-a-aclarar.xlsx` se genera local
  (ambos en `.gitignore`).

**Pendiente (requiere a Julio):** revisar `novedades-a-aclarar.xlsx` (o la tabla
`migracion_novedades` desde el SQL Editor), completar las cédulas de los 40
clientes, y por cada venta armar el plan de pagos real y registrar los pagos ya
recibidos para que los balances reflejen la realidad. El solar 13 (JULIO ENRIQUE
DE LA ROSA, según Hoja1/VEND pero no en la principal) y VIARELYS como vendedora
se cargan cuando Julio confirme esa venta.

**Listo cuando:** la data está cargada, es reproducible, y existe el reporte de novedades para que el cliente lo resuelva. ✅

---

## Sprint 8 — Reportes y tableros por rol

- Gerencia: ventas por período, recaudo, cartera pendiente, inventario por estado, comisiones.
- Administración: cobros del día, cuotas vencidas, recibos emitidos.
- Vendedor: sus solares, sus clientes, sus comisiones.
- Exportación a Excel/PDF de los principales listados.

**Hecho el 27 de julio de 2026:** el tablero `/reportes` (server component,
enlazado primero en la home) con KPIs (solares libres/vendidos, cartera
pendiente, vencido sin pagar, recaudo del mes) y cuatro secciones —inventario
por estado, cartera pendiente, cuotas vencidas y recaudo por mes—, cada una con
su botón **«Exportar a Excel (CSV)»**. La exportación es un solo route handler
`/reportes/exportar?tipo=cartera|ventas|cuotas-vencidas|recaudo|inventario`.
Reglas de base en `supabase/sql/14_reportes.sql`, pruebas en
`15_pruebas_reportes.sql` (17/17 en `PASA`). Helpers puros en
`src/lib/reportes.ts`.

Decisiones de este sprint:

- **Un reporte es una vista, no un cálculo repetido.** Las cuatro vistas
  (`reporte_inventario`, `reporte_ventas`, `reporte_recaudo_mensual`,
  `reporte_cuotas_vencidas`) viven solo en SQL —como `ventas_resumen_cobros`—:
  no hay tabla nueva, así que **nada que migrar en Drizzle**. `reporte_ventas`
  reusa `ventas_resumen_cobros` para el balance; el dinero no se recalcula a
  mano en ningún lado.
- **Los reportes se scopean por rol en la base, no en la UI.** Todas las vistas
  son `security_invoker = on`: heredan la RLS de las tablas de abajo. Un
  vendedor que abra `/reportes` o exporte un CSV ve exactamente sus ventas,
  cobros y vencidas —igual que en el resto del sistema—; administración y
  gerencia ven todo. Ninguna vista usa `security definer`: si mañana se afloja
  una política de base, el reporte se afloja con ella, no al revés.
- **La cartera es `reporte_ventas` filtrada** a las ventas activas con balance
  pendiente (las canceladas fuera, las saldadas se caen solas con balance 0).
  El «vencido sin pagar» sale de `vencido_pendiente`, ya calculado por la vista
  de cobros.
- **Exportar es CSV, no xlsx.** Un solo endpoint con `?tipo=`, con BOM UTF-8 al
  frente (para que Excel respete los acentos) y los montos como número plano
  (`1234.56`, sin `RD$`) para que Excel los sume. Lee las mismas vistas con el
  cliente anónimo, así que el archivo también respeta la RLS del que lo pide.
  El anónimo ni llega: el proxy lo manda a `/acceso`.
- **El inventario por estado es global** (`solares` es legible por todos), pero
  el tablero solo lo muestra a administración y gerencia; al vendedor le
  interesa su cartera, no el conteo del proyecto.

**Estado con la data real (carga limpia del Sprint 7):** el inventario ya
reporta (33 libres, 50 separado, 1 comercial), pero cartera muestra las 50
ventas con balance = precio y **0 cuotas vencidas / 0 meses de recaudo**, porque
las ventas migradas entraron sin plan de cuotas y sin pagos a propósito. Los
reportes se pueblan solos a medida que Julio arme los planes y registre los
pagos reales.

**Pendiente (requiere a Julio):** entrar con un usuario a recorrer el tablero
con datos ya cobrados; y lo de siempre, armar planes y registrar pagos para que
cartera, vencidas y recaudo reflejen la realidad.

**Listo cuando:** cada rol ve su tablero con cifras que cuadran con las tablas
y puede exportar los listados a Excel. ✅

---

## Sprint 9 — Endurecimiento y entrega

- Pruebas de RLS por rol (SQL, no UI) y de los cálculos de dinero.
- Revisión de la bitácora: que ninguna operación de dinero quede sin rastro.
- Respaldos, variables de entorno de producción, dominio.
- Manual corto en español y entrega a los usuarios.

**Hecho el 27 de julio de 2026:** prueba de aceptación final
`supabase/sql/16_endurecimiento.sql` (**23/23 en `PASA`** contra el Supabase
real, hace `rollback`, no define objetos nuevos). Es una sola corrida de punta a
punta que cubre las cuatro exigencias del sprint:

- **Auditoría estructural (la bitácora sin huecos, revisada desde el catálogo):**
  las 13 tablas de dinero/estado tienen su disparador `tr_auditar`; recibos,
  pagos, aplicaciones y bitácora tienen el candado de inmutabilidad; ninguna
  vista de dinero es `security definer`. Y de forma dinámica: cada pago, recibo,
  comisión y cambio de estado de venta del flujo dejó su fila en
  `bitacora_auditoria`.
- **Cálculos de dinero exactos:** la suma de las cuotas = precio pactado al
  centavo, el residuo del redondeo en la última cuota (5 × 16,666.66 +
  16,666.70), separación → inicial → capital → saldado con balance verificable
  en cada paso, sobrepago 300,000/250,000 = 50,000 de saldo a favor sin perder
  centavos, y la comisión 3% = 22,500 naciendo sola al llegar a capital.
- **RLS por rol (SQL, no UI):** el vendedor ve solo su venta, sus pagos, sus
  recibos y su comisión, no cobra, no cancela y no lee la bitácora; un vendedor
  sin ventas no ve nada; administración no reversa; gerencia sí (devuelve la
  cuota, baja lo recibido y emite nota de crédito); y un recibo no admite UPDATE
  ni DELETE ni para gerencia.

Documentos de entrega: **`MANUAL.md`** (uso por rol: entrar, registrar venta,
cobrar, reversar, comisiones, reportes) y **`ENTREGA.md`** (lista de
verificación de producción: respaldos/PITR, variables de entorno, dominio,
creación de usuarios y decisiones abiertas). El `README.md` raíz se reescribió
(dejó de ser el boilerplate de create-next-app) con stack, arranque local,
aplicación del SQL y las reglas duras.

**Pendiente (requiere a Julio, panel):** activar PITR/respaldo en Supabase,
confirmar el dominio de producción y su configuración de Auth, y crear los
usuarios reales. Y lo de datos que arrastra el Sprint 7: completar cédulas,
armar planes y registrar pagos por el sistema.

**Listo cuando:** las pruebas de dinero y RLS pasan por SQL, la bitácora no deja
huecos, y existe manual y guía de entrega. ✅

---

## Decisiones abiertas (preguntar a Julio, no inventar)

1. ¿El "valor por m²" varía por cliente negociado o es fijo por manzana? (el Excel muestra 2500 y 3500 en solares vecinos).
2. Dominio de producción y conexión con Vercel.
3. **Plazo del capital**: ¿hay un número estándar de cuotas (12, 24, 36) o se
   pacta venta por venta? Hoy la pantalla lo pregunta y sugiere 1 (pago único
   del balance), que es lo único que no inventa una regla.

### Resueltas

- **Comisión: 3% del precio pactado, generada al completarse la inicial**
  (27 de julio de 2026, "por el momento"). Igual para todos los vendedores y
  editable por gerencia desde `/configuracion`. Vive en
  `configuracion.comision_porcentaje`.
- **Cuotas de la inicial: 6** (22 de julio de 2026, "por el momento").
- **Separación: 5% del valor del solar** (22 de julio de 2026, "por el momento").
  Ambas viven en `configuracion` justamente porque son provisionales.
- **Dígito verificador de la cédula: advierte, no bloquea.** Circulan cédulas
  viejas legítimas que no pasan Luhn; el formulario exige marcar «guardar
  igual» y así queda el rastro de que alguien lo decidió.
- Llaves de Supabase y repo de GitHub: entregados (ver arriba).
