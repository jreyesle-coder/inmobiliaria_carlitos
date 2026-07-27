-- =============================================================================
-- Sprint 9 · Endurecimiento y entrega
-- =============================================================================
-- Prueba de aceptación final, de punta a punta. NO define objetos nuevos: es la
-- red de seguridad de la entrega. Todo corre dentro de una transacción que
-- termina en `rollback`, así que NO deja datos.
--
-- Cubre las cuatro exigencias del sprint:
--   A. Cobertura de auditoría (estructural): ninguna tabla de dinero/estado se
--      queda sin su disparador de bitácora ni sin su candado de inmutabilidad.
--   B. Cálculos de dinero exactos: separación, inicial en 6 cuotas con el
--      residuo en la última, capital, sobrepago como saldo a favor, y la suma
--      de las cuotas = precio pactado al centavo (decimal, sin float).
--   C. RLS por rol (SQL, no UI): el vendedor solo ve lo suyo y no cobra ni
--      cancela; administración no reversa; gerencia sí.
--   D. Bitácora sin huecos: cada pago, recibo, comisión y cambio de estado de
--      venta dejó su rastro en `bitacora_auditoria`.
--
-- La tabla de resultados es normal (no temporal) y con permisos, porque una
-- temporal la posee `postgres` y el rol `authenticated` no podría escribir.
-- =============================================================================

begin;

-- Candado: sin los sprints previos aplicados, estas pruebas no tienen sentido.
do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'registrar_pago'
  ) or not exists (
    select 1 from pg_proc where proname = 'generar_comision'
  ) then
    raise exception
      'Aplique 01..14 (al menos hasta 12_comisiones.sql) antes de estas pruebas.';
  end if;
end $$;

create table public.resultados_endurecimiento (
  n serial,
  prueba text,
  resultado text
);
grant insert, select on public.resultados_endurecimiento to authenticated;
grant usage, select on sequence public.resultados_endurecimiento_n_seq to authenticated;

create or replace function public.anotar_end(p_prueba text, p_ok boolean, p_detalle text default '')
returns void
language sql
as $$
  insert into public.resultados_endurecimiento (prueba, resultado)
  values (p_prueba, case when p_ok then 'PASA' else 'FALLA: ' || p_detalle end);
$$;
grant execute on function public.anotar_end(text, boolean, text) to authenticated;

-- -----------------------------------------------------------------------------
-- A. Cobertura de auditoría e inmutabilidad (estructural, corre como postgres)
-- -----------------------------------------------------------------------------
-- No depende de datos: mira el catálogo. Es la garantía de que NINGUNA tabla de
-- dinero o de estado se quedó sin su disparador de bitácora.

do $$
declare
  v_esperadas text[] := array[
    'perfiles','configuracion','proyectos','manzanas','solares',
    'clientes','vendedores','ventas','cuotas','pagos','pago_aplicaciones',
    'recibos','comisiones'];
  v_faltan text;
begin
  select string_agg(t, ', ') into v_faltan
  from unnest(v_esperadas) as t
  where not exists (
    select 1 from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = t
      and tg.tgname = 'tr_auditar' and not tg.tgisinternal);

  perform public.anotar_end(
    'auditoría: las 13 tablas de dinero/estado tienen su disparador tr_auditar',
    v_faltan is null, coalesce('faltan: ' || v_faltan, ''));
end $$;

do $$
declare
  v_inmutables text[] := array['recibos','pagos','pago_aplicaciones','bitacora_auditoria'];
  v_faltan text;
begin
  select string_agg(t, ', ') into v_faltan
  from unnest(v_inmutables) as t
  where not exists (
    select 1 from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = t
      and tg.tgname = 'tr_inmutable' and not tg.tgisinternal);

  perform public.anotar_end(
    'inmutabilidad: recibos, pagos, aplicaciones y bitácora tienen candado',
    v_faltan is null, coalesce('faltan: ' || v_faltan, ''));
end $$;

