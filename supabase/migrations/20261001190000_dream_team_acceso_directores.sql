-- Dream Team step 7 — the directores of Grupos de Vida read their own people.
--
-- PROBLEM
-- dream_team_lideres_gdv() and dream_team_estructura_gdv() answer only to a
-- caller with a Dream Team capability on the Grupos de Vida root (the `alcance`
-- CTE). It is all or nothing: a director general or a director de etapa, who
-- holds no Dream Team capability, gets zero rows, so Mi equipo cannot show them
-- their own people. Granting them a capability on the root would open all of
-- Grupos de Vida (and a write capability would show edit buttons).
--
-- WHAT CHANGES
-- 1. dream_team_gdv_visibilidad() — ONE internal rule that says, for the session
--    user (auth.uid() -> usuarios.auth_id -> usuarios.id), what of Grupos de Vida
--    is theirs. It returns (tipo, id) rows:
--      'todo'      the root node id, when the caller holds one of the six Dream
--                  Team capabilities on the Grupos de Vida root (exactly the
--                  previous `alcance` gate). Nothing else is returned then.
--      'grupo'     group ids: gdv_dg_grupos_visibles(caller) (a director general:
--                  honors director_general_segmentos.alcance and
--                  dg_directores_etapa) plus the groups linked in
--                  director_etapa_grupos to any segmento_lideres row of the
--                  caller or of the spouse-director of the caller.
--      'director'  segmento_lideres ids: the caller's own rows and their
--                  spouse-director's rows (same couple pairing as the
--                  structure function); for a director general, every row of a
--                  segment held with alcance 'segmento' and only the rows marked
--                  in dg_directores_etapa for the caller under 'directores'.
--      'segmento'  segment ids: the segments assigned to the caller as director
--                  general plus the segments of the caller's own director rows.
--      'dg'        director_general_segmentos ids of the caller's own
--                  assignments (a director general reads themself, not peers).
--    Several roles at once give the union of their scopes. A caller who is
--    nothing gets zero rows. Not executable by anon or authenticated: only the
--    two definer functions below call it.
--
-- 2. dream_team_lideres_gdv(): same signature, return type, language,
--    volatility, definer flag, search_path and grants. For a 'todo' caller
--    the output is the one it was (verified by fingerprint). For a director:
--    lider / colider rows only for visible current groups (same currency filters
--    as before), director_etapa rows only for visible 'director' rows,
--    director_general rows only for the caller's own assignments.
--
-- 3. dream_team_estructura_gdv(): same signature, return type, definer flag
--    and grants. For a 'todo' caller the output is the one it was. For a
--    director it returns only the nodes on their paths with the very same ids,
--    parents and labels as before: the `direccion` root (so the tree has a
--    root), the visible `segmento` nodes, the `directores` nodes and the `grupo`
--    nodes, whose rows are the ones a 'todo' caller gets. The only column that
--    narrows is `responsables` of the `direccion` root and of each `segmento`
--    node: it names the directores generales, and a director gets only the
--    director_general_segmentos rows they can see ('dg': their own assignments),
--    so a director de etapa gets none and a director general only themself,
--    never another director general. A visible group hangs
--    from the same parent as always; when that parent is the team of another
--    director (a group directed from two teams), that team node and its
--    segment are returned too so the tree stays connected, but its people are
--    NOT returned by dream_team_lideres_gdv(). The pairing / md5 node-id logic is
--    untouched.
--
-- dream_team_resolver_nombres and dream_team_contactos_personas are NOT touched:
-- they read dream_team_lideres_gdv(), so they now resolve exactly the people in
-- scope for a director, and nobody else.
--
-- BLAST RADIUS
-- Read-only over Grupos de Vida tables. No schema or policy change, no data
-- change, no capability row (a director's access disappears by itself when they
-- stop being a director). Reading these functions grants no write permission.
--
-- ROLLBACK
-- Recreate dream_team_lideres_gdv() with the definition in
-- 20261001180000_dream_team_directores_gdv.sql and dream_team_estructura_gdv()
-- with the definition in 20260912120000_dream_team_estructura_gdv_directores.sql,
-- re-run the revoke / grant lines of this file, then
-- `drop function public.dream_team_gdv_visibilidad()`.

