-- =============================================================================
-- Sprint 3 · Clientes y vendedores
-- =============================================================================
-- Se aplica DESPUÉS de `03_inventario.sql`. Es idempotente.
--
-- Lo que este archivo hace cumplir en la base de datos, no en la UI:
--   * La cédula se guarda normalizada (11 dígitos, sin guiones) o no se guarda.
--   * `cedula_pendiente` es una consecuencia de la cédula, no un campo suelto:
--     lo pone el trigger, así nunca queda incoherente.
--   * No hay dos clientes con la misma cédula (índice único parcial del
--     Sprint 1, que ahora sí es confiable porque el formato es único).
--   * Un cliente o un vendedor con ventas no se borra.
--
-- Lo que NO se hace cumplir aquí a propósito: el dígito verificador de la
-- cédula. Hay cédulas viejas legítimas que no lo pasan; la UI advierte y deja
-- guardarla marcando la casilla (ver `src/lib/personas.ts`).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Normalización de la cédula y del nombre
-- -----------------------------------------------------------------------------

/** Deja solo los dígitos; devuelve NULL si no queda nada. */
create or replace function public.normalizar_cedula(p_cedula text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(p_cedula, ''), '[^0-9]', '', 'g'), '');
$$;

create or replace function public.fn_normalizar_cliente()
returns trigger
language plpgsql
as $$
begin
  new.nombre_completo := btrim(new.nombre_completo);
  new.cedula          := public.normalizar_cedula(new.cedula);
  -- El campo derivado se calcula aquí: nadie puede desincronizarlo desde fuera.
  new.cedula_pendiente := new.cedula is null;
  new.telefono        := nullif(regexp_replace(coalesce(new.telefono, ''), '[^0-9]', '', 'g'), '');
  new.correo          := nullif(btrim(lower(coalesce(new.correo, ''))), '');
  return new;
end;
$$;

drop trigger if exists tr_normalizar_cliente on public.clientes;
create trigger tr_normalizar_cliente
  before insert or update on public.clientes
  for each row execute function public.fn_normalizar_cliente();

create or replace function public.fn_normalizar_vendedor()
returns trigger
language plpgsql
as $$
begin
  new.nombre_completo := btrim(new.nombre_completo);
  new.cedula          := public.normalizar_cedula(new.cedula);
  new.telefono        := nullif(regexp_replace(coalesce(new.telefono, ''), '[^0-9]', '', 'g'), '');
  new.correo          := nullif(btrim(lower(coalesce(new.correo, ''))), '');
  return new;
end;
$$;

drop trigger if exists tr_normalizar_vendedor on public.vendedores;
create trigger tr_normalizar_vendedor
  before insert or update on public.vendedores
  for each row execute function public.fn_normalizar_vendedor();

-- -----------------------------------------------------------------------------
-- 2. Integridad de clientes y vendedores
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_nombre_no_vacio') then
    alter table public.clientes
      add constraint clientes_nombre_no_vacio
      check (length(btrim(nombre_completo)) > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'clientes_cedula_formato') then
    alter table public.clientes
      add constraint clientes_cedula_formato
      check (cedula is null or cedula ~ '^[0-9]{11}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'vendedores_nombre_no_vacio') then
    alter table public.vendedores
      add constraint vendedores_nombre_no_vacio
      check (length(btrim(nombre_completo)) > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'vendedores_cedula_formato') then
    alter table public.vendedores
      add constraint vendedores_cedula_formato
      check (cedula is null or cedula ~ '^[0-9]{11}$');
  end if;
end $$;

-- La cédula del vendedor también identifica, pero puede faltar.
create unique index if not exists vendedores_cedula_unica
  on public.vendedores (cedula) where cedula is not null;

-- Apoyo a la bandeja de pendientes y a las búsquedas del listado.
create index if not exists clientes_cedula_pendiente_idx
  on public.clientes (cedula_pendiente) where cedula_pendiente;
create index if not exists clientes_nombre_idx
  on public.clientes (lower(nombre_completo));
create index if not exists clientes_creado_por_idx
  on public.clientes (creado_por);

-- -----------------------------------------------------------------------------
-- 3. Un cliente o un vendedor con historia no se borra
-- -----------------------------------------------------------------------------
-- La FK ya es `restrict`, pero el mensaje en español es lo que ve quien usa la
-- pantalla, y de paso cubre las comisiones del vendedor.

create or replace function public.fn_proteger_borrado_cliente()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.ventas v where v.cliente_id = old.id) then
    raise exception 'El cliente tiene ventas registradas: no se puede eliminar.';
  end if;
  return old;
end;
$$;

drop trigger if exists tr_proteger_borrado_cliente on public.clientes;
create trigger tr_proteger_borrado_cliente
  before delete on public.clientes
  for each row execute function public.fn_proteger_borrado_cliente();

create or replace function public.fn_proteger_borrado_vendedor()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.ventas v where v.vendedor_id = old.id) then
    raise exception 'El vendedor tiene ventas registradas: desactívelo en vez de eliminarlo.';
  end if;
  if exists (select 1 from public.comisiones c where c.vendedor_id = old.id) then
    raise exception 'El vendedor tiene comisiones registradas: desactívelo en vez de eliminarlo.';
  end if;
  return old;
end;
$$;

drop trigger if exists tr_proteger_borrado_vendedor on public.vendedores;
create trigger tr_proteger_borrado_vendedor
  before delete on public.vendedores
  for each row execute function public.fn_proteger_borrado_vendedor();

-- -----------------------------------------------------------------------------
-- 4. El vínculo vendedor ↔ usuario es una decisión de permisos
-- -----------------------------------------------------------------------------
-- `perfil_id` decide qué ventas y comisiones ve una persona (ver
-- `mi_vendedor_id`). Solo gerencia puede tocarlo, igual que el rol.

create or replace function public.fn_validar_vendedor()
returns trigger
language plpgsql
as $$
begin
  if new.perfil_id is not null
     and not exists (select 1 from public.perfiles p where p.id = new.perfil_id) then
    raise exception 'El usuario indicado no existe.';
  end if;

  -- `auth.uid() is null` es una sesión de mantenimiento (migración, script del
  -- panel): ahí no hay rol que consultar y no se estorba.
  if tg_op = 'UPDATE'
     and new.perfil_id is distinct from old.perfil_id
     and auth.uid() is not null
     and not public.es_gerencia() then
    raise exception 'Solo gerencia puede vincular un vendedor con un usuario.';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_validar_vendedor on public.vendedores;
create trigger tr_validar_vendedor
  before insert or update on public.vendedores
  for each row execute function public.fn_validar_vendedor();
