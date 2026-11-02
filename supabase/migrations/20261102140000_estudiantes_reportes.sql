-- Estudiantes, Phase B — C6d2 attendance reports and the connection funnel
-- (odd/tasks/estudiantes-fase-b.md, S17–S20, L46–L49; artboards 11 / 12 of
-- design/estudiantes-asistencia, A26–A34).
--
-- What (read-only, definer functions, search_path ''):
--   1. estudiantes_reporte_asistencia(ámbito, campus, desde, hasta, sub-área)
--      → jsonb (S17): for the active groups of the ámbito and campus the
--      caller sees at sub-área level >= 2 (optionally one sub-área):
--        grupos[]   leaders (current periods), miembros (active, estado
--                   miembro), reuniones (meetings with at least one mark),
--                   reuniones_esperadas / sin_marcar / sin_marcar_fechas,
--                   presentes / ausentes of members, promedio_presentes,
--                   porcentaje, visitantes (first-visit marks presente) and
--                   the previous period of equal length (reuniones_previas,
--                   porcentaje_previo, delta). Ordered by sub-área, año,
--                   nombre.
--        personas[] current members of the listed groups and whoever had a
--                   member mark (not era_visitante) in a group of the
--                   filtered sub-áreas in the range, except people who are
--                   an active visitor of the ámbito today (they are only in
--                   "Sin grupo", A32). Their figures sum every meeting of
--                   the range in every group of the ámbito and campus the
--                   caller sees (L48): grupo actual, reuniones, presentes,
--                   ausentes, sin_marcar, porcentaje, ausencias_seguidas,
--                   ultima_presente and grupos_en_rango.
--        subareas[] the sub-áreas the caller sees with their active groups,
--                   and a resumen of the listed groups.
--   2. estudiantes_reporte_detalle(desde, hasta, grupo | persona, ámbito)
--      → jsonb: exactly one of grupo / persona. A group: its meetings in the
--      range (held ones with their counts and the expected dates nobody
--      marked), its summary and its current members with their figures. A
--      person: every meeting of the range in the groups the caller sees
--      (their mark, sin_marcar, or nadie_marco on an expected date with no
--      meeting), their memberships and their figures.
--   3. estudiantes_reporte_embudo(ámbito, campus, sub-área) → jsonb (S18,
--      L48 "Foto de hoy", L49 names): counts and people of the three steps
--      today, internal keys sin_grupo / en_grupo / sirviendo:
--        sin_grupo  known people of the ámbito and campus with no active
--                   group in the ámbito — Transit / Inside Out: a ficha of
--                   the campus whose año belongs to the ámbito; The Living
--                   Room: a ficha without año or any past membership of a
--                   group of the ámbito and campus — plus the active
--                   visitors not yet confirmed (A32). Graduates (ficha
--                   egresado_at) are never counted (S18, L48).
--        en_grupo   active members (estado miembro) of active groups.
--        sirviendo  of those, whoever has an active Dream Team servicio
--                   (any equipo), with its equipo labels.
--   4. Closed helpers (service_role only): estudiantes_reporte_subareas
--      (validation and authority), estudiantes_reporte_fechas (expected
--      dates of a group), estudiantes_reporte_grupo (a group's figures) and
--      estudiantes_reporte_personas (a person's figures).
--
-- How:
--   - Authority (S19, Q3): estudiantes_nivel_en_campus >= 2 on a Grupos de
--     Chicas / Chicos sub-área of the ámbito in the campus (entrenador,
--     director de grupo, directors, a pastor of the campus, admin). A
--     leader (level 1), another campus or nothing visible → sin_autoridad
--     (42501). The detail checks the group's sub-área, or for a person only
--     reads the groups the caller sees (none related → sin_autoridad).
--   - Validation (22023): rango_invalido (a date missing, desde > hasta or
--     more than 366 days counting both ends), ambito_invalido (not a
--     Transit / Inside Out / The Living Room node with small-group
--     sub-áreas), subarea_invalida (not a small-group sub-área of the
--     ámbito), parametros_invalidos (detail without exactly one of grupo /
--     persona), grupo_invalido, persona_invalida.
--   - A meeting is an estudiantes_reuniones row with at least one mark
--     (A28). Expected dates follow estudiantes_grupo_sesiones: Transit /
--     Inside Out, every date on which a turno that serves the ámbito in the
--     group's campus happens (dream_team_turnos_del_equipo +
--     dream_team_turno_activo_en); The Living Room, the group's weekly day
--     (none when it has no day). They are counted per date (a group meets
--     once a day whatever the turno), only from the day the group was
--     created and only up to yesterday (today may still be marked). A
--     group's sin_marcar is an expected date with no meeting that day.
--   - Group % = presentes ÷ (presentes + ausentes) over the members' marks
--     (era_visitante marks are left out); visitantes = presente marks with
--     era_visitante; promedio_presentes = member presentes ÷ meetings. The
--     previous period is the same number of days right before desde.
--     Percentages, promedio and delta are rounded to one decimal; "Estable"
--     (|delta| < 3) is a UI rule.
--   - A person's meetings are the meetings of the range, in the groups the
--     caller sees, where they have a mark or were a member that day
--     (desde <= fecha and before the date of retirado_at, America/Caracas).
--     sin_marcar = those meetings without their mark; % = presentes ÷
--     (presentes + ausentes); ausencias_seguidas = the newest consecutive
--     ausente marks up to hasta (unmarked meetings skipped, may start before
--     desde); ultima_presente = the last presente on or before hasta.
--   - Sub-área filter in the funnel: visitors and members by their group;
--     a known person without an active group by their last group of the
--     ámbito and campus, or else by sexo as estudiantes_sin_grupo does
--     (Femenino → Chicas, Masculino → Chicos, anyone else in both). When the
--     caller sees every sub-área and passes none, nobody is filtered out.
--   - S20: these RPCs take one ámbito; the UI asks Transit → Inside Out →
--     The Living Room in that order. Inside one ámbito groups are ordered by
--     sub-área, año and nombre; people by nombre and apellido.
--
-- Why: S1 asks for individual and group attendance statistics and the plan's
-- Foyer → Living Room → Kitchen metric (S9); the leader screens only show the
-- last meetings of one group.
--
-- Blast radius: seven new read-only functions (three RPCs granted to
-- authenticated, four closed helpers). No table, existing function, policy
-- or row changes.
--
-- Rollback:
--   drop function if exists public.estudiantes_reporte_embudo(uuid, uuid, uuid);
--   drop function if exists public.estudiantes_reporte_detalle(date, date, uuid, uuid, uuid);
--   drop function if exists public.estudiantes_reporte_asistencia(uuid, uuid, date, date, uuid);
--   drop function if exists public.estudiantes_reporte_personas(uuid[], uuid[], date, date);
--   drop function if exists public.estudiantes_reporte_grupo(uuid, date, date);
--   drop function if exists public.estudiantes_reporte_fechas(uuid, date, date);
--   drop function if exists public.estudiantes_reporte_subareas(uuid, uuid, uuid);

-- ── 1. helpers ───────────────────────────────────────────────────────

-- The small-group sub-áreas of an ámbito the caller sees in a campus (level
-- >= 2), and whether each is inside the optional sub-área filter. Raises
-- ambito_invalido, subarea_invalida or sin_autoridad (nothing visible in the
-- filter).
create or replace function public.estudiantes_reporte_subareas(p_ambito_id uuid, p_campus_id uuid, p_subarea_id uuid)
returns table (subarea_id uuid, label text, en_filtro boolean)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not exists (
    select 1 from public.dream_team_equipos a
     where a.id = p_ambito_id and a.experiencia in ('estudiantes', 'the_living_room')
       and exists (select 1 from public.dream_team_equipos s
                    where s.parent_equipo_id = a.id and public.estudiantes_es_subarea_grupos(s.label))
  ) then
    raise exception 'ambito_invalido' using errcode = '22023';
  end if;
  if p_subarea_id is not null and not exists (
    select 1 from public.dream_team_equipos s
     where s.id = p_subarea_id and s.parent_equipo_id = p_ambito_id
       and public.estudiantes_es_subarea_grupos(s.label)
  ) then
    raise exception 'subarea_invalida' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.dream_team_equipos s
     where s.parent_equipo_id = p_ambito_id and public.estudiantes_es_subarea_grupos(s.label)
       and (p_subarea_id is null or s.id = p_subarea_id)
       and public.estudiantes_nivel_en_campus(s.id, p_campus_id) >= 2
  ) then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;

  return query
  select s.id, s.label, (p_subarea_id is null or s.id = p_subarea_id)
    from public.dream_team_equipos s
   where s.parent_equipo_id = p_ambito_id and public.estudiantes_es_subarea_grupos(s.label)
     and public.estudiantes_nivel_en_campus(s.id, p_campus_id) >= 2
   order by s.label, s.id;
