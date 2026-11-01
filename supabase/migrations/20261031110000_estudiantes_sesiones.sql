-- Estudiantes, Phase B — C3 leader list (odd/tasks/estudiantes-fase-b.md, C3;
-- artboards 01, 02 and 05 of design/estudiantes-asistencia).
--
-- What (definer functions, search_path '', authority from
-- estudiantes_nivel_grupo of 20261029100000):
--   estudiantes_grupo_sesiones(grupo, dias)   the meetings a group's leader
--     can mark in the last `dias` days (default 56, 1..366), newest first:
--     Transit / Inside Out: every date on which a Dream Team turno that
--     serves the ámbito in the group's campus happens; The Living Room: the
--     dates of its regular weekly day (when set). Both also list the meetings
--     already opened in the window. Each row carries the meeting (when it
--     exists) and its counts.
--   estudiantes_grupo_historial(grupo, n)     the last `n` meetings of a group
--     with marks (default 4, 1..12), oldest first, and for each active member
--     their mark at each of them (null when unmarked) — the "Historial" dots.
--
-- Why: estudiantes_grupo_lista needs a valid (fecha, turno); the leader has
-- no other way to know which turnos serve their group or which dates count.
--
-- Blast radius: two new read-only functions; no table, existing function,
-- policy or row changes.
--
-- Rollback:
--   drop function if exists public.estudiantes_grupo_sesiones(uuid, integer);
--   drop function if exists public.estudiantes_grupo_historial(uuid, integer);

create or replace function public.estudiantes_grupo_sesiones(p_grupo_id uuid, p_dias integer default 56)
returns table (
  fecha date,
  turno_id uuid,
  turno text,
  hora time,
  reunion_id uuid,
  lugar text,
  presentes integer,
  ausentes integer,
  visitantes integer,
  marcados integer
)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_g record;
  v_nivel smallint;
  v_hoy date := public.ninos_hoy();
  v_desde date;
begin
  if public.ninos_usuario_actual() is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  select g.id, g.campus_id, g.ambito_id, g.dia_semana, g.activo, a.experiencia into v_g
    from public.estudiantes_grupos g
    join public.dream_team_equipos a on a.id = g.ambito_id
   where g.id = p_grupo_id;
  if not found then
    raise exception 'grupo_invalido' using errcode = '22023';
  end if;
  v_nivel := public.estudiantes_nivel_grupo(p_grupo_id);
  if v_nivel < 1 or (not v_g.activo and v_nivel < 3) then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  v_desde := v_hoy - (least(greatest(coalesce(p_dias, 56), 1), 366) - 1);

  return query
  with posibles as (
    -- Transit / Inside Out: the turnos that serve the ámbito, on the dates they happen.
    select d::date as fecha, t.id as turno_id
      from public.dream_team_turnos_del_equipo(v_g.ambito_id, v_g.campus_id) as x(id)
      join public.dream_team_turnos t on t.id = x.id
      cross join generate_series(v_desde, v_hoy, interval '1 day') as d
     where v_g.experiencia <> 'the_living_room'
       and public.dream_team_turno_activo_en(t.id, d::date)
    union
    -- The Living Room: its regular weekly day.
    select d::date, null::uuid
      from generate_series(v_desde, v_hoy, interval '1 day') as d
     where v_g.experiencia = 'the_living_room'
       and v_g.dia_semana is not null
       and extract(dow from d)::int = v_g.dia_semana
    union
    -- Meetings already opened in the window.
    select r.fecha, r.turno_id
      from public.estudiantes_reuniones r
     where r.grupo_id = p_grupo_id and r.fecha between v_desde and v_hoy
  )
  select p.fecha, p.turno_id, t.nombre,
         coalesce((select f.hora from public.dream_team_turno_fechas f
                    where f.turno_id = p.turno_id and f.fecha = p.fecha), t.hora),
         r.id, r.lugar,
         coalesce(k.presentes, 0), coalesce(k.ausentes, 0), coalesce(k.visitantes, 0), coalesce(k.marcados, 0)
    from posibles p
    left join public.dream_team_turnos t on t.id = p.turno_id
    left join public.estudiantes_reuniones r
      on r.grupo_id = p_grupo_id and r.fecha = p.fecha and r.turno_id is not distinct from p.turno_id
    left join lateral (
      select count(*) filter (where a.estado = 'presente')::integer as presentes,
             count(*) filter (where a.estado = 'ausente')::integer as ausentes,
             count(*) filter (where a.estado = 'presente' and a.era_visitante)::integer as visitantes,
             count(*)::integer as marcados
        from public.estudiantes_asistencias a
       where a.reunion_id = r.id
    ) k on true
   order by p.fecha desc, t.orden nulls last, 4 nulls last, p.turno_id;
