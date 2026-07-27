# ERP de Solares — OASIS DE MACHIN (Carlitos Inmobiliaria)

Aplicativo web interno para administrar y vender los solares del proyecto OASIS
DE MACHIN: inventario, clientes, vendedores, ventas, planes de pago, pagos,
recibos, comisiones y reportes. Uso interno para 5–10 personas en tres roles
(vendedor, administración, gerencia).

## Documentación

- **`CLAUDE.md`** — reglas duras del proyecto (mandan sobre cualquier cambio).
- **`PLAN.md`** — plan por sprints y estado (Sprints 0–9).
- **`MANUAL.md`** — manual de uso por rol.
- **`ENTREGA.md`** — lista de verificación de producción y entrega (Sprint 9).
- **`supabase/sql/README.md`** — orden y aplicación del SQL.

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Supabase (Postgres, Auth,
Storage, RLS) · Drizzle ORM · TailwindCSS v4 + shadcn/ui · pdf-lib · Vercel.

> En Next.js 16 `middleware.ts` se llama `proxy.ts` y corre en Node.js. Consultar
> `node_modules/next/dist/docs/` antes de asumir APIs (ver `AGENTS.md`).

## Correr en local

1. Copiar `.env.example` a `.env.local` y completar las llaves de Supabase (ver
   comentarios del propio archivo). **Nunca** commitear `.env.local`.
2. Instalar y arrancar:

   ```bash
   npm install
   npm run dev
   ```

3. Abrir http://localhost:3000.

## Base de datos

El esquema lo maneja Drizzle; RLS, triggers de auditoría, inmutabilidad y las
funciones de negocio viven en `supabase/sql/` y se aplican **en orden**. Como
Windows no trae `psql`, se aplican con:

```bash
node scripts/sql.mjs supabase/sql/01_seguridad_y_auditoria.sql
```

Detalle completo del orden, las pruebas y las notas de dependencia entre
archivos en `supabase/sql/README.md`.

## Pruebas

Los archivos pares de `supabase/sql/` son pruebas que terminan en `rollback` (no
dejan datos). La prueba de aceptación final del Sprint 9 es
`16_endurecimiento.sql` (23/23 en PASA): dinero exacto, RLS por rol, auditoría
sin huecos e inmutabilidad de recibos.

## Reglas que no se violan

Dinero en `numeric(14,2)` y decimal exacto (nunca float). Recibos inmutables
(se corrige con nota de crédito, no editando). Todo lo de dinero queda en la
bitácora. Seguridad por rol con RLS en la base, no solo en la UI. Interfaz en
español, moneda RD$. Ver `CLAUDE.md` para el detalle.
