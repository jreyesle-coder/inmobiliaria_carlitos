-- =============================================================================
-- Sprint 8 · Pruebas de reportes
-- =============================================================================
-- Se corre completo en el SQL Editor de Supabase. Todo pasa dentro de una
-- transacción que termina en `rollback`: NO deja datos.
--
-- Comprueba dos cosas: (1) los agregados de las vistas cuadran con las tablas
-- de base, y (2) las vistas respetan la RLS —un vendedor solo ve lo suyo—
-- gracias a `security_invoker`.
--
-- La tabla de resultados es normal (no temporal) y con permisos, porque una
-- temporal la posee `postgres` y el rol `authenticated` no podría escribir.
-- =============================================================================

begin;

-- Candado: sin `14_reportes.sql` aplicado no existen las vistas.
do $$
begin
  if not exists (
    select 1 from pg_views where schemaname = 'public' and viewname = 'reporte_ventas'
  ) then
    raise exception
      'Falta aplicar supabase/sql/14_reportes.sql antes de correr estas pruebas.';
  end if;
end $$;

create table public.resultados_pruebas_rep (
  n serial,
  prueba text,
  resultado text
);
grant insert, select on public.resultados_pruebas_rep to authenticated;
grant usage, select on sequence public.resultados_pruebas_rep_n_seq to authenticated;

create or replace function public.anotar_rep(p_prueba text, p_ok boolean, p_detalle text default '')
returns void
language sql
as $$
  insert into public.resultados_pruebas_rep (prueba, resultado)
  values (p_prueba, case when p_ok then 'PASA' else 'FALLA: ' || p_detalle end);
