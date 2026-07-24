-- =============================================================================
-- Sprint 7 · Migración del Excel — tabla de novedades a aclarar
-- =============================================================================
-- Se aplica DESPUÉS de `09_pagos.sql`. Es idempotente.
--
-- Aquí SOLO va el esquema. La carga de datos la hace `scripts/importar-excel.mjs`
-- leyendo el Excel local, para que los nombres de clientes reales no queden en
-- el repositorio.
--
-- `migracion_novedades` es el reporte de reconciliación: cada fila es algo que
-- el Excel no deja decidir a la máquina (un monto que no cuadra entre hojas, un
-- estado suelto, un pago que no se puede amarrar a un solar). La migración
-- registra lo que hay y deja esto para que Julio lo resuelva.
-- =============================================================================

create table if not exists public.migracion_novedades (
  id           uuid primary key default gen_random_uuid(),
  -- Lote de la corrida: permite re-importar borrando solo lo de este origen.
  origen       text not null default 'excel-oasis',
  solar_numero integer,
  manzana      text,
  campo        text not null,
  -- Valor del campo en cada hoja del Excel, tal cual venía.
  valores      jsonb,
  motivo       text not null,
  creado_en    timestamp with time zone not null default now()
);

create index if not exists migracion_novedades_solar_idx
  on public.migracion_novedades (solar_numero);
create index if not exists migracion_novedades_campo_idx
  on public.migracion_novedades (campo);

-- Solo administración y gerencia leen las novedades; nadie las edita a mano
-- (las escribe el script de migración por la conexión directa, que es dueña de
-- la tabla y se salta RLS).
alter table public.migracion_novedades enable row level security;

do $$
begin
  if exists (select 1 from pg_policies
             where schemaname='public' and tablename='migracion_novedades'
               and policyname='migracion_novedades_select') then
    drop policy migracion_novedades_select on public.migracion_novedades;
  end if;
end $$;

create policy migracion_novedades_select on public.migracion_novedades
  for select to authenticated
  using (public.es_admin_o_gerencia());

revoke insert, update, delete on public.migracion_novedades from authenticated;