-- Ninguna vista de dinero/reportes puede ser `security definer` (escalaría RLS).
do $$
declare v_malas text;
begin
  select string_agg(c.relname, ', ') into v_malas
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and c.relname in ('ventas_resumen_cobros','reporte_inventario','reporte_ventas',
                      'reporte_recaudo_mensual','reporte_cuotas_vencidas',
                      'comisiones_por_vendedor')
    and not exists (
      select 1 from unnest(coalesce(c.reloptions, array[]::text[])) o
      where o = 'security_invoker=on' or o = 'security_invoker=true');

  perform public.anotar_end(
    'reportes: toda vista de dinero es security_invoker (hereda la RLS)',
    v_malas is null, coalesce('sin security_invoker: ' || v_malas, ''));
end $$;

-- -----------------------------------------------------------------------------
-- 0. Datos de trabajo para el flujo de dinero
-- -----------------------------------------------------------------------------

insert into public.proyectos (id, nombre)
values ('a9000000-0000-0000-0000-000000000001', 'PROYECTO DE ENDURECIMIENTO');

insert into public.manzanas (id, proyecto_id, codigo)
values ('a9000000-0000-0000-0000-000000000002',
        'a9000000-0000-0000-0000-000000000001', 'Z');

-- S1 de 750,000 (flujo completo) y S2 de 250,000 (sobrepago).
insert into public.solares (id, manzana_id, numero, area_m2, valor_m2, valor_total)
values
  ('a9000000-0000-0000-0000-000000000010','a9000000-0000-0000-0000-000000000002','1',300,2500,750000),
  ('a9000000-0000-0000-0000-000000000011','a9000000-0000-0000-0000-000000000002','2',100,2500,250000);

insert into public.clientes (id, nombre_completo, cedula)
values ('a9000000-0000-0000-0000-000000000020', 'Comprador De Endurecimiento', '04009876543');

insert into public.vendedores (id, nombre_completo)
values ('a9000000-0000-0000-0000-000000000030', 'Vendedor De Endurecimiento');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('a9b1b1b1-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'prueba.end.vendedor@ejemplo.test', '',
   now(), now(), now(), '{}', '{}'),
  ('a9b1b1b1-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'prueba.end.admin@ejemplo.test', '',
   now(), now(), now(), '{}', '{}'),
  ('a9b1b1b1-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'prueba.end.gerencia@ejemplo.test', '',
   now(), now(), now(), '{}', '{}'),
  ('a9b1b1b1-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'prueba.end.vendedor2@ejemplo.test', '',
   now(), now(), now(), '{}', '{}');

update public.perfiles set rol = 'administracion' where id = 'a9b1b1b1-0000-0000-0000-000000000002';
update public.perfiles set rol = 'gerencia'       where id = 'a9b1b1b1-0000-0000-0000-000000000003';
update public.vendedores set perfil_id = 'a9b1b1b1-0000-0000-0000-000000000001'
  where id = 'a9000000-0000-0000-0000-000000000030';

-- Venta A: 750,000 con vendedor; separación 37,500, inicial 100,000 en 6 cuotas.
insert into public.ventas (id, solar_id, cliente_id, vendedor_id, fecha_venta,
                           precio_pactado, monto_separacion, monto_inicial,
                           cuotas_inicial, cuotas_capital)
values ('a9000000-0000-0000-0000-000000000100',
        'a9000000-0000-0000-0000-000000000010',
        'a9000000-0000-0000-0000-000000000020',
        'a9000000-0000-0000-0000-000000000030',
        '2026-03-10', 750000, 37500, 100000, 6, 1);
select public.generar_plan_pagos('a9000000-0000-0000-0000-000000000100');

-- Venta B: 250,000 con vendedor; una sola cuota de capital (para el sobrepago).
insert into public.ventas (id, solar_id, cliente_id, vendedor_id, fecha_venta,
                           precio_pactado, monto_separacion, monto_inicial,
                           cuotas_inicial, cuotas_capital)
