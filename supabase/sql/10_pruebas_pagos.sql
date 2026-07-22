-- =============================================================================
-- Sprint 5 · Pruebas de pagos, aplicaciones, recibos y reversos
-- =============================================================================
-- Se corre completo en el SQL Editor de Supabase. Todo pasa dentro de una
-- transacción que termina en `rollback`: NO deja datos.
--
-- Como en las pruebas anteriores, la tabla de resultados es normal (no
-- temporal) y se le dan permisos, porque una tabla temporal la posee `postgres`
-- y el rol `authenticated` no podría escribir en ella.
-- =============================================================================

begin;

-- Candado: sin `09_pagos.sql` aplicado no existe la puerta de entrada del
-- dinero y la mitad de estas pruebas "pasaría" sin probar nada.
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'registrar_pago'
  ) then
    raise exception
      'Falta aplicar supabase/sql/09_pagos.sql antes de correr estas pruebas.';
  end if;
end $$;

create table public.resultados_pruebas_pag (
  n serial,
  prueba text,
  resultado text
);
grant insert, select on public.resultados_pruebas_pag to authenticated;
grant usage, select on sequence public.resultados_pruebas_pag_n_seq to authenticated;

create or replace function public.anotar_pag(p_prueba text, p_ok boolean, p_detalle text default '')
returns void
language sql
as $$
  insert into public.resultados_pruebas_pag (prueba, resultado)
  values (p_prueba, case when p_ok then 'PASA' else 'FALLA: ' || p_detalle end);
$$;
grant execute on function public.anotar_pag(text, boolean, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 0. Datos de trabajo
-- -----------------------------------------------------------------------------

insert into public.proyectos (id, nombre)
values ('a5000000-0000-0000-0000-000000000001', 'PROYECTO DE PRUEBA PAGOS');

insert into public.manzanas (id, proyecto_id, codigo)
values ('a5000000-0000-0000-0000-000000000002',
        'a5000000-0000-0000-0000-000000000001', 'P');

insert into public.solares (id, manzana_id, numero, area_m2, valor_m2, valor_total)
values
  ('a5000000-0000-0000-0000-000000000010',
   'a5000000-0000-0000-0000-000000000002', '1', 300, 2500, 750000),
  ('a5000000-0000-0000-0000-000000000011',
   'a5000000-0000-0000-0000-000000000002', '2', 300, 2500, 750000),
  ('a5000000-0000-0000-0000-000000000012',
   'a5000000-0000-0000-0000-000000000002', '3', 100, 2500, 250000);

insert into public.clientes (id, nombre_completo, cedula)
values ('a5000000-0000-0000-0000-000000000020', 'Pagador De Prueba', '04001234561');

insert into public.vendedores (id, nombre_completo)
values ('a5000000-0000-0000-0000-000000000030', 'Vendedor De Pagos');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('a5b1b1b1-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'prueba.pag.vendedor@ejemplo.test', '',
   now(), now(), now(), '{}', '{}'),
  ('a5b1b1b1-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'prueba.pag.admin@ejemplo.test', '',
   now(), now(), now(), '{}', '{}'),
  ('a5b1b1b1-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'prueba.pag.gerencia@ejemplo.test', '',
   now(), now(), now(), '{}', '{}');

update public.perfiles set rol = 'administracion'
  where id = 'a5b1b1b1-0000-0000-0000-000000000002';
update public.perfiles set rol = 'gerencia'
  where id = 'a5b1b1b1-0000-0000-0000-000000000003';

update public.vendedores set perfil_id = 'a5b1b1b1-0000-0000-0000-000000000001'
  where id = 'a5000000-0000-0000-0000-000000000030';

-- Venta principal: 750,000 = 37,500 de separación + 100,000 de inicial en 6
-- cuotas + 612,500 de capital en 1 cuota. Fecha fija para que las fechas de
-- vencimiento no dependan de cuándo se corran las pruebas.
insert into public.ventas (id, solar_id, cliente_id, vendedor_id, fecha_venta,
                           precio_pactado, monto_separacion, monto_inicial,
                           cuotas_inicial, cuotas_capital)
values ('a5000000-0000-0000-0000-000000000100',
        'a5000000-0000-0000-0000-000000000010',
        'a5000000-0000-0000-0000-000000000020',
        'a5000000-0000-0000-0000-000000000030',
        '2026-01-15', 750000, 37500, 100000, 6, 1);

select public.generar_plan_pagos('a5000000-0000-0000-0000-000000000100');

-- Venta chica para saldarla completa: 250,000 sin separación ni inicial.
insert into public.ventas (id, solar_id, cliente_id, vendedor_id, fecha_venta,
                           precio_pactado, monto_separacion, monto_inicial,
                           cuotas_inicial, cuotas_capital)
values ('a5000000-0000-0000-0000-000000000101',
        'a5000000-0000-0000-0000-000000000012',
        'a5000000-0000-0000-0000-000000000020',
        'a5000000-0000-0000-0000-000000000030',
        '2026-01-15', 250000, 0, 0, 1, 1);

select public.generar_plan_pagos('a5000000-0000-0000-0000-000000000101');

-- Venta para probar la cancelación con dinero de por medio.
insert into public.ventas (id, solar_id, cliente_id, vendedor_id, fecha_venta,
                           precio_pactado, monto_separacion, monto_inicial,
                           cuotas_inicial, cuotas_capital)
values ('a5000000-0000-0000-0000-000000000102',
        'a5000000-0000-0000-0000-000000000011',
        'a5000000-0000-0000-0000-000000000020',
        'a5000000-0000-0000-0000-000000000030',
        '2026-01-15', 750000, 37500, 100000, 6, 1);

select public.generar_plan_pagos('a5000000-0000-0000-0000-000000000102');

-- -----------------------------------------------------------------------------
-- 1. El vendedor no cobra
-- -----------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"a5b1b1b1-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
begin
  begin
    perform public.registrar_pago(
      'a5000000-0000-0000-0000-000000000100', current_date, 1000, 'efectivo');
    perform public.anotar_pag('el vendedor no registra pagos', false, 'lo permitió');
  exception when others then
    perform public.anotar_pag('el vendedor no registra pagos', true);
  end;

  -- Tampoco puede escribir la aplicación a mano para inflar una cuota.
  begin
    insert into public.pagos (venta_id, fecha_pago, monto, metodo)
    values ('a5000000-0000-0000-0000-000000000100', current_date, 1000, 'efectivo');
    perform public.anotar_pag('el vendedor no inserta pagos sueltos', false, 'lo permitió');
  exception when others then
    perform public.anotar_pag('el vendedor no inserta pagos sueltos', true);
  end;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Administración cobra: pago, aplicación automática y recibo
-- -----------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"a5b1b1b1-0000-0000-0000-000000000002","role":"authenticated"}';

