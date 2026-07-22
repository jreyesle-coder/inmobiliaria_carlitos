-- =============================================================================
-- Sprint 4 · Pruebas de ventas, plan de pagos y cancelación
-- =============================================================================
-- Se corre completo en el SQL Editor de Supabase. Todo pasa dentro de una
-- transacción que termina en `rollback`: NO deja datos.
--
-- Como en las pruebas anteriores, la tabla de resultados es normal (no
-- temporal) y se le dan permisos, porque una tabla temporal la posee `postgres`
-- y el rol `authenticated` no podría escribir en ella.
-- =============================================================================

begin;

-- Candado: sin `07_ventas.sql` aplicado no existe el pipeline de la venta y la
-- mitad de estas pruebas "pasaría" sin probar nada.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'tr_validar_venta'
      and tgrelid = 'public.ventas'::regclass
  ) then
    raise exception
      'Falta aplicar supabase/sql/07_ventas.sql antes de correr estas pruebas.';
  end if;
end $$;

create table public.resultados_pruebas_ven (
  n serial,
  prueba text,
  resultado text
);
grant insert, select on public.resultados_pruebas_ven to authenticated;
grant usage, select on sequence public.resultados_pruebas_ven_n_seq to authenticated;

-- -----------------------------------------------------------------------------
-- 0. Datos de trabajo
-- -----------------------------------------------------------------------------

insert into public.proyectos (id, nombre)
values ('a4000000-0000-0000-0000-000000000001', 'PROYECTO DE PRUEBA VENTAS');

insert into public.manzanas (id, proyecto_id, codigo)
values ('a4000000-0000-0000-0000-000000000002',
        'a4000000-0000-0000-0000-000000000001', 'V');

insert into public.solares (id, manzana_id, numero, area_m2, valor_m2, valor_total)
values
  ('a4000000-0000-0000-0000-000000000010',
   'a4000000-0000-0000-0000-000000000002', '1', 300, 2500, 750000),
  ('a4000000-0000-0000-0000-000000000011',
   'a4000000-0000-0000-0000-000000000002', '2', 300, 2500, 750000),
  ('a4000000-0000-0000-0000-000000000012',
   'a4000000-0000-0000-0000-000000000002', '3', 300, 2500, 750000),
  ('a4000000-0000-0000-0000-000000000013',
   'a4000000-0000-0000-0000-000000000002', '4', 300, 2500, 750000);

insert into public.clientes (id, nombre_completo, cedula)
values ('a4000000-0000-0000-0000-000000000020', 'Comprador De Prueba', '03101234569');

insert into public.vendedores (id, nombre_completo)
values ('a4000000-0000-0000-0000-000000000030', 'Vendedor De Prueba');

-- -----------------------------------------------------------------------------
-- 1. La venta manda sobre el estado del solar
-- -----------------------------------------------------------------------------

