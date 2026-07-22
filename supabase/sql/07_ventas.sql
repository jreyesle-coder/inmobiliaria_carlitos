-- =============================================================================
-- Sprint 4 · Ventas, contrato y plan de pagos
-- =============================================================================
-- Se aplica DESPUÉS de `05_personas.sql`. Es idempotente.
--
-- Lo que este archivo hace cumplir en la base de datos, no en la UI:
--   * Un solar no puede tener dos ventas activas a la vez.
--   * La venta recorre el mismo pipeline que el solar, sin saltos, y el solar
--     sigue a la venta: el estado del inventario no se toca a mano cuando hay
--     una venta detrás.
--   * El plan de cuotas suma exactamente el precio pactado. Siempre.
--   * Una cuota con dinero aplicado no se cambia ni se borra.
--   * Cancelar una venta es de gerencia y libera el solar dejando rastro.
--
-- Las claves de negocio (`cuotas_inicial_por_defecto`, `separacion_porcentaje`)
-- se escriben aquí con `do update` a propósito: el `insert` del Sprint 1 es
-- `on conflict do nothing` y no pisa una base que ya quedó con los valores
-- viejos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Valores de negocio confirmados por Julio el 22 de julio de 2026
-- -----------------------------------------------------------------------------

insert into public.configuracion (clave, valor, descripcion) values
  ('cuotas_inicial_por_defecto', '6',
   'Cuotas en que se divide la inicial. Confirmado: 6 (por el momento).'),
  ('separacion_porcentaje', '0.0500',
   'Separación (apartado) como fracción del valor del solar. Confirmado: 5%.'),
  ('cuotas_capital_por_defecto', '1',
   'Sugerencia de cuotas para el capital. El plazo real se pacta por venta.')
on conflict (clave) do update
  set valor = excluded.valor,
      descripcion = excluded.descripcion,
      actualizado_en = now();

-- -----------------------------------------------------------------------------
-- 2. Columnas que agrega el Sprint 4
-- -----------------------------------------------------------------------------
-- También están en `src/db/esquema.ts` y en la migración de Drizzle; aquí van
-- con `if not exists` para poder aplicar el archivo sobre la base que ya está
-- corriendo.

alter table public.ventas
  add column if not exists cuotas_capital integer not null default 1,
  add column if not exists fecha_cancelacion date,
  add column if not exists motivo_cancelacion text;