do $$
declare
  v_res       jsonb;
  v_cuota     public.cuotas%rowtype;
  v_recibo    public.recibos%rowtype;
  v_estado    public.estado_venta;
begin
  -- 37,500 exactos: cubren la separación completa y nada más.
  v_res := public.registrar_pago(
    'a5000000-0000-0000-0000-000000000100', '2026-01-15', 37500,
    'efectivo', 'caja 1', 'pago de separación');

  select * into v_cuota from public.cuotas
   where venta_id = 'a5000000-0000-0000-0000-000000000100' and tipo = 'separacion';

  perform public.anotar_pag(
    'el pago automático cubre primero la cuota más vieja',
    v_cuota.monto_aplicado = 37500 and v_cuota.estado = 'pagada',
    'aplicado=' || v_cuota.monto_aplicado || ' estado=' || v_cuota.estado);

  perform public.anotar_pag(
    'el pago no deja saldo a favor cuando calza exacto',
    (v_res ->> 'saldo_a_favor')::numeric = 0,
    v_res ->> 'saldo_a_favor');

  select * into v_recibo from public.recibos
   where pago_id = (v_res ->> 'pago_id')::uuid;

  perform public.anotar_pag(
    'todo pago emite su recibo, con número y ruta de PDF',
    v_recibo.id is not null
      and v_recibo.numero is not null
      and v_recibo.monto = 37500
      and v_recibo.ruta_pdf = 'recibo-' || v_recibo.id || '.pdf',
    coalesce(v_recibo.ruta_pdf, 'sin recibo'));

  select estado into v_estado from public.ventas
   where id = 'a5000000-0000-0000-0000-000000000100';

  perform public.anotar_pag(
    'pagada la separación, la venta pasa a inicial',
    v_estado = 'inicial', v_estado::text);

  perform public.anotar_pag(
    'el solar sigue a la venta al avanzar por pagos',
    (select estado from public.solares
      where id = 'a5000000-0000-0000-0000-000000000010') = 'inicial',
    (select estado::text from public.solares
      where id = 'a5000000-0000-0000-0000-000000000010'));
