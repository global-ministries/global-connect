-- Estudiantes, Phase B — C2 group management (odd/tasks/estudiantes-fase-b.md,
-- C2a–C2c; artboards 06, 07 and 08 of design/estudiantes-asistencia).
--
-- What (definer functions, search_path '', the caller resolved by
-- ninos_usuario_actual(), authority from estudiantes_nivel_en_campus /
-- estudiantes_nivel_grupo of 20261029100000):
--   estudiantes_subareas_gestionables()             the Grupos de Chicas /
--     Chicos sub-áreas and campuses where the caller manages groups (level 3),
--     with the entrenadores and directores de grupo of each sub-área; it
--     feeds "Crear grupo" and the área cards, also when no group exists yet.
--   estudiantes_grupo_integrantes(grupo)             the members of a group
--     with contacts and representantes, without a meeting (level >= 1; an
--     inactive group only at level 3).
--   estudiantes_sin_grupo(grupo)                     people who were in a
--     group of the same sub-área and campus and today have no active group
--     in the ámbito ("Sin grupo en Transit · Chicas"; level 3).
--   estudiantes_grupo_miembro_mover(persona, grupo)  moves an active member
--     to another group of the same ámbito and campus in one step, keeping
--     their estado (level 3 on both groups).
--
-- Why: the C1 RPCs only list groups that exist, read members through a
-- meeting (fecha and turno) and would move a person as quitar + agregar in
-- two calls, which leaves them without a group if the second fails.
--
-- Blast radius: four new functions; no table, existing function, policy or
-- row changes.
--
-- Rollback:
--   drop function if exists public.estudiantes_subareas_gestionables();
--   drop function if exists public.estudiantes_grupo_integrantes(uuid);
--   drop function if exists public.estudiantes_sin_grupo(uuid);
--   drop function if exists public.estudiantes_grupo_miembro_mover(uuid, uuid);

create or replace function public.estudiantes_subareas_gestionables()
returns table (
  subarea_id uuid,
  subarea text,
  ambito_id uuid,
  ambito text,
  experiencia text,
  campus_id uuid,
  campus text,
  responsables jsonb
)
language sql
stable
security definer
set search_path to ''
as $$
  with mios as (
    select c.id, c.nombre
      from public.campus c
     where c.activo
       and (public.estudiantes_tiene_rol_sistema('admin')
            or exists (select 1
                         from public.usuarios u
                         join public.usuario_campus uc on uc.usuario_id = u.id
                        where u.auth_id = auth.uid() and uc.campus_id = c.id))
  )
  select s.id, s.label, a.id, a.label, a.experiencia, m.id, m.nombre,
         coalesce((
           select jsonb_agg(jsonb_build_object('servicio_id', sv.id, 'persona_id', u.id, 'nombre', u.nombre,
                                               'apellido', u.apellido, 'rol', r.label)
                            order by r.label, u.apellido, u.nombre, sv.id)
             from public.dream_team_servicios sv
             join public.usuarios u on u.id = sv.persona_id
             join public.dream_team_roles r on r.id = sv.rol_id
            where sv.equipo_id = s.id and sv.estado = 'activo'
              and public.dream_team_normalizar_etiqueta(r.label) in ('entrenador', 'director de grupo')
              and public.estudiantes_persona_en_campus(u.id, m.id)), '[]'::jsonb)
    from public.dream_team_equipos s
    join public.dream_team_equipos a on a.id = s.parent_equipo_id
    cross join mios m
   where auth.uid() is not null
     and s.activo and a.activo
     and a.experiencia in ('estudiantes', 'the_living_room')
     and public.estudiantes_es_subarea_grupos(s.label)
     and public.estudiantes_nivel_en_campus(s.id, m.id) >= 3
   order by a.label, s.label, m.nombre, s.id, m.id
$$;

comment on function public.estudiantes_subareas_gestionables() is
  'Grupos de Chicas / Chicos sub-áreas and campuses where the caller manages groups (level 3), with their '
  'entrenadores and directores de grupo. Empty for anyone else.';

revoke all on function public.estudiantes_subareas_gestionables() from public, anon;
grant execute on function public.estudiantes_subareas_gestionables() to authenticated, service_role;

