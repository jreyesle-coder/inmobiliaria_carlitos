-- =============================================================================
-- Sprint 5 · Pagos, aplicaciones y recibos inmutables
-- =============================================================================
-- Se aplica DESPUÉS de `07_ventas.sql`. Es idempotente.
--
-- Lo que este archivo hace cumplir en la base de datos, no en la UI:
--   * Un pago, sus aplicaciones y su recibo entran en UNA sola transacción:
--     `registrar_pago`. No existe forma de que quede dinero sin recibo.
--   * Una cuota nunca recibe más de lo que se le espera, y un pago nunca
--     reparte más de lo que se recibió. Lo que sobra queda como saldo a favor
--     del pago, no como una cuota inflada.
--   * `cuotas.monto_aplicado` no lo escribe nadie a mano: lo recalcula un
--     trigger sumando las aplicaciones.
--   * Un pago no se edita ni se borra: se REVERSA con otro pago que lo anula y
--     emite una nota de crédito contra el recibo original. Todo es `insert`.
--   * El recibo es inmutable desde el Sprint 1; aquí se le fija la ruta del PDF
--     al momento de emitirlo (no se puede actualizar después).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columnas y reglas del reverso
-- -----------------------------------------------------------------------------
-- También están en `src/db/esquema.ts` y en `drizzle/0003_pagos_sprint5.sql`;
-- aquí van con `if not exists` para poder aplicarlo sobre la base que corre.

alter table public.pagos
  add column if not exists es_reverso boolean not null default false,
  add column if not exists pago_reversado_id uuid,
  add column if not exists motivo_reverso text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pagos_reversado_fk') then
    alter table public.pagos
      add constraint pagos_reversado_fk
      foreign key (pago_reversado_id) references public.pagos (id);
  end if;

  -- Un reverso dice a quién anula y por qué; un pago normal no finge serlo.
  if not exists (select 1 from pg_constraint where conname = 'pagos_reverso_coherente') then
    alter table public.pagos
      add constraint pagos_reverso_coherente
      check (
        es_reverso = (pago_reversado_id is not null)
        and (not es_reverso or coalesce(btrim(motivo_reverso), '') <> '')
      );
  end if;
end $$;

-- Un pago se reversa una sola vez.
create unique index if not exists pagos_reverso_unico
  on public.pagos (pago_reversado_id) where pago_reversado_id is not null;

create index if not exists pago_aplicaciones_cuota_idx
  on public.pago_aplicaciones (cuota_id);
create index if not exists pagos_fecha_idx on public.pagos (fecha_pago);
create index if not exists recibos_venta_idx on public.recibos (venta_id);

-- -----------------------------------------------------------------------------
-- 2. `cuotas.monto_aplicado` lo mantiene la base
-- -----------------------------------------------------------------------------
-- Se recalcula sumando las aplicaciones: las del reverso restan. Así el saldo
-- de una cuota nunca depende de que la aplicación se haya escrito bien desde
-- afuera, y una cuota no puede recibir más de lo que se le espera.

