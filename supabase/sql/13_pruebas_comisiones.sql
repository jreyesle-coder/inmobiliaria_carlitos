-- =============================================================================
-- Sprint 6 · Pruebas de comisiones
-- =============================================================================
-- Se corre completo en el SQL Editor de Supabase. Todo pasa dentro de una
-- transacción que termina en `rollback`: NO deja datos.
--
-- Como en las pruebas anteriores, la tabla de resultados es normal (no
-- temporal) y se le dan permisos, porque una tabla temporal la posee `postgres`
-- y el rol `authenticated` no podría escribir en ella.
-- =============================================================================

begin;

-- Candado: sin `12_comisiones.sql` aplicado no existe la generación de la
-- comisión y estas pruebas "pasarían" sin probar nada.
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'generar_comision'
  ) then
    raise exception
      'Falta aplicar supabase/sql/12_comisiones.sql antes de correr estas pruebas.';
  end if;
end $$;

create table public.resultados_pruebas_com (
  n serial,
  prueba text,
  resultado text
);
grant insert, select on public.resultados_pruebas_com to authenticated;
grant usage, select on sequence public.resultados_pruebas_com_n_seq to authenticated;

create or replace function public.anotar_com(p_prueba text, p_ok boolean, p_detalle text default '')
returns void
language sql
as $$
  insert into public.resultados_pruebas_com (prueba, resultado)
  values (p_prueba, case when p_ok then 'PASA' else 'FALLA: ' || p_detalle end);
$$;
grant execute on function public.anotar_com(text, boolean, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 0. Datos de trabajo
-- -----------------------------------------------------------------------------

insert into public.proyectos (id, nombre)
values ('a6000000-0000-0000-0000-000000000001', 'PROYECTO DE PRUEBA COMISIONES');

insert into public.manzanas (id, proyecto_id, codigo)
values ('a6000000-0000-0000-0000-000000000002',
        'a6000000-0000-0000-0000-000000000001', 'Q');

insert into public.solares (id, manzana_id, numero, area_m2, valor_m2, valor_total)
values
  ('a6000000-0000-0000-0000-000000000010',
   'a6000000-0000-0000-0000-000000000002', '1', 300, 2500, 750000),
  ('a6000000-0000-0000-0000-000000000011',
   'a6000000-0000-0000-0000-000000000002', '2', 100, 2500, 250000),
  ('a6000000-0000-0000-0000-000000000012',
   'a6000000-0000-0000-0000-000000000002', '3', 300, 2500, 750000),
  ('a6000000-0000-0000-0000-000000000013',
   'a6000000-0000-0000-0000-000000000002', '4', 300, 2500, 750000);

insert into public.clientes (id, nombre_completo, cedula)
values ('a6000000-0000-0000-0000-000000000020', 'Comprador De Prueba', '04009876541');

insert into public.vendedores (id, nombre_completo)
values ('a6000000-0000-0000-0000-000000000030', 'Vendedor De Comisiones');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('a6b1b1b1-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'prueba.com.vendedor@ejemplo.test', '',
   now(), now(), now(), '{}', '{}'),
  ('a6b1b1b1-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'prueba.com.admin@ejemplo.test', '',
   now(), now(), now(), '{}', '{}'),
  ('a6b1b1b1-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'prueba.com.gerencia@ejemplo.test', '',
   now(), now(), now(), '{}', '{}');

update public.perfiles set rol = 'administracion'
  where id = 'a6b1b1b1-0000-0000-0000-000000000002';
update public.perfiles set rol = 'gerencia'
  where id = 'a6b1b1b1-0000-0000-0000-000000000003';

update public.vendedores set perfil_id = 'a6b1b1b1-0000-0000-0000-000000000001'
  where id = 'a6000000-0000-0000-0000-000000000030';

-- Venta con vendedor: 750,000 = 37,500 separación + 100,000 inicial (6) + capital.
insert into public.ventas (id, solar_id, cliente_id, vendedor_id, fecha_venta,
                           precio_pactado, monto_separacion, monto_inicial,
                           cuotas_inicial, cuotas_capital)
values ('a6000000-0000-0000-0000-000000000100',
        'a6000000-0000-0000-0000-000000000010',
        'a6000000-0000-0000-0000-000000000020',
        'a6000000-0000-0000-0000-000000000030',
        '2026-01-15', 750000, 37500, 100000, 6, 1);
select public.generar_plan_pagos('a6000000-0000-0000-0000-000000000100');

-- Venta SIN vendedor: se salda completa pero no debe generar comisión.
insert into public.ventas (id, solar_id, cliente_id, vendedor_id, fecha_venta,
                           precio_pactado, monto_separacion, monto_inicial,
                           cuotas_inicial, cuotas_capital)
values ('a6000000-0000-0000-0000-000000000101',
        'a6000000-0000-0000-0000-000000000011',
        'a6000000-0000-0000-0000-000000000020',
        null,
        '2026-01-15', 250000, 0, 0, 1, 1);
select public.generar_plan_pagos('a6000000-0000-0000-0000-000000000101');

-- Venta para probar el porcentaje nuevo (se completa la inicial más adelante).
insert into public.ventas (id, solar_id, cliente_id, vendedor_id, fecha_venta,
                           precio_pactado, monto_separacion, monto_inicial,
                           cuotas_inicial, cuotas_capital)
values ('a6000000-0000-0000-0000-000000000102',
        'a6000000-0000-0000-0000-000000000012',
        'a6000000-0000-0000-0000-000000000020',
        'a6000000-0000-0000-0000-000000000030',
        '2026-01-15', 750000, 37500, 100000, 6, 1);
select public.generar_plan_pagos('a6000000-0000-0000-0000-000000000102');

-- Venta para probar que cancelar retira la comisión pendiente.
insert into public.ventas (id, solar_id, cliente_id, vendedor_id, fecha_venta,
                           precio_pactado, monto_separacion, monto_inicial,
                           cuotas_inicial, cuotas_capital)
values ('a6000000-0000-0000-0000-000000000103',
        'a6000000-0000-0000-0000-000000000013',
        'a6000000-0000-0000-0000-000000000020',
        'a6000000-0000-0000-0000-000000000030',
        '2026-01-15', 750000, 37500, 100000, 6, 1);
select public.generar_plan_pagos('a6000000-0000-0000-0000-000000000103');

-- -----------------------------------------------------------------------------
-- 1. Antes de completar la inicial no hay comisión
-- -----------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"a6b1b1b1-0000-0000-0000-000000000002","role":"authenticated"}';

