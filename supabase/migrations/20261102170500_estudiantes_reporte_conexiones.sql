-- Estudiantes, Phase B — C7b the 4 connections of The Living Room
-- (odd/tasks/estudiantes-fase-b.md, S21 with L54 / L55, on top of the
-- reports of S17–S19; artboards 13 / 14 of design/estudiantes-asistencia,
-- A35–A47 and "Data points and sources").
--
-- What (read-only, definer function, search_path ''):
--   estudiantes_reporte_conexiones(ámbito, campus, desde, hasta, sub-área,
--   persona) → jsonb: for a The Living Room ámbito, the people of
--   estudiantes_reporte_asistencia (same ámbito, campus, range and sub-área;
--   only p_persona_id when given), ordered by nombre and apellido, each with
--   its four connections:
--     lider    1:1 realizados with their leader: realizados in the range,
--              por_semana (realizados ÷ weeks of the range, one decimal),
--              ultimo (the last one up to hasta, even before desde),
--              ultimo_con (who led it), lideres (current leaders of their
--              current group) and desconectado (none in the 2 months up to
--              hasta, or never; L55).
--     otros    grupo: reuniones, presentes, ausentes, sin_marcar and
--              porcentaje of the attendance report (S17, L48); sirve and one
--              entry per active Dream Team servicio (equipo, área, rol) with
--              esperadas, presentes, justificados, ausentes and porcentaje in
--              the range.
--     iglesia  talleres completados (any campus, any date): count and list
--              (taller, fecha, anio), oldest first.
--     jesus    {"registrado": false}: nothing is recorded yet (L54).
--   plus a resumen: personas, desconectados, sin_servicio, con_talleres.
--
-- How:
--   - Authority and validation (S19, L55) are those of
--     estudiantes_reporte_asistencia, which this function calls for the
--     people and their group figures: a session, rango_invalido (22023),
--     then sub-área level >= 2 in the campus (estudiantes_reporte_subareas:
--     a leader, another campus or another sub-área → sin_autoridad 42501;
--     subarea_invalida). Before that call, an ámbito whose experiencia is
--     not the_living_room → ambito_invalido (22023). p_persona_id: an
--     unknown usuario → persona_invalida (22023); someone who is not among
--     the people the caller sees → sin_autoridad.
--   - "Con su líder" (L55): a uno_a_uno with estado realizado, the person
--     on the dirigido side and on the líder side someone whose servicio
--     led a group of the ámbito and campus the person was in on the date of
--     the 1:1. The date is fecha_hora in America/Caracas (when it happened;
--     realizado_en is when it was recorded). The person was in the group
--     that day as estudiantes_reporte_personas counts it (desde <= fecha and
--     before the date of retirado_at); the leader's period covers the day
--     (from the date of desde through the date of hasta, both included).
--     A 1:1 with anyone else (another group's leader, an entrenador, a
--     pastor) does not count; agendado and cancelado never count.
--   - desconectado: no such 1:1 dated after hasta − 2 months and on or
--     before hasta. Weeks of the range = days ÷ 7.
--   - Servicio (O6): marks of dream_team_asistencias of the servicio dated
--     in the range; esperadas, presentes, justificados and ausentes count
--     only expected marks (an unexpected presente is left out), a
--     justificado is not a presente; porcentaje = presentes ÷ esperadas,
--     null without esperadas ("sin fechas en el rango").
--   - Talleres (O7): taller_inscripciones with unit_estado completado where
--     the person is persona_principal_id or companero_id (a couple completes
--     together), joined to its edición (taller_ediciones; taller_id is the
--     edición id) for the taller's name (talleres.nombre, else the edición's
--     nombre_snapshot), fecha (fecha_fin, else fecha_inicio, else the day
--     it was created) and anio (the year of its temporada's apertura, else
--     of fecha).
--
-- Why: S21 (plan S6) asks for the connection of each young adult of The
-- Living Room with their leader, with others, with the church and with
-- Jesus; this first delivery reads only what is already recorded (L54).
--
-- Blast radius: one new read-only function granted to authenticated. It
-- calls estudiantes_reporte_asistencia, so a change in that function's
-- people or person fields changes this one too. No table, existing
-- function, policy or row changes.
--
-- Rollback:
--   drop function if exists public.estudiantes_reporte_conexiones(uuid, uuid, date, date, uuid, uuid);