end;
$$;

comment on function public.estudiantes_reporte_subareas(uuid, uuid, uuid) is
  'Small-group sub-áreas of an ámbito the caller sees in a campus (level >= 2) and whether each is in the optional '
  'filter. Errors: ambito_invalido, subarea_invalida, sin_autoridad.';

revoke all on function public.estudiantes_reporte_subareas(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.estudiantes_reporte_subareas(uuid, uuid, uuid) to service_role;

-- The dates a group was expected to meet between desde and hasta, as
-- estudiantes_grupo_sesiones lists them: Transit / Inside Out, the dates of
-- the turnos that serve the ámbito in its campus; The Living Room, its weekly
-- day. Only from the day the group was created and up to yesterday.
create or replace function public.estudiantes_reporte_fechas(p_grupo_id uuid, p_desde date, p_hasta date)
returns setof date
language sql
stable
security definer
set search_path to ''
as $$
  with g as (
    select g.id, g.campus_id, g.ambito_id, g.dia_semana, a.experiencia,
           greatest(p_desde, (g.created_at at time zone 'America/Caracas')::date) as desde,
           least(p_hasta, public.ninos_hoy() - 1) as hasta
      from public.estudiantes_grupos g
      join public.dream_team_equipos a on a.id = g.ambito_id
     where g.id = p_grupo_id
  ),
  turnos as (
    select x.id
      from g
      cross join lateral public.dream_team_turnos_del_equipo(g.ambito_id, g.campus_id) as x(id)
     where g.experiencia <> 'the_living_room'
  )
  select d::date
    from g
    cross join generate_series(g.desde, g.hasta, interval '1 day') as d
   where case when g.experiencia = 'the_living_room'
              then extract(dow from d::date)::int = g.dia_semana
              else exists (select 1 from turnos t where public.dream_team_turno_activo_en(t.id, d::date))
         end
   order by 1
$$;

comment on function public.estudiantes_reporte_fechas(uuid, date, date) is
  'Dates a group was expected to meet in a range (turnos serving its ámbito for Transit / Inside Out, its weekly '
  'day for The Living Room), from its creation and up to yesterday.';

revoke all on function public.estudiantes_reporte_fechas(uuid, date, date) from public, anon, authenticated;
grant execute on function public.estudiantes_reporte_fechas(uuid, date, date) to service_role;

-- A group's figures in a range and in the previous period of equal length.
create or replace function public.estudiantes_reporte_grupo(p_grupo_id uuid, p_desde date, p_hasta date)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  with reun as (
    select r.id, r.fecha, r.fecha >= p_desde as actual,
           count(*) filter (where a.estado = 'presente' and not a.era_visitante) as presentes,
           count(*) filter (where a.estado = 'ausente' and not a.era_visitante) as ausentes,
           count(*) filter (where a.estado = 'presente' and a.era_visitante) as visitantes
      from public.estudiantes_reuniones r
      join public.estudiantes_asistencias a on a.reunion_id = r.id
     where r.grupo_id = p_grupo_id
       and r.fecha between p_desde - (p_hasta - p_desde + 1) and p_hasta
     group by r.id, r.fecha
  ),
  k as (
    select count(*) filter (where x.actual) as reuniones,
           coalesce(sum(x.presentes) filter (where x.actual), 0) as presentes,
           coalesce(sum(x.ausentes) filter (where x.actual), 0) as ausentes,
           coalesce(sum(x.visitantes) filter (where x.actual), 0) as visitantes,
           count(*) filter (where not x.actual) as reuniones_previas,
           coalesce(sum(x.presentes) filter (where not x.actual), 0) as presentes_previos,
           coalesce(sum(x.ausentes) filter (where not x.actual), 0) as ausentes_previos
      from reun x
  ),
  pct as (
    select k.*,
           case when k.presentes + k.ausentes > 0
                then 100.0 * k.presentes / (k.presentes + k.ausentes) end as porcentaje,
           case when k.presentes_previos + k.ausentes_previos > 0
                then 100.0 * k.presentes_previos / (k.presentes_previos + k.ausentes_previos) end as porcentaje_previo
      from k
  ),
  esperadas as (
    select f.fecha, exists (select 1 from reun x where x.actual and x.fecha = f.fecha) as celebrada
      from public.estudiantes_reporte_fechas(p_grupo_id, p_desde, p_hasta) as f(fecha)
  )
  select jsonb_build_object(
    'reuniones', p.reuniones,
    'reuniones_esperadas', (select count(*) from esperadas),
    'sin_marcar', (select count(*) from esperadas e where not e.celebrada),
    'sin_marcar_fechas', coalesce((select jsonb_agg(e.fecha order by e.fecha) from esperadas e where not e.celebrada),
                                  '[]'::jsonb),
    'presentes', p.presentes,
    'ausentes', p.ausentes,
    'visitantes', p.visitantes,
    'promedio_presentes', case when p.reuniones > 0 then round(p.presentes::numeric / p.reuniones, 1) end,
    'porcentaje', round(p.porcentaje, 1),
    'reuniones_previas', p.reuniones_previas,
    'porcentaje_previo', round(p.porcentaje_previo, 1),
    'delta', round(p.porcentaje - p.porcentaje_previo, 1))
    from pct p
$$;

comment on function public.estudiantes_reporte_grupo(uuid, date, date) is
  'A group''s attendance figures in a range: meetings (with marks), expected dates and the unmarked ones, member '
  'presentes / ausentes, promedio, %, first-visit visitors, and the % of the previous period of equal length.';

revoke all on function public.estudiantes_reporte_grupo(uuid, date, date) from public, anon, authenticated;
grant execute on function public.estudiantes_reporte_grupo(uuid, date, date) to service_role;

-- The figures of people over the meetings of the given groups: every meeting
-- of the range where they have a mark or were a member that day. The streak
-- and the last presente look at every mark up to hasta.
create or replace function public.estudiantes_reporte_personas(
  p_grupos uuid[],
  p_personas uuid[],
  p_desde date,
  p_hasta date
)
returns table (
  persona_id uuid,
  reuniones integer,
  presentes integer,
  ausentes integer,
  sin_marcar integer,
  porcentaje numeric,
  ausencias_seguidas integer,
  ultima_presente date,
  grupos_en_rango jsonb
)
language sql
stable
security definer
set search_path to ''
as $$
  with reun as (
    select r.id, r.grupo_id, r.fecha
      from public.estudiantes_reuniones r
     where r.grupo_id = any(p_grupos)
       and r.fecha <= p_hasta
       and exists (select 1 from public.estudiantes_asistencias a where a.reunion_id = r.id)
  ),
  marcas as (
    select a.persona_id, a.estado, a.marcado_at, r.id as reunion_id, r.grupo_id, r.fecha
      from reun r
      join public.estudiantes_asistencias a on a.reunion_id = r.id
     where a.persona_id = any(p_personas)
  ),
  esperadas as (
    select m.persona_id, r.id as reunion_id, r.grupo_id, r.fecha
      from reun r
      join public.estudiantes_grupo_miembros m on m.grupo_id = r.grupo_id
     where m.persona_id = any(p_personas)
       and r.fecha >= p_desde
       and m.desde <= r.fecha
       and (m.retirado_at is null or (m.retirado_at at time zone 'America/Caracas')::date > r.fecha)
    union
    select x.persona_id, x.reunion_id, x.grupo_id, x.fecha from marcas x where x.fecha >= p_desde
  ),
  conteo as (
    select e.persona_id,
           count(*)::integer as reuniones,
           count(*) filter (where x.estado = 'presente')::integer as presentes,
           count(*) filter (where x.estado = 'ausente')::integer as ausentes
      from esperadas e
      left join marcas x on x.reunion_id = e.reunion_id and x.persona_id = e.persona_id
     group by e.persona_id
  ),
  racha as (
    select y.persona_id,
           count(*) filter (where y.presentes_hasta_aqui = 0)::integer as seguidas,
           max(y.fecha) filter (where y.estado = 'presente') as ultima
      from (
        select x.persona_id, x.estado, x.fecha,
               count(*) filter (where x.estado = 'presente')
                 over (partition by x.persona_id order by x.fecha desc, x.marcado_at desc, x.reunion_id
                       rows between unbounded preceding and current row) as presentes_hasta_aqui
          from marcas x
      ) y
     group by y.persona_id
  ),
  grupos as (
    select z.persona_id, jsonb_agg(z.nombre order by z.primera, z.nombre) as nombres
      from (
        select e.persona_id, g.nombre, min(e.fecha) as primera
          from esperadas e
          join public.estudiantes_grupos g on g.id = e.grupo_id
         group by e.persona_id, g.id, g.nombre
      ) z
     group by z.persona_id
  )
  select p.id,
         coalesce(c.reuniones, 0),
         coalesce(c.presentes, 0),
         coalesce(c.ausentes, 0),
         coalesce(c.reuniones - c.presentes - c.ausentes, 0),
         case when c.presentes + c.ausentes > 0 then round(100.0 * c.presentes / (c.presentes + c.ausentes), 1) end,
         coalesce(r.seguidas, 0),
         r.ultima,
         coalesce(g.nombres, '[]'::jsonb)
    from (select distinct u.id from unnest(p_personas) as u(id)) p
    left join conteo c on c.persona_id = p.id
    left join racha r on r.persona_id = p.id
    left join grupos g on g.persona_id = p.id
$$;

comment on function public.estudiantes_reporte_personas(uuid[], uuid[], date, date) is
  'Attendance figures of people over the meetings of the given groups in a range (meetings where they have a mark '
  'or were a member that day): reuniones, presentes, ausentes, sin_marcar, %, the newest ausente streak and the last '
  'presente up to hasta, and the names of the groups of those meetings in order.';

revoke all on function public.estudiantes_reporte_personas(uuid[], uuid[], date, date) from public, anon, authenticated;
grant execute on function public.estudiantes_reporte_personas(uuid[], uuid[], date, date) to service_role;

-- ── 2. attendance report ─────────────────────────────────────────────

create or replace function public.estudiantes_reporte_asistencia(
  p_ambito_id uuid,
  p_campus_id uuid,
  p_desde date,
  p_hasta date,
  p_subarea_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_visibles uuid[];
  v_filtro uuid[];
  v_subareas jsonb;
  -- Every group of the visible sub-áreas, in any state: a person's history.
  v_historia uuid[];
  v_historia_filtro uuid[];
  -- The active groups listed.
  v_grupos uuid[];
  v_personas uuid[];
  v_grupos_json jsonb;
  v_personas_json jsonb;
  v_resumen jsonb;
begin
  if public.ninos_usuario_actual() is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta or p_hasta - p_desde > 365 then
    raise exception 'rango_invalido' using errcode = '22023';
  end if;

  select array_agg(s.subarea_id order by s.label, s.subarea_id),
         array_agg(s.subarea_id order by s.label, s.subarea_id) filter (where s.en_filtro),
         jsonb_agg(jsonb_build_object(
           'subarea_id', s.subarea_id, 'label', s.label,
           'grupos', (select count(*) from public.estudiantes_grupos g
                       where g.subarea_id = s.subarea_id and g.campus_id = p_campus_id and g.activo))
           order by s.label, s.subarea_id)
    into v_visibles, v_filtro, v_subareas
    from public.estudiantes_reporte_subareas(p_ambito_id, p_campus_id, p_subarea_id) s;

  v_historia := array(
    select g.id from public.estudiantes_grupos g
     where g.ambito_id = p_ambito_id and g.campus_id = p_campus_id and g.subarea_id = any(v_visibles));
  v_historia_filtro := array(
    select g.id from public.estudiantes_grupos g
     where g.id = any(v_historia) and g.subarea_id = any(v_filtro));
  v_grupos := array(
    select g.id from public.estudiantes_grupos g
     where g.id = any(v_historia_filtro) and g.activo);
  v_personas := array(
    select m.persona_id
      from public.estudiantes_grupo_miembros m
     where m.grupo_id = any(v_grupos) and m.activo and m.estado = 'miembro'
    union
    select a.persona_id
      from public.estudiantes_asistencias a
      join public.estudiantes_reuniones r on r.id = a.reunion_id
     where r.grupo_id = any(v_historia_filtro)
       and r.fecha between p_desde and p_hasta
       and not a.era_visitante
       and not exists (select 1 from public.estudiantes_grupo_miembros v
                        where v.persona_id = a.persona_id and v.ambito_id = p_ambito_id
                          and v.activo and v.estado = 'visitante'));

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'grupo_id', g.id, 'nombre', g.nombre, 'subarea_id', g.subarea_id, 'subarea', s.label,
             'anio', g.anio, 'anio_etiqueta', e.etiqueta, 'dia_semana', g.dia_semana, 'hora', g.hora,
             'lideres', coalesce((
               select jsonb_agg(btrim(u.nombre || ' ' || u.apellido) order by u.apellido, u.nombre)
                 from public.estudiantes_grupo_lideres gl
                 join public.dream_team_servicios sv on sv.id = gl.servicio_id
                 join public.usuarios u on u.id = sv.persona_id
                where gl.grupo_id = g.id and gl.hasta is null and sv.estado = 'activo'), '[]'::jsonb),
             'miembros', (select count(*) from public.estudiantes_grupo_miembros m
                           where m.grupo_id = g.id and m.activo and m.estado = 'miembro'))
           || public.estudiantes_reporte_grupo(g.id, p_desde, p_hasta)
           order by s.label, g.anio nulls last, g.nombre, g.id), '[]'::jsonb)
    into v_grupos_json
    from public.estudiantes_grupos g
    join public.dream_team_equipos s on s.id = g.subarea_id
    left join public.estudiantes_escala e on e.campus_id = g.campus_id and e.numero = g.anio
   where g.id = any(v_grupos);

  select coalesce(jsonb_agg(jsonb_build_object(
           'persona_id', u.id, 'nombre', u.nombre, 'apellido', u.apellido, 'anio_etiqueta', ef.etiqueta,
           'grupo_id', ga.grupo_id, 'grupo', ga.nombre, 'miembro_desde', ga.desde,
           'reuniones', x.reuniones, 'presentes', x.presentes, 'ausentes', x.ausentes,
           'sin_marcar', x.sin_marcar, 'porcentaje', x.porcentaje,
           'ausencias_seguidas', x.ausencias_seguidas, 'ultima_presente', x.ultima_presente,
           'grupos_en_rango', x.grupos_en_rango)
           order by u.nombre, u.apellido, u.id), '[]'::jsonb)
    into v_personas_json
    from public.estudiantes_reporte_personas(v_historia, v_personas, p_desde, p_hasta) x
    join public.usuarios u on u.id = x.persona_id
    left join public.estudiantes_fichas f on f.persona_id = u.id
    left join public.estudiantes_escala ef on ef.campus_id = f.campus_id and ef.numero = f.anio_actual
    left join lateral (
      select m.grupo_id, g.nombre, m.desde
        from public.estudiantes_grupo_miembros m
        join public.estudiantes_grupos g on g.id = m.grupo_id
       where m.persona_id = u.id and m.ambito_id = p_ambito_id and m.activo and g.activo
         and g.id = any(v_historia)
       order by m.desde desc, m.id
       limit 1
    ) ga on true;

  select jsonb_build_object(
           'grupos', count(*),
           'reuniones', coalesce(sum((x ->> 'reuniones')::integer), 0),
           'presentes', coalesce(sum((x ->> 'presentes')::integer), 0),
           'ausentes', coalesce(sum((x ->> 'ausentes')::integer), 0),
           'porcentaje', case when coalesce(sum((x ->> 'presentes')::integer + (x ->> 'ausentes')::integer), 0) > 0
                              then round(100.0 * sum((x ->> 'presentes')::integer)
                                         / sum((x ->> 'presentes')::integer + (x ->> 'ausentes')::integer), 1) end,
           'visitantes', coalesce(sum((x ->> 'visitantes')::integer), 0),
           'sin_marcar', coalesce(sum((x ->> 'sin_marcar')::integer), 0),
           'personas', jsonb_array_length(v_personas_json))
    into v_resumen
    from jsonb_array_elements(v_grupos_json) x;

  return jsonb_build_object(
    'ambito_id', p_ambito_id, 'campus_id', p_campus_id, 'subarea_id', p_subarea_id,
    'desde', p_desde, 'hasta', p_hasta,
    'previo_desde', p_desde - (p_hasta - p_desde + 1), 'previo_hasta', p_desde - 1,
    'subareas', coalesce(v_subareas, '[]'::jsonb),
    'resumen', v_resumen,
    'grupos', v_grupos_json,
    'personas', v_personas_json);
