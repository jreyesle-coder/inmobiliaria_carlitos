-- =============================================================================
-- Sprint 3 · Pruebas de clientes y vendedores
-- =============================================================================
-- Se corre completo en el SQL Editor de Supabase. Todo pasa dentro de una
-- transacción que termina en `rollback`: NO deja datos.
--
-- Como en las pruebas anteriores, la tabla de resultados es normal (no
-- temporal) y se le dan permisos, porque una tabla temporal la posee `postgres`
-- y el rol `authenticated` no podría escribir en ella.
-- =============================================================================

begin;

create table public.resultados_pruebas_per (
  n serial,
  prueba text,
  resultado text
);
grant insert, select on public.resultados_pruebas_per to authenticated;
grant usage, select on sequence public.resultados_pruebas_per_n_seq to authenticated;

-- Inventario mínimo para poder crear una venta más adelante.
insert into public.proyectos (id, nombre)
values ('11111111-0000-0000-0000-000000000001', 'PROYECTO DE PRUEBA PERSONAS');

insert into public.manzanas (id, proyecto_id, codigo)
values ('22222222-0000-0000-0000-000000000001',
        '11111111-0000-0000-0000-000000000001', 'Z');

insert into public.solares (id, manzana_id, numero, area_m2, valor_m2, valor_total)
values ('33333333-0000-0000-0000-000000000001',
        '22222222-0000-0000-0000-000000000001', '1', 300, 2500, 750000);

-- -----------------------------------------------------------------------------
-- 1. Normalización de la cédula y campo derivado `cedula_pendiente`
-- -----------------------------------------------------------------------------

do $$
declare v_cedula text; v_pendiente boolean;
begin
  -- Se escribe con guiones; se debe guardar con 11 dígitos limpios.
  insert into public.clientes (id, nombre_completo, cedula)
  values ('c1000000-0000-0000-0000-000000000001', '  Juan Pérez  ', '031-0123456-9');

  select cedula, cedula_pendiente into v_cedula, v_pendiente
  from public.clientes where id = 'c1000000-0000-0000-0000-000000000001';

  if v_cedula = '03101234569' and v_pendiente = false then
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('la cédula se guarda normalizada y sale de pendiente', 'PASA');
  else
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('la cédula se guarda normalizada y sale de pendiente',
              'FALLA: cedula=' || coalesce(v_cedula, 'null') || ' pendiente=' || v_pendiente);
  end if;

  -- Cliente sin cédula: queda pendiente sin que nadie lo marque.
  insert into public.clientes (id, nombre_completo)
  values ('c1000000-0000-0000-0000-000000000002', 'María Sin Cédula');

  select cedula_pendiente into v_pendiente
  from public.clientes where id = 'c1000000-0000-0000-0000-000000000002';

  if v_pendiente then
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('un cliente sin cédula queda pendiente', 'PASA');
  else
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('un cliente sin cédula queda pendiente', 'FALLA: no quedó pendiente');
  end if;

  -- Cargar la cédula después es lo que hace la bandeja de pendientes.
  update public.clientes set cedula = '00114725377'
    where id = 'c1000000-0000-0000-0000-000000000002';

  select cedula_pendiente into v_pendiente
  from public.clientes where id = 'c1000000-0000-0000-0000-000000000002';

  if not v_pendiente then
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('cargar la cédula quita el pendiente', 'PASA');
  else
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('cargar la cédula quita el pendiente', 'FALLA: siguió pendiente');
  end if;

  -- Intentar mentir sobre el campo derivado no sirve: lo pone el trigger.
  update public.clientes set cedula_pendiente = true
    where id = 'c1000000-0000-0000-0000-000000000002';

  select cedula_pendiente into v_pendiente
  from public.clientes where id = 'c1000000-0000-0000-0000-000000000002';

  if not v_pendiente then
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('`cedula_pendiente` no se puede desincronizar a mano', 'PASA');
  else
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('`cedula_pendiente` no se puede desincronizar a mano', 'FALLA: lo permitió');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Unicidad y formato de la cédula
-- -----------------------------------------------------------------------------