create or replace function public.estudiantes_grupo_integrantes(p_grupo_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_g record;
  v_nivel smallint;
  v_personas jsonb;
begin
  if public.ninos_usuario_actual() is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  select g.id, g.nombre, g.campus_id, g.ambito_id, g.subarea_id, g.anio, g.zona, g.dia_semana, g.hora, g.activo,
         a.label as ambito, a.experiencia, s.label as subarea, e.etiqueta as anio_etiqueta
    into v_g
    from public.estudiantes_grupos g
    join public.dream_team_equipos a on a.id = g.ambito_id
    join public.dream_team_equipos s on s.id = g.subarea_id
    left join public.estudiantes_escala e on e.campus_id = g.campus_id and e.numero = g.anio
   where g.id = p_grupo_id;
  if not found then
    raise exception 'grupo_invalido' using errcode = '22023';
  end if;
  v_nivel := public.estudiantes_nivel_grupo(p_grupo_id);
  if v_nivel < 1 or (not v_g.activo and v_nivel < 3) then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'persona_id', u.id,
           'nombre', u.nombre,
           'apellido', u.apellido,
           'genero', u.genero,
           'telefono', u.telefono,
           'fecha_nacimiento', u.fecha_nacimiento,
           'estado', m.estado,
           'desde', m.desde,
           'anio', f.anio_actual,
           'anio_etiqueta', ef.etiqueta,
           'visitas', vis.n,
           'sugerir_confirmar', m.estado = 'visitante' and vis.n >= 3,
           'representantes', reps.lista)
         order by u.apellido, u.nombre, u.id), '[]'::jsonb)
    into v_personas
    from public.estudiantes_grupo_miembros m
    join public.usuarios u on u.id = m.persona_id
    left join public.estudiantes_fichas f on f.persona_id = m.persona_id
    left join public.estudiantes_escala ef on ef.campus_id = f.campus_id and ef.numero = f.anio_actual
    cross join lateral (select public.estudiantes_visitas(p_grupo_id, m.persona_id, public.ninos_hoy()) as n) vis
    cross join lateral (
      select coalesce(jsonb_agg(jsonb_build_object('persona_id', ru.id, 'nombre', ru.nombre, 'apellido', ru.apellido,
                                                   'telefono', ru.telefono, 'tipo', l.tipo)
                                order by l.principal desc, ru.apellido, ru.nombre, ru.id), '[]'::jsonb) as lista
        from (
          select distinct on (k.id) k.id, k.tipo, k.principal
            from (
              select r.usuario2_id as id, r.tipo_relacion::text as tipo, coalesce(r.es_principal, false) as principal
                from public.relaciones_usuarios r
               where r.usuario1_id = m.persona_id
                 and r.tipo_relacion in ('padre', 'tutor', 'abuelo', 'tio', 'hermano', 'otro_familiar')
              union all
              select r.usuario1_id, 'padre', coalesce(r.es_principal, false)
                from public.relaciones_usuarios r
               where r.usuario2_id = m.persona_id and r.tipo_relacion = 'hijo'
            ) k
           order by k.id, k.principal desc
        ) l
        join public.usuarios ru on ru.id = l.id
    ) reps
   where m.grupo_id = p_grupo_id and m.activo;

  return jsonb_build_object(
    'grupo', jsonb_build_object('id', v_g.id, 'nombre', v_g.nombre, 'campus_id', v_g.campus_id,
                                'ambito_id', v_g.ambito_id, 'ambito', v_g.ambito, 'experiencia', v_g.experiencia,
                                'subarea_id', v_g.subarea_id, 'subarea', v_g.subarea, 'anio', v_g.anio,
                                'anio_etiqueta', v_g.anio_etiqueta, 'zona', v_g.zona,
                                'dia_semana', v_g.dia_semana, 'hora', v_g.hora, 'activo', v_g.activo),
    'puede_gestionar', v_nivel >= 3,
    'personas', v_personas);
end;
$$;

comment on function public.estudiantes_grupo_integrantes(uuid) is
  'Members of a group with contacts and representantes, without a meeting (level >= 1; an inactive group only '
  'at level 3): estado, desde, año, visits so far and sugerir_confirmar. Errors: sin_autoridad, grupo_invalido.';

revoke all on function public.estudiantes_grupo_integrantes(uuid) from public, anon;
grant execute on function public.estudiantes_grupo_integrantes(uuid) to authenticated, service_role;

