-- 1:1 — The Living Room groups as a source of dirigidos
-- (odd/tasks/estudiantes-fase-b.md, C6c, L43).
--
-- What: uno_a_uno_dirigidos_de gains one source, estudiantes_tlr: the current
-- leader of an active The Living Room group (estudiantes_grupo_lideres with
-- hasta NULL, an active servicio of the group's sub-área) leads the miembros of
-- that group (not its visitantes), with the context "Estudiantes: <grupo>".
-- Transit and Inside Out are left out on purpose (minors; the user, L43:
-- "por ahora solo the living room").
--
-- How: the function is re-created from its latest definition
-- (20261024160000_uno_a_uno_regla_pareja.sql, body md5 83a3e540 in staging and
-- production when this was written) with one new CTE and one more branch in
-- `todos`. Everything else is byte for byte the same: the GDV, director de
-- etapa, director general and Dream Team sources, the self and spouse rule,
-- the signature and the privileges (service_role only; mis_dirigidos and the
-- 1:1 functions call it). uno_a_uno_crear checks dirigidos_de, so a leader can
-- schedule a 1:1 with a TLR member with no other change.
--
-- Blast radius: one internal function re-created. No table, row or policy.
--
-- Rollback: re-run uno_a_uno_dirigidos_de from
-- 20261024160000_uno_a_uno_regla_pareja.sql.

create or replace function public.uno_a_uno_dirigidos_de(p_usuario uuid)
returns table (usuario_id uuid, contextos text[])
language sql
stable security definer
set search_path to 'public'
as $$
  -- Everyone leads by their own role only (T10): a spouse leads nobody for
  -- being married to a leader. A Matrimonios couple still leads together
  -- because both are loaded as Líder.
  with unidad as (
    select p_usuario as id
    where p_usuario is not null
  ),
  grupos_vigentes as (
    select g.id, g.nombre
    from public.grupos g
    join public.temporadas t on t.id = g.temporada_id
    where g.activo
      and not g.eliminado
      and g.estado_aprobacion = 'aprobado'
      and t.activa
  ),
  miembros_vigentes as (
    select gm.grupo_id, gm.usuario_id, gm.rol
    from public.grupo_miembros gm
    where gm.fecha_salida is null
      and coalesce(gm.estado, 'activo') = 'activo'
  ),
  gdv as (
    select m.usuario_id, 'GDV: ' || g.nombre as contexto
    from miembros_vigentes l
    join unidad u on u.id = l.usuario_id
    join grupos_vigentes g on g.id = l.grupo_id
    join miembros_vigentes m on m.grupo_id = l.grupo_id
    where l.rol = 'Líder'
      and m.rol in ('Colíder', 'Miembro')
  ),
  director_etapa as (
    select m.usuario_id, 'Director de etapa: ' || s.nombre as contexto
    from public.segmento_lideres sl
    join unidad u on u.id = sl.usuario_id
    join public.segmentos s on s.id = sl.segmento_id
    join public.director_etapa_grupos deg on deg.director_etapa_id = sl.id
    join grupos_vigentes g on g.id = deg.grupo_id
    join miembros_vigentes m on m.grupo_id = g.id
    where sl.tipo_lider = 'director_etapa'
      and m.rol = 'Líder'
  ),
  director_general as (
    select sl.usuario_id, 'Director general: ' || s.nombre as contexto
    from public.director_general_segmentos dgs
    join unidad u on u.id = dgs.usuario_id
    join public.segmentos s on s.id = dgs.segmento_id
    join public.segmento_lideres sl
      on sl.segmento_id = dgs.segmento_id
     and sl.tipo_lider = 'director_etapa'
    where dgs.alcance = 'segmento'
       or (dgs.alcance = 'directores'
           and exists (select 1
                       from public.dg_directores_etapa dde
                       where dde.dg_usuario_id = dgs.usuario_id
                         and dde.segmento_lider_id = sl.id))
  ),
  -- Active servicios in active equipos with the rank of their nivel.
  dt_niveles as (
    select sv.persona_id, sv.equipo_id, e.parent_equipo_id, e.label as equipo_label,
           case r.nivel
             when 'director' then 4
             when 'coordinador' then 3
             when 'lider' then 2
             else 1
           end as rango
    from public.dream_team_servicios sv
    join public.dream_team_equipos e on e.id = sv.equipo_id
    join public.dream_team_roles r on r.id = sv.rol_id
    where sv.estado = 'activo'
      and e.activo
  ),
  dt_servicios as (
    select n.*, max(n.rango) over (partition by n.equipo_id) as rango_max
    from dt_niveles n
  ),
  -- The head of an equipo: its servicios with the highest rank.
  dt_cabezas as (
    select s.persona_id, s.equipo_id, s.parent_equipo_id, s.equipo_label, s.rango
    from dt_servicios s
    where s.rango = s.rango_max
  ),
  dt_mismo_equipo as (
    select o.persona_id as usuario_id, 'Dream Team: ' || l.equipo_label as contexto
    from dt_servicios l
    join unidad u on u.id = l.persona_id
    join dt_servicios o on o.equipo_id = l.equipo_id and o.rango < l.rango
    where l.rango >= 2
  ),
  dt_sub_equipos as (
    select hc.persona_id as usuario_id, 'Dream Team: ' || hc.equipo_label as contexto
    from dt_cabezas hp
    join unidad u on u.id = hp.persona_id
    join dt_cabezas hc on hc.parent_equipo_id = hp.equipo_id
    where hp.rango >= 2
  ),
  -- The Living Room (C6c, L43): the current leader of an active group sees its
  -- miembros (not its visitors). Transit / Inside Out stay out (minors).
  estudiantes_tlr as (
    select mb.persona_id as usuario_id, 'Estudiantes: ' || g.nombre as contexto
    from public.estudiantes_grupo_lideres gl
    join public.dream_team_servicios sv on sv.id = gl.servicio_id and sv.estado = 'activo'
    join unidad u on u.id = sv.persona_id
    join public.estudiantes_grupos g on g.id = gl.grupo_id and g.activo and g.subarea_id = sv.equipo_id
    join public.dream_team_equipos a on a.id = g.ambito_id and a.experiencia = 'the_living_room'
    join public.estudiantes_grupo_miembros mb on mb.grupo_id = g.id and mb.activo and mb.estado = 'miembro'
    where gl.hasta is null
  ),
  todos as (
    select usuario_id, contexto from gdv
    union all
    select usuario_id, contexto from director_etapa
    union all
    select usuario_id, contexto from director_general
    union all
    select usuario_id, contexto from dt_mismo_equipo
    union all
    select usuario_id, contexto from dt_sub_equipos
    union all
    select usuario_id, contexto from estudiantes_tlr
  )
  select t.usuario_id, array_agg(distinct t.contexto order by t.contexto)
  from todos t
  -- Never oneself nor one's own spouse.
  where t.usuario_id <> p_usuario
    and t.usuario_id is distinct from public.talleres_conyuge_unico(p_usuario)
  group by t.usuario_id;
$$;

comment on function public.uno_a_uno_dirigidos_de(uuid) is
  'Who a usuario leads by their own role, one row per person with every context. Internal: the 1:1 functions call it.';

revoke all on function public.uno_a_uno_dirigidos_de(uuid) from public, anon, authenticated;