end $$;

-- -----------------------------------------------------------------------------
-- 3. Pago parcial y pago que se reparte entre varias cuotas
-- -----------------------------------------------------------------------------

do $$
declare
  v_res  jsonb;
  v_c1   numeric(14,2);
  v_c2   numeric(14,2);
  v_e1   public.estado_cuota;
begin
  -- La inicial son 6 cuotas de 16,666.66 (la última 16,666.70). Un pago de
  -- 10,000 deja la primera parcial.
  v_res := public.registrar_pago(
    'a5000000-0000-0000-0000-000000000100', '2026-02-15', 10000, 'transferencia', 'TR-001');

  select monto_aplicado, estado into v_c1, v_e1 from public.cuotas
   where venta_id = 'a5000000-0000-0000-0000-000000000100'
     and tipo = 'inicial' and numero = 1;

  perform public.anotar_pag(
    'un pago menor que la cuota la deja parcial',
    v_c1 = 10000 and v_e1 = 'parcial',
    'aplicado=' || v_c1 || ' estado=' || v_e1);

  -- 20,000 más: terminan la cuota 1 (6,666.66) y se van a la 2 (13,333.34).
  v_res := public.registrar_pago(
    'a5000000-0000-0000-0000-000000000100', '2026-02-20', 20000, 'efectivo');

  select monto_aplicado into v_c1 from public.cuotas
   where venta_id = 'a5000000-0000-0000-0000-000000000100'
     and tipo = 'inicial' and numero = 1;
  select monto_aplicado into v_c2 from public.cuotas
   where venta_id = 'a5000000-0000-0000-0000-000000000100'
     and tipo = 'inicial' and numero = 2;

  perform public.anotar_pag(
    'un pago se reparte entre varias cuotas sin perder centavos',
    v_c1 = 16666.66 and v_c2 = 13333.34,
    'c1=' || v_c1 || ' c2=' || v_c2);

  perform public.anotar_pag(
    'el pago repartido no deja saldo a favor',
    (v_res ->> 'saldo_a_favor')::numeric = 0, v_res ->> 'saldo_a_favor');
end $$;

-- -----------------------------------------------------------------------------
-- 4. Aplicación manual: se respeta lo que decide quien cobra
-- -----------------------------------------------------------------------------

do $$
declare
  v_res    jsonb;
  v_cuota  uuid;
  v_ap     numeric(14,2);
begin
  select id into v_cuota from public.cuotas
   where venta_id = 'a5000000-0000-0000-0000-000000000100'
     and tipo = 'inicial' and numero = 6;

  -- 5,000 a la ÚLTIMA cuota de la inicial, saltándose el orden natural.
  v_res := public.registrar_pago(
    'a5000000-0000-0000-0000-000000000100', '2026-03-01', 5000, 'efectivo', null, null,
    jsonb_build_array(jsonb_build_object('cuota_id', v_cuota, 'monto', 5000)));

  select monto_aplicado into v_ap from public.cuotas where id = v_cuota;

  perform public.anotar_pag(
    'la aplicación manual manda sobre el orden automático',
    v_ap = 5000, v_ap::text);

  -- Un pago del que solo se aplica una parte: el resto es saldo a favor, no una
  -- cuota inflada.
  v_res := public.registrar_pago(
    'a5000000-0000-0000-0000-000000000100', '2026-03-02', 8000, 'efectivo', null, null,
    jsonb_build_array(jsonb_build_object('cuota_id', v_cuota, 'monto', 3000)));

  perform public.anotar_pag(
    'lo que no se aplica queda como saldo a favor del pago',
    (v_res ->> 'saldo_a_favor')::numeric = 5000, v_res ->> 'saldo_a_favor');
end $$;

-- -----------------------------------------------------------------------------
-- 5. Los límites del dinero
-- -----------------------------------------------------------------------------

do $$
declare
  v_cuota uuid;
  v_pago  uuid;
