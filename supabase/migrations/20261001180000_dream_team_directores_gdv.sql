-- Dream Team step 6 — the directores of Grupos de Vida are people, not just
-- labels on the tree.
--
-- PROBLEM
-- dream_team_lideres_gdv() is the only source of Grupos de Vida people for
-- Servidores and Mi equipo, and it returns only the lider / colider of current
-- groups. A person who is ONLY a director (director general or director de
-- etapa) never shows up, and dream_team_resolver_nombres /
-- dream_team_contactos_personas (which let a person through when they are in
-- this function) resolve them as "Persona no encontrada", without contact.
-- dream_team_estructura_gdv() already shows the directors, but only as labels of
-- the tree (responsables of the direccion / segmento nodes, and the virtual
-- `directores` nodes with no responsables).
--
-- WHAT CHANGES
-- Same function, same signature, return type, language, volatility, SECURITY
-- DEFINER, pinned search_path and gate (the `alcance` CTE: Dream Team authority
-- on the Grupos de Vida root through the tree). The existing lider / colider
-- rows come out exactly as before. Two kinds of rows are added, both behind the
-- same `exists (select 1 from alcance)` gate:
--
--   rol = 'director_etapa'
--     One row per segmento_lideres row, the very set dream_team_estructura_gdv()
--     uses (it does not filter tipo_lider). equipo_id is the id of the virtual
--     `directores` node the person belongs to, computed with the same pairing
--     (a married couple of the same segment is ONE node) and the same md5
--     formula. Included even when the director has no current groups. desde is
--     NULL: segmento_lideres has no timestamp. A person with two segmento_lideres
--     rows in the same segment (different tipo_lider) is one row.
--
--   rol = 'director_general'
--     One row per director_general_segmentos row. equipo_id is the segment id,
--     which is a `segmento` node of the structure. desde is the creado_en of the
--     assignment. The `alcance` column of the assignment does not change the row.
--
-- dream_team_resolver_nombres and dream_team_contactos_personas are NOT touched:
-- they already read this function, so they follow automatically.
-- dream_team_estructura_gdv() is NOT touched. Parity (every director equipo_id
-- exists in the structure with the expected tipo) is asserted by
-- supabase/tests/dream-team-directores-gdv.test.sql.
--
-- BLAST RADIUS
-- Read-only over Grupos de Vida tables. No schema or policy change, no data
-- change, no new capability: appearing in the pool grants no permission.
-- Deployment order: the app discards roles it does not know, so this can ship
-- before the app that renders the new roles.
--
-- ROLLBACK
-- Recreate dream_team_lideres_gdv() with the definition in
-- 20260911140000_dream_team_estructura_gdv.sql (statement `create function
-- public.dream_team_lideres_gdv()`), then re-run the revoke / grant lines below.

create or replace function public.dream_team_lideres_gdv()
returns table (persona_id uuid, equipo_id uuid, rol text, desde timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with nodo as (
    select e.id
    from public.dream_team_equipos e
    where e.parent_equipo_id is null
      and e.experiencia = 'grupos_vida'
      and e.activo
    order by e.created_at
    limit 1
  ),
  alcance as (
    select n.id
    from nodo n
    where auth_has_dream_team_capability_in_tree('dream_team.org.manage', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.direct', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.coordinate', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.lead', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.metrics.read', n.id)
  ),
  -- The next four CTEs mirror dream_team_estructura_gdv(): same director set
  -- (no tipo_lider filter), same couple pairing, so the node ids match.
  directores as (
    select sl.segmento_id,
           sl.usuario_id
    from public.segmento_lideres sl
    join public.usuarios u on u.id = sl.usuario_id
  ),
  parejas as (
    select a.segmento_id, a.usuario_id as u1, b.usuario_id as u2
    from directores a
    join directores b
      on b.segmento_id = a.segmento_id
     and b.usuario_id > a.usuario_id
    join public.relaciones_usuarios r
      on r.tipo_relacion = 'conyuge'
     and ((r.usuario1_id = a.usuario_id and r.usuario2_id = b.usuario_id)
       or (r.usuario1_id = b.usuario_id and r.usuario2_id = a.usuario_id))
  ),
  pareja_de as (
    select segmento_id, u1 as usuario_id, u1, u2 from parejas
    union all
    select segmento_id, u2 as usuario_id, u1, u2 from parejas
  ),
  director_con_equipo as (
    select d.segmento_id,
           d.usuario_id,
           coalesce(p.u1, d.usuario_id) as clave_u1,
           p.u2 as clave_u2
    from directores d
    left join pareja_de p
      on p.segmento_id = d.segmento_id
     and p.usuario_id = d.usuario_id
  )
  select gm.usuario_id,
         gm.grupo_id,
         case when gm.rol = 'Líder' then 'lider' else 'colider' end,
         gm.fecha_asignacion
  from public.grupo_miembros gm
  join public.grupos g on g.id = gm.grupo_id
  join public.temporadas t on t.id = g.temporada_id
  where gm.rol in ('Líder', 'Colíder')
    and gm.fecha_salida is null
    and coalesce(gm.estado, 'activo') = 'activo'
    and g.activo
    and not g.eliminado
    and g.estado_aprobacion = 'aprobado'
    and t.activa
    and exists (select 1 from alcance)

  union all

  select distinct
         d.usuario_id,
         md5('dream_team.gdv.directores:' || d.segmento_id::text || ':' || d.clave_u1::text || ':' || coalesce(d.clave_u2::text, ''))::uuid,
         'director_etapa',
         null::timestamptz
  from director_con_equipo d
  where exists (select 1 from alcance)

  union all

  select dgs.usuario_id,
         dgs.segmento_id,
         'director_general',
         dgs.creado_en
  from public.director_general_segmentos dgs
  join public.usuarios u on u.id = dgs.usuario_id
  where exists (select 1 from alcance);
$function$;

comment on function public.dream_team_lideres_gdv() is
  'People of Grupos de Vida for Dream Team, one row per person and team: current '
  'lider / colider (equipo_id = group id), director_etapa (equipo_id = id of the '
  'virtual directores node of dream_team_estructura_gdv(), a couple is one node) '
  'and director_general (equipo_id = segment id). Read-only. Visible to whoever '
  'has Dream Team authority over the Grupos de Vida node through the tree.';

revoke all on function public.dream_team_lideres_gdv() from public;
revoke all on function public.dream_team_lideres_gdv() from anon;
grant execute on function public.dream_team_lideres_gdv() to authenticated;
grant execute on function public.dream_team_lideres_gdv() to service_role;