create or replace function public.dream_team_gdv_visibilidad()
returns table (tipo text, id uuid)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with yo as (
    select u.id
    from public.usuarios u
    where u.auth_id = auth.uid()
  ),
  nodo as (
    select e.id
    from public.dream_team_equipos e
    where e.parent_equipo_id is null
      and e.experiencia = 'grupos_vida'
      and e.activo
    order by e.created_at
    limit 1
  ),
  -- The previous `alcance` gate, unchanged: Dream Team authority on the Grupos
  -- de Vida root through the tree.
  ve_todo as (
    select n.id
    from nodo n
    where auth_has_dream_team_capability_in_tree('dream_team.org.manage', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.direct', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.coordinate', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.lead', n.id)
       or auth_has_dream_team_capability_in_tree('dream_team.metrics.read', n.id)
  ),
  -- The caller as a director: their own segmento_lideres rows plus the rows of
  -- their spouse-director. Same pairing as dream_team_estructura_gdv(): same
  -- segment, conyuge in relaciones_usuarios in either direction, any tipo_lider.
  propios as (
    select sl.id, sl.segmento_id, sl.usuario_id
    from public.segmento_lideres sl
    join yo on yo.id = sl.usuario_id
  ),
  conyuges as (
    select c.id, c.segmento_id
    from propios p
    join public.segmento_lideres c
      on c.segmento_id = p.segmento_id
     and c.usuario_id <> p.usuario_id
    join public.relaciones_usuarios r
      on r.tipo_relacion = 'conyuge'
     and ((r.usuario1_id = p.usuario_id and r.usuario2_id = c.usuario_id)
       or (r.usuario1_id = c.usuario_id and r.usuario2_id = p.usuario_id))
  ),
  equipo_propio as (
    select p.id, p.segmento_id from propios p
    union
    select c.id, c.segmento_id from conyuges c
  ),
  -- The caller as a director general.
  asignaciones_dg as (
    select dgs.id, dgs.segmento_id, dgs.alcance
    from public.director_general_segmentos dgs
    join yo on yo.id = dgs.usuario_id
  ),
  directores_dg as (
    select sl.id
    from public.segmento_lideres sl
    join asignaciones_dg a
      on a.segmento_id = sl.segmento_id
     and a.alcance = 'segmento'
    union
    select sl.id
    from public.segmento_lideres sl
    join asignaciones_dg a
      on a.segmento_id = sl.segmento_id
     and a.alcance = 'directores'
    join public.dg_directores_etapa dde on dde.segmento_lider_id = sl.id
    join yo on yo.id = dde.dg_usuario_id
    where sl.tipo_lider = 'director_etapa'
  ),
  grupos_visibles as (
    select public.gdv_dg_grupos_visibles(yo.id) as id
    from yo
    union
    select deg.grupo_id
    from public.director_etapa_grupos deg
    join equipo_propio ep on ep.id = deg.director_etapa_id
  )
  select 'todo'::text, v.id
  from ve_todo v

  union all

  select 'grupo'::text, g.id
  from grupos_visibles g
  where not exists (select 1 from ve_todo)

  union all

  select 'director'::text, d.id
  from (
    select ep.id from equipo_propio ep
    union
    select dd.id from directores_dg dd
  ) d
  where not exists (select 1 from ve_todo)

  union all

  select 'segmento'::text, s.id
  from (
    select ep.segmento_id as id from equipo_propio ep
    union
    select a.segmento_id from asignaciones_dg a
  ) s
  where not exists (select 1 from ve_todo)

  union all

  select 'dg'::text, a.id
  from asignaciones_dg a
  where not exists (select 1 from ve_todo);
$function$;

comment on function public.dream_team_gdv_visibilidad() is
  'Internal. The single rule of what Grupos de Vida the session user reads in Dream Team, as (tipo, id) rows: todo (root id, Dream Team capability on the root), grupo, director (segmento_lideres id), segmento, dg (director_general_segmentos id). Used only by dream_team_lideres_gdv() and dream_team_estructura_gdv(); not executable by anon or authenticated.';

create or replace function public.dream_team_lideres_gdv()
returns table (persona_id uuid, equipo_id uuid, rol text, desde timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with vis as (
    select v.tipo, v.id
    from public.dream_team_gdv_visibilidad() v
  ),
  ve_todo as (
    select exists (select 1 from vis where vis.tipo = 'todo') as si
  ),
  -- The next four CTEs mirror dream_team_estructura_gdv(): same director set
  -- (no tipo_lider filter), same couple pairing, so the node ids match.
  directores as (
    select sl.id as sl_id,
           sl.segmento_id,
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
    select d.sl_id,
           d.segmento_id,
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
    and ((select si from ve_todo)
         or gm.grupo_id in (select v.id from vis v where v.tipo = 'grupo'))

  union all

  select distinct
         d.usuario_id,
         md5('dream_team.gdv.directores:' || d.segmento_id::text || ':' || d.clave_u1::text || ':' || coalesce(d.clave_u2::text, ''))::uuid,
         'director_etapa',
         null::timestamptz
  from director_con_equipo d
  where (select si from ve_todo)
     or d.sl_id in (select v.id from vis v where v.tipo = 'director')

  union all

  select dgs.usuario_id,
         dgs.segmento_id,
         'director_general',
         dgs.creado_en
  from public.director_general_segmentos dgs
  join public.usuarios u on u.id = dgs.usuario_id
  where (select si from ve_todo)
     or dgs.id in (select v.id from vis v where v.tipo = 'dg');
$function$;

comment on function public.dream_team_lideres_gdv() is
  'People of Grupos de Vida for Dream Team, one row per person and team: current '
  'lider / colider (equipo_id = group id), director_etapa (equipo_id = id of the '
  'virtual directores node of dream_team_estructura_gdv(), a couple is one node) '
  'and director_general (equipo_id = segment id). Read-only. A caller with Dream '
  'Team authority over the Grupos de Vida node through the tree reads all of it; a '
  'director general or director de etapa reads only their own scope '
  '(dream_team_gdv_visibilidad()); anybody else reads nothing.';

create or replace function public.dream_team_estructura_gdv()
returns table (nodo_id uuid, parent_id uuid, tipo text, label text, responsables jsonb)
language sql
stable
security definer
set search_path to 'public'
as $$
  with vis as (
    select v.tipo, v.id
    from public.dream_team_gdv_visibilidad() v
  ),
  ve_todo as (
    select exists (select 1 from vis where vis.tipo = 'todo') as si
  ),
  nodo as (
    select e.id, e.label
    from public.dream_team_equipos e
    where e.parent_equipo_id is null
      and e.experiencia = 'grupos_vida'
      and e.activo
    order by e.created_at
    limit 1
  ),
  -- The root is returned to whoever reads any part of Grupos de Vida.
  alcance as (
    select n.id, n.label
    from nodo n
    where exists (select 1 from vis)
  ),
  grupos_vigentes as (
    select g.id, g.nombre, g.segmento_id
    from public.grupos g
    join public.temporadas t on t.id = g.temporada_id
    where g.activo
      and not g.eliminado
      and g.estado_aprobacion = 'aprobado'
      and t.activa
  ),
  directores as (
    select sl.id as sl_id,
           sl.segmento_id,
           sl.usuario_id,
           concat_ws(' ', u.nombre, u.apellido) as nombre
    from public.segmento_lideres sl
    join public.usuarios u on u.id = sl.usuario_id
  ),
  -- Dos directores del mismo segmento son pareja cuando Grupos de Vida los
  -- tiene registrados como cónyuges. Misma regla que su pantalla de segmento.
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
  -- Cada director, con la clave del equipo al que pertenece: su pareja si la
  -- tiene, o él mismo. La clave lleva el segmento porque la misma persona
  -- puede dirigir en dos segmentos (pasa en staging).
  director_con_equipo as (
    select d.sl_id,
           d.segmento_id,
           d.usuario_id,
           d.nombre,
           coalesce(p.u1, d.usuario_id) as clave_u1,
           p.u2 as clave_u2
    from directores d
    left join pareja_de p
      on p.segmento_id = d.segmento_id
     and p.usuario_id = d.usuario_id
  ),
  equipos_direccion as (
    select segmento_id,
           clave_u1,
           clave_u2,
           md5('dream_team.gdv.directores:' || segmento_id::text || ':' || clave_u1::text || ':' || coalesce(clave_u2::text, ''))::uuid as nodo_id,
           string_agg(nombre, ' y ' order by nombre) as label
    from director_con_equipo
    group by segmento_id, clave_u1, clave_u2
  ),
  asignaciones as (
    select gv.id as grupo_id,
           e.nodo_id as equipo_nodo_id,
           dce.usuario_id,
           dce.nombre
    from grupos_vigentes gv
    join public.director_etapa_grupos deg on deg.grupo_id = gv.id
    join director_con_equipo dce on dce.sl_id = deg.director_etapa_id
    join equipos_direccion e
      on e.segmento_id = dce.segmento_id
     and e.clave_u1 = dce.clave_u1
     and e.clave_u2 is not distinct from dce.clave_u2
  ),
  -- El equipo del que cuelga el grupo: el que aporta más de sus directores.
  equipo_por_grupo as (
    select distinct on (grupo_id) grupo_id, equipo_nodo_id
    from (
      select grupo_id, equipo_nodo_id, count(*) as cuantos, min(nombre) as primer_nombre
      from asignaciones
      group by grupo_id, equipo_nodo_id
    ) conteo
    order by grupo_id, cuantos desc, primer_nombre
  ),
  -- Los directores del grupo que quedaron fuera de ese equipo.
  supervisores_extra as (
    select a.grupo_id,
           jsonb_agg(distinct jsonb_build_object(
             'persona_id', a.usuario_id,
             'nombre', a.nombre,
             'rol', 'director_etapa')) as extra
    from asignaciones a
    join equipo_por_grupo epg on epg.grupo_id = a.grupo_id
    where a.equipo_nodo_id <> epg.equipo_nodo_id
    group by a.grupo_id
  ),
  -- What a director reads (unused by a 'todo' caller). The visible groups, the
  -- teams that hold a visible director or hang a visible group, and the
  -- segments that hold anything visible: the nodes on their paths.
  grupos_ok as (
    select v.id from vis v where v.tipo = 'grupo'
  ),
  -- The director_general_segmentos rows a director may name as responsables.
  dg_ok as (
    select v.id from vis v where v.tipo = 'dg'
  ),
  equipos_ok as (
    select e.nodo_id, e.segmento_id
    from equipos_direccion e
    where e.nodo_id in (
            select ed.nodo_id
            from director_con_equipo dce
            join equipos_direccion ed
              on ed.segmento_id = dce.segmento_id
             and ed.clave_u1 = dce.clave_u1
             and ed.clave_u2 is not distinct from dce.clave_u2
            where dce.sl_id in (select v.id from vis v where v.tipo = 'director')
          )
       or e.nodo_id in (
            select epg.equipo_nodo_id
            from equipo_por_grupo epg
            where epg.grupo_id in (select id from grupos_ok)
          )
  ),
  segmentos_ok as (
    select v.id from vis v where v.tipo = 'segmento'
    union
    select eo.segmento_id from equipos_ok eo
    union
    select gv.segmento_id
    from grupos_vigentes gv
    where gv.id in (select id from grupos_ok)
      and not exists (select 1 from equipo_por_grupo epg where epg.grupo_id = gv.id)
  )

  -- La dirección: sus directores generales.
  select a.id,
         null::uuid,
         'direccion',
         a.label,
         coalesce((
           select jsonb_agg(distinct jsonb_build_object(
                    'persona_id', u.id,
                    'nombre', concat_ws(' ', u.nombre, u.apellido),
                    'rol', 'director_general'))
           from public.director_general_segmentos dgs
           join public.usuarios u on u.id = dgs.usuario_id
           where (select si from ve_todo)
              or dgs.id in (select id from dg_ok)
         ), '[]'::jsonb)
  from alcance a

  union all

  -- Cada segmento: sólo su director general. Los de etapa son nodos hijos.
  select s.id,
         a.id,
         'segmento',
         s.nombre,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'persona_id', u.id,
                    'nombre', concat_ws(' ', u.nombre, u.apellido),
                    'rol', 'director_general')
                  order by concat_ws(' ', u.nombre, u.apellido))
           from public.director_general_segmentos dgs
           join public.usuarios u on u.id = dgs.usuario_id
           where dgs.segmento_id = s.id
             and ((select si from ve_todo) or dgs.id in (select id from dg_ok))
         ), '[]'::jsonb)
  from public.segmentos s
  cross join alcance a
  where (select si from ve_todo)
     or s.id in (select id from segmentos_ok)

  union all

  -- Cada equipo de dirección: la pareja, o el director solo. Su etiqueta ya
  -- son los nombres, así que no lleva responsables: repetirlos sería decir
  -- dos veces lo mismo en la misma fila.
  select e.nodo_id,
         e.segmento_id,
         'directores',
         e.label,
         '[]'::jsonb
  from equipos_direccion e
  cross join alcance a
  where (select si from ve_todo)
     or e.nodo_id in (select eo.nodo_id from equipos_ok eo)

  union all

  -- Cada grupo vigente: su líder y su colíder, más los directores que lo
  -- supervisan desde otro equipo.
  select gv.id,
         coalesce(epg.equipo_nodo_id, gv.segmento_id),
         'grupo',
         gv.nombre,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'persona_id', gm.usuario_id,
                    'nombre', concat_ws(' ', u.nombre, u.apellido),
                    'rol', case when gm.rol = 'Líder' then 'lider' else 'colider' end)
                  order by gm.rol, u.nombre)
           from public.grupo_miembros gm
           join public.usuarios u on u.id = gm.usuario_id
           where gm.grupo_id = gv.id
             and gm.rol in ('Líder', 'Colíder')
             and gm.fecha_salida is null
             and coalesce(gm.estado, 'activo') = 'activo'
         ), '[]'::jsonb) || coalesce(se.extra, '[]'::jsonb)
  from grupos_vigentes gv
  cross join alcance a
  left join equipo_por_grupo epg on epg.grupo_id = gv.id
  left join supervisores_extra se on se.grupo_id = gv.id
  where (select si from ve_todo)
     or gv.id in (select id from grupos_ok);