do $$
begin
  -- Solo la separación: la venta pasa a `inicial`, todavía sin comisión.
  perform public.registrar_pago(
    'a6000000-0000-0000-0000-000000000100', '2026-01-15', 37500, 'efectivo');

  perform public.anotar_com(
    'pagada solo la separación, la venta no genera comisión',
    not exists (select 1 from public.comisiones
                 where venta_id = 'a6000000-0000-0000-0000-000000000100'),
    'apareció una comisión antes de tiempo');
end $$;

-- -----------------------------------------------------------------------------
-- 2. Completada la inicial, nace la comisión
-- -----------------------------------------------------------------------------

do $$
declare v_c public.comisiones%rowtype;
begin
  -- Los 100,000 de la inicial completos: la venta pasa a `capital`.
  perform public.registrar_pago(
    'a6000000-0000-0000-0000-000000000100', '2026-02-15', 100000, 'transferencia');

  select * into v_c from public.comisiones
   where venta_id = 'a6000000-0000-0000-0000-000000000100';

  perform public.anotar_com(
    'completada la inicial, se genera la comisión',
    v_c.id is not null, 'no se generó');

  perform public.anotar_com(
    'la base de la comisión es el precio pactado',
    v_c.base_calculo = 750000, coalesce(v_c.base_calculo::text, 'null'));

  perform public.anotar_com(
    'el porcentaje es el 3% de configuración',
    v_c.porcentaje = 0.0300, coalesce(v_c.porcentaje::text, 'null'));

  perform public.anotar_com(
    'el monto es 3% del precio pactado (22,500)',
    v_c.monto = 22500, coalesce(v_c.monto::text, 'null'));

  perform public.anotar_com(
    'la comisión nace pendiente y para el vendedor de la venta',
    v_c.estado = 'pendiente'
      and v_c.vendedor_id = 'a6000000-0000-0000-0000-000000000030'
      and v_c.fecha_pago is null,
    coalesce(v_c.estado::text, 'null'));
end $$;

-- -----------------------------------------------------------------------------
-- 3. No se duplica con pagos posteriores
-- -----------------------------------------------------------------------------

