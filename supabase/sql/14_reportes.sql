-- =============================================================================
-- Sprint 8 · Reportes y tableros por rol
-- =============================================================================
-- Vistas de solo lectura para el tablero `/reportes` y la exportación a CSV.
--
-- Todas se definen con `security_invoker = on`: NO tienen permisos propios, se
-- ejecutan con los del que consulta y por eso HEREDAN LA RLS de las tablas de
-- base. Un vendedor que lea `reporte_ventas` solo ve sus ventas —igual que en
-- `/ventas`—, porque debajo está `ventas` con su política `ventas_select`. La
-- UI no es la barrera de seguridad; esto sí.
--
-- El dinero no se recalcula aquí a mano: `reporte_ventas` reusa la vista
-- `ventas_resumen_cobros` de `09_pagos.sql`, que es la única definición de
-- "cuánto se ha cobrado y cuánto falta". Se aplica después de 12.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Inventario por estado
-- -----------------------------------------------------------------------------
-- Cuántos solares hay en cada estado y cuánto valen. `solares` es legible por
-- todos (`solares_select using (true)`), así que este agregado es global para
-- cualquier rol; la UI solo lo muestra a administración y gerencia.

create or replace view public.reporte_inventario as
select
  s.estado,
  count(*)::int                        as cantidad,
  coalesce(sum(s.valor_total), 0)      as valor_total
from public.solares s
group by s.estado;

alter view public.reporte_inventario set (security_invoker = on);
grant select on public.reporte_inventario to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Ventas con su estado de cobro
-- -----------------------------------------------------------------------------
-- Una fila por venta con las etiquetas que necesita el reporte (solar, cliente,
-- vendedor) y el resumen de cobros ya calculado. Es la base de "ventas por
-- período" y de "cartera pendiente": la cartera es esta vista filtrando las
-- ventas activas con balance > 0.

create or replace view public.reporte_ventas as
select
  v.id                                 as venta_id,
  v.fecha_venta,
  v.estado,
  v.estado_contrato,
  v.precio_pactado,
  v.vendedor_id,
  ven.nombre_completo                  as vendedor_nombre,
  v.cliente_id,
  cl.nombre_completo                   as cliente_nombre,
  s.id                                 as solar_id,
  s.numero                             as solar_numero,
  mz.codigo                            as manzana_codigo,
  rc.total_recibido,
  rc.total_aplicado,
  rc.saldo_a_favor,
  rc.balance_pendiente,
  rc.vencido_pendiente
from public.ventas v
join public.solares s              on s.id = v.solar_id
left join public.manzanas mz       on mz.id = s.manzana_id
join public.clientes cl            on cl.id = v.cliente_id
left join public.vendedores ven    on ven.id = v.vendedor_id
left join public.ventas_resumen_cobros rc on rc.venta_id = v.id;

alter view public.reporte_ventas set (security_invoker = on);
grant select on public.reporte_ventas to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Recaudo mensual (neto, honrando los reversos)
-- -----------------------------------------------------------------------------
-- Cuánto dinero entró de verdad por mes. Un reverso resta —es dinero que salió
-- de caja— igual que en `ventas_resumen_cobros`. La RLS de `pagos` scopea al
-- vendedor a los pagos de sus ventas, así que cada quien ve su propio recaudo.

create or replace view public.reporte_recaudo_mensual as
select
  date_trunc('month', pg.fecha_pago)::date            as mes,
  sum(case when pg.es_reverso then -pg.monto else pg.monto end) as recaudo_neto,
  count(*) filter (where not pg.es_reverso)::int       as pagos,
  count(*) filter (where pg.es_reverso)::int           as reversos
from public.pagos pg
group by date_trunc('month', pg.fecha_pago)::date;

alter view public.reporte_recaudo_mensual set (security_invoker = on);
grant select on public.reporte_recaudo_mensual to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Cuotas vencidas
-- -----------------------------------------------------------------------------
-- Cuotas cuya fecha ya pasó y todavía no están cubiertas del todo, con el saldo
-- que falta y los días de atraso. Se excluyen las ventas canceladas. La RLS
-- entra por el join a `ventas` (cada fila depende de una venta visible) además
-- de la política propia de `cuotas`.

create or replace view public.reporte_cuotas_vencidas as
select
  cu.id                                as cuota_id,
  cu.venta_id,
  cu.tipo,
  cu.numero,
  cu.fecha_vencimiento,
  cu.monto_esperado,
  cu.monto_aplicado,
  (cu.monto_esperado - cu.monto_aplicado)          as saldo,
  (current_date - cu.fecha_vencimiento)::int        as dias_vencida,
  v.vendedor_id,
  ven.nombre_completo                  as vendedor_nombre,
  cl.nombre_completo                   as cliente_nombre,
  s.numero                             as solar_numero,
  mz.codigo                            as manzana_codigo
from public.cuotas cu
join public.ventas v               on v.id = cu.venta_id
join public.solares s              on s.id = v.solar_id
left join public.manzanas mz       on mz.id = s.manzana_id
join public.clientes cl            on cl.id = v.cliente_id
left join public.vendedores ven    on ven.id = v.vendedor_id
where cu.fecha_vencimiento < current_date
  and cu.monto_aplicado < cu.monto_esperado
  and v.estado <> 'cancelada';

alter view public.reporte_cuotas_vencidas set (security_invoker = on);
grant select on public.reporte_cuotas_vencidas to authenticated;

-- -----------------------------------------------------------------------------
-- Notas
-- -----------------------------------------------------------------------------
-- * No hay tablas nuevas: nada que migrar en Drizzle. Igual que
--   `ventas_resumen_cobros`, estas vistas viven solo en SQL.
-- * Ninguna vista se define con `security definer`: si mañana alguien afloja
--   una política de base, estos reportes se aflojan con ella y no al revés.