$$;

comment on function public.dream_team_estructura_gdv() is
  'Ramas virtuales de Grupos de Vida: dirección, segmentos, equipos de '
  'dirección (parejas de directores de etapa, con la misma regla de cónyuge '
  'que usa Grupos de Vida) y grupos vigentes colgados de su equipo. Sólo '
  'lectura, calculadas al leer. Quien tiene autoridad de Dream Team sobre Grupos '
  'de Vida por el árbol lee todo; un director general o de etapa lee sólo los '
  'nodos de su camino (dream_team_gdv_visibilidad()) y, como responsables de la '
  'dirección y de cada segmento, sólo sus propias asignaciones de director '
  'general (nunca las de otro); el resto no lee nada.';

-- The rule is internal: only the two definer functions above call it.
revoke all on function public.dream_team_gdv_visibilidad() from public;
revoke all on function public.dream_team_gdv_visibilidad() from anon;
revoke all on function public.dream_team_gdv_visibilidad() from authenticated;

revoke all on function public.dream_team_lideres_gdv() from public;
revoke all on function public.dream_team_lideres_gdv() from anon;
grant execute on function public.dream_team_lideres_gdv() to authenticated;
grant execute on function public.dream_team_lideres_gdv() to service_role;

revoke all on function public.dream_team_estructura_gdv() from public;
revoke all on function public.dream_team_estructura_gdv() from anon;
grant execute on function public.dream_team_estructura_gdv() to authenticated;
grant execute on function public.dream_team_estructura_gdv() to service_role;