$$;
grant execute on function public.anotar_rep(text, boolean, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 0. Datos de trabajo
-- -----------------------------------------------------------------------------

insert into public.proyectos (id, nombre)
values ('a8000000-0000-0000-0000-000000000001', 'PROYECTO DE PRUEBA REPORTES');

insert into public.manzanas (id, proyecto_id, codigo)
values ('a8000000-0000-0000-0000-000000000002',
        'a8000000-0000-0000-0000-000000000001', 'R');

-- 5 solares de 750,000; su estado lo mueven las ventas y los pagos.
insert into public.solares (id, manzana_id, numero, area_m2, valor_m2, valor_total)
values
  ('a8000000-0000-0000-0000-000000000010','a8000000-0000-0000-0000-000000000002','1',300,2500,750000),
  ('a8000000-0000-0000-0000-000000000011','a8000000-0000-0000-0000-000000000002','2',100,2500,250000),
  ('a8000000-0000-0000-0000-000000000012','a8000000-0000-0000-0000-000000000002','3',300,2500,750000),
  ('a8000000-0000-0000-0000-000000000013','a8000000-0000-0000-0000-000000000002','4',300,2500,750000),
  ('a8000000-0000-0000-0000-000000000014','a8000000-0000-0000-0000-000000000002','5',300,2500,750000);

insert into public.clientes (id, nombre_completo, cedula)
values ('a8000000-0000-0000-0000-000000000020', 'Comprador De Reportes', '04007654321');

insert into public.vendedores (id, nombre_completo)
values ('a8000000-0000-0000-0000-000000000030', 'Vendedor De Reportes');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('a8b1b1b1-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'prueba.rep.vendedor@ejemplo.test', '',
   now(), now(), now(), '{}', '{}'),
  ('a8b1b1b1-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'prueba.rep.admin@ejemplo.test', '',
   now(), now(), now(), '{}', '{}'),
  ('a8b1b1b1-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'prueba.rep.gerencia@ejemplo.test', '',
   now(), now(), now(), '{}', '{}');

update public.perfiles set rol = 'administracion'
  where id = 'a8b1b1b1-0000-0000-0000-000000000002';
update public.perfiles set rol = 'gerencia'
  where id = 'a8b1b1b1-0000-0000-0000-000000000003';
update public.vendedores set perfil_id = 'a8b1b1b1-0000-0000-0000-000000000001'
  where id = 'a8000000-0000-0000-0000-000000000030';

-- Venta A (con vendedor): 750,000, se cobra la separación y la inicial en marzo.
insert into public.ventas (id, solar_id, cliente_id, vendedor_id, fecha_venta,
                           precio_pactado, monto_separacion, monto_inicial,
                           cuotas_inicial, cuotas_capital)
values ('a8000000-0000-0000-0000-000000000100',
        'a8000000-0000-0000-0000-000000000010',
        'a8000000-0000-0000-0000-000000000020',
        'a8000000-0000-0000-0000-000000000030',
        '2026-03-10', 750000, 37500, 100000, 6, 1);
select public.generar_plan_pagos('a8000000-0000-0000-0000-000000000100');

-- Venta B (con vendedor): vieja y sin pagar, para probar cuotas vencidas.
-- Sin separación ni inicial: una sola cuota de capital de 250,000 en 2025.
insert into public.ventas (id, solar_id, cliente_id, vendedor_id, fecha_venta,
                           precio_pactado, monto_separacion, monto_inicial,
                           cuotas_inicial, cuotas_capital)
values ('a8000000-0000-0000-0000-000000000101',
        'a8000000-0000-0000-0000-000000000011',
        'a8000000-0000-0000-0000-000000000020',
        'a8000000-0000-0000-0000-000000000030',
        '2025-01-01', 250000, 0, 0, 1, 1);
select public.generar_plan_pagos('a8000000-0000-0000-0000-000000000101');

-- Venta C (SIN vendedor): para probar que el vendedor no la ve en los reportes.
insert into public.ventas (id, solar_id, cliente_id, vendedor_id, fecha_venta,
                           precio_pactado, monto_separacion, monto_inicial,
                           cuotas_inicial, cuotas_capital)
values ('a8000000-0000-0000-0000-000000000102',
        'a8000000-0000-0000-0000-000000000012',
        'a8000000-0000-0000-0000-000000000020',
        null,
        '2026-03-10', 750000, 37500, 100000, 6, 1);
select public.generar_plan_pagos('a8000000-0000-0000-0000-000000000102');

-- Venta D (con vendedor): se cancela; sus cuotas no deben salir en vencidas.
insert into public.ventas (id, solar_id, cliente_id, vendedor_id, fecha_venta,
                           precio_pactado, monto_separacion, monto_inicial,
                           cuotas_inicial, cuotas_capital)
values ('a8000000-0000-0000-0000-000000000103',
        'a8000000-0000-0000-0000-000000000013',
        'a8000000-0000-0000-0000-000000000020',
        'a8000000-0000-0000-0000-000000000030',
        '2025-01-01', 750000, 37500, 100000, 6, 1);
select public.generar_plan_pagos('a8000000-0000-0000-0000-000000000103');

-- -----------------------------------------------------------------------------
-- 1. Inventario por estado
-- -----------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"a8b1b1b1-0000-0000-0000-000000000002","role":"authenticated"}';

do $$
declare v_total int; v_separado int; v_suma_solares numeric; v_suma_reporte numeric;
begin
  -- La suma de las cantidades del reporte = total de solares que ve el rol.
  select sum(cantidad) into v_total from public.reporte_inventario;
  perform public.anotar_rep(
    'inventario: la suma de cantidades = total de solares',
    v_total = (select count(*) from public.solares), coalesce(v_total::text,'null'));

  -- Las 4 ventas dejaron sus solares en `separado`; el quinto sigue libre.
  select cantidad into v_separado from public.reporte_inventario where estado = 'separado';
  perform public.anotar_rep(
    'inventario: hay solares en estado separado por las ventas',
    coalesce(v_separado,0) >= 4, coalesce(v_separado::text,'null'));

  -- El valor_total agregado cuadra con la suma directa de la tabla.
  select coalesce(sum(valor_total),0) into v_suma_reporte from public.reporte_inventario;
  select coalesce(sum(valor_total),0) into v_suma_solares from public.solares;
  perform public.anotar_rep(
    'inventario: el valor_total agregado cuadra con solares',
    v_suma_reporte = v_suma_solares,
    v_suma_reporte::text || ' vs ' || v_suma_solares::text);
