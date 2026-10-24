-- Supervision groups a couple who lead the same thing into one row (feature
-- "uno-a-uno", task T11).
--
-- What: uno_a_uno_supervision_lideres gains `pareja jsonb` at the end
-- ([{id, nombre, apellido}], one or two people). Two spouses who are both in
-- the caller's list AND share at least one context (the same group, the same
-- etapa, the same equipo) become one row: usuario_id/nombre/apellido are the
-- first of them by name, contextos and ubicaciones are the union, dirigidos
-- are counted once, and their 1:1s are counted once (a Matrimonios 1:1 has both
-- on the leader side). Spouses who lead different things stay apart.
--
-- Why: user request 2026-10-24: "en matrimonios deberia agrupar los esposos que
-- lideran un mismo grupo o que coordinan porque no tiene sentido que esten
-- separados". Who sees which leader is unchanged.
--
-- Data safety: the function changes its return type, so it is dropped and
-- recreated; no table or row changes.
--
-- Rollback: DROP FUNCTION public.uno_a_uno_supervision_lideres(integer); then
-- re-run its definition from 20261024140000_uno_a_uno_supervision_ubicaciones.sql.

drop function public.uno_a_uno_supervision_lideres(integer);

create or replace function public.uno_a_uno_supervision_lideres(p_dias integer default 30)
returns table (
  usuario_id uuid,
  nombre text,
  apellido text,
  contextos text[],
  dirigidos integer,
  realizados integer,
  agendados integer,
  ultimo_realizado timestamptz,
  ubicaciones jsonb,
  pareja jsonb
)
language plpgsql
stable security definer
set search_path to 'public'
as $$
#variable_conflict use_column
declare
  v_caller uuid := public.get_my_internal_id();
  v_todo boolean;
  v_conyuge uuid;
begin
  if p_dias is null or p_dias < 1 or p_dias > 366 then
    raise exception 'El período debe estar entre 1 y 366 días.' using errcode = '22023';
  end if;
  if v_caller is null then
    return;
  end if;
  v_todo := public.es_admin_o_pastor(auth.uid());
  v_conyuge := public.talleres_conyuge_unico(v_caller);

  return query
  with rel as materialized (
    select r.lider_id, r.dirigido_id, r.contexto from public.uno_a_uno_relaciones() r
  ),
  quienes as materialized (
    select distinct r.lider_id
    from rel r
    where r.lider_id <> v_caller
      and r.lider_id is distinct from v_conyuge
      and (v_todo or r.lider_id in (select s.usuario_id from public.uno_a_uno_supervisados_de(v_caller) s))
  ),
  -- A couple is one row when both are listed and lead something in common.
  unidades as materialized (
    select q.lider_id,
           case when c.conyuge is not null
                 and c.conyuge in (select q2.lider_id from quienes q2)
                 and exists (select 1 from rel a join rel b on b.contexto = a.contexto
                              where a.lider_id = q.lider_id and b.lider_id = c.conyuge)
                then least(q.lider_id, c.conyuge)
                else q.lider_id
           end as unidad
    from quienes q
    cross join lateral (select public.talleres_conyuge_unico(q.lider_id) as conyuge) c
  ),
  personas as (
    select u.unidad,
           array_agg(u.lider_id order by us.nombre, us.apellido, u.lider_id) as ids,
           jsonb_agg(jsonb_build_object('id', us.id, 'nombre', us.nombre, 'apellido', us.apellido)
                     order by us.nombre, us.apellido, us.id) as pareja
    from unidades u
    join public.usuarios us on us.id = u.lider_id
    group by u.unidad
  ),
  ubic as materialized (
    select ub.* from public.uno_a_uno_ubicaciones() ub where ub.lider_id in (select q.lider_id from quienes q)
  )
  select p.ids[1],
         us.nombre,
         us.apellido,
         ctx.contextos,
         ctx.dirigidos::integer,
         coalesce(st.realizados, 0)::integer,
         coalesce(st.agendados, 0)::integer,
         st.ultimo,
         coalesce((select jsonb_agg(distinct jsonb_build_object('direccion_id', ub.direccion_id, 'direccion', ub.direccion,
                                                                'area_id', ub.area_id, 'area', ub.area,
                                                                'equipo_id', ub.equipo_id, 'equipo', ub.equipo))
                     from ubic ub
                    where ub.lider_id = any (p.ids)), '[]'::jsonb),
         p.pareja
  from personas p
  join public.usuarios us on us.id = p.ids[1]
  cross join lateral (
    select array_agg(distinct r.contexto order by r.contexto) as contextos, count(distinct r.dirigido_id) as dirigidos
    from rel r
    where r.lider_id = any (p.ids)
  ) ctx
  left join lateral (
    -- Each 1:1 once, even when both spouses are on its leader side.
    select count(*) filter (where o.estado = 'realizado' and o.fecha_hora >= now() - make_interval(days => p_dias)) as realizados,
           count(*) filter (where o.estado = 'agendado' and o.fecha_hora >= now()) as agendados,
           max(o.fecha_hora) filter (where o.estado = 'realizado') as ultimo
    from public.uno_a_uno o
    where exists (select 1 from public.uno_a_uno_personas pe
                   where pe.uno_a_uno_id = o.id and pe.lado = 'lider' and pe.usuario_id = any (p.ids))
  ) st on true
  order by st.ultimo asc nulls first, us.nombre, us.apellido, p.ids[1];
end;
$$;

comment on function public.uno_a_uno_supervision_lideres(integer) is
  'Per leader of the caller''s chain (admin and pastor: every leader), a couple who lead the same thing as one row: dirigidos, realizados in p_dias, agendados, último realizado, places and the people of the row.';

revoke all on function public.uno_a_uno_supervision_lideres(integer) from public, anon;
grant execute on function public.uno_a_uno_supervision_lideres(integer) to authenticated, service_role;