do $$
begin
  -- La misma cédula escrita distinto sigue siendo la misma cédula.
  begin
    insert into public.clientes (nombre_completo, cedula)
    values ('Otro Juan', '03101234569');
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('no se repite la cédula entre clientes', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('no se repite la cédula entre clientes', 'PASA');
  end;

  begin
    insert into public.clientes (nombre_completo, cedula)
    values ('Cédula Corta', '0310123');
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('una cédula que no tenga 11 dígitos se rechaza', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('una cédula que no tenga 11 dígitos se rechaza', 'PASA');
  end;

  begin
    insert into public.clientes (nombre_completo) values ('   ');
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('un cliente sin nombre se rechaza', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('un cliente sin nombre se rechaza', 'PASA');
  end;

  -- Varios pendientes a la vez sí se permiten: el único es parcial.
  begin
    insert into public.clientes (nombre_completo) values ('Pendiente Uno');
    insert into public.clientes (nombre_completo) values ('Pendiente Dos');
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('varios clientes pueden estar pendientes a la vez', 'PASA');
  exception when others then
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('varios clientes pueden estar pendientes a la vez', 'FALLA: ' || sqlerrm);
  end;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Un cliente o un vendedor con historia no se borra
-- -----------------------------------------------------------------------------

insert into public.vendedores (id, nombre_completo, cedula)
values ('d1000000-0000-0000-0000-000000000001', 'Vendedor Con Venta', '402-1234567-8');

insert into public.ventas (id, solar_id, cliente_id, vendedor_id, fecha_venta, precio_pactado)
values ('e1000000-0000-0000-0000-000000000001',
        '33333333-0000-0000-0000-000000000001',
        'c1000000-0000-0000-0000-000000000001',
        'd1000000-0000-0000-0000-000000000001',
        current_date, 750000);

do $$
begin
  begin
    delete from public.clientes where id = 'c1000000-0000-0000-0000-000000000001';
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('un cliente con ventas no se borra', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('un cliente con ventas no se borra', 'PASA');
  end;

  begin
    delete from public.vendedores where id = 'd1000000-0000-0000-0000-000000000001';
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('un vendedor con ventas no se borra', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('un vendedor con ventas no se borra', 'PASA');
  end;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Permisos por rol (RLS)
-- -----------------------------------------------------------------------------
-- Los usuarios se crean al vuelo en `auth.users`, como en las pruebas
-- anteriores: el trigger `tr_crear_perfil` les arma el perfil como `vendedor` y
-- el `rollback` del final los borra.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('b1b1b1b1-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'prueba.per.vendedor1@ejemplo.test', '',
   now(), now(), now(), '{}', '{}'),
  ('b1b1b1b1-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'prueba.per.vendedor2@ejemplo.test', '',
   now(), now(), now(), '{}', '{}'),
  ('b1b1b1b1-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'prueba.per.gerencia@ejemplo.test', '',
   now(), now(), now(), '{}', '{}');

update public.perfiles set rol = 'gerencia'
  where id = 'b1b1b1b1-0000-0000-0000-000000000003';

-- --- Como vendedor 1 --------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"b1b1b1b1-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
begin
  -- Registra a su cliente: un vendedor necesita poder hacerlo.
  begin
    insert into public.clientes (id, nombre_completo, creado_por)
    values ('c1000000-0000-0000-0000-000000000010', 'Cliente Del Vendedor 1',
            'b1b1b1b1-0000-0000-0000-000000000001');
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('el vendedor registra clientes', 'PASA');
  exception when others then
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('el vendedor registra clientes', 'FALLA: ' || sqlerrm);
  end;

  -- Y completa la cédula del que él registró.
  begin
    update public.clientes set cedula = '00113578645'
      where id = 'c1000000-0000-0000-0000-000000000010';
    if found then
      insert into public.resultados_pruebas_per (prueba, resultado)
        values ('el vendedor completa la cédula de su cliente', 'PASA');
    else
      insert into public.resultados_pruebas_per (prueba, resultado)
        values ('el vendedor completa la cédula de su cliente', 'FALLA: no actualizó');
    end if;
  exception when others then
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('el vendedor completa la cédula de su cliente', 'FALLA: ' || sqlerrm);
  end;

  -- Ve a todos los clientes (necesita saber si el cliente ya existe)…
  if (select count(*) from public.clientes) > 1 then
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('el vendedor ve la cartera completa de clientes', 'PASA');
  else
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('el vendedor ve la cartera completa de clientes', 'FALLA: no los ve');
  end if;

  -- …pero no corrige el de otro.
  begin
    update public.clientes set nombre_completo = 'Nombre Cambiado'
      where id = 'c1000000-0000-0000-0000-000000000002';
    if found then
      insert into public.resultados_pruebas_per (prueba, resultado)
        values ('el vendedor no corrige clientes ajenos', 'FALLA: lo permitió');
    else
      insert into public.resultados_pruebas_per (prueba, resultado)
        values ('el vendedor no corrige clientes ajenos', 'PASA');
    end if;
  exception when others then
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('el vendedor no corrige clientes ajenos', 'PASA');
  end;

  -- Ni borra clientes.
  begin
    delete from public.clientes where id = 'c1000000-0000-0000-0000-000000000010';
    if found then
      insert into public.resultados_pruebas_per (prueba, resultado)
        values ('el vendedor no borra clientes', 'FALLA: lo permitió');
    else
      insert into public.resultados_pruebas_per (prueba, resultado)
        values ('el vendedor no borra clientes', 'PASA');
    end if;
  exception when others then
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('el vendedor no borra clientes', 'PASA');
  end;

  -- Ni se da de alta a sí mismo como vendedor: eso es de gerencia.
  begin
    insert into public.vendedores (nombre_completo, perfil_id)
    values ('Yo Mismo', 'b1b1b1b1-0000-0000-0000-000000000001');
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('el vendedor no crea vendedores', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('el vendedor no crea vendedores', 'PASA');
  end;

  begin
    update public.vendedores set perfil_id = 'b1b1b1b1-0000-0000-0000-000000000001'
      where id = 'd1000000-0000-0000-0000-000000000001';
    if found then
      insert into public.resultados_pruebas_per (prueba, resultado)
        values ('el vendedor no se vincula a sí mismo con un vendedor', 'FALLA: lo permitió');
    else
      insert into public.resultados_pruebas_per (prueba, resultado)
        values ('el vendedor no se vincula a sí mismo con un vendedor', 'PASA');
    end if;
  exception when others then
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('el vendedor no se vincula a sí mismo con un vendedor', 'PASA');
  end;
end $$;

-- --- Como gerencia ----------------------------------------------------------
-- El contrapeso: si nadie pudiera escribir, las pruebas de arriba pasarían
-- igual y no probarían nada.
set local request.jwt.claims = '{"sub":"b1b1b1b1-0000-0000-0000-000000000003","role":"authenticated"}';

do $$
begin
  begin
    insert into public.vendedores (id, nombre_completo, perfil_id)
    values ('d1000000-0000-0000-0000-000000000002', 'Vendedor Vinculado',
            'b1b1b1b1-0000-0000-0000-000000000002');
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('gerencia sí crea y vincula vendedores', 'PASA');
  exception when others then
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('gerencia sí crea y vincula vendedores', 'FALLA: ' || sqlerrm);
  end;

  begin
    update public.clientes set nombre_completo = 'María Corregida Por Gerencia'
      where id = 'c1000000-0000-0000-0000-000000000002';
    if found then
      insert into public.resultados_pruebas_per (prueba, resultado)
        values ('gerencia sí corrige cualquier cliente', 'PASA');
    else
      insert into public.resultados_pruebas_per (prueba, resultado)
        values ('gerencia sí corrige cualquier cliente', 'FALLA: no actualizó');
    end if;
  exception when others then
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('gerencia sí corrige cualquier cliente', 'FALLA: ' || sqlerrm);
  end;
end $$;

-- --- El vendedor vinculado solo ve lo suyo ----------------------------------
-- `mi_vendedor_id()` es lo que separa "mis ventas" del resto; se comprueba aquí
-- porque el vínculo se acaba de crear en esta misma prueba.
set local request.jwt.claims = '{"sub":"b1b1b1b1-0000-0000-0000-000000000002","role":"authenticated"}';

do $$
begin
  if public.mi_vendedor_id() = 'd1000000-0000-0000-0000-000000000002' then
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('el usuario vinculado se reconoce como su vendedor', 'PASA');
  else
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('el usuario vinculado se reconoce como su vendedor',
              'FALLA: ' || coalesce(public.mi_vendedor_id()::text, 'null'));
  end if;

  -- La venta de arriba es del otro vendedor: no debe verla.
  if not exists (select 1 from public.ventas) then
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('el vendedor vinculado no ve ventas ajenas', 'PASA');
  else
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('el vendedor vinculado no ve ventas ajenas', 'FALLA: las ve');
  end if;
end $$;

reset role;
set local request.jwt.claims = '{}';

-- -----------------------------------------------------------------------------
-- 5. Auditoría
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from public.bitacora_auditoria
    where tabla = 'clientes'
      and registro_id = 'c1000000-0000-0000-0000-000000000002'
      and accion = 'update'
      and datos_antes ->> 'cedula' is null
      and datos_despues ->> 'cedula' = '00114725377'
  ) then
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('la carga de la cédula queda en la bitácora', 'PASA');
  else
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('la carga de la cédula queda en la bitácora', 'FALLA: no se registró');
  end if;

  if exists (
    select 1 from public.bitacora_auditoria
    where tabla = 'vendedores'
      and registro_id = 'd1000000-0000-0000-0000-000000000002'
      and accion = 'insert'
      and usuario_correo = 'prueba.per.gerencia@ejemplo.test'
  ) then
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('el alta del vendedor queda en la bitácora con su autor', 'PASA');
  else
    insert into public.resultados_pruebas_per (prueba, resultado)
      values ('el alta del vendedor queda en la bitácora con su autor', 'FALLA: no se registró');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Resultados
-- -----------------------------------------------------------------------------

select n, prueba, resultado from public.resultados_pruebas_per order by n;

rollback;