end;
$$;

comment on function public.estudiantes_grupo_sesiones(uuid, integer) is
  'Meetings a group can mark in the last p_dias days (default 56, 1..366), newest first: the dates of the turnos '
  'that serve the ámbito (Transit / Inside Out) or of the regular weekly day (The Living Room), plus meetings '
  'already opened, with the meeting id, lugar and counts (level >= 1; an inactive group only at level 3). '
  'Errors: sin_autoridad, grupo_invalido.';

revoke all on function public.estudiantes_grupo_sesiones(uuid, integer) from public, anon;
grant execute on function public.estudiantes_grupo_sesiones(uuid, integer) to authenticated, service_role;

create or replace function public.estudiantes_grupo_historial(p_grupo_id uuid, p_reuniones integer default 4)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_g record;
  v_nivel smallint;
  v_n integer := least(greatest(coalesce(p_reuniones, 4), 1), 12);
  v_reuniones jsonb;
  v_personas jsonb;
begin
  if public.ninos_usuario_actual() is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  select g.id, g.activo into v_g from public.estudiantes_grupos g where g.id = p_grupo_id;
  if not found then
    raise exception 'grupo_invalido' using errcode = '22023';
  end if;
  v_nivel := public.estudiantes_nivel_grupo(p_grupo_id);
  if v_nivel < 1 or (not v_g.activo and v_nivel < 3) then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;

  with ultimas as (
    select r.id, r.fecha, r.turno_id
      from public.estudiantes_reuniones r
     where r.grupo_id = p_grupo_id
       and exists (select 1 from public.estudiantes_asistencias a where a.reunion_id = r.id)
     order by r.fecha desc, r.created_at desc
     limit v_n
  ),
  orden as (
    select u.*, row_number() over (order by u.fecha, u.id) as pos from ultimas u
  )
  select coalesce(jsonb_agg(jsonb_build_object('reunion_id', o.id, 'fecha', o.fecha, 'turno_id', o.turno_id,
                                               'turno', t.nombre)
                            order by o.pos), '[]'::jsonb),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'persona_id', m.persona_id,
                    'estados', (select jsonb_agg(a.estado order by o2.pos)
                                  from orden o2
                                  left join public.estudiantes_asistencias a
                                    on a.reunion_id = o2.id and a.persona_id = m.persona_id))
                  order by m.persona_id)
             from public.estudiantes_grupo_miembros m
            where m.grupo_id = p_grupo_id and m.activo), '[]'::jsonb)
    into v_reuniones, v_personas
    from orden o
    left join public.dream_team_turnos t on t.id = o.turno_id;

  return jsonb_build_object('reuniones', coalesce(v_reuniones, '[]'::jsonb),
                            'personas', coalesce(v_personas, '[]'::jsonb));
end;
$$;

comment on function public.estudiantes_grupo_historial(uuid, integer) is
  'The last p_reuniones meetings of a group that have marks (default 4, 1..12), oldest first, and for each active '
  'member their mark at each (null when unmarked): {reuniones: [{reunion_id, fecha, turno_id, turno}], '
  'personas: [{persona_id, estados}]} (level >= 1; an inactive group only at level 3). '
  'Errors: sin_autoridad, grupo_invalido.';

revoke all on function public.estudiantes_grupo_historial(uuid, integer) from public, anon;
grant execute on function public.estudiantes_grupo_historial(uuid, integer) to authenticated, service_role;
