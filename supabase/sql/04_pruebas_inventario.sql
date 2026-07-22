-- =============================================================================
-- Sprint 2 · Pruebas del inventario (transiciones, integridad y permisos)
-- =============================================================================
-- Se corre completo en el SQL Editor de Supabase. Todo pasa dentro de una
-- transacción que termina en `rollback`: NO deja datos.
--
-- Como en `02_pruebas_rls.sql`, la tabla de resultados es normal (no temporal)
-- y se le dan permisos, porque una tabla temporal la posee `postgres` y el rol
-- `authenticated` no podría escribir en ella.
-- =============================================================================

begin;

create table public.resultados_pruebas_inv (
  n serial,
  prueba text,
  resultado text
);
grant insert, select on public.resultados_pruebas_inv to authenticated;
grant usage, select on sequence public.resultados_pruebas_inv_n_seq to authenticated;

-- Datos de prueba (creados como `postgres`, sin RLS).
insert into public.proyectos (id, nombre)
values ('11111111-1111-1111-1111-111111111111', 'PROYECTO DE PRUEBA');

insert into public.manzanas (id, proyecto_id, codigo, valor_m2_referencia)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Z', 2500.00
);

insert into public.solares (id, manzana_id, numero, area_m2, valor_m2, valor_total, estado)
values (
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  '1', 300.00, 2500.00, 750000.00, 'libre'
);

-- -----------------------------------------------------------------------------
-- 1. Transiciones de estado
-- -----------------------------------------------------------------------------

do $$
declare v_error text;
begin
  -- Válida: libre → separado
  begin
    update public.solares set estado = 'separado'
      where id = '33333333-3333-3333-3333-333333333333';
    insert into public.resultados_pruebas_inv (prueba, resultado)
      values ('libre → separado se permite', 'PASA');
  exception when others then
    insert into public.resultados_pruebas_inv (prueba, resultado)
      values ('libre → separado se permite', 'FALLA: ' || sqlerrm);
  end;

  -- Inválida: separado → saldado (se salta el pipeline)
  begin
    update public.solares set estado = 'saldado'
      where id = '33333333-3333-3333-3333-333333333333';
    insert into public.resultados_pruebas_inv (prueba, resultado)
      values ('separado → saldado se rechaza', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_inv (prueba, resultado)
      values ('separado → saldado se rechaza', 'PASA');
  end;

  -- Camino completo hasta saldado, y saldado como estado final.
  update public.solares set estado = 'inicial'
    where id = '33333333-3333-3333-3333-333333333333';
  update public.solares set estado = 'capital'
    where id = '33333333-3333-3333-3333-333333333333';
  update public.solares set estado = 'saldado'
    where id = '33333333-3333-3333-3333-333333333333';
  insert into public.resultados_pruebas_inv (prueba, resultado)
    values ('separado → inicial → capital → saldado se permite', 'PASA');

  begin
    update public.solares set estado = 'libre'
      where id = '33333333-3333-3333-3333-333333333333';
    insert into public.resultados_pruebas_inv (prueba, resultado)
      values ('saldado es estado final', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_inv (prueba, resultado)
      values ('saldado es estado final', 'PASA');
  end;
end $$;

-- Solar nuevo, limpio, para las pruebas de permisos.
insert into public.solares (id, manzana_id, numero, area_m2, valor_m2, valor_total, estado)
values (
  '44444444-4444-4444-4444-444444444444',
  '22222222-2222-2222-2222-222222222222',
  '2', 250.00, 2500.00, 625000.00, 'libre'
);

-- -----------------------------------------------------------------------------
-- 2. Integridad
-- -----------------------------------------------------------------------------

do $$
begin
  begin
    insert into public.solares (manzana_id, numero, area_m2, valor_m2, valor_total)
    values ('22222222-2222-2222-2222-222222222222', '2', 100, 2500, 250000);
    insert into public.resultados_pruebas_inv (prueba, resultado)
      values ('número de solar único por manzana', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_inv (prueba, resultado)
      values ('número de solar único por manzana', 'PASA');
  end;

  begin
    insert into public.solares (manzana_id, numero, area_m2, valor_m2, valor_total)
    values ('22222222-2222-2222-2222-222222222222', '9', -5, 2500, 250000);
    insert into public.resultados_pruebas_inv (prueba, resultado)
      values ('área negativa se rechaza', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_inv (prueba, resultado)
      values ('área negativa se rechaza', 'PASA');
  end;

  begin
    delete from public.manzanas
      where id = '22222222-2222-2222-2222-222222222222';
    insert into public.resultados_pruebas_inv (prueba, resultado)
      values ('manzana con solares no se borra', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_inv (prueba, resultado)
      values ('manzana con solares no se borra', 'PASA');
  end;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Permisos por rol (RLS)
-- -----------------------------------------------------------------------------
-- Se usan los mismos usuarios de `02_pruebas_rls.sql` si existen; si no, se
-- crean perfiles sueltos apuntando a usuarios de auth ya presentes.

do $$
declare
  v_vendedor uuid;
begin
  select id into v_vendedor from public.perfiles where rol = 'vendedor' and activo limit 1;
  if v_vendedor is null then
    insert into public.resultados_pruebas_inv (prueba, resultado)
      values ('permisos de vendedor sobre solares',
              'OMITIDA: no hay ningún usuario con rol vendedor');
    return;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_vendedor, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Lee el inventario…
  if exists (select 1 from public.solares) then
    insert into public.resultados_pruebas_inv (prueba, resultado)
      values ('vendedor lee el inventario', 'PASA');
  else
    insert into public.resultados_pruebas_inv (prueba, resultado)
      values ('vendedor lee el inventario', 'FALLA: no ve nada');
  end if;

  -- …pero no lo modifica.
  begin
    update public.solares set valor_m2 = 1
      where id = '44444444-4444-4444-4444-444444444444';
    if found then
      insert into public.resultados_pruebas_inv (prueba, resultado)
        values ('vendedor no modifica solares', 'FALLA: lo permitió');
    else
      insert into public.resultados_pruebas_inv (prueba, resultado)
        values ('vendedor no modifica solares', 'PASA');
    end if;
  exception when others then
    insert into public.resultados_pruebas_inv (prueba, resultado)
      values ('vendedor no modifica solares', 'PASA');
  end;

  begin
    insert into public.solares (manzana_id, numero, area_m2, valor_m2, valor_total)
    values ('22222222-2222-2222-2222-222222222222', '77', 100, 2500, 250000);
    insert into public.resultados_pruebas_inv (prueba, resultado)
      values ('vendedor no crea solares', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_inv (prueba, resultado)
      values ('vendedor no crea solares', 'PASA');
  end;

  reset role;
  perform set_config('request.jwt.claims', null, true);
end $$;

-- -----------------------------------------------------------------------------
-- 4. Auditoría del cambio de estado
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from public.bitacora_auditoria
    where tabla = 'solares'
      and registro_id = '33333333-3333-3333-3333-333333333333'
      and accion = 'update'
      and datos_antes ->> 'estado' = 'capital'
      and datos_despues ->> 'estado' = 'saldado'
  ) then
    insert into public.resultados_pruebas_inv (prueba, resultado)
      values ('el cambio de estado queda en la bitácora', 'PASA');
  else
    insert into public.resultados_pruebas_inv (prueba, resultado)
      values ('el cambio de estado queda en la bitácora', 'FALLA: no se registró');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Resultados
-- -----------------------------------------------------------------------------

select n, prueba, resultado from public.resultados_pruebas_inv order by n;

rollback;
