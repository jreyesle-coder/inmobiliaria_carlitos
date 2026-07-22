# SQL que Drizzle no modela

Drizzle maneja tablas, tipos e índices. Todo lo demás —RLS, triggers de
auditoría, inmutabilidad de recibos y funciones de rol— vive aquí y se aplica a
mano, en este orden:

| # | Archivo | Qué hace |
|---|---|---|
| 0 | `../../drizzle/0000_esquema_completo.sql` | Crea tipos y tablas (generado por Drizzle) |
| 1 | `01_seguridad_y_auditoria.sql` | Perfiles, RLS, bitácora, inmutabilidad, configuración inicial |
| 2 | `02_pruebas_rls.sql` | Prueba la seguridad y hace `rollback`; no deja datos |
| 3 | `03_inventario.sql` | Pipeline de estados del solar, integridad del inventario y datos base de OASIS DE MACHIN |
| 4 | `04_pruebas_inventario.sql` | Prueba transiciones, integridad y permisos; hace `rollback` |
| 5 | `05_personas.sql` | Normalización y unicidad de la cédula, protección de borrado de clientes y vendedores, vínculo vendedor ↔ usuario |
| 6 | `06_pruebas_personas.sql` | Prueba cédulas, permisos de clientes y vendedores y auditoría; hace `rollback` |
| 7 | `07_ventas.sql` | Pipeline de la venta, una venta activa por solar, plan de pagos (`generar_plan_pagos`), cancelación y claves de negocio |
| 8 | `08_pruebas_ventas.sql` | Prueba el plan, el arrastre del solar, los permisos y la cancelación; hace `rollback` |
| 9 | `09_pagos.sql` | Pagos, aplicaciones y recibos (`registrar_pago`), reversos (`reversar_pago`), resumen de cobros y bucket de PDF |
| 10 | `10_pruebas_pagos.sql` | Prueba el reparto, los límites del dinero, el reverso y los permisos; hace `rollback` |

## Cómo aplicarlo

**Con `DATABASE_URL` configurada** (recomendado):

```bash
npm run db:migrate                       # aplica el paso 0
psql "$DATABASE_URL" -f supabase/sql/01_seguridad_y_auditoria.sql
psql "$DATABASE_URL" -f supabase/sql/02_pruebas_rls.sql
psql "$DATABASE_URL" -f supabase/sql/03_inventario.sql
psql "$DATABASE_URL" -f supabase/sql/04_pruebas_inventario.sql
psql "$DATABASE_URL" -f supabase/sql/05_personas.sql
psql "$DATABASE_URL" -f supabase/sql/06_pruebas_personas.sql
psql "$DATABASE_URL" -f supabase/sql/07_ventas.sql
psql "$DATABASE_URL" -f supabase/sql/08_pruebas_ventas.sql
psql "$DATABASE_URL" -f supabase/sql/09_pagos.sql
psql "$DATABASE_URL" -f supabase/sql/10_pruebas_pagos.sql
```

Ojo: a partir del Sprint 4 el paso 0 incluye `drizzle/0002_ventas_sprint4.sql`
(columnas `cuotas_capital`, `fecha_cancelacion` y `motivo_cancelacion`) y desde
el Sprint 5 también `drizzle/0003_pagos_sprint5.sql` (columnas `es_reverso`,
`pago_reversado_id` y `motivo_reverso`). `07_ventas.sql` y `09_pagos.sql`
también las agregan con `if not exists`, así que se pueden aplicar sobre una
base que todavía no corrió la migración.

**Sin `DATABASE_URL`:** pegar el contenido de cada archivo, en orden, en el SQL
Editor del panel de Supabase.

Todos son re-ejecutables: los impares (1, 3, 5, 7 y 9) son idempotentes y los
pares (2, 4, 6, 8 y 10) terminan en `rollback`.

`fn_validar_solar` está definida **igual** en `03_inventario.sql` y en
`07_ventas.sql` a propósito, para que el resultado no dependa del orden en que
se apliquen. Si se cambia una, hay que cambiar la otra.

`cancelar_venta` sí cambia entre archivos: la de `09_pagos.sql` **reemplaza** a
la de `07_ventas.sql` (ahora mira el neto recibido, porque un pago reversado no
es dinero en caja). Por eso el orden importa: aplicar `07` después de `09`
devolvería la versión vieja.

El paso 9 crea además el bucket privado `recibos` en Storage y sus políticas. Si
el SQL Editor no deja tocar `storage.objects`, cree el bucket `recibos`
(privado) desde **Storage** en el panel y vuelva a correr solo las políticas del
final del archivo.

## Después de aplicar

1. Crear el primer usuario en **Authentication → Users** del panel de Supabase.
   El trigger le crea el perfil con rol `vendedor`.
2. Promoverlo a gerencia una sola vez, desde el SQL Editor:

   ```sql
   update public.perfiles set rol = 'gerencia' where correo = 'correo@ejemplo.com';
   ```

3. De ahí en adelante los roles se asignan desde la pantalla `/usuarios`.