end $$;

-- -----------------------------------------------------------------------------
-- 2. Recaudo mensual y su relación con lo recibido
-- -----------------------------------------------------------------------------

do $$
declare v_marzo numeric; v_pagos int;
begin
  -- Administración cobra la separación (37,500) y la inicial (100,000) en marzo.
  perform public.registrar_pago(
    'a8000000-0000-0000-0000-000000000100', '2026-03-15', 37500, 'efectivo');
  perform public.registrar_pago(
    'a8000000-0000-0000-0000-000000000100', '2026-03-20', 100000, 'transferencia');

  select recaudo_neto, pagos into v_marzo, v_pagos
    from public.reporte_recaudo_mensual where mes = '2026-03-01';

  perform public.anotar_rep(
    'recaudo: marzo suma 137,500 en 2 pagos',
    v_marzo = 137500 and v_pagos = 2,
    coalesce(v_marzo::text,'null') || ' / ' || coalesce(v_pagos::text,'null'));
end $$;

-- El neto del reporte, mes a mes, es el mismo dinero que el resumen de cobros:
-- ambos usan la misma fórmula (un reverso restaría en los dos por igual).
set local request.jwt.claims = '{"sub":"a8b1b1b1-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare v_por_mes numeric; v_por_venta numeric;
begin
  select coalesce(sum(recaudo_neto),0) into v_por_mes from public.reporte_recaudo_mensual;
  select coalesce(sum(total_recibido),0) into v_por_venta from public.reporte_ventas;
  perform public.anotar_rep(
    'recaudo: la suma mensual = la suma de lo recibido por venta',
    v_por_mes = v_por_venta,
    v_por_mes::text || ' vs ' || v_por_venta::text);
end $$;

-- -----------------------------------------------------------------------------
-- 3. reporte_ventas: balance y cartera
-- -----------------------------------------------------------------------------

do $$
declare v public.reporte_ventas%rowtype;
begin
  select * into v from public.reporte_ventas
   where venta_id = 'a8000000-0000-0000-0000-000000000100';

  perform public.anotar_rep(
    'ventas: total_recibido de la venta A = 137,500',
    v.total_recibido = 137500, coalesce(v.total_recibido::text,'null'));

  perform public.anotar_rep(
    'ventas: balance_pendiente = precio - aplicado (750,000 - 137,500)',
    v.balance_pendiente = 612500, coalesce(v.balance_pendiente::text,'null'));

  perform public.anotar_rep(
    'ventas: trae la etiqueta del solar (R / 1)',
    v.manzana_codigo = 'R' and v.solar_numero = '1',
    coalesce(v.manzana_codigo,'null') || ' / ' || coalesce(v.solar_numero,'null'));
end $$;

-- -----------------------------------------------------------------------------
-- 4. Cuotas vencidas
-- -----------------------------------------------------------------------------

do $$
declare v_saldo numeric; v_dias int; v_n int;
begin
  -- La venta B (2025, sin pagar) tiene su capital vencido por 250,000.
  select saldo, dias_vencida into v_saldo, v_dias
    from public.reporte_cuotas_vencidas
   where venta_id = 'a8000000-0000-0000-0000-000000000101';

  perform public.anotar_rep(
    'vencidas: la cuota vieja sin pagar aparece con su saldo (250,000)',
    v_saldo = 250000, coalesce(v_saldo::text,'null'));

  perform public.anotar_rep(
    'vencidas: los días de atraso son positivos',
    v_dias > 0, coalesce(v_dias::text,'null'));

  -- La venta A tiene cuotas futuras (2026) que aún no vencen: no la del capital.
  perform public.anotar_rep(
    'vencidas: una cuota que aún no vence no aparece',
    not exists (
      select 1 from public.reporte_cuotas_vencidas
      where venta_id = 'a8000000-0000-0000-0000-000000000100'
        and fecha_vencimiento >= current_date),
    'apareció una cuota no vencida');