values ('a9000000-0000-0000-0000-000000000101',
        'a9000000-0000-0000-0000-000000000011',
        'a9000000-0000-0000-0000-000000000020',
        'a9000000-0000-0000-0000-000000000030',
        '2026-03-10', 250000, 0, 0, 1, 1);
select public.generar_plan_pagos('a9000000-0000-0000-0000-000000000101');

-- -----------------------------------------------------------------------------
-- B. Cálculos de dinero exactos (decimal, sin float)
-- -----------------------------------------------------------------------------

-- El plan cuadra al centavo: la suma de las cuotas = precio pactado.
do $$
declare v_suma_a numeric; v_suma_b numeric;
begin
  select coalesce(sum(monto_esperado),0) into v_suma_a
    from public.cuotas where venta_id = 'a9000000-0000-0000-0000-000000000100';
  select coalesce(sum(monto_esperado),0) into v_suma_b
    from public.cuotas where venta_id = 'a9000000-0000-0000-0000-000000000101';
  perform public.anotar_end(
    'dinero: la suma de las cuotas = precio pactado (750,000 y 250,000)',
    v_suma_a = 750000 and v_suma_b = 250000,
    v_suma_a::text || ' / ' || v_suma_b::text);
end $$;

-- El residuo del redondeo va en la última cuota de la inicial: 100,000 en 6 son
-- cinco de 16,666.66 y una de 16,666.70.
do $$
declare v_cinco int; v_ultima numeric;
begin
  select count(*) into v_cinco from public.cuotas
   where venta_id = 'a9000000-0000-0000-0000-000000000100'
     and tipo = 'inicial' and monto_esperado = 16666.66;
  select max(monto_esperado) into v_ultima from public.cuotas
   where venta_id = 'a9000000-0000-0000-0000-000000000100' and tipo = 'inicial';
  perform public.anotar_end(
    'dinero: la inicial son 5 de 16,666.66 y el residuo 16,666.70 en la última',
    v_cinco = 5 and v_ultima = 16666.70,
    v_cinco::text || ' iguales / última=' || coalesce(v_ultima::text,'null'));
end $$;

-- Administración cobra separación → inicial → capital → saldado, y cada paso
-- mueve el estado y el balance de forma verificable.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9b1b1b1-0000-0000-0000-000000000002","role":"authenticated"}';

do $$
declare v_estado public.estado_venta; v_bal numeric; v_favor numeric;
begin
  -- Separación.
  perform public.registrar_pago(
    'a9000000-0000-0000-0000-000000000100', '2026-03-11', 37500, 'efectivo');
  select estado into v_estado from public.ventas where id = 'a9000000-0000-0000-0000-000000000100';
  select balance_pendiente into v_bal from public.ventas_resumen_cobros
   where venta_id = 'a9000000-0000-0000-0000-000000000100';
  perform public.anotar_end(
    'dinero: pagada la separación la venta pasa a inicial y balance = 712,500',
    v_estado = 'inicial' and v_bal = 712500,
    v_estado::text || ' / ' || v_bal::text);

  -- Inicial completa.
  perform public.registrar_pago(
    'a9000000-0000-0000-0000-000000000100', '2026-03-12', 100000, 'transferencia');
  select estado into v_estado from public.ventas where id = 'a9000000-0000-0000-0000-000000000100';
  select balance_pendiente into v_bal from public.ventas_resumen_cobros
   where venta_id = 'a9000000-0000-0000-0000-000000000100';
  perform public.anotar_end(
    'dinero: pagada la inicial la venta pasa a capital y balance = 612,500',
    v_estado = 'capital' and v_bal = 612500,
    v_estado::text || ' / ' || v_bal::text);

  -- Capital (el balance completo).
  perform public.registrar_pago(
    'a9000000-0000-0000-0000-000000000100', '2026-03-13', 612500, 'transferencia');
  select estado into v_estado from public.ventas where id = 'a9000000-0000-0000-0000-000000000100';
  select balance_pendiente, saldo_a_favor into v_bal, v_favor
    from public.ventas_resumen_cobros
   where venta_id = 'a9000000-0000-0000-0000-000000000100';
  perform public.anotar_end(
    'dinero: pagado todo la venta queda saldada, balance 0 y sin saldo a favor',
    v_estado = 'saldado' and v_bal = 0 and v_favor = 0,
    v_estado::text || ' / bal=' || v_bal::text || ' / favor=' || v_favor::text);