end;
$$;

comment on function public.estudiantes_reporte_asistencia(uuid, uuid, date, date, uuid) is
  'Attendance report of an ámbito and campus in a range (S17, at most 366 days): per active group the caller sees '
  'at sub-área level >= 2 (optionally one sub-área) its leaders, members, meetings, expected and unmarked dates, '
  'promedio, %, visitors and the previous period; per person (current members and whoever had a member mark in the '
  'range, not active visitors) their meetings in every visible group of the ámbito and campus (L48), presentes, '
  'ausentes, sin_marcar, %, ausente streak, last presente and groups. Groups by sub-área, año, nombre. '
  'Errors: sin_autoridad, rango_invalido, ambito_invalido, subarea_invalida.';

revoke all on function public.estudiantes_reporte_asistencia(uuid, uuid, date, date, uuid) from public, anon;
grant execute on function public.estudiantes_reporte_asistencia(uuid, uuid, date, date, uuid) to authenticated, service_role;

-- ── 3. detail of a group or a person ─────────────────────────────────

create or replace function public.estudiantes_reporte_detalle(
  p_desde date,
  p_hasta date,
  p_grupo_id uuid default null,
  p_persona_id uuid default null,
  p_ambito_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_g record;
  v_p record;
  v_grupos uuid[];
  v_reuniones jsonb;
  v_integrantes jsonb;
  v_membresias jsonb;
  v_resumen jsonb;
begin
  if public.ninos_usuario_actual() is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta or p_hasta - p_desde > 365 then
    raise exception 'rango_invalido' using errcode = '22023';
  end if;
  if (p_grupo_id is null) = (p_persona_id is null) then
    raise exception 'parametros_invalidos' using errcode = '22023';
  end if;

  if p_grupo_id is not null then
    select g.id, g.nombre, g.campus_id, g.ambito_id, g.subarea_id, g.anio, g.dia_semana, g.hora, g.activo,
           s.label as subarea, a.label as ambito, e.etiqueta as anio_etiqueta
      into v_g
      from public.estudiantes_grupos g
      join public.dream_team_equipos s on s.id = g.subarea_id
      join public.dream_team_equipos a on a.id = g.ambito_id
      left join public.estudiantes_escala e on e.campus_id = g.campus_id and e.numero = g.anio
     where g.id = p_grupo_id;
    if not found then
      raise exception 'grupo_invalido' using errcode = '22023';
    end if;
    if public.estudiantes_nivel_en_campus(v_g.subarea_id, v_g.campus_id) < 2 then
      raise exception 'sin_autoridad' using errcode = '42501';
    end if;
    v_grupos := array(
      select g.id from public.estudiantes_grupos g
       where g.ambito_id = v_g.ambito_id and g.campus_id = v_g.campus_id
         and public.estudiantes_nivel_en_campus(g.subarea_id, g.campus_id) >= 2);

    with reun as (
      select r.id, r.fecha, r.turno_id, r.lugar,
             count(*) filter (where a.estado = 'presente' and not a.era_visitante)::integer as presentes,
             count(*) filter (where a.estado = 'ausente' and not a.era_visitante)::integer as ausentes,
             count(*) filter (where a.estado = 'presente' and a.era_visitante)::integer as visitantes
        from public.estudiantes_reuniones r
        join public.estudiantes_asistencias a on a.reunion_id = r.id
       where r.grupo_id = p_grupo_id and r.fecha between p_desde and p_hasta
       group by r.id, r.fecha, r.turno_id, r.lugar
    ),
    filas as (
      select x.fecha, x.id as reunion_id, x.turno_id, t.nombre as turno, t.orden, x.lugar,
             x.presentes, x.ausentes, x.visitantes,
             case when x.presentes + x.ausentes > 0
                  then round(100.0 * x.presentes / (x.presentes + x.ausentes), 1) end as porcentaje,
             false as sin_marcar
        from reun x
        left join public.dream_team_turnos t on t.id = x.turno_id
      union all
      select f.fecha, null, null, null, null, null, 0, 0, 0, null, true
        from public.estudiantes_reporte_fechas(p_grupo_id, p_desde, p_hasta) as f(fecha)
       where not exists (select 1 from reun x where x.fecha = f.fecha)
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'fecha', fi.fecha, 'reunion_id', fi.reunion_id, 'turno_id', fi.turno_id, 'turno', fi.turno,
             'lugar', fi.lugar, 'presentes', fi.presentes, 'ausentes', fi.ausentes, 'visitantes', fi.visitantes,
             'porcentaje', fi.porcentaje, 'sin_marcar', fi.sin_marcar)
             order by fi.fecha desc, fi.orden nulls last, fi.turno_id), '[]'::jsonb)
      into v_reuniones
      from filas fi;

    select coalesce(jsonb_agg(jsonb_build_object(
             'persona_id', u.id, 'nombre', u.nombre, 'apellido', u.apellido, 'miembro_desde', m.desde,
             'reuniones', x.reuniones, 'presentes', x.presentes, 'ausentes', x.ausentes,
             'sin_marcar', x.sin_marcar, 'porcentaje', x.porcentaje,
             'ausencias_seguidas', x.ausencias_seguidas, 'ultima_presente', x.ultima_presente,
             'grupos_en_rango', x.grupos_en_rango)
             order by u.nombre, u.apellido, u.id), '[]'::jsonb)
      into v_integrantes
      from public.estudiantes_grupo_miembros m
      join public.usuarios u on u.id = m.persona_id
      join public.estudiantes_reporte_personas(
             v_grupos,
             array(select mm.persona_id from public.estudiantes_grupo_miembros mm
                    where mm.grupo_id = p_grupo_id and mm.activo and mm.estado = 'miembro'),
             p_desde, p_hasta) x on x.persona_id = m.persona_id
     where m.grupo_id = p_grupo_id and m.activo and m.estado = 'miembro';

    return jsonb_build_object(
      'grupo', jsonb_build_object(
        'grupo_id', v_g.id, 'nombre', v_g.nombre, 'ambito_id', v_g.ambito_id, 'ambito', v_g.ambito,
        'subarea_id', v_g.subarea_id, 'subarea', v_g.subarea, 'anio', v_g.anio, 'anio_etiqueta', v_g.anio_etiqueta,
        'dia_semana', v_g.dia_semana, 'hora', v_g.hora, 'activo', v_g.activo,
        'lideres', coalesce((
          select jsonb_agg(btrim(u.nombre || ' ' || u.apellido) order by u.apellido, u.nombre)
            from public.estudiantes_grupo_lideres gl
            join public.dream_team_servicios sv on sv.id = gl.servicio_id
            join public.usuarios u on u.id = sv.persona_id
           where gl.grupo_id = v_g.id and gl.hasta is null and sv.estado = 'activo'), '[]'::jsonb)),
      'desde', p_desde, 'hasta', p_hasta,
      'resumen', public.estudiantes_reporte_grupo(p_grupo_id, p_desde, p_hasta),
      'reuniones', v_reuniones,
      'integrantes', v_integrantes);
  end if;

  -- A person: only the groups the caller sees (level >= 2) where they were a
  -- member or have a mark.
  select u.id, u.nombre, u.apellido, ef.etiqueta as anio_etiqueta, f.egresado_at
    into v_p
    from public.usuarios u
    left join public.estudiantes_fichas f on f.persona_id = u.id
    left join public.estudiantes_escala ef on ef.campus_id = f.campus_id and ef.numero = f.anio_actual
   where u.id = p_persona_id;
  if not found then
    raise exception 'persona_invalida' using errcode = '22023';
  end if;
  v_grupos := array(
    select g.id
      from public.estudiantes_grupos g
     where (p_ambito_id is null or g.ambito_id = p_ambito_id)
       and (exists (select 1 from public.estudiantes_grupo_miembros m
                     where m.grupo_id = g.id and m.persona_id = p_persona_id)
            or exists (select 1 from public.estudiantes_reuniones r
                         join public.estudiantes_asistencias a on a.reunion_id = r.id
                        where r.grupo_id = g.id and a.persona_id = p_persona_id))
       and public.estudiantes_nivel_en_campus(g.subarea_id, g.campus_id) >= 2);
  if cardinality(v_grupos) = 0 then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;

  with reun as (
    select r.id, r.grupo_id, r.fecha, r.turno_id
      from public.estudiantes_reuniones r
     where r.grupo_id = any(v_grupos) and r.fecha between p_desde and p_hasta
       and exists (select 1 from public.estudiantes_asistencias a where a.reunion_id = r.id)
  ),
  periodos as (
    select m.grupo_id, m.desde,
           case when m.retirado_at is not null
                then (m.retirado_at at time zone 'America/Caracas')::date - 1 end as hasta
      from public.estudiantes_grupo_miembros m
     where m.persona_id = p_persona_id and m.grupo_id = any(v_grupos)
  ),
  filas as (
    select x.fecha, x.grupo_id, x.id as reunion_id, x.turno_id, coalesce(a.estado, 'sin_marcar') as estado
      from reun x
      left join public.estudiantes_asistencias a on a.reunion_id = x.id and a.persona_id = p_persona_id
     where a.persona_id is not null
        or exists (select 1 from periodos pe
                    where pe.grupo_id = x.grupo_id and pe.desde <= x.fecha
                      and (pe.hasta is null or x.fecha <= pe.hasta))
    union all
    select f.fecha, pe.grupo_id, null, null, 'nadie_marco'
      from periodos pe
      cross join lateral public.estudiantes_reporte_fechas(
        pe.grupo_id, greatest(p_desde, pe.desde), least(p_hasta, coalesce(pe.hasta, p_hasta))) as f(fecha)
     where not exists (select 1 from reun x where x.grupo_id = pe.grupo_id and x.fecha = f.fecha)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'fecha', fi.fecha, 'grupo_id', fi.grupo_id, 'grupo', g.nombre, 'reunion_id', fi.reunion_id,
           'turno_id', fi.turno_id, 'turno', t.nombre, 'estado', fi.estado)
           order by fi.fecha desc, g.nombre, fi.grupo_id), '[]'::jsonb)
    into v_reuniones
    from filas fi
    join public.estudiantes_grupos g on g.id = fi.grupo_id
    left join public.dream_team_turnos t on t.id = fi.turno_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'grupo_id', g.id, 'grupo', g.nombre, 'ambito_id', g.ambito_id, 'estado', m.estado,
           'desde', m.desde, 'retirado_at', m.retirado_at, 'activo', m.activo)
           order by m.desde, g.nombre, g.id), '[]'::jsonb)
    into v_membresias
    from public.estudiantes_grupo_miembros m
    join public.estudiantes_grupos g on g.id = m.grupo_id
   where m.persona_id = p_persona_id and m.grupo_id = any(v_grupos);

  select jsonb_build_object(
           'reuniones', x.reuniones, 'presentes', x.presentes, 'ausentes', x.ausentes,
           'sin_marcar', x.sin_marcar, 'porcentaje', x.porcentaje,
           'ausencias_seguidas', x.ausencias_seguidas, 'ultima_presente', x.ultima_presente,
           'grupos_en_rango', x.grupos_en_rango)
    into v_resumen
    from public.estudiantes_reporte_personas(v_grupos, array[p_persona_id], p_desde, p_hasta) x;

  return jsonb_build_object(
    'persona', jsonb_build_object('persona_id', v_p.id, 'nombre', v_p.nombre, 'apellido', v_p.apellido,
                                  'anio_etiqueta', v_p.anio_etiqueta, 'egresado', v_p.egresado_at is not null),
    'desde', p_desde, 'hasta', p_hasta,
    'resumen', v_resumen,
    'membresias', v_membresias,
    'reuniones', v_reuniones);
