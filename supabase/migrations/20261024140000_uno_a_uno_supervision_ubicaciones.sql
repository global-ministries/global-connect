-- Where each leader of the 1:1 supervision sits in the Dream Team tree
-- (feature "uno-a-uno", task T9).
--
-- What:
--   uno_a_uno_ubicaciones()               internal: one row per (leader,
--                                         dirección, área, equipo) place
--   uno_a_uno_supervision_lideres(p_dias) adds `ubicaciones jsonb` at the end
--
-- Why: the supervision filters split leaders into "Grupos de Vida" and "Dream
-- Team", but Dream Team is the administration of every volunteer and Grupos de
-- Vida is one of its direcciones (user correction 2026-10-24). The screen now
-- filters like Dream Team → Servidores: Dirección → Área → Equipo. The label
-- text in `contextos` cannot place a leader reliably (labels repeat), so the
-- function returns the ids.
--
-- Places (odd/tasks/uno-a-uno.md, S9.2):
--   Dream Team: every active servicio with nivel lider or higher in an active
--     equipo. Dirección = the root of that equipo; área = the ancestor right
--     below the root (the equipo itself when it hangs from the root); equipo =
--     the equipo, named by its path below the área ("Waumba Land ›
--     Anfitriones"; null when it is the root or the área).
--   Grupos de Vida: dirección = the root equipo with experiencia 'grupos_vida'
--     (Dirección de Grupos de Vida). A Líder of a current group → área = its
--     segmento, equipo = the group. A director de etapa → área = their
--     segmento. A director general → área = each segmento they lead.
--   A spouse leads together with their partner, so they get the partner's
--     places too (the same rule as uno_a_uno_relaciones).
--
-- Data safety: no table changes. uno_a_uno_supervision_lideres changes its
-- return type, so it is dropped and recreated; who sees which leader is
-- unchanged.
--
-- Rollback: DROP FUNCTION public.uno_a_uno_supervision_lideres(integer);
--   re-run its definition from 20261024120000_uno_a_uno_supervision.sql;
--   DROP FUNCTION public.uno_a_uno_ubicaciones();

-- ─── Places of every leader ─────────────────────────────────────────

create or replace function public.uno_a_uno_ubicaciones()
returns table (
  lider_id uuid,
  direccion_id text,
  direccion text,
  area_id text,
  area text,
  equipo_id text,
  equipo text
)
language sql
stable security definer
set search_path to 'public'
as $$
  with recursive sube as (
    -- From each equipo up to its root: cadena = [equipo, parent, …, root].
    select e.id as equipo_id, e.parent_equipo_id as siguiente, array[e.id] as cadena
    from public.dream_team_equipos e
    union all
    select s.equipo_id, p.parent_equipo_id, s.cadena || p.id
    from sube s
    join public.dream_team_equipos p on p.id = s.siguiente
    where not p.id = any (s.cadena)
  ),
  rutas as (
    select s.equipo_id,
           s.cadena[cardinality(s.cadena)] as raiz_id,
           case when cardinality(s.cadena) >= 2 then s.cadena[cardinality(s.cadena) - 1] end as area_id,
           case when cardinality(s.cadena) >= 3 then s.equipo_id end as hoja_id,
           -- Named by its path below the área: two "Anfitriones" under
           -- different sub-áreas stay apart ("Waumba Land › Anfitriones").
           case when cardinality(s.cadena) >= 3 then
             (select string_agg(x.label, ' › ' order by u.ord desc)
                from unnest(s.cadena[1:cardinality(s.cadena) - 2]) with ordinality as u(id, ord)
                join public.dream_team_equipos x on x.id = u.id)
           end as hoja_label
    from sube s
    where s.siguiente is null
  ),
  conyuges as (
    select x.persona, case when count(distinct x.otro) = 1 then (array_agg(x.otro))[1] end as conyuge
    from (select r.usuario1_id as persona, r.usuario2_id as otro
            from public.relaciones_usuarios r
           where r.tipo_relacion = 'conyuge'
          union all
          select r.usuario2_id, r.usuario1_id
            from public.relaciones_usuarios r
           where r.tipo_relacion = 'conyuge') x
    group by x.persona
  ),
  direccion_gdv as (
    select coalesce(
             (select jsonb_build_object('id', e.id::text, 'label', e.label)
                from public.dream_team_equipos e
               where e.parent_equipo_id is null and e.experiencia = 'grupos_vida'
               order by e.activo desc, e.label
               limit 1),
             jsonb_build_object('id', 'grupos_vida', 'label', 'Grupos de Vida')) as d
  ),
  -- Two current groups of one segmento can share a name when two temporadas
  -- are active at once; the temporada then tells them apart.
  grupos_vigentes as (
    select g.id,
           case when count(*) over (partition by g.segmento_id, g.nombre) > 1
                then g.nombre || ' (' || t.nombre || ')'
                else g.nombre end as nombre,
           g.segmento_id
    from public.grupos g
    join public.temporadas t on t.id = g.temporada_id
    where g.activo
      and not g.eliminado
      and g.estado_aprobacion = 'aprobado'
      and t.activa
  ),
  dream_team as (
    select sv.persona_id as lider_id,
           ra.id::text as direccion_id, ra.label as direccion,
           ar.id::text as area_id, ar.label as area,
           ru.hoja_id::text as equipo_id, ru.hoja_label as equipo
    from public.dream_team_servicios sv
    join public.dream_team_equipos e on e.id = sv.equipo_id
    join public.dream_team_roles r on r.id = sv.rol_id
    join rutas ru on ru.equipo_id = sv.equipo_id
    join public.dream_team_equipos ra on ra.id = ru.raiz_id
    left join public.dream_team_equipos ar on ar.id = ru.area_id
    where sv.estado = 'activo'
      and e.activo
      and r.nivel in ('director', 'coordinador', 'lider')
  ),
  gdv_lider as (
    select gm.usuario_id, (dg.d ->> 'id'), (dg.d ->> 'label'), s.id::text, s.nombre, g.id::text, g.nombre
    from public.grupo_miembros gm
    join grupos_vigentes g on g.id = gm.grupo_id
    join public.segmentos s on s.id = g.segmento_id
    cross join direccion_gdv dg
    where gm.rol = 'Líder'
      and gm.fecha_salida is null
      and coalesce(gm.estado, 'activo') = 'activo'
  ),
  gdv_director_etapa as (
    select sl.usuario_id, (dg.d ->> 'id'), (dg.d ->> 'label'), s.id::text, s.nombre, null::text, null::text
    from public.segmento_lideres sl
    join public.segmentos s on s.id = sl.segmento_id
    cross join direccion_gdv dg
    where sl.tipo_lider = 'director_etapa'
  ),
  gdv_director_general as (
    select dgs.usuario_id, (dg.d ->> 'id'), (dg.d ->> 'label'), s.id::text, s.nombre, null::text, null::text
    from public.director_general_segmentos dgs
    join public.segmentos s on s.id = dgs.segmento_id
    cross join direccion_gdv dg
  ),
  propias as (
    select * from dream_team
    union
    select * from gdv_lider
    union
    select * from gdv_director_etapa
    union
    select * from gdv_director_general
  )
  select * from propias
  union
  -- A couple leads together: X also sits where X's spouse sits.
  select c.persona, p.direccion_id, p.direccion, p.area_id, p.area, p.equipo_id, p.equipo
  from propias p
  join conyuges c on c.conyuge = p.lider_id;
$$;

comment on function public.uno_a_uno_ubicaciones() is
  'Where every leader sits in the Dream Team tree (dirección, área, equipo), Grupos de Vida included. Internal.';

revoke all on function public.uno_a_uno_ubicaciones() from public, anon, authenticated;
grant execute on function public.uno_a_uno_ubicaciones() to service_role;

-- ─── supervision per leader, now with ubicaciones ───────────────────

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
  ubicaciones jsonb
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
  quienes as (
    select distinct r.lider_id
    from rel r
    where r.lider_id <> v_caller
      and r.lider_id is distinct from v_conyuge
      and (v_todo or r.lider_id in (select s.usuario_id from public.uno_a_uno_supervisados_de(v_caller) s))
  ),
  ubic as materialized (
    select u.* from public.uno_a_uno_ubicaciones() u where u.lider_id in (select q.lider_id from quienes q)
  )
  select q.lider_id,
         us.nombre,
         us.apellido,
         ctx.contextos,
         ctx.dirigidos::integer,
         coalesce(st.realizados, 0)::integer,
         coalesce(st.agendados, 0)::integer,
         st.ultimo,
         coalesce((select jsonb_agg(jsonb_build_object('direccion_id', u.direccion_id, 'direccion', u.direccion,
                                                       'area_id', u.area_id, 'area', u.area,
                                                       'equipo_id', u.equipo_id, 'equipo', u.equipo)
                                    order by u.direccion, u.area nulls first, u.equipo nulls first)
                     from ubic u
                    where u.lider_id = q.lider_id), '[]'::jsonb)
  from quienes q
  join public.usuarios us on us.id = q.lider_id
  cross join lateral (
    select array_agg(distinct r.contexto order by r.contexto) as contextos, count(distinct r.dirigido_id) as dirigidos
    from rel r
    where r.lider_id = q.lider_id
  ) ctx
  left join lateral (
    select count(*) filter (where o.estado = 'realizado' and o.fecha_hora >= now() - make_interval(days => p_dias)) as realizados,
           count(*) filter (where o.estado = 'agendado' and o.fecha_hora >= now()) as agendados,
           max(o.fecha_hora) filter (where o.estado = 'realizado') as ultimo
    from public.uno_a_uno_personas p
    join public.uno_a_uno o on o.id = p.uno_a_uno_id
    where p.usuario_id = q.lider_id and p.lado = 'lider'
  ) st on true
  order by st.ultimo asc nulls first, us.nombre, us.apellido, q.lider_id;
end;
$$;

comment on function public.uno_a_uno_supervision_lideres(integer) is
  'Per leader of the caller''s chain (admin and pastor: every leader): dirigidos, realizados in p_dias, agendados, último realizado and where they sit in the Dream Team tree.';

revoke all on function public.uno_a_uno_supervision_lideres(integer) from public, anon;
grant execute on function public.uno_a_uno_supervision_lideres(integer) to authenticated, service_role;