end $$;

-- El solar de una venta saldada queda saldado.
do $$
declare v_solar public.estado_solar;
begin
  select estado into v_solar from public.solares
   where id = 'a9000000-0000-0000-0000-000000000010';
  perform public.anotar_end(
    'dinero: el solar sigue a la venta hasta saldado',
    v_solar = 'saldado', coalesce(v_solar::text,'null'));
end $$;

-- Sobrepago (venta B): una cuota nunca recibe de más; lo que sobra es saldo a
-- favor, y el dinero no se pierde (recibido = aplicado + saldo a favor).
do $$
declare v_recibido numeric; v_aplicado numeric; v_favor numeric; v_bal numeric;
begin
  perform public.registrar_pago(
    'a9000000-0000-0000-0000-000000000101', '2026-03-14', 300000, 'efectivo');
  select total_recibido, total_aplicado, saldo_a_favor, balance_pendiente
    into v_recibido, v_aplicado, v_favor, v_bal
    from public.ventas_resumen_cobros
   where venta_id = 'a9000000-0000-0000-0000-000000000101';
  perform public.anotar_end(
    'dinero: sobrepago 300,000 sobre 250,000 deja 50,000 de saldo a favor, balance 0',
    v_recibido = 300000 and v_aplicado = 250000 and v_favor = 50000 and v_bal = 0,
    'rec=' || v_recibido::text || ' apl=' || v_aplicado::text
      || ' favor=' || v_favor::text || ' bal=' || v_bal::text);
end $$;

-- La comisión nació sola al llegar la venta A a capital: 3% de 750,000 = 22,500.
do $$
declare v_monto numeric; v_estado text; v_n int;
begin
  select monto, estado into v_monto, v_estado from public.comisiones
   where venta_id = 'a9000000-0000-0000-0000-000000000100';
  select count(*) into v_n from public.comisiones
   where venta_id = 'a9000000-0000-0000-0000-000000000100';
  perform public.anotar_end(
    'comisión: nace pendiente y única, 3% de 750,000 = 22,500',
    v_monto = 22500 and v_estado = 'pendiente' and v_n = 1,
    coalesce(v_monto::text,'null') || ' / ' || coalesce(v_estado,'null') || ' / n=' || v_n::text);
end $$;

-- -----------------------------------------------------------------------------
-- C. RLS por rol (SQL, no UI)
-- -----------------------------------------------------------------------------

-- El vendedor ve su venta, su recibo, su pago y su comisión.
set local request.jwt.claims = '{"sub":"a9b1b1b1-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare v_ventas int; v_pagos int; v_recibos int; v_com int;
begin
  select count(*) into v_ventas  from public.ventas   where id = 'a9000000-0000-0000-0000-000000000100';
  select count(*) into v_pagos   from public.pagos    where venta_id = 'a9000000-0000-0000-0000-000000000100';
  select count(*) into v_recibos from public.recibos  where venta_id = 'a9000000-0000-0000-0000-000000000100';
  select count(*) into v_com     from public.comisiones where venta_id = 'a9000000-0000-0000-0000-000000000100';
  perform public.anotar_end(
    'rls: el vendedor ve su venta, sus 3 pagos, sus 3 recibos y su comisión',
    v_ventas = 1 and v_pagos = 3 and v_recibos = 3 and v_com = 1,
    'v=' || v_ventas::text || ' p=' || v_pagos::text
      || ' r=' || v_recibos::text || ' c=' || v_com::text);
end $$;