create or replace function public.saldo_cuota(p_cuota_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(sum(case when p.es_reverso then -pa.monto else pa.monto end), 0)
  from public.pago_aplicaciones pa
  join public.pagos p on p.id = pa.pago_id
  where pa.cuota_id = p_cuota_id;
$$;

create or replace function public.fn_recalcular_cuota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aplicado numeric(14,2);
  v_esperado numeric(14,2);
  v_estado   public.estado_cuota;
  v_pagado   numeric(14,2);
begin
  select public.saldo_cuota(new.cuota_id) into v_aplicado;
  select monto_esperado into v_esperado from public.cuotas where id = new.cuota_id;

  if v_aplicado > v_esperado then
    raise exception
      'A la cuota se le esperan % y se le estarían aplicando %.',
      v_esperado, v_aplicado;
  end if;

  -- Lo repartido de un pago nunca puede pasarse de lo que se recibió.
  select coalesce(sum(monto), 0) into v_pagado
  from public.pago_aplicaciones where pago_id = new.pago_id;

  if v_pagado > (select monto from public.pagos where id = new.pago_id) then
    raise exception
      'El pago no alcanza: se está repartiendo % de un pago de %.',
      v_pagado, (select monto from public.pagos where id = new.pago_id);
  end if;

  v_estado := case
    when v_aplicado <= 0 then 'pendiente'
    when v_aplicado >= v_esperado then 'pagada'
    else 'parcial'
  end;

  update public.cuotas
     set monto_aplicado = v_aplicado,
         estado = v_estado
   where id = new.cuota_id;

  return new;
end;
$$;

drop trigger if exists tr_recalcular_cuota on public.pago_aplicaciones;
create trigger tr_recalcular_cuota
  after insert on public.pago_aplicaciones
  for each row execute function public.fn_recalcular_cuota();

-- -----------------------------------------------------------------------------
-- 3. El estado de la venta sigue al dinero
-- -----------------------------------------------------------------------------
-- El pipeline del proyecto (Separado → Inicial → Capital → Saldado) describe
-- qué bloque del plan se está pagando: no hace falta que alguien lo mueva a
-- mano. Avanza SOLO hacia adelante y paso a paso (el trigger del Sprint 4 no
-- admite saltos); si se reversa un pago, el estado no retrocede solo: eso lo
-- decide gerencia con el botón de siempre.

create or replace function public.orden_estado_venta(p_estado public.estado_venta)
returns integer
language sql
immutable
as $$
  select case p_estado
    when 'separado' then 1
    when 'inicial'  then 2
    when 'capital'  then 3
    when 'saldado'  then 4
    else 0
  end;
$$;

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

  return v_estado;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Registrar un pago
-- -----------------------------------------------------------------------------
-- Única puerta para que entre dinero. En una sola transacción: crea el pago, lo
-- reparte entre las cuotas, mueve el estado de la venta si corresponde y emite
-- el recibo.
--
-- `p_aplicaciones` es opcional: si viene `null` el pago se aplica a las cuotas
-- vencidas primero (la más vieja primero) hasta donde alcance. Si viene, es un
-- arreglo `[{"cuota_id": "...", "monto": "1500.00"}]` y manda lo que diga.
-- Lo que no se aplique queda como saldo a favor del pago: la cuota no se infla.
--
-- La ruta del PDF se fija AQUÍ, al emitir: el recibo es inmutable y después no
-- se le puede actualizar ningún campo. El archivo se genera y se sube la
-- primera vez que alguien lo descarga.

create or replace function public.registrar_pago(
  p_venta_id     uuid,
  p_fecha        date,
  p_monto        numeric,
  p_metodo       public.metodo_pago,
  p_referencia   text default null,
  p_notas        text default null,
  p_aplicaciones jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venta     public.ventas%rowtype;
  v_pago_id   uuid := gen_random_uuid();
  v_recibo_id uuid := gen_random_uuid();
  v_numero    bigint;
  v_restante  numeric(14,2);
  v_aplicar   numeric(14,2);
  v_aplicado  numeric(14,2) := 0;
  v_concepto  text;
  v_estado    public.estado_venta;
  r           record;
begin
  -- `auth.uid() is null` es una sesión de mantenimiento (la migración del Excel
  -- del Sprint 7, un script del panel): ahí no hay rol que consultar y no se
  -- estorba. Mismo criterio que `generar_plan_pagos`.
  if auth.uid() is not null and not public.es_admin_o_gerencia() then
    raise exception 'Solo administración o gerencia registran pagos.';
  end if;

  select * into v_venta from public.ventas where id = p_venta_id;
  if not found then
    raise exception 'La venta indicada no existe.';
  end if;
  if v_venta.estado = 'cancelada' then
    raise exception 'La venta está cancelada: no admite pagos.';
  end if;
  if v_venta.estado = 'saldado' then
    raise exception 'La venta ya está saldada: no queda nada por cobrar.';
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto del pago debe ser mayor que cero.';
  end if;
  if p_fecha is null then
    raise exception 'Indique la fecha del pago.';
  end if;

  insert into public.pagos (
    id, venta_id, fecha_pago, monto, metodo, referencia, notas, registrado_por
  ) values (
    v_pago_id, p_venta_id, p_fecha, round(p_monto, 2), p_metodo,
    nullif(btrim(coalesce(p_referencia, '')), ''),
    nullif(btrim(coalesce(p_notas, '')), ''),
    auth.uid()
  );

  v_restante := round(p_monto, 2);

  if p_aplicaciones is null then
    -- Automático: la cuota más vieja primero, hasta donde alcance el pago.
    for r in
      select c.id, c.monto_esperado - c.monto_aplicado as saldo
      from public.cuotas c
      where c.venta_id = p_venta_id
        and c.monto_esperado > c.monto_aplicado
      order by c.fecha_vencimiento,
               case c.tipo when 'separacion' then 1 when 'inicial' then 2 else 3 end,
               c.numero
    loop
      exit when v_restante <= 0;
      v_aplicar := least(v_restante, r.saldo);
      insert into public.pago_aplicaciones (pago_id, cuota_id, monto)
      values (v_pago_id, r.id, v_aplicar);
      v_restante := v_restante - v_aplicar;
      v_aplicado := v_aplicado + v_aplicar;
    end loop;
  else
    -- Manual: se respeta lo que decidió quien cobra, dentro de lo posible.
    for r in
      select (e ->> 'cuota_id')::uuid as cuota_id,
             round((e ->> 'monto')::numeric, 2) as monto
      from jsonb_array_elements(p_aplicaciones) e
    loop
      if r.monto is null or r.monto <= 0 then
        raise exception 'Cada aplicación debe llevar un monto mayor que cero.';
      end if;
      if not exists (
        select 1 from public.cuotas c
        where c.id = r.cuota_id and c.venta_id = p_venta_id
      ) then
        raise exception 'La cuota indicada no pertenece a esta venta.';
      end if;

      insert into public.pago_aplicaciones (pago_id, cuota_id, monto)
      values (v_pago_id, r.cuota_id, r.monto);
      v_aplicado := v_aplicado + r.monto;
      v_restante := v_restante - r.monto;
    end loop;

    if v_restante < 0 then
      raise exception
        'Se está repartiendo más de lo que se recibió: % de un pago de %.',
        v_aplicado, round(p_monto, 2);
    end if;
  end if;

  v_estado := public.avanzar_venta_por_pagos(p_venta_id);

  -- Concepto del recibo: qué cuotas se cubrieron y qué quedó a favor.
  select string_agg(txt, ', ' order by orden)
  into v_concepto
  from (
    select
      (case c.tipo when 'separacion' then 'Separación'
                   when 'inicial' then 'Inicial'
                   else 'Capital' end)
      || ' ' || c.numero || ' (' || to_char(pa.monto, 'FM999,999,990.00') || ')' as txt,
      c.fecha_vencimiento as orden
    from public.pago_aplicaciones pa
    join public.cuotas c on c.id = pa.cuota_id
    where pa.pago_id = v_pago_id
  ) t;

  v_concepto := coalesce(v_concepto, 'Abono a la venta');
  if v_restante > 0 then
    v_concepto := v_concepto || ' · saldo a favor '
                  || to_char(v_restante, 'FM999,999,990.00');
  end if;

  insert into public.recibos (
    id, tipo, pago_id, venta_id, cliente_id, monto, concepto, ruta_pdf, emitido_por
  ) values (
    v_recibo_id, 'pago', v_pago_id, p_venta_id, v_venta.cliente_id,
    round(p_monto, 2), v_concepto, 'recibo-' || v_recibo_id || '.pdf', auth.uid()
  )
  returning numero into v_numero;

  return jsonb_build_object(
    'pago_id', v_pago_id,
    'recibo_id', v_recibo_id,
    'recibo_numero', v_numero,
    'aplicado', v_aplicado,
    'saldo_a_favor', v_restante,
    'estado_venta', v_estado
  );
end;
$$;

revoke all on function public.registrar_pago(uuid, date, numeric, public.metodo_pago, text, text, jsonb)
  from public, anon;
grant execute on function public.registrar_pago(uuid, date, numeric, public.metodo_pago, text, text, jsonb)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Reversar un pago
-- -----------------------------------------------------------------------------
-- Un pago no se edita ni se borra (regla dura del proyecto). Corregir es emitir
-- el movimiento contrario: un pago marcado `es_reverso` con las MISMAS
-- aplicaciones —que al restar dejan las cuotas como estaban— y una nota de
-- crédito contra el recibo original. Los dos movimientos quedan visibles.

create or replace function public.reversar_pago(
  p_pago_id uuid,
  p_motivo  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago      public.pagos%rowtype;
  v_recibo    public.recibos%rowtype;
  v_reverso   uuid := gen_random_uuid();
  v_nota      uuid := gen_random_uuid();
  v_numero    bigint;
  r           record;
begin
  if not public.es_gerencia() then
    raise exception 'Solo gerencia puede reversar un pago.';
  end if;

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Escriba el motivo del reverso.';
  end if;

  select * into v_pago from public.pagos where id = p_pago_id;
  if not found then
    raise exception 'El pago indicado no existe.';
  end if;
  if v_pago.es_reverso then
    raise exception 'Ese movimiento ya es un reverso: no se reversa un reverso.';
  end if;
  if exists (select 1 from public.pagos where pago_reversado_id = p_pago_id) then
    raise exception 'Ese pago ya fue reversado.';
  end if;

  insert into public.pagos (
    id, venta_id, fecha_pago, monto, metodo, referencia, notas,
    es_reverso, pago_reversado_id, motivo_reverso, registrado_por
  ) values (
    v_reverso, v_pago.venta_id, current_date, v_pago.monto, v_pago.metodo,
    v_pago.referencia, v_pago.notas,
    true, p_pago_id, btrim(p_motivo), auth.uid()
  );

  -- Mismas aplicaciones: el trigger las resta y las cuotas vuelven atrás.
  for r in
    select cuota_id, monto from public.pago_aplicaciones where pago_id = p_pago_id
  loop
    insert into public.pago_aplicaciones (pago_id, cuota_id, monto)
    values (v_reverso, r.cuota_id, r.monto);
  end loop;

  select * into v_recibo from public.recibos
   where pago_id = p_pago_id and tipo = 'pago' limit 1;

  if v_recibo.id is null then
    raise exception 'El pago no tiene recibo: no se puede emitir la nota de crédito.';
  end if;

  insert into public.recibos (
    id, tipo, pago_id, venta_id, cliente_id, monto, concepto,
    recibo_original_id, ruta_pdf, emitido_por
  ) values (
    v_nota, 'nota_credito', v_reverso, v_pago.venta_id, v_recibo.cliente_id,
    v_pago.monto,
    'Reverso del recibo ' || v_recibo.numero || ': ' || btrim(p_motivo),
    v_recibo.id, 'recibo-' || v_nota || '.pdf', auth.uid()
  )
  returning numero into v_numero;

  return jsonb_build_object(
    'pago_reverso_id', v_reverso,
    'nota_credito_id', v_nota,
    'nota_credito_numero', v_numero
  );
end;
$$;

revoke all on function public.reversar_pago(uuid, text) from public, anon;
grant execute on function public.reversar_pago(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Cancelar una venta, ahora que hay reversos
-- -----------------------------------------------------------------------------
-- Reemplaza la versión de `07_ventas.sql`: antes bastaba con que EXISTIERA un
-- pago para frenar la cancelación. Con los reversos eso ya no sirve —un pago
-- reversado no es dinero recibido—, así que lo que se mira es el neto.
--
-- ESTA FUNCIÓN REEMPLAZA A LA DE `07_ventas.sql`. Si se aplica aquel después,
-- vuelve la versión vieja: aplicar siempre los archivos en orden.

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

-- -----------------------------------------------------------------------------
-- 7. Resumen de cobros de una venta
-- -----------------------------------------------------------------------------
-- Una sola definición de "cuánto se ha cobrado y cuánto falta", para que la
-- pantalla, los reportes y la migración no la calculen cada uno a su manera.

create or replace view public.ventas_resumen_cobros as
select
  v.id as venta_id,
  v.precio_pactado,
  coalesce(p.recibido, 0) as total_recibido,
  coalesce(c.aplicado, 0) as total_aplicado,
  coalesce(p.recibido, 0) - coalesce(c.aplicado, 0) as saldo_a_favor,
  v.precio_pactado - coalesce(c.aplicado, 0) as balance_pendiente,
  coalesce(c.vencido, 0) as vencido_pendiente
from public.ventas v
left join lateral (
  select sum(case when pg.es_reverso then -pg.monto else pg.monto end) as recibido
  from public.pagos pg where pg.venta_id = v.id
) p on true
left join lateral (
  select
    sum(cu.monto_aplicado) as aplicado,
    sum(case when cu.fecha_vencimiento < current_date
             then greatest(cu.monto_esperado - cu.monto_aplicado, 0) end) as vencido
  from public.cuotas cu where cu.venta_id = v.id
) c on true;

-- La vista hereda las políticas de `ventas` porque se define con
-- `security_invoker`: cada quien ve el resumen de las ventas que ya podía ver.
alter view public.ventas_resumen_cobros set (security_invoker = on);

grant select on public.ventas_resumen_cobros to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Almacenamiento de los PDF de recibos
-- -----------------------------------------------------------------------------
-- Bucket privado. El PDF se genera y se sube la primera vez que se descarga
-- (`/recibos/[id]/pdf`), con la ruta que el recibo ya trae escrita.
--
-- Si estas sentencias fallan por permisos, cree el bucket `recibos` (privado)
-- desde el panel de Supabase → Storage y vuelva a correr solo las políticas.

insert into storage.buckets (id, name, public)
values ('recibos', 'recibos', false)
on conflict (id) do nothing;

drop policy if exists recibos_pdf_leer on storage.objects;
create policy recibos_pdf_leer on storage.objects for select to authenticated
  using (
    bucket_id = 'recibos'
    and exists (
      select 1 from public.recibos r
      where r.ruta_pdf = name and public.puede_ver_venta(r.venta_id)
    )
  );

drop policy if exists recibos_pdf_subir on storage.objects;
create policy recibos_pdf_subir on storage.objects for insert to authenticated
  with check (
    bucket_id = 'recibos'
    and public.es_admin_o_gerencia()
    and exists (select 1 from public.recibos r where r.ruta_pdf = name)
  );
