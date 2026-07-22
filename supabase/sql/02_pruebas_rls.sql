-- =============================================================================
-- Sprint 1 · Pruebas de RLS por SQL (no por la interfaz)
-- =============================================================================
-- Se ejecuta completo en el SQL Editor de Supabase. Al final imprime una tabla
-- de resultados y deshace TODO con un rollback: no deja datos de prueba.
--
-- Qué comprueba:
--   1. Un vendedor solo ve sus ventas.
--   2. Un vendedor no puede crear ni modificar ventas.
--   3. Nadie puede modificar ni borrar un recibo.
--   4. Solo gerencia lee la bitácora.
--   5. La bitácora registra los cambios.
-- =============================================================================

begin;

create temp table resultados (prueba text, esperado text, obtenido text, ok boolean)
  on commit drop;

-- --- Datos de prueba (como dueño, sin RLS) ----------------------------------
-- Se usan usuarios de auth reales creados al vuelo; el trigger crea sus perfiles.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'prueba.vendedor1@ejemplo.test', '', now(), now(), now(), '{}', '{}'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'prueba.vendedor2@ejemplo.test', '', now(), now(), now(), '{}', '{}'),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'prueba.gerencia@ejemplo.test', '', now(), now(), now(), '{}', '{}');

update public.perfiles set rol = 'gerencia'
  where id = '33333333-3333-3333-3333-333333333333';

insert into public.vendedores (id, nombre_completo, perfil_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Vendedor Uno',  '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Vendedor Dos',  '22222222-2222-2222-2222-222222222222');

insert into public.proyectos (id, nombre) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'PROYECTO DE PRUEBA');
insert into public.manzanas (id, proyecto_id, codigo) values
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'X');
insert into public.solares (id, manzana_id, numero, area_m2, valor_m2, valor_total) values
  ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', '1', 300, 2500, 750000),
  ('dddddddd-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', '2', 300, 2500, 750000);
insert into public.clientes (id, nombre_completo) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'Cliente de Prueba');

insert into public.ventas (id, solar_id, cliente_id, vendedor_id, fecha_venta, precio_pactado) values
  ('ffffffff-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
   'eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', current_date, 750000),
  ('ffffffff-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002',
   'eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', current_date, 750000);

insert into public.pagos (id, venta_id, fecha_pago, monto, metodo) values
  ('99999999-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001',
   current_date, 50000, 'efectivo');
insert into public.recibos (id, venta_id, cliente_id, pago_id, monto, concepto) values
  ('88888888-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001',
   'eeeeeeee-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001',
   50000, 'Separación');

-- --- Prueba 1: el vendedor 1 solo ve su venta -------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into resultados
select 'Vendedor ve solo sus ventas', '1', count(*)::text, count(*) = 1
from public.ventas;

insert into resultados
select 'Vendedor no ve el recibo ajeno', '1', count(*)::text, count(*) = 1
from public.recibos;

-- --- Prueba 2: el vendedor no puede crear ni modificar ventas ---------------
do $$
begin
  begin
    update public.ventas set precio_pactado = 1
      where id = 'ffffffff-0000-0000-0000-000000000001';
    if found then
      insert into resultados values ('Vendedor NO modifica ventas', 'bloqueado', 'modificó', false);
    else
      insert into resultados values ('Vendedor NO modifica ventas', 'bloqueado', 'bloqueado', true);
    end if;
  exception when others then
    insert into resultados values ('Vendedor NO modifica ventas', 'bloqueado', 'bloqueado', true);
  end;

  begin
    insert into public.ventas (solar_id, cliente_id, vendedor_id, fecha_venta, precio_pactado)
    values ('dddddddd-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001',
            'aaaaaaaa-0000-0000-0000-000000000001', current_date, 1);
    insert into resultados values ('Vendedor NO crea ventas', 'bloqueado', 'creó', false);
  exception when others then
    insert into resultados values ('Vendedor NO crea ventas', 'bloqueado', 'bloqueado', true);
  end;

  begin
    perform 1 from public.bitacora_auditoria;
    insert into resultados
    select 'Vendedor NO lee la bitácora', '0', count(*)::text, count(*) = 0
    from public.bitacora_auditoria;
  exception when others then
    insert into resultados values ('Vendedor NO lee la bitácora', '0', 'bloqueado', true);
  end;
end $$;

-- --- Prueba 3: gerencia ve todo y no puede tocar recibos --------------------
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

insert into resultados
select 'Gerencia ve todas las ventas', '2', count(*)::text, count(*) = 2
from public.ventas;

insert into resultados
select 'Gerencia lee la bitácora', '>0', count(*)::text, count(*) > 0
from public.bitacora_auditoria;

do $$
begin
  begin
    update public.recibos set monto = 1 where id = '88888888-0000-0000-0000-000000000001';
    insert into resultados values ('Recibo inmutable (UPDATE)', 'bloqueado', 'modificó', false);
  exception when others then
    insert into resultados values ('Recibo inmutable (UPDATE)', 'bloqueado', 'bloqueado', true);
  end;

  begin
    delete from public.recibos where id = '88888888-0000-0000-0000-000000000001';
    insert into resultados values ('Recibo inmutable (DELETE)', 'bloqueado', 'borró', false);
  exception when others then
    insert into resultados values ('Recibo inmutable (DELETE)', 'bloqueado', 'bloqueado', true);
  end;

  begin
    delete from public.bitacora_auditoria;
    insert into resultados values ('Bitácora no se borra', 'bloqueado', 'borró', false);
  exception when others then
    insert into resultados values ('Bitácora no se borra', 'bloqueado', 'bloqueado', true);
  end;
end $$;

-- --- Prueba 4: la bitácora registró el movimiento de dinero ----------------
insert into resultados
select 'Bitácora registró el pago', '1', count(*)::text, count(*) = 1
from public.bitacora_auditoria
where tabla = 'pagos' and registro_id = '99999999-0000-0000-0000-000000000001';

reset role;

select prueba, esperado, obtenido,
       case when ok then 'PASA' else 'FALLA' end as resultado
from resultados
order by ok, prueba;

rollback;