do $$
declare v_n integer;
begin
  -- Un abono al capital: la venta sigue en `capital`, la comisión no se repite.
  perform public.registrar_pago(
    'a6000000-0000-0000-0000-000000000100', '2026-03-15', 50000, 'efectivo');

  select count(*) into v_n from public.comisiones
   where venta_id = 'a6000000-0000-0000-0000-000000000100';

  perform public.anotar_com(
    'un pago posterior no genera una segunda comisión',
    v_n = 1, 'hay ' || v_n || ' comisiones');

  -- Llamarla de más tampoco duplica.
  perform public.generar_comision('a6000000-0000-0000-0000-000000000100');
  select count(*) into v_n from public.comisiones
   where venta_id = 'a6000000-0000-0000-0000-000000000100';
  perform public.anotar_com(
    'generar_comision es idempotente', v_n = 1, 'hay ' || v_n || ' comisiones');
end $$;

-- -----------------------------------------------------------------------------
-- 4. Sin vendedor no hay comisión
-- -----------------------------------------------------------------------------

do $$
begin
  -- Se salda la venta sin vendedor: llega a `saldado` pero no genera comisión.
  perform public.registrar_pago(
    'a6000000-0000-0000-0000-000000000101', '2026-01-15', 250000, 'efectivo');

  perform public.anotar_com(
    'una venta sin vendedor no genera comisión',
    not exists (select 1 from public.comisiones
                 where venta_id = 'a6000000-0000-0000-0000-000000000101'),
    'generó comisión sin vendedor');
end $$;

-- -----------------------------------------------------------------------------
-- 5. Marcar pagada es solo de gerencia
-- -----------------------------------------------------------------------------

-- Administración no puede.
do $$
declare v_id uuid;
begin
  select id into v_id from public.comisiones
   where venta_id = 'a6000000-0000-0000-0000-000000000100';
  begin
    perform public.marcar_comision(v_id, true);
    perform public.anotar_com('administración no marca comisiones', false, 'lo permitió');
  exception when others then
    perform public.anotar_com('administración no marca comisiones', true);
  end;
end $$;

-- El vendedor tampoco.
set local request.jwt.claims = '{"sub":"a6b1b1b1-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare v_id uuid;
begin
  select id into v_id from public.comisiones
   where venta_id = 'a6000000-0000-0000-0000-000000000100';
  begin
    perform public.marcar_comision(v_id, true);
    perform public.anotar_com('el vendedor no marca comisiones', false, 'lo permitió');
  exception when others then
    perform public.anotar_com('el vendedor no marca comisiones', true);
  end;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Gerencia marca pagada y puede revertir
-- -----------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"a6b1b1b1-0000-0000-0000-000000000003","role":"authenticated"}';
do $$
declare
  v_id uuid;
  v_c  public.comisiones%rowtype;
begin
  select id into v_id from public.comisiones
   where venta_id = 'a6000000-0000-0000-0000-000000000100';

  perform public.marcar_comision(v_id, true);
  select * into v_c from public.comisiones where id = v_id;
  perform public.anotar_com(
    'gerencia marca pagada y deja escrito cuándo y quién',
    v_c.estado = 'pagada'
      and v_c.fecha_pago = current_date
      and v_c.pagada_por = 'a6b1b1b1-0000-0000-0000-000000000003',
    coalesce(v_c.estado::text, 'null'));

  perform public.marcar_comision(v_id, false);
  select * into v_c from public.comisiones where id = v_id;
  perform public.anotar_com(
    'gerencia puede devolver la comisión a pendiente',
    v_c.estado = 'pendiente' and v_c.fecha_pago is null and v_c.pagada_por is null,
    coalesce(v_c.estado::text, 'null'));
end $$;

-- -----------------------------------------------------------------------------
-- 7. Cambiar el porcentaje desde el sistema
-- -----------------------------------------------------------------------------

-- Administración no cambia la configuración.
set local request.jwt.claims = '{"sub":"a6b1b1b1-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
begin
  begin
    perform public.establecer_configuracion('comision_porcentaje', '0.05');
    perform public.anotar_com('administración no cambia la configuración', false, 'lo permitió');
  exception when others then
    perform public.anotar_com('administración no cambia la configuración', true);
  end;
end $$;