begin
  select id into v_cuota from public.cuotas
   where venta_id = 'a5000000-0000-0000-0000-000000000100'
     and tipo = 'capital' and numero = 1;

  -- No se le puede aplicar a una cuota más de lo que se le espera.
  begin
    perform public.registrar_pago(
      'a5000000-0000-0000-0000-000000000100', current_date, 999999, 'efectivo', null, null,
      jsonb_build_array(jsonb_build_object('cuota_id', v_cuota, 'monto', 999999)));
    perform public.anotar_pag('una cuota no recibe más de lo esperado', false, 'lo permitió');
  exception when others then
    perform public.anotar_pag('una cuota no recibe más de lo esperado', true);
  end;

  -- Ni se puede repartir más de lo que entró.
  begin
    perform public.registrar_pago(
      'a5000000-0000-0000-0000-000000000100', current_date, 1000, 'efectivo', null, null,
      jsonb_build_array(jsonb_build_object('cuota_id', v_cuota, 'monto', 5000)));
    perform public.anotar_pag('un pago no reparte más de lo recibido', false, 'lo permitió');
  exception when others then
    perform public.anotar_pag('un pago no reparte más de lo recibido', true);
  end;

  -- Un monto en cero o negativo no es un pago.
  begin
    perform public.registrar_pago(
      'a5000000-0000-0000-0000-000000000100', current_date, 0, 'efectivo');
    perform public.anotar_pag('un pago de cero se rechaza', false, 'lo permitió');
  exception when others then
    perform public.anotar_pag('un pago de cero se rechaza', true);
  end;

  -- Y a una cuota de otra venta no se le aplica nada.
  select id into v_cuota from public.cuotas
   where venta_id = 'a5000000-0000-0000-0000-000000000101' limit 1;
  begin
    perform public.registrar_pago(
      'a5000000-0000-0000-0000-000000000100', current_date, 1000, 'efectivo', null, null,
      jsonb_build_array(jsonb_build_object('cuota_id', v_cuota, 'monto', 1000)));
    perform public.anotar_pag('no se aplica un pago a la cuota de otra venta', false, 'lo permitió');
  exception when others then
    perform public.anotar_pag('no se aplica un pago a la cuota de otra venta', true);
  end;

  -- El pago y su aplicación son inmutables aunque los haya hecho quien cobra.
  select id into v_pago from public.pagos
   where venta_id = 'a5000000-0000-0000-0000-000000000100' limit 1;
  begin
    update public.pagos set monto = 1 where id = v_pago;
    perform public.anotar_pag('un pago no se edita', false, 'lo permitió');
  exception when others then
    perform public.anotar_pag('un pago no se edita', true);
  end;
  begin
    delete from public.pagos where id = v_pago;
    perform public.anotar_pag('un pago no se borra', false, 'lo permitió');
  exception when others then
    perform public.anotar_pag('un pago no se borra', true);
  end;
  begin
    update public.recibos set monto = 1
     where pago_id = v_pago;
    perform public.anotar_pag('un recibo no se edita', false, 'lo permitió');
  exception when others then
    perform public.anotar_pag('un recibo no se edita', true);
  end;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Un plan con dinero encima no se rehace
-- -----------------------------------------------------------------------------

do $$
begin
  begin
    perform public.generar_plan_pagos('a5000000-0000-0000-0000-000000000100');
    perform public.anotar_pag('un plan con pagos aplicados no se regenera', false, 'lo permitió');
  exception when others then
    perform public.anotar_pag('un plan con pagos aplicados no se regenera', true);
  end;
end $$;

-- -----------------------------------------------------------------------------
-- 7. Saldar una venta completa
-- -----------------------------------------------------------------------------

do $$
declare
  v_res    jsonb;
  v_estado public.estado_venta;
begin
  v_res := public.registrar_pago(
    'a5000000-0000-0000-0000-000000000101', '2026-02-15', 250000, 'transferencia', 'TR-999');

  select estado into v_estado from public.ventas
   where id = 'a5000000-0000-0000-0000-000000000101';

  perform public.anotar_pag(
    'pagado todo el plan, la venta queda saldada',
    v_estado = 'saldado', v_estado::text);

  perform public.anotar_pag(
    'el solar queda saldado con la venta',
    (select estado from public.solares
      where id = 'a5000000-0000-0000-0000-000000000012') = 'saldado',
    (select estado::text from public.solares
      where id = 'a5000000-0000-0000-0000-000000000012'));

  -- Y una venta saldada ya no admite más cobros.
  begin
    perform public.registrar_pago(
      'a5000000-0000-0000-0000-000000000101', current_date, 100, 'efectivo');
    perform public.anotar_pag('una venta saldada no admite más pagos', false, 'lo permitió');
  exception when others then
    perform public.anotar_pag('una venta saldada no admite más pagos', true);
  end;