end $$;

-- Cancelar la venta D (es de gerencia): sus cuotas no deben salir en vencidas.
set local request.jwt.claims = '{"sub":"a8b1b1b1-0000-0000-0000-000000000003","role":"authenticated"}';
do $$
begin
  perform public.cancelar_venta('a8000000-0000-0000-0000-000000000103', 'prueba de reportes');
  perform public.anotar_rep(
    'vencidas: una venta cancelada no aporta cuotas vencidas',
    not exists (
      select 1 from public.reporte_cuotas_vencidas
      where venta_id = 'a8000000-0000-0000-0000-000000000103'),
    'la venta cancelada dejó cuotas vencidas');
end $$;

-- -----------------------------------------------------------------------------
-- 5. Lo que ve cada rol (security_invoker hereda la RLS)
-- -----------------------------------------------------------------------------

-- Administración ve todas las ventas activas en el reporte.
do $$
declare v_n int;
begin
  select count(*) into v_n from public.reporte_ventas;
  perform public.anotar_rep(
    'ventas: administración ve todas las ventas (incluida la sin vendedor)',
    v_n >= 4 and exists (
      select 1 from public.reporte_ventas
      where venta_id = 'a8000000-0000-0000-0000-000000000102'),
    v_n::text);
end $$;

-- El vendedor solo ve las suyas: no la venta C (sin vendedor).
set local request.jwt.claims = '{"sub":"a8b1b1b1-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare v_n int; v_ajena int;
begin
  select count(*) into v_n from public.reporte_ventas;
  select count(*) into v_ajena from public.reporte_ventas
   where venta_id = 'a8000000-0000-0000-0000-000000000102';
  perform public.anotar_rep(
    'ventas: el vendedor ve solo las suyas, no la venta sin vendedor',
    v_n >= 1 and v_ajena = 0, v_n::text || ' / ajena=' || v_ajena::text);
end $$;

-- El recaudo que ve el vendedor es solo el de sus ventas (la venta A es suya).
do $$
declare v_mes numeric;
begin
  select coalesce(sum(recaudo_neto),0) into v_mes from public.reporte_recaudo_mensual;
  perform public.anotar_rep(
    'recaudo: el vendedor ve el recaudo de sus ventas',
    v_mes = 137500, coalesce(v_mes::text,'null'));
end $$;

-- Sus cuotas vencidas: la venta B es suya, así que la ve.
do $$
begin
  perform public.anotar_rep(
    'vencidas: el vendedor ve las cuotas vencidas de sus ventas',
    exists (
      select 1 from public.reporte_cuotas_vencidas
      where venta_id = 'a8000000-0000-0000-0000-000000000101'),
    'no ve su propia cuota vencida');
end $$;

-- Un vendedor sin ventas propias no ve ninguna en los reportes.
reset role;
set local request.jwt.claims = '{}';
update public.vendedores set perfil_id = null
  where id = 'a8000000-0000-0000-0000-000000000030';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a8b1b1b1-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare v_ventas int; v_vencidas int; v_recaudo numeric;
begin
  select count(*) into v_ventas from public.reporte_ventas;
  select count(*) into v_vencidas from public.reporte_cuotas_vencidas;
  select coalesce(sum(recaudo_neto),0) into v_recaudo from public.reporte_recaudo_mensual;
  perform public.anotar_rep(
    'un vendedor sin ventas propias no ve nada en los reportes',
    v_ventas = 0 and v_vencidas = 0 and v_recaudo = 0,
    v_ventas::text || ' / ' || v_vencidas::text || ' / ' || v_recaudo::text);
end $$;

-- -----------------------------------------------------------------------------
-- Resultados
-- -----------------------------------------------------------------------------

reset role;
set local request.jwt.claims = '{}';
select n, prueba, resultado from public.resultados_pruebas_rep order by n;

rollback;