-- Gerencia sí, con validación.
set local request.jwt.claims = '{"sub":"a6b1b1b1-0000-0000-0000-000000000003","role":"authenticated"}';
do $$
begin
  -- Rechaza un porcentaje fuera de rango.
  begin
    perform public.establecer_configuracion('comision_porcentaje', '1.5');
    perform public.anotar_com('se rechaza un porcentaje fuera de rango', false, 'lo aceptó');
  exception when others then
    perform public.anotar_com('se rechaza un porcentaje fuera de rango', true);
  end;

  -- Rechaza una clave que no es de negocio.
  begin
    perform public.establecer_configuracion('ncf_activo', 'true');
    perform public.anotar_com('se rechaza una clave no editable', false, 'lo aceptó');
  exception when others then
    perform public.anotar_com('se rechaza una clave no editable', true);
  end;

  -- Acepta el 5% y lo guarda.
  perform public.establecer_configuracion('comision_porcentaje', '0.0500');
  perform public.anotar_com(
    'gerencia cambia el porcentaje de comisión',
    (select valor from public.configuracion where clave = 'comision_porcentaje') = '0.0500',
    (select valor from public.configuracion where clave = 'comision_porcentaje'));
end $$;

-- El porcentaje nuevo aplica a la comisión que nace después.
set local request.jwt.claims = '{"sub":"a6b1b1b1-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare v_c public.comisiones%rowtype;
begin
  perform public.registrar_pago(
    'a6000000-0000-0000-0000-000000000102', '2026-01-15', 137500, 'efectivo');

  select * into v_c from public.comisiones
   where venta_id = 'a6000000-0000-0000-0000-000000000102';

  perform public.anotar_com(
    'una comisión nueva usa el porcentaje vigente (5% = 37,500)',
    v_c.porcentaje = 0.0500 and v_c.monto = 37500,
    coalesce(v_c.porcentaje::text, 'null') || ' / ' || coalesce(v_c.monto::text, 'null'));
end $$;

-- -----------------------------------------------------------------------------
-- 8. Cancelar la venta retira la comisión pendiente
-- -----------------------------------------------------------------------------

-- Administración completa la inicial: nace la comisión pendiente.
do $$
begin
  perform public.registrar_pago(
    'a6000000-0000-0000-0000-000000000103', '2026-01-15', 37500, 'efectivo');
  perform public.registrar_pago(
    'a6000000-0000-0000-0000-000000000103', '2026-02-15', 100000, 'efectivo');

  perform public.anotar_com(
    'la venta a cancelar tiene su comisión pendiente',
    exists (select 1 from public.comisiones
             where venta_id = 'a6000000-0000-0000-0000-000000000103'
               and estado = 'pendiente'), 'no se generó');
end $$;

-- Gerencia reversa los pagos (para que el neto quede en cero) y cancela.
set local request.jwt.claims = '{"sub":"a6b1b1b1-0000-0000-0000-000000000003","role":"authenticated"}';
do $$
declare r record;
begin
  for r in
    select id from public.pagos
     where venta_id = 'a6000000-0000-0000-0000-000000000103' and not es_reverso
  loop
    perform public.reversar_pago(r.id, 'prueba de cancelación');
  end loop;

  perform public.cancelar_venta('a6000000-0000-0000-0000-000000000103', 'el cliente desistió');

  perform public.anotar_com(
    'cancelar la venta retira su comisión pendiente',
    not exists (select 1 from public.comisiones
                 where venta_id = 'a6000000-0000-0000-0000-000000000103'),
    'la comisión sobrevivió a la cancelación');
end $$;

-- -----------------------------------------------------------------------------
-- 9. Lo que ve cada quien
-- -----------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"a6b1b1b1-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.comisiones
   where vendedor_id = 'a6000000-0000-0000-0000-000000000030';
  perform public.anotar_com(
    'el vendedor ve sus propias comisiones', v_n > 0, v_n::text);
end $$;

-- Un vendedor sin la venta no ve nada. Desvincularlo es de mantenimiento.
reset role;
set local request.jwt.claims = '{}';
update public.vendedores set perfil_id = null
  where id = 'a6000000-0000-0000-0000-000000000030';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a6b1b1b1-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.comisiones;
  perform public.anotar_com(
    'un vendedor sin comisiones propias no ve ninguna', v_n = 0, v_n::text);
end $$;

-- -----------------------------------------------------------------------------
-- 10. Rastro en la bitácora
-- -----------------------------------------------------------------------------

reset role;
set local request.jwt.claims = '{}';
do $$
begin
  perform public.anotar_com(
    'la comisión queda en la bitácora',
    exists (
      select 1 from public.bitacora_auditoria
      where tabla = 'comisiones' and accion = 'insert'
    ), 'no se registró');
end $$;

-- -----------------------------------------------------------------------------
-- Resultados
-- -----------------------------------------------------------------------------

select n, prueba, resultado from public.resultados_pruebas_com order by n;

rollback;