create or replace function public.estudiantes_reporte_conexiones(
  p_ambito_id uuid,
  p_campus_id uuid,
  p_desde date,
  p_hasta date,
  p_subarea_id uuid default null,
  p_persona_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_rep jsonb;
  v_corte date;
  v_personas jsonb;
begin
  if public.ninos_usuario_actual() is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta or p_hasta - p_desde > 365 then
    raise exception 'rango_invalido' using errcode = '22023';
  end if;
  if not exists (select 1 from public.dream_team_equipos a
                  where a.id = p_ambito_id and a.experiencia = 'the_living_room') then
    raise exception 'ambito_invalido' using errcode = '22023';
  end if;

  v_rep := public.estudiantes_reporte_asistencia(p_ambito_id, p_campus_id, p_desde, p_hasta, p_subarea_id);
  v_corte := (p_hasta - interval '2 months')::date;

  if p_persona_id is not null then
    if not exists (select 1 from public.usuarios u where u.id = p_persona_id) then
      raise exception 'persona_invalida' using errcode = '22023';
    end if;
    if not exists (select 1 from jsonb_array_elements(v_rep -> 'personas') x
                    where (x ->> 'persona_id')::uuid = p_persona_id) then
      raise exception 'sin_autoridad' using errcode = '42501';
    end if;
  end if;

  with p as (
    select (x ->> 'persona_id')::uuid as persona_id, x, n
      from jsonb_array_elements(v_rep -> 'personas') with ordinality as t(x, n)
     where p_persona_id is null or (x ->> 'persona_id')::uuid = p_persona_id
  ),
  uno as (
    select d.usuario_id as persona_id, u.id, (u.fecha_hora at time zone 'America/Caracas')::date as fecha
      from public.uno_a_uno u
      join public.uno_a_uno_personas d on d.uno_a_uno_id = u.id and d.lado = 'dirigido'
     where u.estado = 'realizado'
       and d.usuario_id in (select p.persona_id from p)
       and (u.fecha_hora at time zone 'America/Caracas')::date <= p_hasta
  ),
  -- The 1:1 led by someone who led the person's group of the ámbito that day.
  con_lider as (
    select o.persona_id, o.id, o.fecha,
           string_agg(distinct btrim(ul.nombre || ' ' || ul.apellido), ', '
                      order by btrim(ul.nombre || ' ' || ul.apellido)) as con
      from uno o
      join public.uno_a_uno_personas l on l.uno_a_uno_id = o.id and l.lado = 'lider'
      join public.usuarios ul on ul.id = l.usuario_id
     where exists (
       select 1
         from public.dream_team_servicios sv
         join public.estudiantes_grupo_lideres gl on gl.servicio_id = sv.id
         join public.estudiantes_grupos g on g.id = gl.grupo_id
         join public.estudiantes_grupo_miembros m on m.grupo_id = g.id and m.persona_id = o.persona_id
        where sv.persona_id = l.usuario_id
          and g.ambito_id = p_ambito_id and g.campus_id = p_campus_id
          and (gl.desde at time zone 'America/Caracas')::date <= o.fecha
          and (gl.hasta is null or (gl.hasta at time zone 'America/Caracas')::date >= o.fecha)
          and m.desde <= o.fecha
          and (m.retirado_at is null or (m.retirado_at at time zone 'America/Caracas')::date > o.fecha))
     group by o.persona_id, o.id, o.fecha
  ),
  lider as (
    select c.persona_id,
           count(*) filter (where c.fecha >= p_desde)::integer as realizados,
           max(c.fecha) as ultimo,
           bool_or(c.fecha > v_corte) as conectado,
           (array_agg(c.con order by c.fecha desc, c.con))[1] as ultimo_con
      from con_lider c
     group by c.persona_id
  ),
  servicios as (
    select sv.persona_id,
           jsonb_agg(jsonb_build_object(
             'servicio_id', sv.id, 'equipo_id', e.id, 'equipo', e.label, 'area', pe.label, 'rol', r.label,
             'esperadas', k.esperadas, 'presentes', k.presentes, 'justificados', k.justificados,
             'ausentes', k.ausentes,
             'porcentaje', case when k.esperadas > 0 then round(100.0 * k.presentes / k.esperadas, 1) end)
             order by e.label, sv.id) as lista
      from public.dream_team_servicios sv
      join public.dream_team_equipos e on e.id = sv.equipo_id
      left join public.dream_team_equipos pe on pe.id = e.parent_equipo_id
      join public.dream_team_roles r on r.id = sv.rol_id
      cross join lateral (
        select count(*)::integer as esperadas,
               count(*) filter (where a.estado = 'presente')::integer as presentes,
               count(*) filter (where a.estado = 'justificado')::integer as justificados,
               count(*) filter (where a.estado = 'ausente')::integer as ausentes
          from public.dream_team_asistencias a
         where a.servicio_id = sv.id and a.esperado and a.fecha between p_desde and p_hasta
      ) k
     where sv.estado = 'activo' and sv.persona_id in (select p.persona_id from p)
     group by sv.persona_id
  ),
  talleres as (
    select y.persona_id, count(*)::integer as cantidad,
           jsonb_agg(jsonb_build_object('taller', y.taller, 'fecha', y.fecha, 'anio', y.anio)
                     order by y.fecha, y.taller, y.id) as lista
      from (
        select v.persona_id, i.id, coalesce(ta.nombre, e.nombre_snapshot) as taller,
               coalesce(e.fecha_fin, e.fecha_inicio, (e.created_at at time zone 'America/Caracas')::date) as fecha,
               extract(year from coalesce((tp.fecha_apertura at time zone 'America/Caracas')::date, e.fecha_fin,
                                          e.fecha_inicio, (e.created_at at time zone 'America/Caracas')::date))::integer
                 as anio
          from public.taller_inscripciones i
          cross join lateral (values (i.persona_principal_id), (i.companero_id)) as v(persona_id)
          join public.taller_ediciones e on e.id = i.taller_id
          left join public.talleres ta on ta.id = e.taller_id
          left join public.talleres_temporadas tp on tp.id = e.temporada_id
         where i.unit_estado = 'completado'
           and v.persona_id in (select p.persona_id from p)
      ) y
     group by y.persona_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'persona_id', p.persona_id, 'nombre', p.x ->> 'nombre', 'apellido', p.x ->> 'apellido',
           'grupo_id', p.x -> 'grupo_id', 'grupo', p.x -> 'grupo', 'miembro_desde', p.x -> 'miembro_desde',
           'lider', jsonb_build_object(
             'realizados', coalesce(l.realizados, 0),
             'por_semana', round(coalesce(l.realizados, 0)::numeric * 7 / (p_hasta - p_desde + 1), 1),
             'ultimo', l.ultimo,
             'ultimo_con', l.ultimo_con,
             'lideres', coalesce((
               select jsonb_agg(btrim(u.nombre || ' ' || u.apellido) order by u.apellido, u.nombre)
                 from public.estudiantes_grupo_lideres gl
                 join public.dream_team_servicios sv on sv.id = gl.servicio_id
                 join public.usuarios u on u.id = sv.persona_id
                where gl.grupo_id = (p.x ->> 'grupo_id')::uuid and gl.hasta is null and sv.estado = 'activo'),
               '[]'::jsonb),
             'desconectado', not coalesce(l.conectado, false)),
           'otros', jsonb_build_object(
             'grupo', jsonb_build_object(
               'reuniones', p.x -> 'reuniones', 'presentes', p.x -> 'presentes', 'ausentes', p.x -> 'ausentes',
               'sin_marcar', p.x -> 'sin_marcar', 'porcentaje', p.x -> 'porcentaje'),
             'sirve', s.lista is not null,
             'servicios', coalesce(s.lista, '[]'::jsonb)),
           'iglesia', jsonb_build_object(
             'talleres', coalesce(ti.cantidad, 0),
             'lista', coalesce(ti.lista, '[]'::jsonb)),
           'jesus', jsonb_build_object('registrado', false))
           order by p.n), '[]'::jsonb)
    into v_personas
    from p
    left join lider l on l.persona_id = p.persona_id
    left join servicios s on s.persona_id = p.persona_id
    left join talleres ti on ti.persona_id = p.persona_id;

  return jsonb_build_object(
    'ambito_id', p_ambito_id, 'campus_id', p_campus_id, 'subarea_id', p_subarea_id, 'persona_id', p_persona_id,
    'desde', p_desde, 'hasta', p_hasta,
    'semanas', round((p_hasta - p_desde + 1)::numeric / 7, 1),
    'desconectado_si_antes_de', v_corte + 1,
    'resumen', (
      select jsonb_build_object(
               'personas', count(*),
               'desconectados', count(*) filter (where (x #>> '{lider,desconectado}')::boolean),
               'sin_servicio', count(*) filter (where not (x #>> '{otros,sirve}')::boolean),
               'con_talleres', count(*) filter (where (x #>> '{iglesia,talleres}')::integer > 0))
        from jsonb_array_elements(v_personas) x),
    'personas', v_personas);
end;
$$;

comment on function public.estudiantes_reporte_conexiones(uuid, uuid, date, date, uuid, uuid) is
  'The 4 connections of The Living Room (S21, L55) for the people of estudiantes_reporte_asistencia in a range '
  '(optionally one sub-área or one person): 1:1 realizados with the leader of their group at that date (count, per '
  'week, last up to hasta, desconectado = none in the 2 months up to hasta), group attendance and each active '
  'Dream Team servicio (esperadas, presentes, justificados, ausentes), talleres completados of all time, and Jesús '
  'not recorded; plus a resumen. Errors: sin_autoridad, rango_invalido, ambito_invalido, subarea_invalida, '
  'persona_invalida.';

revoke all on function public.estudiantes_reporte_conexiones(uuid, uuid, date, date, uuid, uuid) from public, anon;
grant execute on function public.estudiantes_reporte_conexiones(uuid, uuid, date, date, uuid, uuid)
  to authenticated, service_role;