-- El vendedor no puede cobrar.
do $$
declare v_ok boolean := false;
begin
  begin
    perform public.registrar_pago(
      'a9000000-0000-0000-0000-000000000101', '2026-03-15', 1000, 'efectivo');
  exception when others then v_ok := true;
  end;
  perform public.anotar_end('rls: el vendedor NO puede registrar un pago', v_ok, 'no lanzó error');
end $$;

-- El vendedor no puede cancelar una venta.
do $$
declare v_ok boolean := false;
begin
  begin
    perform public.cancelar_venta('a9000000-0000-0000-0000-000000000101', 'intento vendedor');
  exception when others then v_ok := true;
  end;
  perform public.anotar_end('rls: el vendedor NO puede cancelar una venta', v_ok, 'no lanzó error');
end $$;

-- El vendedor no lee la bitácora.
do $$
declare v_n int;
begin
  select count(*) into v_n from public.bitacora_auditoria;
  perform public.anotar_end('rls: el vendedor NO lee la bitácora', v_n = 0, 'vio ' || v_n::text || ' filas');
end $$;

-- Un segundo vendedor, sin ventas propias, no ve nada.
set local request.jwt.claims = '{"sub":"a9b1b1b1-0000-0000-0000-000000000004","role":"authenticated"}';
do $$
declare v_ventas int; v_pagos int;
begin
  select count(*) into v_ventas from public.ventas;
  select count(*) into v_pagos  from public.pagos;
  perform public.anotar_end(
    'rls: un vendedor sin ventas propias no ve ventas ni pagos',
    v_ventas = 0 and v_pagos = 0, 'v=' || v_ventas::text || ' p=' || v_pagos::text);
end $$;

-- Administración no puede reversar un pago (es de gerencia).
set local request.jwt.claims = '{"sub":"a9b1b1b1-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare v_pago uuid; v_ok boolean := false;
begin
  select id into v_pago from public.pagos
   where venta_id = 'a9000000-0000-0000-0000-000000000101' and not es_reverso limit 1;
  begin
    perform public.reversar_pago(v_pago, 'intento admin');
  exception when others then v_ok := true;
  end;
  perform public.anotar_end('rls: administración NO puede reversar un pago', v_ok, 'no lanzó error');
end $$;

-- Gerencia sí reversa: devuelve la cuota, baja lo recibido y emite nota de crédito.
set local request.jwt.claims = '{"sub":"a9b1b1b1-0000-0000-0000-000000000003","role":"authenticated"}';
do $$
declare v_pago uuid; v_recibido numeric; v_aplicado numeric; v_notas int;
begin
  select id into v_pago from public.pagos
   where venta_id = 'a9000000-0000-0000-0000-000000000101' and not es_reverso limit 1;
  perform public.reversar_pago(v_pago, 'prueba de endurecimiento');

  select total_recibido, total_aplicado into v_recibido, v_aplicado
    from public.ventas_resumen_cobros
   where venta_id = 'a9000000-0000-0000-0000-000000000101';
  select count(*) into v_notas from public.recibos
   where venta_id = 'a9000000-0000-0000-0000-000000000101' and tipo = 'nota_credito';

  perform public.anotar_end(
    'rls: gerencia reversa; recibido y aplicado vuelven a 0 y hay nota de crédito',
    v_recibido = 0 and v_aplicado = 0 and v_notas = 1,
    'rec=' || v_recibido::text || ' apl=' || v_aplicado::text || ' notas=' || v_notas::text);
end $$;

-- Un recibo no se puede editar ni borrar, ni siquiera por gerencia.
do $$
declare v_ok_upd boolean := false; v_ok_del boolean := false; v_id uuid;
begin
  select id into v_id from public.recibos
   where venta_id = 'a9000000-0000-0000-0000-000000000100' limit 1;
  begin
    update public.recibos set numero = numero where id = v_id;
  exception when others then v_ok_upd := true;
  end;
  begin
    delete from public.recibos where id = v_id;
  exception when others then v_ok_del := true;
  end;
  perform public.anotar_end(
    'inmutabilidad: un recibo no admite UPDATE ni DELETE (ni gerencia)',
    v_ok_upd and v_ok_del,
    'upd=' || v_ok_upd::text || ' del=' || v_ok_del::text);