end $$;

-- -----------------------------------------------------------------------------
-- 8. El resumen de cobros cuadra
-- -----------------------------------------------------------------------------

do $$
declare
  v_recibido numeric(14,2);
  v_aplicado numeric(14,2);
  v_favor    numeric(14,2);
  v_balance  numeric(14,2);
begin
  select total_recibido, total_aplicado, saldo_a_favor, balance_pendiente
  into v_recibido, v_aplicado, v_favor, v_balance
  from public.ventas_resumen_cobros
  where venta_id = 'a5000000-0000-0000-0000-000000000100';

  -- 37,500 + 10,000 + 20,000 + 5,000 + 8,000 = 80,500 recibidos, de los cuales
  -- 5,000 quedaron a favor (del pago de 8,000 solo se aplicaron 3,000).
  perform public.anotar_pag(
    'el resumen suma lo recibido, lo aplicado y el saldo a favor',
    v_recibido = 80500 and v_aplicado = 75500 and v_favor = 5000
      and v_balance = 750000 - 75500,
    'recibido=' || v_recibido || ' aplicado=' || v_aplicado
      || ' favor=' || v_favor || ' balance=' || v_balance);
end $$;

-- -----------------------------------------------------------------------------
-- 9. Reversar: es de gerencia y deshace lo aplicado
-- -----------------------------------------------------------------------------

do $$
declare v_pago uuid;
begin
  select p.id into v_pago from public.pagos p
   where p.venta_id = 'a5000000-0000-0000-0000-000000000100'
     and p.monto = 37500 and not p.es_reverso;
  begin
    perform public.reversar_pago(v_pago, 'error de digitación');
    perform public.anotar_pag('administración no reversa pagos', false, 'lo permitió');
  exception when others then
    perform public.anotar_pag('administración no reversa pagos', true);
  end;
end $$;

set local request.jwt.claims = '{"sub":"a5b1b1b1-0000-0000-0000-000000000003","role":"authenticated"}';

do $$
declare
  v_pago     uuid;
  v_res      jsonb;
  v_ap       numeric(14,2);
  v_estado   public.estado_cuota;
  v_nota     public.recibos%rowtype;
  v_recibido numeric(14,2);
begin
  select p.id into v_pago from public.pagos p
   where p.venta_id = 'a5000000-0000-0000-0000-000000000100'
     and p.monto = 37500 and not p.es_reverso;

  begin
    perform public.reversar_pago(v_pago, '');
    perform public.anotar_pag('sin motivo no se reversa', false, 'lo permitió');
  exception when others then
    perform public.anotar_pag('sin motivo no se reversa', true);
  end;

  v_res := public.reversar_pago(v_pago, 'el cheque no tenía fondos');

  select monto_aplicado, estado into v_ap, v_estado from public.cuotas
   where venta_id = 'a5000000-0000-0000-0000-000000000100' and tipo = 'separacion';

  perform public.anotar_pag(
    'el reverso devuelve la cuota a como estaba',
    v_ap = 0 and v_estado = 'pendiente',
    'aplicado=' || v_ap || ' estado=' || v_estado);

  select * into v_nota from public.recibos where id = (v_res ->> 'nota_credito_id')::uuid;

  perform public.anotar_pag(
    'el reverso emite una nota de crédito contra el recibo original',
    v_nota.tipo = 'nota_credito'
      and v_nota.recibo_original_id is not null
      and v_nota.monto = 37500,
    coalesce(v_nota.tipo::text, 'sin nota'));

  select total_recibido into v_recibido from public.ventas_resumen_cobros
   where venta_id = 'a5000000-0000-0000-0000-000000000100';

  perform public.anotar_pag(
    'el reverso baja lo recibido de la venta',
    v_recibido = 80500 - 37500, v_recibido::text);

  -- El pago original sigue ahí: se corrigió, no se borró.
  perform public.anotar_pag(
    'el pago reversado queda en la historia',
    exists (select 1 from public.pagos where id = v_pago),
    'desapareció');

  begin
    perform public.reversar_pago(v_pago, 'otra vez');
    perform public.anotar_pag('un pago no se reversa dos veces', false, 'lo permitió');
  exception when others then
    perform public.anotar_pag('un pago no se reversa dos veces', true);
  end;

  begin
    perform public.reversar_pago((v_res ->> 'pago_reverso_id')::uuid, 'reverso del reverso');
    perform public.anotar_pag('un reverso no se reversa', false, 'lo permitió');
  exception when others then
    perform public.anotar_pag('un reverso no se reversa', true);
  end;