-- -----------------------------------------------------------------------------
-- 3. Integridad de la venta
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ventas_precio_positivo') then
    alter table public.ventas
      add constraint ventas_precio_positivo check (precio_pactado > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ventas_montos_no_negativos') then
    alter table public.ventas
      add constraint ventas_montos_no_negativos
      check (monto_separacion >= 0 and monto_inicial >= 0);
  end if;

  -- Lo pactado no puede pasarse del precio: si la separación y la inicial ya
  -- cubren todo, no hay capital, y nunca puede haber capital negativo.
  if not exists (select 1 from pg_constraint where conname = 'ventas_montos_dentro_del_precio') then
    alter table public.ventas
      add constraint ventas_montos_dentro_del_precio
      check (monto_separacion + monto_inicial <= precio_pactado);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ventas_cuotas_positivas') then
    alter table public.ventas
      add constraint ventas_cuotas_positivas
      check (cuotas_inicial >= 1 and cuotas_capital >= 1);
  end if;

  -- Una venta cancelada dice desde cuándo; una viva no puede fingir que lo está.
  if not exists (select 1 from pg_constraint where conname = 'ventas_cancelacion_coherente') then
    alter table public.ventas
      add constraint ventas_cancelacion_coherente
      check ((estado = 'cancelada') = (fecha_cancelacion is not null));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cuotas_monto_positivo') then
    alter table public.cuotas
      add constraint cuotas_monto_positivo check (monto_esperado > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cuotas_numero_positivo') then
    alter table public.cuotas
      add constraint cuotas_numero_positivo check (numero >= 1);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cuotas_aplicado_no_negativo') then
    alter table public.cuotas
      add constraint cuotas_aplicado_no_negativo check (monto_aplicado >= 0);
  end if;
end $$;

-- Un solar se vende una vez. Las canceladas no estorban: quedan como historia.
create unique index if not exists ventas_solar_activa_unica
  on public.ventas (solar_id) where estado <> 'cancelada';

create index if not exists cuotas_venta_idx on public.cuotas (venta_id);
create index if not exists cuotas_vencimiento_idx on public.cuotas (fecha_vencimiento);
create index if not exists ventas_estado_idx on public.ventas (estado);

-- -----------------------------------------------------------------------------
-- 4. Pipeline de la venta
-- -----------------------------------------------------------------------------
-- Mismo recorrido que el solar, con vuelta atrás de un paso. `cancelada` se
-- puede pedir desde cualquier estado que no sea `saldado`, y de ahí no se
-- vuelve: una venta que se cae se registra de nuevo, no se resucita.
--
-- Las mismas reglas están en `src/lib/ventas.ts` para no ofrecer botones
-- imposibles; la barrera real es esta.

create or replace function public.transicion_venta_valida(
  p_desde public.estado_venta,
  p_hasta public.estado_venta
)
returns boolean
language sql
immutable
as $$
  select case p_desde
    when 'separado'  then p_hasta in ('inicial', 'cancelada')
    when 'inicial'   then p_hasta in ('capital', 'separado', 'cancelada')
    when 'capital'   then p_hasta in ('saldado', 'inicial', 'cancelada')
    when 'saldado'   then false
    when 'cancelada' then false
    else false
  end;
$$;

/** Estado que le corresponde al solar según cómo va la venta. */
create or replace function public.estado_solar_de_venta(
  p_estado public.estado_venta
)
returns public.estado_solar
language sql
immutable
as $$
  select case p_estado
    when 'separado'  then 'separado'::public.estado_solar
    when 'inicial'   then 'inicial'::public.estado_solar
    when 'capital'   then 'capital'::public.estado_solar
    when 'saldado'   then 'saldado'::public.estado_solar
    when 'cancelada' then 'libre'::public.estado_solar
  end;
$$;

create or replace function public.fn_validar_venta()
returns trigger
language plpgsql
as $$
declare
  v_estado_solar public.estado_solar;
begin
  if tg_op = 'INSERT' then
    select estado into v_estado_solar from public.solares where id = new.solar_id;

    if v_estado_solar is distinct from 'libre' then
      raise exception
        'El solar no está libre (está %): no se puede registrar la venta.',
        v_estado_solar;
    end if;

    if new.estado <> 'separado' then
      raise exception 'Una venta nueva entra como separada.';
    end if;

    return new;
  end if;

  if new.estado is distinct from old.estado
     and not public.transicion_venta_valida(old.estado, new.estado) then
    raise exception 'Transición de estado no permitida para la venta: % → %.',
      old.estado, new.estado;
  end if;

  -- El solar y el cliente son la identidad de la venta: aparecen en el
  -- contrato y en los recibos. Si hay dinero registrado, no se cambian.
  if (new.solar_id is distinct from old.solar_id
      or new.cliente_id is distinct from old.cliente_id)
     and exists (select 1 from public.pagos p where p.venta_id = old.id) then
    raise exception
      'La venta ya tiene pagos registrados: no se puede cambiar el solar ni el cliente.';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_validar_venta on public.ventas;
create trigger tr_validar_venta
  before insert or update on public.ventas
  for each row execute function public.fn_validar_venta();

-- -----------------------------------------------------------------------------
-- 5. El solar sigue a la venta
-- -----------------------------------------------------------------------------
-- Con una venta detrás, el estado del inventario deja de ser un dato suelto:
-- lo dicta la venta. `security definer` porque quien registra la venta puede
-- no tener permiso de escritura sobre el solar.

create or replace function public.fn_sincronizar_solar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_destino public.estado_solar;
begin
  if tg_op = 'UPDATE' and new.estado is not distinct from old.estado then
    return new;
  end if;

  v_destino := public.estado_solar_de_venta(new.estado);

  update public.solares
     set estado = v_destino
   where id = new.solar_id
     and estado is distinct from v_destino;

  return new;
end;
$$;

drop trigger if exists tr_sincronizar_solar on public.ventas;
create trigger tr_sincronizar_solar
  after insert or update of estado on public.ventas
  for each row execute function public.fn_sincronizar_solar();

-- Se redefine la validación del solar del Sprint 2 para dejar pasar una
-- liberación: un solar separado, en inicial o en capital vuelve a `libre`
-- cuando ya no tiene venta activa (se canceló). `saldado` sigue siendo final y
-- los saltos hacia adelante siguen prohibidos.
--
-- ESTA FUNCIÓN ES IDÉNTICA A LA DE `03_inventario.sql`. Si se cambia una, se
-- cambia la otra: así el resultado no depende del orden en que se apliquen.
create or replace function public.fn_validar_solar()
returns trigger
language plpgsql
as $$
begin
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

  if new.manzana_id is distinct from old.manzana_id
     and exists (select 1 from public.ventas v
                 where v.solar_id = old.id and v.estado <> 'cancelada') then
    raise exception 'No se puede cambiar de manzana un solar con venta activa.';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Plan de pagos
-- -----------------------------------------------------------------------------
-- Separación (una cuota, el día de la venta) + inicial en N cuotas mensuales +
-- capital en M cuotas mensuales que arrancan cuando termina la inicial.
--
-- El residuo del redondeo va en la ÚLTIMA cuota de cada bloque: por eso la
-- suma del plan es exactamente el precio pactado, y eso se comprueba al final
-- de la función. `src/lib/ventas.ts` reparte igual para poder mostrar el plan
-- antes de guardarlo.
--
-- Sin interés ni mora: preparados y desactivados (ver CLAUDE.md).

-- `security definer` con la comprobación de rol adentro: rehacer un plan
-- implica borrar cuotas, y borrar cuotas sueltas es de gerencia (política
-- `cuotas_delete` del Sprint 1). Administración sí arma y corrige planes, que
-- es su trabajo, pero solo por esta puerta.
create or replace function public.generar_plan_pagos(p_venta_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venta      public.ventas%rowtype;
  v_capital    numeric(14,2);
  v_base       numeric(14,2);
  v_asignado   numeric(14,2);
  v_total      numeric(14,2);
  v_generadas  integer := 0;
  i            integer;
begin
  -- `auth.uid() is null` es una sesión de mantenimiento (migración del Excel,
  -- script del panel): ahí no hay rol que consultar y no se estorba.
  if auth.uid() is not null and not public.es_admin_o_gerencia() then
    raise exception 'Solo administración o gerencia arman el plan de pagos.';
  end if;

  select * into v_venta from public.ventas where id = p_venta_id;
  if not found then
    raise exception 'La venta indicada no existe.';
  end if;

  if v_venta.estado = 'cancelada' then
    raise exception 'La venta está cancelada: no se le genera plan de pagos.';
  end if;

  -- Regenerar es normal mientras no haya entrado dinero (se corrige el precio,
  -- la inicial, el plazo). En cuanto hay un peso aplicado, el plan se congela.
  if exists (
    select 1 from public.cuotas c
    where c.venta_id = p_venta_id and c.monto_aplicado > 0
  ) then
    raise exception
      'El plan ya tiene pagos aplicados: no se puede regenerar (reverse los pagos primero).';
  end if;

  delete from public.cuotas where venta_id = p_venta_id;

  v_capital := v_venta.precio_pactado
             - v_venta.monto_separacion
             - v_venta.monto_inicial;

  -- Separación: se paga el día en que se aparta el solar.
  if v_venta.monto_separacion > 0 then
    insert into public.cuotas (venta_id, tipo, numero, monto_esperado, fecha_vencimiento)
    values (p_venta_id, 'separacion', 1, v_venta.monto_separacion, v_venta.fecha_venta);
    v_generadas := v_generadas + 1;
  end if;

  -- Inicial: mensual, la primera al mes de la venta.
  if v_venta.monto_inicial > 0 then
    v_base := trunc(v_venta.monto_inicial / v_venta.cuotas_inicial, 2);
    v_asignado := 0;
    for i in 1 .. v_venta.cuotas_inicial loop
      insert into public.cuotas (venta_id, tipo, numero, monto_esperado, fecha_vencimiento)
      values (
        p_venta_id, 'inicial', i,
        case when i = v_venta.cuotas_inicial
             then v_venta.monto_inicial - v_asignado
             else v_base end,
        (v_venta.fecha_venta + (i || ' month')::interval)::date
      );
      v_asignado := v_asignado + v_base;
      v_generadas := v_generadas + 1;
    end loop;
  end if;

  -- Capital: arranca donde termina la inicial.
  if v_capital > 0 then
    v_base := trunc(v_capital / v_venta.cuotas_capital, 2);
    v_asignado := 0;
    for i in 1 .. v_venta.cuotas_capital loop
      insert into public.cuotas (venta_id, tipo, numero, monto_esperado, fecha_vencimiento)
      values (
        p_venta_id, 'capital', i,
        case when i = v_venta.cuotas_capital
             then v_capital - v_asignado
             else v_base end,
        (v_venta.fecha_venta
          + ((case when v_venta.monto_inicial > 0 then v_venta.cuotas_inicial else 0 end + i)
             || ' month')::interval)::date
      );
      v_asignado := v_asignado + v_base;
      v_generadas := v_generadas + 1;
    end loop;
  end if;

  -- La razón de ser de todo lo anterior: el plan tiene que cuadrar con el
  -- total. Si no cuadra, no se guarda nada.
  select coalesce(sum(monto_esperado), 0) into v_total
  from public.cuotas where venta_id = p_venta_id;

  if v_total <> v_venta.precio_pactado then
    raise exception
      'El plan generado (%) no cuadra con el precio pactado (%).',
      v_total, v_venta.precio_pactado;
  end if;

  return v_generadas;
end;
$$;

revoke all on function public.generar_plan_pagos(uuid) from public, anon;
grant execute on function public.generar_plan_pagos(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Una cuota con dinero encima no se toca
-- -----------------------------------------------------------------------------
-- `monto_aplicado` y `estado` sí se mueven: los va a mantener el trigger de
-- pagos del Sprint 5. Lo que se congela es lo pactado (monto, fecha, tipo).

create or replace function public.fn_proteger_cuota()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.monto_aplicado > 0 then
      raise exception
        'La cuota tiene pagos aplicados: no se puede eliminar.';
    end if;
    return old;
  end if;

  if old.monto_aplicado > 0
     and (new.monto_esperado is distinct from old.monto_esperado
          or new.fecha_vencimiento is distinct from old.fecha_vencimiento
          or new.tipo is distinct from old.tipo
          or new.numero is distinct from old.numero
          or new.venta_id is distinct from old.venta_id) then
    raise exception
      'La cuota tiene pagos aplicados: solo se corrige reversando el pago.';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_proteger_cuota on public.cuotas;
create trigger tr_proteger_cuota
  before update or delete on public.cuotas
  for each row execute function public.fn_proteger_cuota();

-- -----------------------------------------------------------------------------
-- 8. Cancelar una venta
-- -----------------------------------------------------------------------------
-- Es de gerencia: devuelve el solar al inventario y deja el motivo escrito.
-- `security definer` con la comprobación de rol adentro, igual que
-- `asignar_rol`: la operación toca ventas, cuotas y solares a la vez.

create or replace function public.cancelar_venta(
  p_venta_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado public.estado_venta;
begin
  if not public.es_gerencia() then
    raise exception 'Solo gerencia puede cancelar una venta.';
  end if;

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Escriba el motivo de la cancelación.';
  end if;

  select estado into v_estado from public.ventas where id = p_venta_id;
  if not found then
    raise exception 'La venta indicada no existe.';
  end if;
  if v_estado = 'cancelada' then
    raise exception 'La venta ya está cancelada.';
  end if;
  if v_estado = 'saldado' then
    raise exception 'Una venta saldada no se cancela.';
  end if;

  if exists (select 1 from public.pagos p where p.venta_id = p_venta_id) then
    raise exception
      'La venta tiene pagos registrados: reverse los pagos antes de cancelarla.';
  end if;

  -- Las cuotas son lo esperado, no dinero recibido: sin pagos aplicados se van
  -- con la venta. El rastro de que existieron queda en la bitácora.
  delete from public.cuotas where venta_id = p_venta_id;

  update public.ventas
     set estado = 'cancelada',
         fecha_cancelacion = current_date,
         motivo_cancelacion = btrim(p_motivo)
   where id = p_venta_id;
end;
$$;

revoke all on function public.cancelar_venta(uuid, text) from public, anon;
grant execute on function public.cancelar_venta(uuid, text) to authenticated;