create or replace function public.estudiantes_sin_grupo(p_grupo_id uuid)
returns table (
  persona_id uuid,
  nombre text,
  apellido text,
  anio_etiqueta text,
  ultimo_grupo text,
  retirado_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_g record;
begin
  if public.ninos_usuario_actual() is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  select g.id, g.campus_id, g.ambito_id, g.subarea_id into v_g
    from public.estudiantes_grupos g where g.id = p_grupo_id and g.activo;
  if not found then
    raise exception 'grupo_invalido' using errcode = '22023';
  end if;
  if public.estudiantes_nivel_grupo(p_grupo_id) < 3 then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;

  return query
  select x.persona_id, x.nombre, x.apellido, x.anio_etiqueta, x.ultimo_grupo, x.retirado_at
    from (
      select distinct on (m.persona_id)
             m.persona_id, u.nombre, u.apellido, ef.etiqueta as anio_etiqueta, g.nombre as ultimo_grupo,
             m.retirado_at
        from public.estudiantes_grupo_miembros m
        join public.estudiantes_grupos g on g.id = m.grupo_id
        join public.usuarios u on u.id = m.persona_id
        left join public.estudiantes_fichas f on f.persona_id = m.persona_id
        left join public.estudiantes_escala ef on ef.campus_id = f.campus_id and ef.numero = f.anio_actual
       where not m.activo
         and g.subarea_id = v_g.subarea_id
         and g.campus_id = v_g.campus_id
         and not exists (select 1 from public.estudiantes_grupo_miembros a
                          where a.persona_id = m.persona_id and a.ambito_id = v_g.ambito_id and a.activo)
       order by m.persona_id, m.retirado_at desc nulls last
    ) x
   order by x.retirado_at desc nulls last, x.apellido, x.nombre, x.persona_id
   limit 50;
end;
$$;

comment on function public.estudiantes_sin_grupo(uuid) is
  'People who were in a group of the same sub-área and campus and have no active group in the ámbito today, '
  'last removed first (level 3 on the group). At most 50. Errors: sin_autoridad, grupo_invalido.';

revoke all on function public.estudiantes_sin_grupo(uuid) from public, anon;
grant execute on function public.estudiantes_sin_grupo(uuid) to authenticated, service_role;

create or replace function public.estudiantes_grupo_miembro_mover(p_persona_id uuid, p_grupo_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_yo uuid := public.ninos_usuario_actual();
  v_destino record;
  v_origen record;
  v_id uuid;
begin
  if v_yo is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  select g.id, g.campus_id, g.ambito_id, g.anio into v_destino
    from public.estudiantes_grupos g where g.id = p_grupo_id and g.activo;
  if not found then
    raise exception 'grupo_invalido' using errcode = '22023';
  end if;
  if public.estudiantes_nivel_grupo(p_grupo_id) < 3 then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  select m.id, m.grupo_id, m.estado, g.campus_id into v_origen
    from public.estudiantes_grupo_miembros m
    join public.estudiantes_grupos g on g.id = m.grupo_id
   where m.persona_id = p_persona_id and m.ambito_id = v_destino.ambito_id and m.activo
     for update of m;
  if not found then
    raise exception 'persona_invalida' using errcode = '22023';
  end if;
  if v_origen.grupo_id = p_grupo_id then
    return v_origen.id;
  end if;
  if v_origen.campus_id <> v_destino.campus_id or public.estudiantes_nivel_grupo(v_origen.grupo_id) < 3 then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;

  update public.estudiantes_grupo_miembros m
     set activo = false, retirado_at = now()
   where m.id = v_origen.id;
  v_id := public.estudiantes_incorporar(p_grupo_id, p_persona_id, v_origen.estado, public.ninos_hoy(), v_yo);
  return v_id;
end;
$$;

comment on function public.estudiantes_grupo_miembro_mover(uuid, uuid) is
  'Moves an active member to another group of the same ámbito and campus in one step, keeping their estado '
  '(level 3 on both groups); the old membership stays as inactive. Returns the new membership id. '
  'Errors: sin_autoridad, grupo_invalido, persona_invalida.';

revoke all on function public.estudiantes_grupo_miembro_mover(uuid, uuid) from public, anon;
grant execute on function public.estudiantes_grupo_miembro_mover(uuid, uuid) to authenticated, service_role;
