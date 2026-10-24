-- Supervision orders leaders by hierarchy (feature "uno-a-uno", task T12).
--
-- What: uno_a_uno_supervision_lideres gains `rango integer` and `rol text` at
-- the end and orders by rango first: 1 Director general, 2 Director (director
-- de etapa, or nivel director in a Dream Team equipo), 3 Coordinador (Dream
-- Team), 4 Líder (Líder of a group or nivel líder in Dream Team). A row takes
-- the highest role any of its people lead with; within a rango, whoever has
-- gone longest without a 1:1 still comes first.
--
-- Why: user request 2026-10-24: "seria bueno poder ordenar primero los
-- directores luego los lideres, esto para los roles superiores". Who sees which
-- leader is unchanged.
--
-- Data safety: the function changes its return type, so it is dropped and
-- recreated; no table or row changes.
--
-- Rollback: DROP FUNCTION public.uno_a_uno_supervision_lideres(integer); then
-- re-run its definition from 20261024180000_uno_a_uno_supervision_parejas.sql.

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
  pareja jsonb,
  rango integer,
  rol text
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
         p.pareja,
         rg.rango,
         case rg.rango when 1 then 'Director general' when 2 then 'Director' when 3 then 'Coordinador' else 'Líder' end
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
  -- The highest role the row leads with (T12): 1 director general, 2 director
  -- (de etapa, or director of a Dream Team equipo), 3 coordinador, 4 líder.
  cross join lateral (
    select coalesce(min(x.r), 4) as rango
    from (
      select case when r.contexto like 'Director general:%' then 1
                  when r.contexto like 'Director de etapa:%' then 2
                  when r.contexto like 'GDV:%' then 4
             end as r
      from rel r
      where r.lider_id = any (p.ids)
      union all
      select case dr.nivel when 'director' then 2 when 'coordinador' then 3 else 4 end
      from public.dream_team_servicios sv
      join public.dream_team_equipos e on e.id = sv.equipo_id
      join public.dream_team_roles dr on dr.id = sv.rol_id
      where sv.persona_id = any (p.ids)
        and sv.estado = 'activo'
        and e.activo
        and dr.nivel in ('director', 'coordinador', 'lider')
        and exists (select 1 from rel r2 where r2.lider_id = sv.persona_id and r2.contexto like 'Dream Team:%')
    ) x
  ) rg
  order by rg.rango, st.ultimo asc nulls first, us.nombre, us.apellido, p.ids[1];
end;
$$;

comment on function public.uno_a_uno_supervision_lideres(integer) is
  'Per leader of the caller''s chain (admin and pastor: every leader), a couple who lead the same thing as one row: dirigidos, realizados in p_dias, agendados, último realizado, places, the people of the row and their highest role (rango 1-4, rol), ordered by rango.';

revoke all on function public.uno_a_uno_supervision_lideres(integer) from public, anon;
grant execute on function public.uno_a_uno_supervision_lideres(integer) to authenticated, service_role;