do $$
declare v_estado public.estado_solar;
begin
  insert into public.ventas (id, solar_id, cliente_id, vendedor_id, fecha_venta,
                             precio_pactado, monto_separacion, monto_inicial,
                             cuotas_inicial, cuotas_capital)
  values ('a4000000-0000-0000-0000-000000000100',
          'a4000000-0000-0000-0000-000000000010',
          'a4000000-0000-0000-0000-000000000020',
          'a4000000-0000-0000-0000-000000000030',
          '2026-01-31', 750000, 37500, 100000, 6, 1);

  select estado into v_estado from public.solares
   where id = 'a4000000-0000-0000-0000-000000000010';

  if v_estado = 'separado' then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('registrar la venta deja el solar separado', 'PASA');
  else
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('registrar la venta deja el solar separado', 'FALLA: ' || v_estado);
  end if;

  -- Un solar se vende una vez.
  begin
    insert into public.ventas (solar_id, cliente_id, fecha_venta, precio_pactado)
    values ('a4000000-0000-0000-0000-000000000010',
            'a4000000-0000-0000-0000-000000000020', current_date, 750000);
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('un solar no admite dos ventas activas', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('un solar no admite dos ventas activas', 'PASA');
  end;

  -- Tampoco se vende un solar que no está libre (aquí, área comercial).
  update public.solares set estado = 'area_comercial'
    where id = 'a4000000-0000-0000-0000-000000000013';
  begin
    insert into public.ventas (solar_id, cliente_id, fecha_venta, precio_pactado)
    values ('a4000000-0000-0000-0000-000000000013',
            'a4000000-0000-0000-0000-000000000020', current_date, 750000);
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('no se vende un solar que no está libre', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('no se vende un solar que no está libre', 'PASA');
  end;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Montos de la venta
-- -----------------------------------------------------------------------------

do $$
begin
  begin
    insert into public.ventas (solar_id, cliente_id, fecha_venta, precio_pactado,
                               monto_separacion, monto_inicial)
    values ('a4000000-0000-0000-0000-000000000011',
            'a4000000-0000-0000-0000-000000000020', current_date,
            750000, 400000, 400000);
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('la separación más la inicial no pasan del precio', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('la separación más la inicial no pasan del precio', 'PASA');
  end;

  begin
    insert into public.ventas (solar_id, cliente_id, fecha_venta, precio_pactado)
    values ('a4000000-0000-0000-0000-000000000011',
            'a4000000-0000-0000-0000-000000000020', current_date, 0);
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('el precio pactado tiene que ser mayor que cero', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('el precio pactado tiene que ser mayor que cero', 'PASA');
  end;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Plan de pagos
-- -----------------------------------------------------------------------------
-- La venta de arriba: 750,000 = 37,500 de separación + 100,000 de inicial en 6
-- cuotas + 612,500 de capital en 1. La inicial no divide exacto
-- (100,000 / 6 = 16,666.666…), que es justo el caso que tiene que cuadrar.

do $$
declare
  v_generadas integer;
  v_total     numeric(14,2);
  v_ultima    numeric(14,2);
  v_primera   numeric(14,2);
  v_fecha     date;
begin
  v_generadas := public.generar_plan_pagos('a4000000-0000-0000-0000-000000000100');

  if v_generadas = 8 then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('el plan genera 1 separación + 6 iniciales + 1 capital', 'PASA');
  else
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('el plan genera 1 separación + 6 iniciales + 1 capital',
              'FALLA: generó ' || v_generadas);
  end if;

  select sum(monto_esperado) into v_total
    from public.cuotas where venta_id = 'a4000000-0000-0000-0000-000000000100';

  if v_total = 750000.00 then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('el plan suma exactamente el precio pactado', 'PASA');
  else
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('el plan suma exactamente el precio pactado', 'FALLA: sumó ' || v_total);
  end if;

  -- El residuo del redondeo va en la última cuota de la inicial.
  select monto_esperado into v_primera from public.cuotas
   where venta_id = 'a4000000-0000-0000-0000-000000000100'
     and tipo = 'inicial' and numero = 1;
  select monto_esperado into v_ultima from public.cuotas
   where venta_id = 'a4000000-0000-0000-0000-000000000100'
     and tipo = 'inicial' and numero = 6;

  if v_primera = 16666.66 and v_ultima = 16666.70 then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('el residuo del redondeo va en la última cuota de la inicial', 'PASA');
  else
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('el residuo del redondeo va en la última cuota de la inicial',
              'FALLA: primera=' || v_primera || ' última=' || v_ultima);
  end if;

  -- La separación vence el día de la venta.
  select fecha_vencimiento into v_fecha from public.cuotas
   where venta_id = 'a4000000-0000-0000-0000-000000000100' and tipo = 'separacion';
  if v_fecha = date '2026-01-31' then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('la separación vence el día de la venta', 'PASA');
  else
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('la separación vence el día de la venta', 'FALLA: ' || v_fecha);
  end if;

  -- 31 de enero + 1 mes = 28 de febrero: el día se recorta al último del mes.
  select fecha_vencimiento into v_fecha from public.cuotas
   where venta_id = 'a4000000-0000-0000-0000-000000000100'
     and tipo = 'inicial' and numero = 1;
  if v_fecha = date '2026-02-28' then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('un vencimiento en día 31 se recorta al último del mes', 'PASA');
  else
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('un vencimiento en día 31 se recorta al último del mes', 'FALLA: ' || v_fecha);
  end if;

  -- El capital arranca después de la última cuota de la inicial.
  select fecha_vencimiento into v_fecha from public.cuotas
   where venta_id = 'a4000000-0000-0000-0000-000000000100' and tipo = 'capital';
  if v_fecha = date '2026-08-31' then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('el capital arranca cuando termina la inicial', 'PASA');
  else
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('el capital arranca cuando termina la inicial', 'FALLA: ' || v_fecha);
  end if;

  -- Regenerar mientras no haya dinero aplicado es normal: se corrige el plan.
  update public.ventas set monto_inicial = 120000, cuotas_capital = 5
    where id = 'a4000000-0000-0000-0000-000000000100';
  v_generadas := public.generar_plan_pagos('a4000000-0000-0000-0000-000000000100');

  select sum(monto_esperado) into v_total
    from public.cuotas where venta_id = 'a4000000-0000-0000-0000-000000000100';

  if v_generadas = 12 and v_total = 750000.00 then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('regenerar el plan sin pagos lo rehace y sigue cuadrando', 'PASA');
  else
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('regenerar el plan sin pagos lo rehace y sigue cuadrando',
              'FALLA: cuotas=' || v_generadas || ' total=' || v_total);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Una cuota con dinero encima se congela
-- -----------------------------------------------------------------------------

do $$
declare v_cuota uuid;
begin
  select id into v_cuota from public.cuotas
   where venta_id = 'a4000000-0000-0000-0000-000000000100'
     and tipo = 'inicial' and numero = 1;

  -- Lo que va a hacer el trigger de pagos del Sprint 5.
  update public.cuotas set monto_aplicado = 5000, estado = 'parcial'
    where id = v_cuota;

  begin
    update public.cuotas set monto_esperado = 1 where id = v_cuota;
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('una cuota con pagos no cambia de monto', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('una cuota con pagos no cambia de monto', 'PASA');
  end;

  begin
    delete from public.cuotas where id = v_cuota;
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('una cuota con pagos no se borra', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('una cuota con pagos no se borra', 'PASA');
  end;

  begin
    perform public.generar_plan_pagos('a4000000-0000-0000-0000-000000000100');
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('un plan con pagos aplicados no se regenera', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('un plan con pagos aplicados no se regenera', 'PASA');
  end;

  -- Se deshace para no estorbar a las pruebas de cancelación.
  update public.cuotas set monto_aplicado = 0, estado = 'pendiente'
    where id = v_cuota;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Pipeline de la venta y arrastre del solar
-- -----------------------------------------------------------------------------

do $$
declare v_estado public.estado_solar;
begin
  begin
    update public.ventas set estado = 'saldado'
      where id = 'a4000000-0000-0000-0000-000000000100';
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('separado → saldado se rechaza en la venta', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('separado → saldado se rechaza en la venta', 'PASA');
  end;

  update public.ventas set estado = 'inicial'
    where id = 'a4000000-0000-0000-0000-000000000100';
  update public.ventas set estado = 'capital'
    where id = 'a4000000-0000-0000-0000-000000000100';
  update public.ventas set estado = 'saldado'
    where id = 'a4000000-0000-0000-0000-000000000100';

  select estado into v_estado from public.solares
   where id = 'a4000000-0000-0000-0000-000000000010';

  if v_estado = 'saldado' then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('el solar sigue a la venta hasta saldado', 'PASA');
  else
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('el solar sigue a la venta hasta saldado', 'FALLA: ' || v_estado);
  end if;

  begin
    update public.ventas set estado = 'capital'
      where id = 'a4000000-0000-0000-0000-000000000100';
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('una venta saldada es final', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('una venta saldada es final', 'PASA');
  end;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Cancelación
-- -----------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('a4b1b1b1-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'prueba.ven.vendedor@ejemplo.test', '',
   now(), now(), now(), '{}', '{}'),
  ('a4b1b1b1-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'prueba.ven.admin@ejemplo.test', '',
   now(), now(), now(), '{}', '{}'),
  ('a4b1b1b1-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'prueba.ven.gerencia@ejemplo.test', '',
   now(), now(), now(), '{}', '{}');

update public.perfiles set rol = 'administracion'
  where id = 'a4b1b1b1-0000-0000-0000-000000000002';
update public.perfiles set rol = 'gerencia'
  where id = 'a4b1b1b1-0000-0000-0000-000000000003';

-- El vendedor de la prueba queda vinculado al primer usuario.
update public.vendedores set perfil_id = 'a4b1b1b1-0000-0000-0000-000000000001'
  where id = 'a4000000-0000-0000-0000-000000000030';

-- Venta viva sobre otro solar, para cancelarla.
insert into public.ventas (id, solar_id, cliente_id, vendedor_id, fecha_venta,
                           precio_pactado, monto_separacion, monto_inicial)
values ('a4000000-0000-0000-0000-000000000101',
        'a4000000-0000-0000-0000-000000000011',
        'a4000000-0000-0000-0000-000000000020',
        'a4000000-0000-0000-0000-000000000030',
        current_date, 625000, 31250, 100000);

select public.generar_plan_pagos('a4000000-0000-0000-0000-000000000101');

update public.ventas set estado = 'inicial'
  where id = 'a4000000-0000-0000-0000-000000000101';

set local role authenticated;
set local request.jwt.claims = '{"sub":"a4b1b1b1-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
begin
  -- Un vendedor no cancela ventas.
  begin
    perform public.cancelar_venta('a4000000-0000-0000-0000-000000000101', 'me arrepentí');
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('el vendedor no cancela ventas', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('el vendedor no cancela ventas', 'PASA');
  end;

  -- Ni las registra: eso es de administración y gerencia.
  begin
    insert into public.ventas (solar_id, cliente_id, fecha_venta, precio_pactado)
    values ('a4000000-0000-0000-0000-000000000012',
            'a4000000-0000-0000-0000-000000000020', current_date, 750000);
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('el vendedor no registra ventas', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('el vendedor no registra ventas', 'PASA');
  end;

  -- Ni arma planes de pago.
  begin
    perform public.generar_plan_pagos('a4000000-0000-0000-0000-000000000101');
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('el vendedor no arma planes de pago', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('el vendedor no arma planes de pago', 'PASA');
  end;

  -- Pero ve las suyas y su plan de cuotas.
  if (select count(*) from public.ventas) = 2
     and exists (select 1 from public.cuotas
                 where venta_id = 'a4000000-0000-0000-0000-000000000101') then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('el vendedor ve sus ventas y su plan de cuotas', 'PASA');
  else
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('el vendedor ve sus ventas y su plan de cuotas',
              'FALLA: ve ' || (select count(*) from public.ventas) || ' ventas');
  end if;
end $$;

-- --- Como administración ----------------------------------------------------
set local request.jwt.claims = '{"sub":"a4b1b1b1-0000-0000-0000-000000000002","role":"authenticated"}';

do $$
declare v_cuotas integer;
begin
  begin
    insert into public.ventas (id, solar_id, cliente_id, fecha_venta, precio_pactado,
                               monto_separacion, monto_inicial)
    values ('a4000000-0000-0000-0000-000000000102',
            'a4000000-0000-0000-0000-000000000012',
            'a4000000-0000-0000-0000-000000000020', current_date,
            750000, 37500, 90000);
    v_cuotas := public.generar_plan_pagos('a4000000-0000-0000-0000-000000000102');
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('administración registra la venta y genera su plan',
              case when v_cuotas = 8 then 'PASA' else 'FALLA: ' || v_cuotas || ' cuotas' end);
  exception when others then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('administración registra la venta y genera su plan', 'FALLA: ' || sqlerrm);
  end;

  -- Cancelar sigue siendo de gerencia, no de administración.
  begin
    perform public.cancelar_venta('a4000000-0000-0000-0000-000000000102', 'prueba');
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('administración no cancela ventas', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('administración no cancela ventas', 'PASA');
  end;
end $$;

-- --- Como gerencia ----------------------------------------------------------
set local request.jwt.claims = '{"sub":"a4b1b1b1-0000-0000-0000-000000000003","role":"authenticated"}';

do $$
declare
  v_estado_solar public.estado_solar;
  v_estado_venta public.estado_venta;
  v_cuotas       integer;
  v_motivo       text;
begin
  begin
    perform public.cancelar_venta('a4000000-0000-0000-0000-000000000101', '  el cliente se retractó  ');

    select estado, motivo_cancelacion into v_estado_venta, v_motivo
      from public.ventas where id = 'a4000000-0000-0000-0000-000000000101';
    select estado into v_estado_solar
      from public.solares where id = 'a4000000-0000-0000-0000-000000000011';
    select count(*) into v_cuotas
      from public.cuotas where venta_id = 'a4000000-0000-0000-0000-000000000101';

    if v_estado_venta = 'cancelada' and v_motivo = 'el cliente se retractó' then
      insert into public.resultados_pruebas_ven (prueba, resultado)
        values ('gerencia cancela la venta y queda el motivo', 'PASA');
    else
      insert into public.resultados_pruebas_ven (prueba, resultado)
        values ('gerencia cancela la venta y queda el motivo',
                'FALLA: estado=' || v_estado_venta || ' motivo=' || coalesce(v_motivo, 'null'));
    end if;

    if v_estado_solar = 'libre' then
      insert into public.resultados_pruebas_ven (prueba, resultado)
        values ('cancelar devuelve el solar a libre desde inicial', 'PASA');
    else
      insert into public.resultados_pruebas_ven (prueba, resultado)
        values ('cancelar devuelve el solar a libre desde inicial', 'FALLA: ' || v_estado_solar);
    end if;

    if v_cuotas = 0 then
      insert into public.resultados_pruebas_ven (prueba, resultado)
        values ('cancelar retira el plan de cuotas', 'PASA');
    else
      insert into public.resultados_pruebas_ven (prueba, resultado)
        values ('cancelar retira el plan de cuotas', 'FALLA: quedaron ' || v_cuotas);
    end if;
  exception when others then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('gerencia cancela la venta y queda el motivo', 'FALLA: ' || sqlerrm);
  end;

  -- Sin motivo no se cancela: la cancelación tiene que quedar explicada.
  begin
    perform public.cancelar_venta('a4000000-0000-0000-0000-000000000102', '   ');
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('cancelar sin motivo se rechaza', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('cancelar sin motivo se rechaza', 'PASA');
  end;

  -- Una venta saldada no se cancela.
  begin
    perform public.cancelar_venta('a4000000-0000-0000-0000-000000000100', 'nos arrepentimos');
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('una venta saldada no se cancela', 'FALLA: lo permitió');
  exception when others then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('una venta saldada no se cancela', 'PASA');
  end;

  -- El solar liberado se puede volver a vender.
  begin
    insert into public.ventas (solar_id, cliente_id, fecha_venta, precio_pactado)
    values ('a4000000-0000-0000-0000-000000000011',
            'a4000000-0000-0000-0000-000000000020', current_date, 625000);
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('el solar liberado se vuelve a vender', 'PASA');
  exception when others then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('el solar liberado se vuelve a vender', 'FALLA: ' || sqlerrm);
  end;
end $$;

reset role;
set local request.jwt.claims = '{}';

-- -----------------------------------------------------------------------------
-- 7. Configuración y bitácora
-- -----------------------------------------------------------------------------

do $$
declare v_valor text;
begin
  select valor into v_valor from public.configuracion
   where clave = 'cuotas_inicial_por_defecto';
  if v_valor = '6' then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('la inicial quedó configurada en 6 cuotas', 'PASA');
  else
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('la inicial quedó configurada en 6 cuotas', 'FALLA: ' || coalesce(v_valor, 'null'));
  end if;

  select valor into v_valor from public.configuracion
   where clave = 'separacion_porcentaje';
  if v_valor = '0.0500' then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('la separación quedó configurada en 5%', 'PASA');
  else
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('la separación quedó configurada en 5%', 'FALLA: ' || coalesce(v_valor, 'null'));
  end if;

  if exists (
    select 1 from public.bitacora_auditoria
    where tabla = 'ventas'
      and registro_id = 'a4000000-0000-0000-0000-000000000101'
      and accion = 'update'
      and datos_antes ->> 'estado' = 'inicial'
      and datos_despues ->> 'estado' = 'cancelada'
      and usuario_correo = 'prueba.ven.gerencia@ejemplo.test'
  ) then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('la cancelación queda en la bitácora con su autor', 'PASA');
  else
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('la cancelación queda en la bitácora con su autor', 'FALLA: no se registró');
  end if;

  if exists (
    select 1 from public.bitacora_auditoria
    where tabla = 'cuotas' and accion = 'insert'
  ) then
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('las cuotas del plan quedan en la bitácora', 'PASA');
  else
    insert into public.resultados_pruebas_ven (prueba, resultado)
      values ('las cuotas del plan quedan en la bitácora', 'FALLA: no se registró');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Resultados
-- -----------------------------------------------------------------------------

select n, prueba, resultado from public.resultados_pruebas_ven order by n;

rollback;
