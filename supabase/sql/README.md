# SQL que Drizzle no modela

Drizzle maneja tablas, tipos e índices. Todo lo demás —RLS, triggers de
auditoría, inmutabilidad de recibos y funciones de rol— vive aquí y se aplica a
mano, en este orden:

| # | Archivo | Qué hace |
|---|---|---|
| 0 | `../../drizzle/0000_esquema_completo.sql` | Crea tipos y tablas (generado por Drizzle) |
| 1 | `01_seguridad_y_auditoria.sql` | Perfiles, RLS, bitácora, inmutabilidad, configuración inicial |
| 2 | `02_pruebas_rls.sql` | Prueba la seguridad y hace `rollback`; no deja datos |

## Cómo aplicarlo

**Con `DATABASE_URL` configurada** (recomendado):

```bash
npm run db:migrate                       # aplica el paso 0
psql "$DATABASE_URL" -f supabase/sql/01_seguridad_y_auditoria.sql
psql "$DATABASE_URL" -f supabase/sql/02_pruebas_rls.sql
```

**Sin `DATABASE_URL`:** pegar el contenido de cada archivo, en orden, en el SQL
Editor del panel de Supabase.

Los archivos 1 y 2 son re-ejecutables: el 1 es idempotente y el 2 termina en
`rollback`.

## Después de aplicar

1. Crear el primer usuario en **Authentication → Users** del panel de Supabase.
   El trigger le crea el perfil con rol `vendedor`.
2. Promoverlo a gerencia una sola vez, desde el SQL Editor:

   ```sql
   update public.perfiles set rol = 'gerencia' where correo = 'correo@ejemplo.com';
   ```

3. De ahí en adelante los roles se asignan desde la pantalla `/usuarios`.