end $$;

-- -----------------------------------------------------------------------------
-- D. Bitácora sin huecos (corre como postgres para ver toda la tabla)
-- -----------------------------------------------------------------------------
-- Cada pago, recibo y comisión que creamos dejó su fila de auditoría, y el
-- cambio de estado de la venta (separado→…→saldado) quedó como UPDATE.

reset role;
set local request.jwt.claims = '{}';

do $$
declare v_pagos int; v_auditados int;
begin
  select count(*) into v_pagos from public.pagos
   where venta_id in ('a9000000-0000-0000-0000-000000000100',
                      'a9000000-0000-0000-0000-000000000101');
  select count(distinct registro_id) into v_auditados from public.bitacora_auditoria
   where tabla = 'pagos' and accion = 'insert'
     and registro_id in (select id::text from public.pagos
       where venta_id in ('a9000000-0000-0000-0000-000000000100',
                          'a9000000-0000-0000-0000-000000000101'));
  perform public.anotar_end(
    'bitácora: cada pago (incluido el reverso) tiene su fila de auditoría',
    v_pagos > 0 and v_pagos = v_auditados,
    'pagos=' || v_pagos::text || ' auditados=' || v_auditados::text);
end $$;

do $$
declare v_recibos int; v_auditados int;
begin
  select count(*) into v_recibos from public.recibos
   where venta_id in ('a9000000-0000-0000-0000-000000000100',
                      'a9000000-0000-0000-0000-000000000101');
  select count(distinct registro_id) into v_auditados from public.bitacora_auditoria
   where tabla = 'recibos' and accion = 'insert'
     and registro_id in (select id::text from public.recibos
       where venta_id in ('a9000000-0000-0000-0000-000000000100',
                          'a9000000-0000-0000-0000-000000000101'));
  perform public.anotar_end(
    'bitácora: cada recibo (incluida la nota de crédito) tiene su fila',
    v_recibos > 0 and v_recibos = v_auditados,
    'recibos=' || v_recibos::text || ' auditados=' || v_auditados::text);
end $$;

do $$
declare v_com int; v_auditados int;
begin
  select count(*) into v_com from public.comisiones
   where venta_id = 'a9000000-0000-0000-0000-000000000100';
  select count(distinct registro_id) into v_auditados from public.bitacora_auditoria
   where tabla = 'comisiones' and accion = 'insert'
     and registro_id in (select id::text from public.comisiones
       where venta_id = 'a9000000-0000-0000-0000-000000000100');
  perform public.anotar_end(
    'bitácora: la comisión generada tiene su fila de auditoría',
    v_com > 0 and v_com = v_auditados,
    'com=' || v_com::text || ' auditados=' || v_auditados::text);
end $$;

do $$
declare v_cambios int;
begin
  -- La venta A cambió de estado 3 veces (separado→inicial→capital→saldado):
  -- cada avance quedó como UPDATE en la bitácora.
  select count(*) into v_cambios from public.bitacora_auditoria
   where tabla = 'ventas' and accion = 'update'
     and registro_id = 'a9000000-0000-0000-0000-000000000100'
     and (datos_antes ->> 'estado') is distinct from (datos_despues ->> 'estado');
  perform public.anotar_end(
    'bitácora: los 3 cambios de estado de la venta quedaron registrados',
    v_cambios >= 3, v_cambios::text || ' cambios de estado');
end $$;

-- -----------------------------------------------------------------------------
-- Resultados
-- -----------------------------------------------------------------------------

select
  count(*) filter (where resultado = 'PASA') as pasa,
  count(*) as total,
  case when count(*) filter (where resultado <> 'PASA') = 0
       then 'TODAS PASAN' else 'HAY FALLAS' end as veredicto
from public.resultados_endurecimiento;

select n, prueba, resultado from public.resultados_endurecimiento order by n;

rollback;
