-- =============================================================================
-- Sprint 6 · Comisiones
-- =============================================================================
-- Regla confirmada por Julio el 27 de julio de 2026 (por el momento, así que
-- vive en `configuracion`, no en el código):
--
--   * La comisión es un PORCENTAJE, igual para todos los vendedores.
--   * Se calcula sobre el PRECIO PACTADO de la venta.
--   * Se genera CUANDO SE COMPLETA LA INICIAL (la venta llega a `capital`).
--   * El porcentaje arranca en 3% y lo cambia gerencia desde el sistema.
--
-- Generar la comisión NO es pagarla: nace en `pendiente` y gerencia la marca
-- `pagada` cuando corresponde. Nada de esto es dinero que entra o sale por caja
-- (eso son los pagos): es lo que la empresa le debe al vendedor.
--
-- Se aplica después de `09_pagos.sql`. Este archivo REDEFINE dos funciones de
-- archivos anteriores —`avanzar_venta_por_pagos` (de 09) y `cancelar_venta`
-- (de 09)— para engancharles la comisión: aplicar 09 después de 12 revierte esa
-- parte. Aplicar siempre en orden.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. La clave de negocio: el porcentaje de comisión
-- -----------------------------------------------------------------------------
-- Fracción, como `separacion_porcentaje`: 0.0300 = 3%. `on conflict do nothing`
-- para no pisar el valor que gerencia haya cambiado desde el sistema.

insert into public.configuracion (clave, valor, descripcion) values
  ('comision_porcentaje', '0.0300',
   'Comisión del vendedor como fracción del precio pactado. Confirmado: 3%.')
on conflict (clave) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Una sola comisión por venta
-- -----------------------------------------------------------------------------
-- La generación es automática e idempotente; esta restricción es el candado que
-- hace que un segundo pago no cree una segunda comisión. Es el mismo objeto que
-- describe el esquema Drizzle (`drizzle/0004_comisiones_sprint6.sql`); acá se
-- agrega con guardia para que el archivo se pueda aplicar solo, sin migrar.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'comisiones_venta_unico'
  ) then
    alter table public.comisiones
      add constraint comisiones_venta_unico unique (venta_id);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Generar la comisión de una venta
-- -----------------------------------------------------------------------------
-- Idempotente y defensiva: solo hace algo si la venta ya completó la inicial
-- (estado `capital` o más), tiene vendedor y no tiene comisión todavía. La
-- llama `avanzar_venta_por_pagos`, así que nace sola con el pago que completa
-- la inicial; llamarla de más no duplica ni rompe nada.

