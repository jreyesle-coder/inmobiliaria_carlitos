-- =============================================================================
-- Sprint 1 · Seguridad (RLS), perfiles y bitácora de auditoría
-- =============================================================================
-- Se aplica DESPUÉS de la migración de Drizzle `drizzle/0000_esquema_completo.sql`.
-- Es idempotente: se puede volver a ejecutar sin romper nada.
--
-- Reglas que este archivo hace cumplir en la base de datos, no en la UI:
--   * Recibos, pagos y aplicaciones de pago son inmutables (sin UPDATE ni DELETE).
--   * La bitácora solo la escriben los triggers; nadie la edita ni la borra.
--   * Un vendedor solo ve sus ventas, sus cuotas, sus pagos y sus comisiones.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Perfiles ligados a auth.users
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'perfiles_id_auth_users_fk'
  ) then
    alter table public.perfiles
      add constraint perfiles_id_auth_users_fk
      foreign key (id) references auth.users (id) on delete cascade;
  end if;
end $$;

-- Alta automática del perfil al crearse el usuario en Supabase Auth.
-- El rol por defecto es `vendedor`: gerencia lo promueve después.
create or replace function public.fn_crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, correo, nombre_completo, rol)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nombre_completo', ''),
    coalesce(
      (new.raw_user_meta_data ->> 'rol')::public.rol_usuario,
      'vendedor'::public.rol_usuario
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists tr_crear_perfil on auth.users;
create trigger tr_crear_perfil
  after insert on auth.users
  for each row execute function public.fn_crear_perfil();

-- -----------------------------------------------------------------------------
-- 2. Reglas de integridad que Drizzle no modela
-- -----------------------------------------------------------------------------

-- La cédula identifica al cliente, pero puede estar pendiente: único solo
-- cuando existe.
create unique index if not exists clientes_cedula_unica
  on public.clientes (cedula) where cedula is not null;

-- Coherencia entre `cedula` y `cedula_pendiente`.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clientes_cedula_coherente'
  ) then
    alter table public.clientes
      add constraint clientes_cedula_coherente
      check ((cedula is null) = cedula_pendiente);
  end if;
end $$;

-- Nota de crédito: referencia al recibo original.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'recibos_original_fk'
  ) then
    alter table public.recibos
      add constraint recibos_original_fk
      foreign key (recibo_original_id) references public.recibos (id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'recibos_nota_credito_coherente'
  ) then
    alter table public.recibos
      add constraint recibos_nota_credito_coherente
      check (tipo <> 'nota_credito' or recibo_original_id is not null);
  end if;
end $$;

