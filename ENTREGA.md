# Entrega y endurecimiento — Sprint 9

Lista de verificación para dejar el sistema en producción y entregarlo. Lo que
requiere el panel de Supabase o de Vercel lo hace **Julio** (llaves y accesos);
lo técnico ya está en el repo.

## 1. Pruebas de aceptación (hechas)

- `supabase/sql/16_endurecimiento.sql`: 23/23 en **PASA** contra el Supabase
  real. Corre de punta a punta y hace `rollback` (no deja datos). Cubre:
  - **Auditoría estructural**: las 13 tablas de dinero/estado tienen su
    disparador `tr_auditar`; recibos, pagos, aplicaciones y bitácora tienen el
    candado de inmutabilidad; ninguna vista de dinero es `security definer`.
  - **Cálculos de dinero**: la suma de las cuotas = precio pactado al centavo;
    el residuo del redondeo va en la última cuota; separación → inicial →
    capital → saldado con balance verificable; sobrepago = saldo a favor;
    comisión 3% = 22,500.
  - **RLS por rol**: el vendedor solo ve lo suyo, no cobra, no cancela, no lee
    la bitácora; administración no reversa; gerencia sí; el recibo no admite
    UPDATE ni DELETE ni para gerencia.
  - **Bitácora sin huecos**: cada pago, recibo, comisión y cambio de estado de
    venta dejó su fila de auditoría.
- Suites de sprints anteriores, todas en verde: RLS (11), inventario (14),
  personas (23), ventas (34), pagos (43), comisiones (23), reportes (17).

Para volver a correrla:

```bash
node scripts/sql.mjs supabase/sql/16_endurecimiento.sql
```

## 2. Respaldos (Julio, en el panel de Supabase)

- **Point-in-Time Recovery (PITR)**: en *Database → Backups*, activar PITR o
  confirmar el respaldo diario del plan. Es la red por si alguien corrompe data.
  El sistema no borra dinero (todo es inmutable + bitácora), pero un respaldo
  cubre errores humanos fuera de la app (ediciones directas en el SQL Editor).
- **Antes de cualquier carga o cambio de esquema en producción**: tomar un
  respaldo manual desde el panel.
- Guardar en lugar seguro (no en el repo) una copia de las llaves y de
  `DATABASE_URL`.

## 3. Variables de entorno de producción

En **Vercel → Settings → Environment Variables** (Production), solo las dos
públicas (las demás no las usa el runtime):

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | llave anónima |

Recordatorios:

- Las `NEXT_PUBLIC_*` se **incrustan al construir**. Si se cargan o cambian
  después de un build, hay que **redesplegar sin caché** (destildar «Use existing
  Build Cache»).
- `SUPABASE_SERVICE_ROLE_KEY` y `DATABASE_URL` **NO** van a Vercel: son solo para
  scripts locales (`node scripts/sql.mjs`, la migración del Excel). El runtime no
  las necesita.
- `.env.local` **nunca** se commitea; `.env.example` es la plantilla.

## 4. Dominio de producción

- En **Vercel → Settings → Domains**, agregar el dominio del cliente y seguir las
  instrucciones de DNS (registro A / CNAME). *(Decisión abierta: falta que Julio
  confirme el dominio.)*
- En **Supabase → Authentication → URL Configuration**, poner ese dominio en
  *Site URL* y en *Redirect URLs* para que el login funcione desde producción.

## 5. Usuarios (Julio, una sola vez)

1. Crear cada usuario en **Supabase → Authentication → Users** con su contraseña.
   El trigger le crea el perfil como **vendedor**.
2. Promover al primero a gerencia desde el **SQL Editor**:

   ```sql
   update public.perfiles set rol = 'gerencia' where correo = 'correo@ejemplo.com';
   ```

3. De ahí en adelante, los roles se asignan desde la pantalla **`/usuarios`**.

## 6. Entrega a los usuarios

- Manual corto en español: **`MANUAL.md`** (uso por rol, cobrar, reversar,
  reportes).
- Repaso en vivo: entrar con un usuario de cada rol y recorrer el flujo
  (registrar venta → armar plan → cobrar → recibo → reporte).
- Pendiente de datos (lo va cargando administración por el sistema): completar
  las 40 cédulas, armar el plan de pagos de cada venta migrada y registrar los
  pagos ya recibidos para que cartera, vencidas y recaudo reflejen la realidad
  (ver `PLAN.md`, Sprint 7).

## 7. Decisiones de negocio aún abiertas (no inventar; preguntar a Julio)

1. ¿El valor por m² varía por cliente negociado o es fijo por manzana?
2. Dominio de producción.
3. Plazo estándar del capital (hoy se pacta por venta; el default es 1 pago).

Todo lo provisional (comisión 3%, separación 5%, inicial en 6 cuotas) vive en la
tabla `configuracion` y gerencia lo cambia desde `/configuracion` sin desplegar.