end $$;

-- -----------------------------------------------------------------------------
-- 10. Cancelar con dinero recibido
-- -----------------------------------------------------------------------------

do $$
declare
  v_pago uuid;
begin
  perform public.registrar_pago(
    'a5000000-0000-0000-0000-000000000102', '2026-01-15', 37500, 'efectivo');

  begin
    perform public.cancelar_venta('a5000000-0000-0000-0000-000000000102', 'se cayó');
    perform public.anotar_pag('no se cancela una venta con dinero recibido', false, 'lo permitió');
  exception when others then
    perform public.anotar_pag('no se cancela una venta con dinero recibido', true);
  end;

  select id into v_pago from public.pagos
   where venta_id = 'a5000000-0000-0000-0000-000000000102' and not es_reverso;
  perform public.reversar_pago(v_pago, 'el cliente desistió');

  begin
    perform public.cancelar_venta('a5000000-0000-0000-0000-000000000102', 'el cliente desistió');
    perform public.anotar_pag('reversado el pago, la venta sí se cancela', true);
  exception when others then
    perform public.anotar_pag('reversado el pago, la venta sí se cancela', false, sqlerrm);
  end;

  perform public.anotar_pag(
    'el solar vuelve a libre tras cancelar',
    (select estado from public.solares
      where id = 'a5000000-0000-0000-0000-000000000011') = 'libre',
    (select estado::text from public.solares
      where id = 'a5000000-0000-0000-0000-000000000011'));
end $$;

-- -----------------------------------------------------------------------------
-- 11. Lo que ve cada quien
-- -----------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"a5b1b1b1-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare v_n integer;
begin
  select count(*) into v_n from public.pagos
   where venta_id = 'a5000000-0000-0000-0000-000000000100';
  perform public.anotar_pag(
    'el vendedor ve los pagos de su venta', v_n > 0, v_n::text);

  select count(*) into v_n from public.recibos
   where venta_id = 'a5000000-0000-0000-0000-000000000100';
  perform public.anotar_pag(
    'el vendedor ve los recibos de su venta', v_n > 0, v_n::text);
end $$;

-- Un vendedor ajeno no ve nada de esa venta. (Desvincularlo es de gerencia:
-- se hace fuera del rol de prueba, que precisamente no podría hacerlo.)
reset role;
update public.vendedores set perfil_id = null
  where id = 'a5000000-0000-0000-0000-000000000030';
set local role authenticated;

do $$
declare v_n integer;
begin
  select count(*) into v_n from public.pagos
   where venta_id = 'a5000000-0000-0000-0000-000000000100';
  perform public.anotar_pag(
    'un vendedor sin la venta no ve sus pagos', v_n = 0, v_n::text);

  select count(*) into v_n from public.recibos
   where venta_id = 'a5000000-0000-0000-0000-000000000100';
  perform public.anotar_pag(
    'un vendedor sin la venta no ve sus recibos', v_n = 0, v_n::text);
end $$;

-- -----------------------------------------------------------------------------
-- 12. Rastro en la bitácora
-- -----------------------------------------------------------------------------

reset role;
set local request.jwt.claims = '{}';

do $$
begin
  perform public.anotar_pag(
    'el pago queda en la bitácora con su autor',
    exists (
      select 1 from public.bitacora_auditoria
      where tabla = 'pagos' and accion = 'insert'
        and usuario_correo = 'prueba.pag.admin@ejemplo.test'
    ), 'no se registró');

  perform public.anotar_pag(
    'el recibo queda en la bitácora',
    exists (
      select 1 from public.bitacora_auditoria
      where tabla = 'recibos' and accion = 'insert'
    ), 'no se registró');

  perform public.anotar_pag(
    'el reverso queda en la bitácora con su autor',
    exists (
      select 1 from public.bitacora_auditoria
      where tabla = 'pagos' and accion = 'insert'
        and (datos_despues ->> 'es_reverso')::boolean
        and usuario_correo = 'prueba.pag.gerencia@ejemplo.test'
    ), 'no se registró');
end $$;

-- -----------------------------------------------------------------------------
-- Resultados
-- -----------------------------------------------------------------------------

select n, prueba, resultado from public.resultados_pruebas_pag order by n;

rollback;