create or replace function public.generar_comision(p_venta_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venta      public.ventas%rowtype;
  v_porcentaje numeric(7,4);
  v_monto      numeric(14,2);
  v_id         uuid := gen_random_uuid();
begin
  select * into v_venta from public.ventas where id = p_venta_id;
  if not found then
    return null;
  end if;

  -- Sin vendedor no hay a quién pagarle (ventas históricas del Excel sin
  -- `VEND COM.`): no se inventa una comisión huérfana.
  if v_venta.vendedor_id is null then
    return null;
  end if;

  -- El hito es completar la inicial: la venta en `capital` o `saldado`.
  if public.orden_estado_venta(v_venta.estado) < 3 then
    return null;
  end if;

  -- Ya existe: no se toca (idempotencia; el índice único es el respaldo).
  if exists (select 1 from public.comisiones where venta_id = p_venta_id) then
    return null;
  end if;

  v_porcentaje := coalesce(
    (select valor::numeric from public.configuracion
      where clave = 'comision_porcentaje'),
    0.0300);

  v_monto := round(v_venta.precio_pactado * v_porcentaje, 2);

  insert into public.comisiones (
    id, venta_id, vendedor_id, base_calculo, porcentaje, monto,
    estado, fecha_generacion
  ) values (
    v_id, p_venta_id, v_venta.vendedor_id, v_venta.precio_pactado,
    v_porcentaje, v_monto, 'pendiente', current_date
  )
  on conflict (venta_id) do nothing;

  return v_id;
end;
$$;

revoke all on function public.generar_comision(uuid) from public, anon;
grant execute on function public.generar_comision(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Enganchar la generación al avance de la venta
-- -----------------------------------------------------------------------------
-- REDEFINE la de `09_pagos.sql`: el cuerpo es idéntico y al final, si la venta
-- quedó en `capital` o más, genera la comisión. Es el punto exacto donde "se
-- completa la inicial", así que es su lugar natural. `generar_comision` es
-- idempotente, así que no importa cuántas veces se pase por aquí.

create or replace function public.avanzar_venta_por_pagos(p_venta_id uuid)
returns public.estado_venta
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado   public.estado_venta;
  v_destino  public.estado_venta;
  v_pend_sep numeric(14,2);
  v_pend_ini numeric(14,2);
  v_pend_tot numeric(14,2);
begin
  select estado into v_estado from public.ventas where id = p_venta_id;
  if v_estado is null or public.orden_estado_venta(v_estado) = 0 then
    return v_estado;
  end if;

  -- Sin plan de cuotas no hay nada que deducir: el estado se mueve a mano.
  if not exists (select 1 from public.cuotas where venta_id = p_venta_id) then
    return v_estado;
  end if;

  select
    coalesce(sum(case when tipo = 'separacion'
                      then greatest(monto_esperado - monto_aplicado, 0) end), 0),
    coalesce(sum(case when tipo = 'inicial'
                      then greatest(monto_esperado - monto_aplicado, 0) end), 0),
    coalesce(sum(greatest(monto_esperado - monto_aplicado, 0)), 0)
  into v_pend_sep, v_pend_ini, v_pend_tot
  from public.cuotas where venta_id = p_venta_id;

  v_destino := case
    when v_pend_tot <= 0 then 'saldado'::public.estado_venta
    when v_pend_sep <= 0 and v_pend_ini <= 0 then 'capital'::public.estado_venta
    when v_pend_sep <= 0 then 'inicial'::public.estado_venta
    else v_estado
  end;

  -- Un paso a la vez: el trigger `tr_validar_venta` rechaza los saltos y es
  -- quien mueve el solar detrás de cada paso.
  while public.orden_estado_venta(v_destino) > public.orden_estado_venta(v_estado) loop
    v_estado := case v_estado
      when 'separado' then 'inicial'::public.estado_venta
      when 'inicial'  then 'capital'::public.estado_venta
      when 'capital'  then 'saldado'::public.estado_venta
    end;
    update public.ventas set estado = v_estado where id = p_venta_id;
  end loop;

  -- Completada la inicial (la venta llegó a `capital` o más), nace la comisión.
  if public.orden_estado_venta(v_estado) >= 3 then
    perform public.generar_comision(p_venta_id);
  end if;

  return v_estado;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Marcar una comisión pagada (o devolverla a pendiente)
-- -----------------------------------------------------------------------------
-- Solo gerencia. Al pagar deja escrito cuándo y quién; al revertir lo borra.
-- La comisión NO es inmutable (a diferencia de pagos y recibos): pagarla es un
-- acto administrativo que se corrige, no un movimiento de caja. Queda en la
-- bitácora por el trigger de auditoría.

create or replace function public.marcar_comision(
  p_comision_id uuid,
  p_pagada boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_gerencia() then
    raise exception 'Solo gerencia marca las comisiones.';
  end if;

  if not exists (select 1 from public.comisiones where id = p_comision_id) then
    raise exception 'La comisión indicada no existe.';
  end if;

  if p_pagada then
    update public.comisiones
       set estado = 'pagada',
           fecha_pago = current_date,
           pagada_por = auth.uid(),
           actualizado_en = now()
     where id = p_comision_id;
  else
    update public.comisiones
       set estado = 'pendiente',
           fecha_pago = null,
           pagada_por = null,
           actualizado_en = now()
     where id = p_comision_id;
  end if;
end;
$$;

revoke all on function public.marcar_comision(uuid, boolean) from public, anon;
grant execute on function public.marcar_comision(uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Cambiar una clave de configuración desde el sistema
-- -----------------------------------------------------------------------------
-- Para que gerencia ajuste el porcentaje de comisión (y las otras cifras "por
-- el momento") sin desplegar. Whitelist explícita: solo estas claves de negocio
-- se tocan por aquí, y cada una se valida. Las demás claves de `configuracion`
-- (moneda, banderas de interés/mora/NCF) no se exponen.

create or replace function public.establecer_configuracion(
  p_clave text,
  p_valor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_num numeric;
begin
  if not public.es_gerencia() then
    raise exception 'Solo gerencia cambia la configuración.';
  end if;

  if p_clave in ('comision_porcentaje', 'separacion_porcentaje') then
    begin
      v_num := p_valor::numeric;
    exception when others then
      raise exception 'El porcentaje debe ser un número (fracción, p. ej. 0.03).';
    end;
    if v_num < 0 or v_num >= 1 then
      raise exception 'El porcentaje va entre 0 y 1 (0.03 = 3%%). Recibido: %.', p_valor;
    end if;

  elsif p_clave in ('cuotas_inicial_por_defecto', 'cuotas_capital_por_defecto') then
    begin
      v_num := p_valor::numeric;
    exception when others then
      raise exception 'El número de cuotas debe ser un entero mayor que cero.';
    end;
    if v_num < 1 or v_num <> trunc(v_num) then
      raise exception 'El número de cuotas debe ser un entero mayor que cero. Recibido: %.', p_valor;
    end if;

  else
    raise exception 'La clave "%" no se puede cambiar desde aquí.', p_clave;
  end if;

  insert into public.configuracion (clave, valor)
  values (p_clave, p_valor)
  on conflict (clave) do update set valor = excluded.valor;
end;
$$;

revoke all on function public.establecer_configuracion(text, text) from public, anon;
grant execute on function public.establecer_configuracion(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Cancelar una venta, ahora que puede tener comisión
-- -----------------------------------------------------------------------------
-- REDEFINE la de `09_pagos.sql`: mismo cuerpo, y además retira la comisión
-- PENDIENTE de la venta cancelada —una venta cancelada no le debe comisión a
-- nadie—. Una comisión ya PAGADA se queda como historia (el dinero ya salió),
-- igual que una cuota que llegó a cobrarse. Aplicar 09 después de 12 devuelve
-- la versión sin esta limpieza.

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
  v_neto   numeric(14,2);
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

  select coalesce(sum(case when es_reverso then -monto else monto end), 0)
  into v_neto
  from public.pagos where venta_id = p_venta_id;

  if v_neto > 0 then
    raise exception
      'La venta tiene % recibidos: reverse los pagos antes de cancelarla.', v_neto;
  end if;

  -- Las cuotas son lo esperado, no dinero recibido: se van con la venta. Pero
  -- una cuota que llegó a tener un pago —aunque después se reversara— conserva
  -- sus aplicaciones, y esas NO se borran nunca: son el rastro del dinero. Esa
  -- cuota se queda como historia de la venta cancelada, en cero.
  delete from public.cuotas c
   where c.venta_id = p_venta_id
     and not exists (
       select 1 from public.pago_aplicaciones pa where pa.cuota_id = c.id
     );

  -- Una comisión pendiente muere con la venta; una pagada es historia y se
  -- queda (el dinero ya salió al vendedor).
  delete from public.comisiones
   where venta_id = p_venta_id and estado = 'pendiente';

  update public.ventas
     set estado = 'cancelada',
         fecha_cancelacion = current_date,
         motivo_cancelacion = btrim(p_motivo)
   where id = p_venta_id;
end;
$$;

revoke all on function public.cancelar_venta(uuid, text) from public, anon;
grant execute on function public.cancelar_venta(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Resumen de comisiones por vendedor
-- -----------------------------------------------------------------------------
-- Una sola definición de "cuánto se le debe a cada vendedor y cuánto ya se le
-- pagó", para que la pantalla y los reportes no la calculen cada uno a su
-- manera. `security_invoker`: hereda las políticas de `comisiones`, así que un
-- vendedor solo ve su propia fila.

create or replace view public.comisiones_por_vendedor as
select
  c.vendedor_id,
  count(*) as total_comisiones,
  count(*) filter (where c.estado = 'pendiente') as pendientes,
  count(*) filter (where c.estado = 'pagada') as pagadas,
  coalesce(sum(c.monto) filter (where c.estado = 'pendiente'), 0) as monto_pendiente,
  coalesce(sum(c.monto) filter (where c.estado = 'pagada'), 0) as monto_pagado,
  coalesce(sum(c.monto), 0) as monto_total
from public.comisiones c
group by c.vendedor_id;

alter view public.comisiones_por_vendedor set (security_invoker = on);

grant select on public.comisiones_por_vendedor to authenticated;
