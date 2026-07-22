-- =============================================================================
-- Sprint 2 · Inventario: proyectos, manzanas y solares
-- =============================================================================
-- Se aplica DESPUÉS de `01_seguridad_y_auditoria.sql`. Es idempotente.
--
-- Lo que este archivo hace cumplir en la base de datos, no en la UI:
--   * Las transiciones de estado del solar siguen el pipeline único.
--   * Un solar con venta activa no se borra ni se le cambia la manzana.
--   * Área y valores no pueden ser negativos.
--
-- Nota: NO se obliga a que `valor_total = area_m2 * valor_m2`. El Excel de
-- origen trae totales que no cuadran y la regla del proyecto es registrar lo
-- que hay; la pantalla muestra el calculado al lado para que se vea la
-- diferencia (ver `novedades-a-aclarar`, Sprint 7).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Integridad de montos del inventario
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'solares_valor_m2_no_negativo') then
    alter table public.solares
      add constraint solares_valor_m2_no_negativo check (valor_m2 >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'solares_valor_total_no_negativo') then
    alter table public.solares
      add constraint solares_valor_total_no_negativo check (valor_total >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'manzanas_valor_m2_no_negativo') then
    alter table public.manzanas
      add constraint manzanas_valor_m2_no_negativo
      check (valor_m2_referencia is null or valor_m2_referencia >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'manzanas_codigo_no_vacio') then
    alter table public.manzanas
      add constraint manzanas_codigo_no_vacio check (length(btrim(codigo)) > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'solares_numero_no_vacio') then
    alter table public.solares
      add constraint solares_numero_no_vacio check (length(btrim(numero)) > 0);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Pipeline de estados del solar
-- -----------------------------------------------------------------------------
-- Libre → Separado → Inicial → Capital → Saldado, con vuelta atrás de un paso
-- (una separación se cae, una inicial se revierte). `area_comercial` está fuera
-- del flujo residencial: solo entra y sale desde `libre`. `saldado` es final.
--
-- Esta función es la única fuente de verdad de las transiciones; la UI lee las
-- mismas reglas desde `src/lib/solares.ts` y deben mantenerse iguales.

create or replace function public.transicion_solar_valida(
  p_desde public.estado_solar,
  p_hasta public.estado_solar
)
returns boolean
language sql
immutable
as $$
  select case p_desde
    when 'libre'          then p_hasta in ('separado', 'area_comercial')
    when 'separado'       then p_hasta in ('inicial', 'libre')
    when 'inicial'        then p_hasta in ('capital', 'separado')
    when 'capital'        then p_hasta in ('saldado', 'inicial')
    when 'saldado'        then false
    when 'area_comercial' then p_hasta = 'libre'
    else false
  end;
$$;

create or replace function public.fn_validar_solar()
returns trigger
language plpgsql
as $$
begin
  -- La excepción de la liberación la agregó el Sprint 4: un solar separado, en
  -- inicial o en capital vuelve a `libre` cuando ya no tiene venta activa (se
  -- canceló). `saldado` sigue siendo final y los saltos hacia adelante siguen
  -- prohibidos. ESTA FUNCIÓN ES IDÉNTICA A LA DE `07_ventas.sql`: si se cambia
  -- una, se cambia la otra, así el resultado no depende del orden de aplicación.
  if new.estado is distinct from old.estado
     and not public.transicion_solar_valida(old.estado, new.estado)
     and not (
       new.estado = 'libre'
       and old.estado in ('separado', 'inicial', 'capital')
       and not exists (
         select 1 from public.ventas v
         where v.solar_id = old.id and v.estado <> 'cancelada'
       )
     ) then
    raise exception
      'Transición de estado no permitida para el solar: % → %.',
      old.estado, new.estado;
  end if;

  -- Mover un solar de manzana cambiaría su identidad (manzana + número), que es
  -- lo que aparece en contratos y recibos.
  if new.manzana_id is distinct from old.manzana_id
     and exists (select 1 from public.ventas v
                 where v.solar_id = old.id and v.estado <> 'cancelada') then
    raise exception 'No se puede cambiar de manzana un solar con venta activa.';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_validar_solar on public.solares;
create trigger tr_validar_solar
  before update on public.solares
  for each row execute function public.fn_validar_solar();

-- Un solar con historia de venta no se borra: se deja el rastro.
create or replace function public.fn_proteger_borrado_solar()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.ventas v where v.solar_id = old.id) then
    raise exception 'El solar tiene ventas registradas: no se puede eliminar.';
  end if;
  return old;
end;
$$;

drop trigger if exists tr_proteger_borrado_solar on public.solares;
create trigger tr_proteger_borrado_solar
  before delete on public.solares
  for each row execute function public.fn_proteger_borrado_solar();

-- Una manzana con solares tampoco se borra (la FK ya es `restrict`, pero el
-- mensaje en español ayuda a quien usa la pantalla).
create or replace function public.fn_proteger_borrado_manzana()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.solares s where s.manzana_id = old.id) then
    raise exception 'La manzana tiene solares registrados: no se puede eliminar.';
  end if;
  return old;
end;
$$;

drop trigger if exists tr_proteger_borrado_manzana on public.manzanas;
create trigger tr_proteger_borrado_manzana
  before delete on public.manzanas
  for each row execute function public.fn_proteger_borrado_manzana();

-- -----------------------------------------------------------------------------
-- 3. Índices de apoyo a los filtros del listado
-- -----------------------------------------------------------------------------

create index if not exists solares_manzana_idx on public.solares (manzana_id);
create index if not exists solares_valor_total_idx on public.solares (valor_total);

-- -----------------------------------------------------------------------------
-- 4. Datos base del proyecto OASIS DE MACHIN
-- -----------------------------------------------------------------------------
-- Solo el proyecto y sus cuatro manzanas. Los 84 solares entran por la pantalla
-- o por la migración del Excel (Sprint 7), nunca inventados aquí.

insert into public.proyectos (nombre, descripcion, ubicacion)
values ('OASIS DE MACHIN', 'Proyecto de venta de solares.', null)
on conflict (nombre) do nothing;

insert into public.manzanas (proyecto_id, codigo, descripcion)
select p.id, m.codigo, m.descripcion
from public.proyectos p
cross join (values
  ('B', 'Manzana B'),
  ('C', 'Manzana C'),
  ('D', 'Manzana D'),
  ('E', 'Manzana E')
) as m(codigo, descripcion)
where p.nombre = 'OASIS DE MACHIN'
on conflict on constraint manzanas_proyecto_codigo do nothing;