-- Montos no negativos donde no tiene sentido que lo sean.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pagos_monto_positivo') then
    alter table public.pagos add constraint pagos_monto_positivo check (monto > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pago_aplicaciones_monto_positivo') then
    alter table public.pago_aplicaciones
      add constraint pago_aplicaciones_monto_positivo check (monto > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'solares_area_positiva') then
    alter table public.solares add constraint solares_area_positiva check (area_m2 > 0);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. `actualizado_en` automático
-- -----------------------------------------------------------------------------

create or replace function public.fn_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'perfiles','configuracion','proyectos','manzanas','solares',
    'clientes','vendedores','ventas','cuotas','comisiones'
  ] loop
    execute format('drop trigger if exists tr_actualizado_en on public.%I', t);
    execute format(
      'create trigger tr_actualizado_en before update on public.%I
         for each row execute function public.fn_actualizado_en()', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Bitácora de auditoría
-- -----------------------------------------------------------------------------

create or replace function public.fn_auditar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registro text;
  v_correo   text;
begin
  v_registro := coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id', '');
  select correo into v_correo from public.perfiles where id = auth.uid();

  insert into public.bitacora_auditoria (
    tabla, registro_id, accion, usuario_id, usuario_correo,
    datos_antes, datos_despues
  )
  values (
    tg_table_name,
    v_registro,
    lower(tg_op)::public.accion_auditoria,
    auth.uid(),
    v_correo,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );

  return coalesce(new, old);
end;
$$;

-- Todo lo que toca dinero, ventas, recibos, comisiones, estados y permisos.
do $$
declare t text;
begin
  foreach t in array array[
    'perfiles','configuracion','proyectos','manzanas','solares',
    'clientes','vendedores','ventas','cuotas','pagos','pago_aplicaciones',
    'recibos','comisiones'
  ] loop
    execute format('drop trigger if exists tr_auditar on public.%I', t);
    execute format(
      'create trigger tr_auditar after insert or update or delete on public.%I
         for each row execute function public.fn_auditar()', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Inmutabilidad: recibos, pagos y bitácora
-- -----------------------------------------------------------------------------
-- Además de no dar políticas de UPDATE/DELETE, se bloquea a nivel de trigger.
-- Esto también frena al `service_role`, que se salta RLS.

create or replace function public.fn_bloquear_modificacion()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'La tabla % es inmutable: no se permite % (corrija con una nota de crédito).',
    tg_table_name, tg_op;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['recibos','pagos','pago_aplicaciones','bitacora_auditoria'] loop
    execute format('drop trigger if exists tr_inmutable on public.%I', t);
    execute format(
      'create trigger tr_inmutable before update or delete on public.%I
         for each row execute function public.fn_bloquear_modificacion()', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Funciones de rol para las políticas
-- -----------------------------------------------------------------------------
-- `security definer` a propósito: leen `perfiles` sin disparar RLS y evitan la
-- recursión infinita de una política que consulta su propia tabla.

create or replace function public.mi_rol()
returns public.rol_usuario
language sql
stable
security definer
set search_path = public
as $$
  select rol from public.perfiles where id = auth.uid() and activo;
$$;

create or replace function public.es_gerencia()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.mi_rol() = 'gerencia';
$$;

create or replace function public.es_admin_o_gerencia()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.mi_rol() in ('administracion','gerencia');
$$;

/** Vendedor vinculado al usuario actual, o NULL si no lo hay. */
create or replace function public.mi_vendedor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select v.id from public.vendedores v
  where v.perfil_id = auth.uid() and v.activo;
$$;

/** ¿El usuario actual puede ver esta venta? */
create or replace function public.puede_ver_venta(p_venta_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_admin_o_gerencia()
      or exists (
           select 1 from public.ventas v
           where v.id = p_venta_id
             and v.vendedor_id is not distinct from public.mi_vendedor_id()
             and public.mi_vendedor_id() is not null
         );
$$;

-- -----------------------------------------------------------------------------
-- 7. Permisos base
-- -----------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Ni siquiera por GRANT se puede tocar lo inmutable ni la bitácora.
revoke update, delete on public.recibos            from authenticated;
revoke update, delete on public.pagos              from authenticated;
revoke update, delete on public.pago_aplicaciones  from authenticated;
revoke insert, update, delete on public.bitacora_auditoria from authenticated;
revoke insert, update, delete on public.perfiles   from authenticated; -- solo gerencia, vía función

-- -----------------------------------------------------------------------------
-- 8. RLS
-- -----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'perfiles','configuracion','proyectos','manzanas','solares',
    'clientes','vendedores','ventas','cuotas','pagos','pago_aplicaciones',
    'recibos','comisiones','bitacora_auditoria'
  ] loop
    -- Sin `force`: el dueño de la tabla debe poder escribir, porque los
    -- triggers `security definer` (perfil nuevo, bitácora) corren como él.
    execute format('alter table public.%I enable row level security', t);
    -- Limpia políticas previas para que el archivo sea re-ejecutable.
    execute (
      select coalesce(string_agg(format('drop policy if exists %I on public.%I;', policyname, t), ' '), '')
      from pg_policies where schemaname = 'public' and tablename = t
    );
  end loop;
end $$;

-- --- perfiles ---------------------------------------------------------------
-- Cada quien ve el suyo; gerencia los ve todos. El rol solo lo cambia gerencia
-- (los INSERT/UPDATE están revocados: se hacen por trigger o por gerencia con
-- la función `asignar_rol`).
create policy perfiles_select on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_gerencia());

-- --- configuracion ----------------------------------------------------------
create policy configuracion_select on public.configuracion for select to authenticated
  using (true);
create policy configuracion_escribe on public.configuracion for all to authenticated
  using (public.es_gerencia()) with check (public.es_gerencia());

-- --- catálogos: proyectos, manzanas, solares --------------------------------
create policy proyectos_select on public.proyectos for select to authenticated using (true);
create policy proyectos_escribe on public.proyectos for all to authenticated
  using (public.es_admin_o_gerencia()) with check (public.es_admin_o_gerencia());

create policy manzanas_select on public.manzanas for select to authenticated using (true);
create policy manzanas_escribe on public.manzanas for all to authenticated
  using (public.es_admin_o_gerencia()) with check (public.es_admin_o_gerencia());

create policy solares_select on public.solares for select to authenticated using (true);
create policy solares_escribe on public.solares for all to authenticated
  using (public.es_admin_o_gerencia()) with check (public.es_admin_o_gerencia());

-- --- clientes ---------------------------------------------------------------
-- Todos los ven (un vendedor necesita saber si el cliente ya existe) y todos
-- pueden darlos de alta; corregir y borrar es de administración/gerencia.
create policy clientes_select on public.clientes for select to authenticated using (true);
create policy clientes_insert on public.clientes for insert to authenticated with check (true);
create policy clientes_update on public.clientes for update to authenticated
  using (public.es_admin_o_gerencia() or creado_por = auth.uid())
  with check (public.es_admin_o_gerencia() or creado_por = auth.uid());
create policy clientes_delete on public.clientes for delete to authenticated
  using (public.es_gerencia());

-- --- vendedores -------------------------------------------------------------
create policy vendedores_select on public.vendedores for select to authenticated using (true);
create policy vendedores_escribe on public.vendedores for all to authenticated
  using (public.es_gerencia()) with check (public.es_gerencia());

-- --- ventas -----------------------------------------------------------------
create policy ventas_select on public.ventas for select to authenticated
  using (
    public.es_admin_o_gerencia()
    or (public.mi_vendedor_id() is not null and vendedor_id = public.mi_vendedor_id())
  );
create policy ventas_insert on public.ventas for insert to authenticated
  with check (public.es_admin_o_gerencia());
create policy ventas_update on public.ventas for update to authenticated
  using (public.es_admin_o_gerencia()) with check (public.es_admin_o_gerencia());
create policy ventas_delete on public.ventas for delete to authenticated
  using (public.es_gerencia());

-- --- cuotas -----------------------------------------------------------------
create policy cuotas_select on public.cuotas for select to authenticated
  using (public.puede_ver_venta(venta_id));
create policy cuotas_insert on public.cuotas for insert to authenticated
  with check (public.es_admin_o_gerencia());
create policy cuotas_update on public.cuotas for update to authenticated
  using (public.es_admin_o_gerencia()) with check (public.es_admin_o_gerencia());
create policy cuotas_delete on public.cuotas for delete to authenticated
  using (public.es_gerencia());

-- --- pagos y aplicaciones (solo lectura e inserción) ------------------------
create policy pagos_select on public.pagos for select to authenticated
  using (public.puede_ver_venta(venta_id));
create policy pagos_insert on public.pagos for insert to authenticated
  with check (public.es_admin_o_gerencia());

create policy pago_aplicaciones_select on public.pago_aplicaciones for select to authenticated
  using (
    exists (
      select 1 from public.pagos p
      where p.id = pago_id and public.puede_ver_venta(p.venta_id)
    )
  );
create policy pago_aplicaciones_insert on public.pago_aplicaciones for insert to authenticated
  with check (public.es_admin_o_gerencia());

-- --- recibos (inmutables: sin UPDATE ni DELETE, a propósito) ----------------
create policy recibos_select on public.recibos for select to authenticated
  using (public.puede_ver_venta(venta_id));
create policy recibos_insert on public.recibos for insert to authenticated
  with check (public.es_admin_o_gerencia());

-- --- comisiones -------------------------------------------------------------
create policy comisiones_select on public.comisiones for select to authenticated
  using (
    public.es_admin_o_gerencia()
    or (public.mi_vendedor_id() is not null and vendedor_id = public.mi_vendedor_id())
  );
create policy comisiones_escribe on public.comisiones for all to authenticated
  using (public.es_gerencia()) with check (public.es_gerencia());

-- --- bitácora (solo lectura, solo gerencia) ---------------------------------
create policy bitacora_select on public.bitacora_auditoria for select to authenticated
  using (public.es_gerencia());

-- -----------------------------------------------------------------------------
-- 9. Cambio de rol (única vía para tocar `perfiles`)
-- -----------------------------------------------------------------------------

create or replace function public.asignar_rol(
  p_perfil_id uuid,
  p_rol public.rol_usuario
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_gerencia() then
    raise exception 'Solo gerencia puede cambiar roles.';
  end if;
  update public.perfiles set rol = p_rol where id = p_perfil_id;
end;
$$;

create or replace function public.activar_perfil(
  p_perfil_id uuid,
  p_activo boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_gerencia() then
    raise exception 'Solo gerencia puede activar o desactivar usuarios.';
  end if;
  update public.perfiles set activo = p_activo where id = p_perfil_id;
end;
$$;

revoke all on function public.asignar_rol(uuid, public.rol_usuario) from public, anon;
revoke all on function public.activar_perfil(uuid, boolean) from public, anon;
grant execute on function public.asignar_rol(uuid, public.rol_usuario) to authenticated;
grant execute on function public.activar_perfil(uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 10. Configuración inicial
-- -----------------------------------------------------------------------------

insert into public.configuracion (clave, valor, descripcion) values
  ('moneda', 'DOP', 'Moneda del sistema. Se muestra como RD$.'),
  ('cuotas_inicial_por_defecto', '12', 'Cuotas en que se divide la inicial. Falta confirmar con el cliente.'),
  ('interes_activo', 'false', 'Preparado y desactivado: cálculo de interés.'),
  ('mora_activa', 'false', 'Preparado y desactivado: cálculo de mora.'),
  ('ncf_activo', 'false', 'Preparado y desactivado: comprobantes fiscales DGII.')
on conflict (clave) do nothing;