end;
$$;

comment on function public.estudiantes_reporte_detalle(date, date, uuid, uuid, uuid) is
  'Detail of a report in a range (at most 366 days), exactly one of p_grupo_id / p_persona_id. A group (level >= 2 '
  'on its sub-área and campus): its meetings with member presentes, ausentes, first-visit visitors and %, the '
  'expected dates nobody marked (sin_marcar), its summary and its current members with their figures. A person: '
  'each meeting of the range in the groups the caller sees (optionally of one ámbito) with their mark, sin_marcar '
  'or nadie_marco, their memberships and figures. Errors: sin_autoridad, rango_invalido, parametros_invalidos, '
  'grupo_invalido, persona_invalida.';

revoke all on function public.estudiantes_reporte_detalle(date, date, uuid, uuid, uuid) from public, anon;
grant execute on function public.estudiantes_reporte_detalle(date, date, uuid, uuid, uuid) to authenticated, service_role;

-- ── 4. connection funnel (snapshot of today) ─────────────────────────

create or replace function public.estudiantes_reporte_embudo(
  p_ambito_id uuid,
  p_campus_id uuid,
  p_subarea_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_experiencia text;
  v_filtro uuid[];
  v_etiquetas text[];
  v_todas boolean;
  v_res jsonb;
begin
  if public.ninos_usuario_actual() is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  select array_agg(s.subarea_id) filter (where s.en_filtro),
         array_agg(public.dream_team_normalizar_etiqueta(s.label)) filter (where s.en_filtro)
    into v_filtro, v_etiquetas
    from public.estudiantes_reporte_subareas(p_ambito_id, p_campus_id, p_subarea_id) s;
  select a.experiencia into v_experiencia from public.dream_team_equipos a where a.id = p_ambito_id;
  -- Every small-group sub-área of the ámbito is in the filter: nobody is left out by sub-área.
  v_todas := not exists (select 1 from public.dream_team_equipos s
                          where s.parent_equipo_id = p_ambito_id and public.estudiantes_es_subarea_grupos(s.label)
                            and s.id <> all(v_filtro));

  with egresados as (
    select f.persona_id from public.estudiantes_fichas f where f.egresado_at is not null
  ),
  -- An active membership in an active group of the ámbito (any estado).
  activos as (
    select m.persona_id, m.estado, g.id as grupo_id, g.nombre, g.subarea_id, g.campus_id, m.desde
      from public.estudiantes_grupo_miembros m
      join public.estudiantes_grupos g on g.id = m.grupo_id
     where m.activo and g.activo and m.ambito_id = p_ambito_id
  ),
  en_grupo as (
    select distinct on (a.persona_id) a.persona_id, a.grupo_id, a.nombre as grupo
      from activos a
     where a.estado = 'miembro' and a.campus_id = p_campus_id and a.subarea_id = any(v_filtro)
     order by a.persona_id, a.desde desc
  ),
  servicio as (
    select sv.persona_id, string_agg(distinct e.label, ', ' order by e.label) as etiqueta
      from public.dream_team_servicios sv
      join public.dream_team_equipos e on e.id = sv.equipo_id
     where sv.estado = 'activo' and sv.persona_id in (select eg.persona_id from en_grupo eg)
     group by sv.persona_id
  ),
  conocidos as (
    select f.persona_id
      from public.estudiantes_fichas f
      join public.estudiantes_escala e on e.campus_id = f.campus_id and e.numero = f.anio_actual
     where v_experiencia = 'estudiantes' and f.campus_id = p_campus_id and e.ambito_id = p_ambito_id
    union
    select f.persona_id
      from public.estudiantes_fichas f
     where v_experiencia = 'the_living_room' and f.campus_id = p_campus_id and f.anio_actual is null
    union
    select m.persona_id
      from public.estudiantes_grupo_miembros m
      join public.estudiantes_grupos g on g.id = m.grupo_id
     where v_experiencia = 'the_living_room' and g.ambito_id = p_ambito_id and g.campus_id = p_campus_id
  ),
  sin_grupo as (
    select a.persona_id, 'visitante'::text as tipo, a.nombre as grupo
      from activos a
     where a.estado = 'visitante' and a.campus_id = p_campus_id and a.subarea_id = any(v_filtro)
    union all
    select k.persona_id, case when f.persona_id is not null then 'ficha' else 'antes_en_grupo' end, ug.nombre
      from conocidos k
      join public.usuarios u on u.id = k.persona_id
      left join public.estudiantes_fichas f on f.persona_id = k.persona_id
      left join lateral (
        select g.nombre, g.subarea_id
          from public.estudiantes_grupo_miembros m
          join public.estudiantes_grupos g on g.id = m.grupo_id
         where m.persona_id = k.persona_id and g.ambito_id = p_ambito_id and g.campus_id = p_campus_id
         order by coalesce(m.retirado_at, 'infinity'::timestamptz) desc, m.desde desc, m.id
         limit 1
      ) ug on true
     where not exists (select 1 from activos a where a.persona_id = k.persona_id)
       and (v_todas
            or ug.subarea_id = any(v_filtro)
            or (ug.subarea_id is null
                and ((u.genero::text is distinct from 'Masculino' and 'grupos de chicas' = any(v_etiquetas))
                     or (u.genero::text is distinct from 'Femenino' and 'grupos de chicos' = any(v_etiquetas)))))
  ),
  sin_grupo_filas as (
    select x.persona_id, x.tipo, x.grupo, u.nombre, u.apellido, ef.etiqueta as anio_etiqueta
      from sin_grupo x
      join public.usuarios u on u.id = x.persona_id
      left join public.estudiantes_fichas f on f.persona_id = x.persona_id
      left join public.estudiantes_escala ef on ef.campus_id = f.campus_id and ef.numero = f.anio_actual
     where not exists (select 1 from egresados eg where eg.persona_id = x.persona_id)
  ),
  en_grupo_filas as (
    select eg.persona_id, eg.grupo_id, eg.grupo, u.nombre, u.apellido, sv.etiqueta as servicio
      from en_grupo eg
      join public.usuarios u on u.id = eg.persona_id
      left join servicio sv on sv.persona_id = eg.persona_id
  )
  select jsonb_build_object(
    'ambito_id', p_ambito_id, 'campus_id', p_campus_id, 'subarea_id', p_subarea_id,
    'fecha', public.ninos_hoy(),
    'sin_grupo', jsonb_build_object(
      'cantidad', (select count(*) from sin_grupo_filas),
      'personas', coalesce((select jsonb_agg(jsonb_build_object(
                    'persona_id', s.persona_id, 'nombre', s.nombre, 'apellido', s.apellido, 'tipo', s.tipo,
                    'grupo', s.grupo, 'anio_etiqueta', s.anio_etiqueta)
                    order by s.nombre, s.apellido, s.persona_id) from sin_grupo_filas s), '[]'::jsonb)),
    'en_grupo', jsonb_build_object(
      'cantidad', (select count(*) from en_grupo_filas),
      'personas', coalesce((select jsonb_agg(jsonb_build_object(
                    'persona_id', e.persona_id, 'nombre', e.nombre, 'apellido', e.apellido,
                    'grupo_id', e.grupo_id, 'grupo', e.grupo, 'servicio', e.servicio)
                    order by e.nombre, e.apellido, e.persona_id) from en_grupo_filas e), '[]'::jsonb)),
    'sirviendo', jsonb_build_object(
      'cantidad', (select count(*) from en_grupo_filas e where e.servicio is not null),
      'personas', coalesce((select jsonb_agg(jsonb_build_object(
                    'persona_id', e.persona_id, 'nombre', e.nombre, 'apellido', e.apellido,
                    'grupo_id', e.grupo_id, 'grupo', e.grupo, 'servicio', e.servicio)
                    order by e.nombre, e.apellido, e.persona_id)
                    from en_grupo_filas e where e.servicio is not null), '[]'::jsonb)))
    into v_res;

  return v_res;
end;
$$;

comment on function public.estudiantes_reporte_embudo(uuid, uuid, uuid) is
  'Connection funnel of an ámbito and campus today (S18, L48, L49), for the sub-áreas the caller sees at level >= 2 '
  '(optionally one): sin_grupo (known people with no active group in the ámbito — a ficha of the ámbito''s years, or '
  'for The Living Room a ficha without año or a past membership — and active visitors; graduates never count), '
  'en_grupo (active members of active groups) and sirviendo (of those, an active Dream Team servicio), each with '
  'cantidad and personas. Errors: sin_autoridad, ambito_invalido, subarea_invalida.';

revoke all on function public.estudiantes_reporte_embudo(uuid, uuid, uuid) from public, anon;
grant execute on function public.estudiantes_reporte_embudo(uuid, uuid, uuid) to authenticated, service_role;
