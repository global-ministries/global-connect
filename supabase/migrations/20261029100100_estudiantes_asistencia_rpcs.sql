-- noqa: insert-into
-- Estudiantes, Phase B (C1 of odd/tasks/estudiantes-fase-b.md, S1–S10,
-- Q3–Q7) — the RPCs over the attendance model of
-- 20261029100000_estudiantes_asistencia_modelo.sql.
--
-- What (all definer functions, search_path '', the caller resolved by
-- ninos_usuario_actual(), authority from estudiantes_nivel_grupo /
-- estudiantes_nivel_subarea: 1 leader of the group, 2 entrenador of the
-- sub-área, 3 director de grupo or higher in the tree; every level only in
-- the caller's own campus, every campus for the system admin role — L20):
--   Reading
--     estudiantes_escala_campus(campus)                  signed-in users
--     estudiantes_mis_grupos(incluir_inactivos)          groups with level >= 1
--     estudiantes_grupo_lista(grupo, fecha, turno)       level >= 1: roster with
--       contacts (teléfono, cumpleaños, representantes — Q3 as amended in L6),
--       today's mark, visits and the "Confirmar como miembro" hint from the
--       3rd visit (Q6, L13)
--     estudiantes_en_vivo(ámbito, fecha, turno)          sub-área level >= 2:
--       presentes / ausentes / sin marcar / visitantes per group and the
--       "Visitantes de hoy" strip (Q5); Transit and Inside Out only (Q7)
--   Attendance (level >= 1)
--     estudiantes_reunion_guardar(grupo, fecha, turno, lugar)
--     estudiantes_marcar(grupo, fecha, turno, persona, estado)  per tap,
--       idempotent; estado NULL clears the mark (A4)
--     estudiantes_buscar_personas(grupo, cedula, telefono, nombre, apellido)
--     estudiantes_visitante_crear(grupo, fecha, turno, datos)
--     estudiantes_visitante_agregar(grupo, fecha, turno, persona)
--     estudiantes_confirmar_miembro(grupo, persona)
--     estudiantes_ficha_guardar(persona, anio_actual, anio_final)
--   Group management for C2 (level >= 3)
--     estudiantes_grupo_crear / _editar / _activar
--     estudiantes_lideres_disponibles(subarea, campus)
--     estudiantes_grupo_lideres_fijar(grupo, servicios)
--     estudiantes_grupo_miembro_agregar / _quitar
--
-- How:
--   - A meeting is (grupo, fecha, turno). Transit / Inside Out need an active
--     turno of the group's campus that the ámbito serves
--     (dream_team_turnos_del_equipo) and that happens that day
--     (dream_team_turno_activo_en); The Living Room takes no turno. No date
--     after today (America/Caracas, ninos_hoy). Reading never creates a
--     meeting; the first mark does.
--   - A visitor is a person from the first Sunday (Q6): usuarios without an
--     account (estado_civil 'No especificado', as Niños), usuario_campus of
--     the group's campus, a ficha with the group's año by default, and the
--     representante as another person linked by relaciones_usuarios
--     (usuario1 = student, usuario2 = representante, tipo padre by default,
--     the Niños direction). Before creating, the same search as
--     estudiantes_buscar_personas runs: a cédula already registered refuses
--     (cedula_existente), a teléfono or full-name match refuses
--     (posibles_duplicados) unless datos.ignorar_coincidencias is true. The
--     representante is reused when their cédula, or their teléfono and name
--     together, match someone in the campus.
--   - The search returns only id, nombre, apellido, what matched and the
--     person's active group in the ámbito. Cédula matches the whole church
--     (it is unique); teléfono and name match people of the group's campus or
--     with no campus.
--   - Errors are codes in the message: sin_autoridad (42501); grupo_invalido,
--     fecha_invalida, turno_invalido, estado_invalido, persona_invalida,
--     datos_invalidos, nombre_y_apellido_requeridos, genero_requerido,
--     anio_invalido, texto_muy_largo, representante_no_aplica,
--     representante_incompleto, representante_no_encontrado,
--     tipo_representante_invalido, ambito_invalido, subarea_invalida,
--     campus_invalido, nombre_invalido, servicio_invalido,
--     servicios_invalidos, horario_invalido (22023); cedula_existente, posibles_duplicados,
--     persona_en_otro_grupo, nombre_duplicado (23505).
--   - EXECUTE is revoked from PUBLIC and anon on every function; the public
--     RPCs are granted to authenticated, the internal helpers only to
--     service_role.
--
-- Blast radius: new functions only. Writes: the estudiantes_* tables, and
-- usuarios, usuario_campus and relaciones_usuarios when a visitor (and their
-- representante) is created. No existing function, policy or row changes.
--
-- Rollback: drop every function named above and the internal helpers
-- estudiantes_sesion_validar, estudiantes_reunion_id,
-- estudiantes_marca_guardar, estudiantes_visitas,
-- estudiantes_persona_en_campus, estudiantes_coincidencias,
-- estudiantes_ficha_asegurar and estudiantes_incorporar
-- (drop function if exists public.<name>(<argument types>)).

-- ── internal helpers ─────────────────────────────────────────────────

-- Raises unless (fecha, turno) is a valid meeting of a group of that ámbito
-- and campus.
create or replace function public.estudiantes_sesion_validar(
  p_ambito_id uuid,
  p_campus_id uuid,
  p_fecha date,
  p_turno_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_experiencia text;
begin
  select a.experiencia into v_experiencia from public.dream_team_equipos a where a.id = p_ambito_id;
  if p_fecha is null or p_fecha > public.ninos_hoy() then
    raise exception 'fecha_invalida' using errcode = '22023';
  end if;
  if v_experiencia = 'the_living_room' then
    if p_turno_id is not null then
      raise exception 'turno_invalido' using errcode = '22023';
    end if;
    return;
  end if;
  if p_turno_id is null
     or not exists (select 1 from public.dream_team_turnos t
                     where t.id = p_turno_id and t.campus_id = p_campus_id and t.activo)
     or not exists (select 1 from public.dream_team_turnos_del_equipo(p_ambito_id, p_campus_id) as x
                     where x = p_turno_id) then
    raise exception 'turno_invalido' using errcode = '22023';
  end if;
  if not public.dream_team_turno_activo_en(p_turno_id, p_fecha) then
    raise exception 'fecha_invalida' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.estudiantes_sesion_validar(uuid, uuid, date, uuid) from public, anon, authenticated;
grant execute on function public.estudiantes_sesion_validar(uuid, uuid, date, uuid) to service_role;

-- The meeting of (grupo, fecha, turno); created when p_crear and missing.
create or replace function public.estudiantes_reunion_id(
  p_grupo_id uuid,
  p_fecha date,
  p_turno_id uuid,
  p_crear boolean,
  p_actor uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_id uuid;
begin
  select r.id into v_id
    from public.estudiantes_reuniones r
   where r.grupo_id = p_grupo_id and r.fecha = p_fecha and r.turno_id is not distinct from p_turno_id;
  if v_id is null and p_crear then
    insert into public.estudiantes_reuniones (grupo_id, fecha, turno_id, created_by)
    values (p_grupo_id, p_fecha, p_turno_id, p_actor)
    on conflict on constraint estudiantes_reuniones_unica do nothing
    returning id into v_id;
    if v_id is null then
      select r.id into v_id
        from public.estudiantes_reuniones r
       where r.grupo_id = p_grupo_id and r.fecha = p_fecha and r.turno_id is not distinct from p_turno_id;
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.estudiantes_reunion_id(uuid, date, uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.estudiantes_reunion_id(uuid, date, uuid, boolean, uuid) to service_role;

-- Sets (or, with p_estado NULL, clears) a mark. Tapping the same state again
-- keeps who marked it and when; era_visitante is kept from the first mark.
create or replace function public.estudiantes_marca_guardar(
  p_reunion_id uuid,
  p_persona_id uuid,
  p_estado text,
  p_era_visitante boolean,
  p_actor uuid
)
returns void
language plpgsql
volatile
security definer
set search_path to ''
as $$
begin
  if p_estado is null then
    delete from public.estudiantes_asistencias a
     where a.reunion_id = p_reunion_id and a.persona_id = p_persona_id;
    return;
  end if;
  insert into public.estudiantes_asistencias as a
    (reunion_id, persona_id, estado, era_visitante, marcado_por, marcado_at)
  values (p_reunion_id, p_persona_id, p_estado, coalesce(p_era_visitante, false), p_actor, now())
  on conflict (reunion_id, persona_id) do update
     set estado = excluded.estado, marcado_por = excluded.marcado_por, marcado_at = excluded.marcado_at
   where a.estado is distinct from excluded.estado;
end;
$$;

revoke all on function public.estudiantes_marca_guardar(uuid, uuid, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.estudiantes_marca_guardar(uuid, uuid, text, boolean, uuid) to service_role;

-- Times a person was present at the group's meetings up to a date.
create or replace function public.estudiantes_visitas(p_grupo_id uuid, p_persona_id uuid, p_hasta date)
returns integer
language sql
stable
security definer
set search_path to ''
as $$
  select count(*)::integer
    from public.estudiantes_asistencias a
    join public.estudiantes_reuniones r on r.id = a.reunion_id
   where r.grupo_id = p_grupo_id
     and a.persona_id = p_persona_id
     and a.estado = 'presente'
     and r.fecha <= p_hasta
$$;

revoke all on function public.estudiantes_visitas(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.estudiantes_visitas(uuid, uuid, date) to service_role;

-- Whether a person exists and belongs to the campus, or to no campus at all.
create or replace function public.estudiantes_persona_en_campus(p_persona_id uuid, p_campus_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (select 1 from public.usuarios u where u.id = p_persona_id)
     and (exists (select 1 from public.usuario_campus uc
                   where uc.usuario_id = p_persona_id and uc.campus_id = p_campus_id)
          or not exists (select 1 from public.usuario_campus uc where uc.usuario_id = p_persona_id))
$$;

revoke all on function public.estudiantes_persona_en_campus(uuid, uuid) from public, anon, authenticated;
grant execute on function public.estudiantes_persona_en_campus(uuid, uuid) to service_role;

-- Possible duplicates of a person (Q6): normalized cédula (whole church),
-- normalized teléfono and full-name key (campus or no campus). coincide lists
-- what matched: 'cedula', 'nombre', 'telefono'.
create or replace function public.estudiantes_coincidencias(
  p_campus_id uuid,
  p_cedula text,
  p_telefono text,
  p_nombre text,
  p_apellido text
)
returns table (persona_id uuid, coincide text[])
language sql
stable
security definer
set search_path to ''
as $$
  with entrada as (
    select public.normalizar_cedula_ve(nullif(btrim(coalesce(p_cedula, '')), '')) as cedula,
           public.normalizar_telefono_ve(nullif(btrim(coalesce(p_telefono, '')), '')) as telefono,
           case when nullif(btrim(coalesce(p_nombre, '')), '') is not null
                then nullif(public.dream_team_clave_nombre(p_nombre, coalesce(p_apellido, '')), '') end as clave
  ),
  hallados as (
    select u.id, 'cedula'::text as por
      from public.usuarios u, entrada e
     where e.cedula is not null
       and (u.cedula = e.cedula or public.normalizar_cedula_ve(u.cedula) = e.cedula)
    union all
    select u.id, 'telefono'::text
      from public.usuarios u, entrada e
     where e.telefono is not null
       and (u.telefono = e.telefono or public.normalizar_telefono_ve(u.telefono) = e.telefono)
       and public.estudiantes_persona_en_campus(u.id, p_campus_id)
    union all
    select u.id, 'nombre'::text
      from public.usuarios u, entrada e
     where e.clave is not null
       and public.dream_team_clave_nombre(u.nombre, u.apellido) = e.clave
       and public.estudiantes_persona_en_campus(u.id, p_campus_id)
  )
  select h.id, array_agg(distinct h.por order by h.por)
    from hallados h
   group by h.id
$$;

revoke all on function public.estudiantes_coincidencias(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.estudiantes_coincidencias(uuid, text, text, text, text) to service_role;

-- Creates the person's ficha when missing (an existing one is kept).
create or replace function public.estudiantes_ficha_asegurar(
  p_persona_id uuid,
  p_campus_id uuid,
  p_anio integer,
  p_actor uuid
)
returns void
language plpgsql
volatile
security definer
set search_path to ''
as $$
begin
  insert into public.estudiantes_fichas (persona_id, campus_id, anio_actual, updated_by)
  values (p_persona_id, p_campus_id, p_anio, p_actor)
  on conflict (persona_id) do nothing;
exception
  when foreign_key_violation or check_violation then
    raise exception 'anio_invalido' using errcode = '22023';
end;
$$;

revoke all on function public.estudiantes_ficha_asegurar(uuid, uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.estudiantes_ficha_asegurar(uuid, uuid, integer, uuid) to service_role;

-- Makes the person an active member of the group (insert or reactivate);
-- an active member keeps their estado. Returns the membership id.
create or replace function public.estudiantes_incorporar(
  p_grupo_id uuid,
  p_persona_id uuid,
  p_estado text,
  p_desde date,
  p_actor uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_id uuid;
  v_activo boolean;
begin
  select m.id, m.activo into v_id, v_activo
    from public.estudiantes_grupo_miembros m
   where m.grupo_id = p_grupo_id and m.persona_id = p_persona_id
     for update;
  begin
    if v_id is null then
      insert into public.estudiantes_grupo_miembros
        (grupo_id, persona_id, estado, desde, confirmado_por, confirmado_at, created_by)
      values (p_grupo_id, p_persona_id, p_estado, p_desde,
              case when p_estado = 'miembro' then p_actor end,
              case when p_estado = 'miembro' then now() end,
              p_actor)
      returning id into v_id;
    elsif not v_activo then
      update public.estudiantes_grupo_miembros m
         set activo = true, retirado_at = null, estado = p_estado, desde = p_desde,
             confirmado_por = case when p_estado = 'miembro' then p_actor end,
             confirmado_at = case when p_estado = 'miembro' then now() end
       where m.id = v_id;
    end if;
  exception
    when unique_violation then
      raise exception 'persona_en_otro_grupo' using errcode = '23505';
  end;
  return v_id;
end;
$$;

revoke all on function public.estudiantes_incorporar(uuid, uuid, text, date, uuid) from public, anon, authenticated;
grant execute on function public.estudiantes_incorporar(uuid, uuid, text, date, uuid) to service_role;

-- ── reading ──────────────────────────────────────────────────────────

create or replace function public.estudiantes_escala_campus(p_campus_id uuid)
returns table (numero integer, etiqueta text, ambito_id uuid, ambito text)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if public.ninos_usuario_actual() is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  return query
  select e.numero::integer, e.etiqueta, e.ambito_id, a.label
    from public.estudiantes_escala e
    join public.dream_team_equipos a on a.id = e.ambito_id
   where e.campus_id = p_campus_id
   order by e.numero;
end;
$$;

comment on function public.estudiantes_escala_campus(uuid) is
  'School scale of a campus (numero, etiqueta, ámbito) for the visitor and ficha forms. Any signed-in user.';

revoke all on function public.estudiantes_escala_campus(uuid) from public, anon;
grant execute on function public.estudiantes_escala_campus(uuid) to authenticated, service_role;

create or replace function public.estudiantes_mis_grupos(p_incluir_inactivos boolean default false)
returns table (
  grupo_id uuid,
  nombre text,
  campus_id uuid,
  ambito_id uuid,
  ambito text,
  experiencia text,
  subarea_id uuid,
  subarea text,
  anio integer,
  anio_etiqueta text,
  zona text,
  dia_semana integer,
  hora time,
  activo boolean,
  soy_lider boolean,
  puede_ver_vivo boolean,
  puede_gestionar boolean,
  miembros integer,
  visitantes integer,
  lideres jsonb
)
language sql
stable
security definer
set search_path to ''
as $$
  select g.id, g.nombre, g.campus_id, g.ambito_id, a.label, a.experiencia, g.subarea_id, s.label,
         g.anio::integer, e.etiqueta, g.zona, g.dia_semana::integer, g.hora, g.activo,
         n.lider, n.nivel >= 2, n.nivel >= 3,
         (select count(*)::integer from public.estudiantes_grupo_miembros m
           where m.grupo_id = g.id and m.activo),
         (select count(*)::integer from public.estudiantes_grupo_miembros m
           where m.grupo_id = g.id and m.activo and m.estado = 'visitante'),
         coalesce((
           select jsonb_agg(jsonb_build_object('servicio_id', sv.id, 'persona_id', u.id, 'nombre', u.nombre,
                                               'apellido', u.apellido, 'rol', r.label)
                            order by u.apellido, u.nombre, u.id)
             from public.estudiantes_grupo_lideres gl
             join public.dream_team_servicios sv on sv.id = gl.servicio_id
             join public.usuarios u on u.id = sv.persona_id
             join public.dream_team_roles r on r.id = sv.rol_id
            where gl.grupo_id = g.id and sv.estado = 'activo'), '[]'::jsonb)
    from public.estudiantes_grupos g
    join public.dream_team_equipos a on a.id = g.ambito_id
    join public.dream_team_equipos s on s.id = g.subarea_id
    left join public.estudiantes_escala e on e.campus_id = g.campus_id and e.numero = g.anio
    cross join lateral (
      select public.estudiantes_nivel_grupo(g.id) as nivel,
             exists (select 1
                       from public.estudiantes_grupo_lideres gl
                       join public.dream_team_servicios sv on sv.id = gl.servicio_id
                       join public.usuarios u on u.id = sv.persona_id
                      where gl.grupo_id = g.id and sv.estado = 'activo' and sv.equipo_id = g.subarea_id
                        and u.auth_id = auth.uid()) as lider
    ) n
   where n.nivel >= 1
     and (g.activo or (coalesce(p_incluir_inactivos, false) and n.nivel >= 3))
   order by a.label, s.label, g.anio nulls last, g.nombre, g.id
$$;

comment on function public.estudiantes_mis_grupos(boolean) is
  'Groups the caller sees (Q3): leaders their own, entrenador / director de grupo their sub-área, directors their '
  'subtree, org.manage all. Inactive groups only with p_incluir_inactivos and management level.';

revoke all on function public.estudiantes_mis_grupos(boolean) from public, anon;
grant execute on function public.estudiantes_mis_grupos(boolean) to authenticated, service_role;

create or replace function public.estudiantes_grupo_lista(p_grupo_id uuid, p_fecha date, p_turno_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_yo uuid := public.ninos_usuario_actual();
  v_g record;
  v_nivel smallint;
  v_reunion uuid;
  v_lugar text;
  v_personas jsonb;
begin
  if v_yo is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  select g.id, g.nombre, g.campus_id, g.ambito_id, g.subarea_id, g.anio, g.zona, g.dia_semana, g.hora,
         a.label as ambito, a.experiencia, s.label as subarea, e.etiqueta as anio_etiqueta
    into v_g
    from public.estudiantes_grupos g
    join public.dream_team_equipos a on a.id = g.ambito_id
    join public.dream_team_equipos s on s.id = g.subarea_id
    left join public.estudiantes_escala e on e.campus_id = g.campus_id and e.numero = g.anio
   where g.id = p_grupo_id and g.activo;
  if not found then
    raise exception 'grupo_invalido' using errcode = '22023';
  end if;
  v_nivel := public.estudiantes_nivel_grupo(p_grupo_id);
  if v_nivel < 1 then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  perform public.estudiantes_sesion_validar(v_g.ambito_id, v_g.campus_id, p_fecha, p_turno_id);

  v_reunion := public.estudiantes_reunion_id(p_grupo_id, p_fecha, p_turno_id, false, v_yo);
  select r.lugar into v_lugar from public.estudiantes_reuniones r where r.id = v_reunion;

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
           'marca', x.estado,
           'marcado_at', x.marcado_at,
           'visitas', vis.n,
           'sugerir_confirmar', m.estado = 'visitante' and vis.n >= 3,
           'representantes', reps.lista)
         order by u.apellido, u.nombre, u.id), '[]'::jsonb)
    into v_personas
    from public.estudiantes_grupo_miembros m
    join public.usuarios u on u.id = m.persona_id
    left join public.estudiantes_fichas f on f.persona_id = m.persona_id
    left join public.estudiantes_escala ef on ef.campus_id = f.campus_id and ef.numero = f.anio_actual
    left join public.estudiantes_asistencias x on x.reunion_id = v_reunion and x.persona_id = m.persona_id
    cross join lateral (select public.estudiantes_visitas(p_grupo_id, m.persona_id, p_fecha) as n) vis
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
                                'dia_semana', v_g.dia_semana, 'hora', v_g.hora),
    'fecha', p_fecha,
    'turno_id', p_turno_id,
    'reunion_id', v_reunion,
    'lugar', v_lugar,
    'puede_ver_vivo', v_nivel >= 2,
    'puede_gestionar', v_nivel >= 3,
    'personas', v_personas);
end;
$$;

comment on function public.estudiantes_grupo_lista(uuid, date, uuid) is
  'Roster of a group for a meeting (level >= 1): each active member with contacts and representantes (Q3, L6), '
  'año, the mark, visits and sugerir_confirmar (visitor with 3+ visits, Q6/L13). Never creates the meeting. '
  'Errors: sin_autoridad, grupo_invalido, fecha_invalida, turno_invalido.';

revoke all on function public.estudiantes_grupo_lista(uuid, date, uuid) from public, anon;
grant execute on function public.estudiantes_grupo_lista(uuid, date, uuid) to authenticated, service_role;

create or replace function public.estudiantes_en_vivo(p_ambito_id uuid, p_fecha date, p_turno_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_campus uuid;
  v_grupos jsonb;
  v_visitantes jsonb;
begin
  if public.ninos_usuario_actual() is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.dream_team_equipos a
     where a.id = p_ambito_id and a.experiencia = 'estudiantes'
       and exists (select 1 from public.dream_team_equipos s
                    where s.parent_equipo_id = a.id and public.estudiantes_es_subarea_grupos(s.label))
  ) then
    raise exception 'ambito_invalido' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.dream_team_equipos s
     where s.parent_equipo_id = p_ambito_id and public.estudiantes_es_subarea_grupos(s.label)
       and public.estudiantes_nivel_subarea(s.id) >= 2
  ) then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  select t.campus_id into v_campus from public.dream_team_turnos t where t.id = p_turno_id;
  if v_campus is null then
    raise exception 'turno_invalido' using errcode = '22023';
  end if;
  if not public.estudiantes_campus_visible(v_campus) then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  perform public.estudiantes_sesion_validar(p_ambito_id, v_campus, p_fecha, p_turno_id);

  select coalesce(jsonb_agg(jsonb_build_object(
           'grupo_id', gr.id, 'nombre', gr.nombre, 'subarea', gr.subarea, 'anio', gr.anio,
           'anio_etiqueta', gr.anio_etiqueta,
           'lideres', coalesce((
             select jsonb_agg(btrim(u.nombre || ' ' || u.apellido) order by u.apellido, u.nombre)
               from public.estudiantes_grupo_lideres gl
               join public.dream_team_servicios sv on sv.id = gl.servicio_id
               join public.usuarios u on u.id = sv.persona_id
              where gl.grupo_id = gr.id and sv.estado = 'activo'), '[]'::jsonb),
           'presentes', k.presentes, 'ausentes', k.ausentes, 'visitantes', k.visitantes,
           'sin_marcar', sm.n)
         order by gr.subarea, gr.anio, gr.nombre, gr.id), '[]'::jsonb)
    into v_grupos
    from (
      select g.id, g.nombre, g.anio, s.label as subarea, e.etiqueta as anio_etiqueta, r.id as reunion_id
        from public.estudiantes_grupos g
        join public.dream_team_equipos s on s.id = g.subarea_id
        left join public.estudiantes_escala e on e.campus_id = g.campus_id and e.numero = g.anio
        left join public.estudiantes_reuniones r
          on r.grupo_id = g.id and r.fecha = p_fecha and r.turno_id = p_turno_id
       where g.ambito_id = p_ambito_id and g.campus_id = v_campus and g.activo
         and public.estudiantes_nivel_subarea(g.subarea_id) >= 2
    ) gr
    cross join lateral (
      select count(*) filter (where x.estado = 'presente')::integer as presentes,
             count(*) filter (where x.estado = 'ausente')::integer as ausentes,
             count(*) filter (where x.estado = 'presente' and x.era_visitante)::integer as visitantes
        from public.estudiantes_asistencias x
       where x.reunion_id = gr.reunion_id
    ) k
    cross join lateral (
      select count(*)::integer as n
        from public.estudiantes_grupo_miembros m
       where m.grupo_id = gr.id and m.activo
         and not exists (select 1 from public.estudiantes_asistencias x
                          where x.reunion_id = gr.reunion_id and x.persona_id = m.persona_id)
    ) sm;

  select coalesce(jsonb_agg(jsonb_build_object(
           'persona_id', u.id, 'nombre', u.nombre, 'apellido', u.apellido,
           'grupo_id', gr.id, 'grupo', gr.nombre,
           'anio_etiqueta', ef.etiqueta,
           'registrado_por', btrim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')),
           'registrado_at', x.marcado_at,
           'es_nuevo', m.desde = p_fecha)
         order by x.marcado_at desc, u.id), '[]'::jsonb)
    into v_visitantes
    from (
      select g.id, g.nombre, r.id as reunion_id
        from public.estudiantes_grupos g
        join public.estudiantes_reuniones r
          on r.grupo_id = g.id and r.fecha = p_fecha and r.turno_id = p_turno_id
       where g.ambito_id = p_ambito_id and g.campus_id = v_campus and g.activo
         and public.estudiantes_nivel_subarea(g.subarea_id) >= 2
    ) gr
    join public.estudiantes_asistencias x on x.reunion_id = gr.reunion_id
    join public.usuarios u on u.id = x.persona_id
    left join public.usuarios p on p.id = x.marcado_por
    left join public.estudiantes_grupo_miembros m on m.grupo_id = gr.id and m.persona_id = x.persona_id
    left join public.estudiantes_fichas f on f.persona_id = x.persona_id
    left join public.estudiantes_escala ef on ef.campus_id = f.campus_id and ef.numero = f.anio_actual
   where x.estado = 'presente' and x.era_visitante;

  return jsonb_build_object('ambito_id', p_ambito_id, 'fecha', p_fecha, 'turno_id', p_turno_id,
                            'grupos', v_grupos, 'visitantes_hoy', v_visitantes);
end;
$$;

comment on function public.estudiantes_en_vivo(uuid, date, uuid) is
  'Live view of a Transit / Inside Out meeting (Q5, S5): per visible group (sub-área level >= 2) presentes, ausentes, '
  'visitantes and sin_marcar, and the visitors present today with who marked them and when. '
  'Errors: sin_autoridad, ambito_invalido, turno_invalido, fecha_invalida.';

revoke all on function public.estudiantes_en_vivo(uuid, date, uuid) from public, anon;
grant execute on function public.estudiantes_en_vivo(uuid, date, uuid) to authenticated, service_role;

-- ── attendance ───────────────────────────────────────────────────────

create or replace function public.estudiantes_reunion_guardar(
  p_grupo_id uuid,
  p_fecha date,
  p_turno_id uuid,
  p_lugar text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_yo uuid := public.ninos_usuario_actual();
  v_g record;
  v_lugar text := nullif(btrim(coalesce(p_lugar, '')), '');
  v_id uuid;
begin
  if v_yo is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  select g.id, g.campus_id, g.ambito_id into v_g
    from public.estudiantes_grupos g where g.id = p_grupo_id and g.activo;
  if not found then
    raise exception 'grupo_invalido' using errcode = '22023';
  end if;
  if public.estudiantes_nivel_grupo(p_grupo_id) < 1 then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  perform public.estudiantes_sesion_validar(v_g.ambito_id, v_g.campus_id, p_fecha, p_turno_id);
  if length(v_lugar) > 200 then
    raise exception 'texto_muy_largo' using errcode = '22023';
  end if;
  v_id := public.estudiantes_reunion_id(p_grupo_id, p_fecha, p_turno_id, true, v_yo);
  update public.estudiantes_reuniones r set lugar = v_lugar where r.id = v_id;
  return v_id;
end;
$$;

comment on function public.estudiantes_reunion_guardar(uuid, date, uuid, text) is
  'Opens (or edits the lugar of) a meeting of a group (level >= 1); returns its id. The Living Room: no turno, lugar optional.';

revoke all on function public.estudiantes_reunion_guardar(uuid, date, uuid, text) from public, anon;
grant execute on function public.estudiantes_reunion_guardar(uuid, date, uuid, text) to authenticated, service_role;

create or replace function public.estudiantes_marcar(
  p_grupo_id uuid,
  p_fecha date,
  p_turno_id uuid,
  p_persona_id uuid,
  p_estado text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_yo uuid := public.ninos_usuario_actual();
  v_g record;
  v_estado_miembro text;
  v_reunion uuid;
  v_visitas integer;
begin
  if v_yo is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  select g.id, g.campus_id, g.ambito_id into v_g
    from public.estudiantes_grupos g where g.id = p_grupo_id and g.activo;
  if not found then
    raise exception 'grupo_invalido' using errcode = '22023';
  end if;
  if public.estudiantes_nivel_grupo(p_grupo_id) < 1 then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  if p_estado is not null and p_estado not in ('presente', 'ausente') then
    raise exception 'estado_invalido' using errcode = '22023';
  end if;
  perform public.estudiantes_sesion_validar(v_g.ambito_id, v_g.campus_id, p_fecha, p_turno_id);
  select m.estado into v_estado_miembro
    from public.estudiantes_grupo_miembros m
   where m.grupo_id = p_grupo_id and m.persona_id = p_persona_id and m.activo;
  if not found then
    raise exception 'persona_invalida' using errcode = '22023';
  end if;

  v_reunion := public.estudiantes_reunion_id(p_grupo_id, p_fecha, p_turno_id, p_estado is not null, v_yo);
  if v_reunion is not null then
    perform public.estudiantes_marca_guardar(v_reunion, p_persona_id, p_estado, v_estado_miembro = 'visitante', v_yo);
  end if;
  v_visitas := public.estudiantes_visitas(p_grupo_id, p_persona_id, p_fecha);

  return jsonb_build_object('reunion_id', v_reunion, 'persona_id', p_persona_id, 'estado', p_estado,
                            'visitas', v_visitas,
                            'sugerir_confirmar', v_estado_miembro = 'visitante' and v_visitas >= 3);
end;
$$;

comment on function public.estudiantes_marcar(uuid, date, uuid, uuid, text) is
  'Marks an active member presente / ausente at a meeting (level >= 1), creating the meeting on the first mark; '
  'p_estado NULL clears the mark. Idempotent. Errors: sin_autoridad, grupo_invalido, estado_invalido, '
  'fecha_invalida, turno_invalido, persona_invalida.';

revoke all on function public.estudiantes_marcar(uuid, date, uuid, uuid, text) from public, anon;
grant execute on function public.estudiantes_marcar(uuid, date, uuid, uuid, text) to authenticated, service_role;

create or replace function public.estudiantes_buscar_personas(
  p_grupo_id uuid,
  p_cedula text default null,
  p_telefono text default null,
  p_nombre text default null,
  p_apellido text default null
)
returns table (
  persona_id uuid,
  nombre text,
  apellido text,
  coincide text[],
  grupo_id uuid,
  grupo text,
  en_este_grupo boolean
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
  select g.id, g.campus_id, g.ambito_id into v_g
    from public.estudiantes_grupos g where g.id = p_grupo_id and g.activo;
  if not found then
    raise exception 'grupo_invalido' using errcode = '22023';
  end if;
  if public.estudiantes_nivel_grupo(p_grupo_id) < 1 then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;

  return query
  select c.persona_id, u.nombre, u.apellido, c.coincide, og.id, og.nombre, coalesce(og.id = v_g.id, false)
    from public.estudiantes_coincidencias(v_g.campus_id, p_cedula, p_telefono, p_nombre, p_apellido) c
    join public.usuarios u on u.id = c.persona_id
    left join lateral (
      select g2.id, g2.nombre
        from public.estudiantes_grupo_miembros m
        join public.estudiantes_grupos g2 on g2.id = m.grupo_id
       where m.persona_id = c.persona_id and m.ambito_id = v_g.ambito_id and m.activo
       limit 1
    ) og on true
   order by cardinality(c.coincide) desc, u.apellido, u.nombre, u.id
   limit 10;
end;
$$;

comment on function public.estudiantes_buscar_personas(uuid, text, text, text, text) is
  'Possible duplicates before registering a visitor (Q6, level >= 1): by normalized cédula, teléfono and full name. '
  'Returns only id, nombre, apellido, what matched and the person''s active group in the ámbito. At most 10.';

revoke all on function public.estudiantes_buscar_personas(uuid, text, text, text, text) from public, anon;
grant execute on function public.estudiantes_buscar_personas(uuid, text, text, text, text) to authenticated, service_role;

create or replace function public.estudiantes_visitante_crear(
  p_grupo_id uuid,
  p_fecha date,
  p_turno_id uuid,
  p_datos jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_yo uuid := public.ninos_usuario_actual();
  v_g record;
  v_nombre text;
  v_apellido text;
  v_genero text;
  v_telefono text;
  v_cedula text;
  v_nac date;
  v_anio integer;
  v_rep jsonb;
  v_rep_id uuid;
  v_rep_nombre text;
  v_rep_apellido text;
  v_rep_telefono text;
  v_rep_cedula text;
  v_rep_genero text;
  v_rep_tipo text;
  v_persona uuid;
  v_miembro uuid;
  v_reunion uuid;
begin
  if v_yo is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  select g.id, g.campus_id, g.ambito_id, g.anio, a.experiencia into v_g
    from public.estudiantes_grupos g
    join public.dream_team_equipos a on a.id = g.ambito_id
   where g.id = p_grupo_id and g.activo;
  if not found then
    raise exception 'grupo_invalido' using errcode = '22023';
  end if;
  if public.estudiantes_nivel_grupo(p_grupo_id) < 1 then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  perform public.estudiantes_sesion_validar(v_g.ambito_id, v_g.campus_id, p_fecha, p_turno_id);

  -- The visitor.
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  v_nombre := public.ninos_texto(p_datos, 'nombre');
  v_apellido := public.ninos_texto(p_datos, 'apellido');
  if v_nombre is null or v_apellido is null then
    raise exception 'nombre_y_apellido_requeridos' using errcode = '22023';
  end if;
  v_genero := public.ninos_texto(p_datos, 'genero');
  if v_genero is null or v_genero not in ('Masculino', 'Femenino') then
    raise exception 'genero_requerido' using errcode = '22023';
  end if;
  v_telefono := public.ninos_texto(p_datos, 'telefono');
  v_cedula := public.ninos_texto(p_datos, 'cedula');
  begin
    v_nac := public.ninos_texto(p_datos, 'fecha_nacimiento')::date;
    v_anio := public.ninos_texto(p_datos, 'anio')::integer;
  exception
    when invalid_text_representation or datetime_field_overflow or invalid_datetime_format
         or numeric_value_out_of_range then
      raise exception 'datos_invalidos' using errcode = '22023';
  end;
  if greatest(length(v_nombre), length(v_apellido), length(coalesce(v_telefono, '')),
              length(coalesce(v_cedula, ''))) > 80 then
    raise exception 'texto_muy_largo' using errcode = '22023';
  end if;
  if v_nac is not null and v_nac > public.ninos_hoy() then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if v_g.experiencia = 'the_living_room' then
    if v_anio is not null then
      raise exception 'anio_invalido' using errcode = '22023';
    end if;
  else
    v_anio := coalesce(v_anio, v_g.anio);
  end if;

  -- The representante (Transit / Inside Out only, Q7).
  v_rep := p_datos -> 'representante';
  if v_rep is not null and jsonb_typeof(v_rep) = 'null' then
    v_rep := null;
  end if;
  if v_rep is not null then
    if v_g.experiencia = 'the_living_room' then
      raise exception 'representante_no_aplica' using errcode = '22023';
    end if;
    if jsonb_typeof(v_rep) <> 'object' then
      raise exception 'datos_invalidos' using errcode = '22023';
    end if;
    v_rep_tipo := coalesce(public.ninos_texto(v_rep, 'tipo'), 'padre');
    if v_rep_tipo not in ('padre', 'tutor', 'abuelo', 'tio', 'hermano', 'otro_familiar') then
      raise exception 'tipo_representante_invalido' using errcode = '22023';
    end if;
    if public.ninos_texto(v_rep, 'persona_id') is not null then
      begin
        v_rep_id := public.ninos_texto(v_rep, 'persona_id')::uuid;
      exception
        when invalid_text_representation then
          raise exception 'datos_invalidos' using errcode = '22023';
      end;
      if not exists (select 1 from public.usuarios u where u.id = v_rep_id) then
        raise exception 'representante_no_encontrado' using errcode = '22023';
      end if;
    else
      v_rep_nombre := public.ninos_texto(v_rep, 'nombre');
      v_rep_apellido := coalesce(public.ninos_texto(v_rep, 'apellido'), '');
      v_rep_telefono := public.ninos_texto(v_rep, 'telefono');
      v_rep_cedula := public.ninos_texto(v_rep, 'cedula');
      v_rep_genero := public.ninos_texto(v_rep, 'genero');
      if v_rep_nombre is null or v_rep_telefono is null then
        raise exception 'representante_incompleto' using errcode = '22023';
      end if;
      if v_rep_genero is null or v_rep_genero not in ('Masculino', 'Femenino') then
        raise exception 'genero_requerido' using errcode = '22023';
      end if;
      if greatest(length(v_rep_nombre), length(v_rep_apellido), length(v_rep_telefono),
                  length(coalesce(v_rep_cedula, ''))) > 80 then
        raise exception 'texto_muy_largo' using errcode = '22023';
      end if;
    end if;
  end if;

  -- Never duplicate (Q6).
  if v_cedula is not null and exists (
    select 1 from public.usuarios u
     where u.cedula = public.normalizar_cedula_ve(v_cedula)
        or public.normalizar_cedula_ve(u.cedula) = public.normalizar_cedula_ve(v_cedula)
  ) then
    raise exception 'cedula_existente' using errcode = '23505';
  end if;
  if not coalesce(p_datos -> 'ignorar_coincidencias' = 'true'::jsonb, false)
     and exists (select 1 from public.estudiantes_coincidencias(v_g.campus_id, null, v_telefono, v_nombre, v_apellido)) then
    raise exception 'posibles_duplicados' using errcode = '23505';
  end if;

  begin
    insert into public.usuarios (nombre, apellido, genero, estado_civil, fecha_nacimiento, telefono, cedula)
    values (v_nombre, v_apellido, v_genero::public.enum_genero, 'No especificado', v_nac, v_telefono, v_cedula)
    returning id into v_persona;
  exception
    when unique_violation then
      raise exception 'cedula_existente' using errcode = '23505';
  end;
  insert into public.usuario_campus (usuario_id, campus_id, es_campus_principal)
  values (v_persona, v_g.campus_id, true);

  if v_rep is not null then
    if v_rep_id is null and v_rep_cedula is not null then
      select u.id into v_rep_id
        from public.usuarios u
       where u.cedula = public.normalizar_cedula_ve(v_rep_cedula)
          or public.normalizar_cedula_ve(u.cedula) = public.normalizar_cedula_ve(v_rep_cedula)
       order by (u.cedula = public.normalizar_cedula_ve(v_rep_cedula)) desc
       limit 1;
    end if;
    if v_rep_id is null then
      select c.persona_id into v_rep_id
        from public.estudiantes_coincidencias(v_g.campus_id, null, v_rep_telefono, v_rep_nombre, v_rep_apellido) c
       where c.coincide @> array['nombre', 'telefono']
         and c.persona_id <> v_persona
       order by c.persona_id
       limit 1;
    end if;
    if v_rep_id is null then
      begin
        insert into public.usuarios (nombre, apellido, genero, estado_civil, telefono, cedula)
        values (v_rep_nombre, v_rep_apellido, v_rep_genero::public.enum_genero, 'No especificado',
                v_rep_telefono, v_rep_cedula)
        returning id into v_rep_id;
      exception
        when unique_violation then
          raise exception 'cedula_existente' using errcode = '23505';
      end;
      insert into public.usuario_campus (usuario_id, campus_id, es_campus_principal)
      values (v_rep_id, v_g.campus_id, true);
    end if;
    insert into public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal)
    values (v_persona, v_rep_id, v_rep_tipo::public.enum_tipo_relacion, true);
  end if;

  perform public.estudiantes_ficha_asegurar(v_persona, v_g.campus_id, v_anio, v_yo);
  v_miembro := public.estudiantes_incorporar(p_grupo_id, v_persona, 'visitante', p_fecha, v_yo);
  v_reunion := public.estudiantes_reunion_id(p_grupo_id, p_fecha, p_turno_id, true, v_yo);
  perform public.estudiantes_marca_guardar(v_reunion, v_persona, 'presente', true, v_yo);

  return jsonb_build_object('persona_id', v_persona, 'representante_id', v_rep_id, 'miembro_id', v_miembro,
                            'reunion_id', v_reunion);
end;
$$;

comment on function public.estudiantes_visitante_crear(uuid, date, uuid, jsonb) is
  'Registers a first-time visitor (Q4, Q6, level >= 1): creates the person (no account) with their ficha and, for '
  'Transit / Inside Out, the representante linked by relaciones_usuarios; adds them to the group as visitante and '
  'marks them presente. p_datos: nombre, apellido, genero (Masculino | Femenino), telefono, cedula, '
  'fecha_nacimiento, anio (default the group''s), ignorar_coincidencias, representante {persona_id | nombre, '
  'apellido, telefono, cedula, genero (Masculino | Femenino); tipo}. Errors: see the migration header.';

revoke all on function public.estudiantes_visitante_crear(uuid, date, uuid, jsonb) from public, anon;
grant execute on function public.estudiantes_visitante_crear(uuid, date, uuid, jsonb) to authenticated, service_role;

create or replace function public.estudiantes_visitante_agregar(
  p_grupo_id uuid,
  p_fecha date,
  p_turno_id uuid,
  p_persona_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_yo uuid := public.ninos_usuario_actual();
  v_g record;
  v_miembro uuid;
  v_estado text;
  v_reunion uuid;
begin
  if v_yo is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  select g.id, g.campus_id, g.ambito_id, g.anio into v_g
    from public.estudiantes_grupos g where g.id = p_grupo_id and g.activo;
  if not found then
    raise exception 'grupo_invalido' using errcode = '22023';
  end if;
  if public.estudiantes_nivel_grupo(p_grupo_id) < 1 then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  perform public.estudiantes_sesion_validar(v_g.ambito_id, v_g.campus_id, p_fecha, p_turno_id);
  if not public.estudiantes_persona_en_campus(p_persona_id, v_g.campus_id) then
    raise exception 'persona_invalida' using errcode = '22023';
  end if;

  perform public.estudiantes_ficha_asegurar(p_persona_id, v_g.campus_id, v_g.anio, v_yo);
  v_miembro := public.estudiantes_incorporar(p_grupo_id, p_persona_id, 'visitante', p_fecha, v_yo);
  select m.estado into v_estado from public.estudiantes_grupo_miembros m where m.id = v_miembro;
  v_reunion := public.estudiantes_reunion_id(p_grupo_id, p_fecha, p_turno_id, true, v_yo);
  perform public.estudiantes_marca_guardar(v_reunion, p_persona_id, 'presente', v_estado = 'visitante', v_yo);

  return jsonb_build_object('persona_id', p_persona_id, 'miembro_id', v_miembro, 'estado', v_estado,
                            'reunion_id', v_reunion,
                            'visitas', public.estudiantes_visitas(p_grupo_id, p_persona_id, p_fecha));
end;
$$;

comment on function public.estudiantes_visitante_agregar(uuid, date, uuid, uuid) is
  'Adds an existing person found by estudiantes_buscar_personas to the group as visitante (an active member keeps '
  'their estado) and marks them presente (level >= 1). Errors: sin_autoridad, grupo_invalido, fecha_invalida, '
  'turno_invalido, persona_invalida, persona_en_otro_grupo.';

revoke all on function public.estudiantes_visitante_agregar(uuid, date, uuid, uuid) from public, anon;
grant execute on function public.estudiantes_visitante_agregar(uuid, date, uuid, uuid) to authenticated, service_role;

create or replace function public.estudiantes_confirmar_miembro(p_grupo_id uuid, p_persona_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_yo uuid := public.ninos_usuario_actual();
begin
  if v_yo is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  if not exists (select 1 from public.estudiantes_grupos g where g.id = p_grupo_id and g.activo) then
    raise exception 'grupo_invalido' using errcode = '22023';
  end if;
  if public.estudiantes_nivel_grupo(p_grupo_id) < 1 then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  update public.estudiantes_grupo_miembros m
     set estado = 'miembro', confirmado_por = v_yo, confirmado_at = now()
   where m.grupo_id = p_grupo_id and m.persona_id = p_persona_id and m.activo and m.estado = 'visitante';
  if found then
    return true;
  end if;
  if exists (select 1 from public.estudiantes_grupo_miembros m
              where m.grupo_id = p_grupo_id and m.persona_id = p_persona_id and m.activo) then
    return false;
  end if;
  raise exception 'persona_invalida' using errcode = '22023';
end;
$$;

comment on function public.estudiantes_confirmar_miembro(uuid, uuid) is
  'Confirms a visitor of the group as miembro (level >= 1); true when it changed, false when already a member. '
  'Errors: sin_autoridad, grupo_invalido, persona_invalida.';

revoke all on function public.estudiantes_confirmar_miembro(uuid, uuid) from public, anon;
grant execute on function public.estudiantes_confirmar_miembro(uuid, uuid) to authenticated, service_role;

create or replace function public.estudiantes_ficha_guardar(
  p_persona_id uuid,
  p_anio_actual integer,
  p_anio_final integer
)
returns void
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_yo uuid := public.ninos_usuario_actual();
  v_campus uuid;
begin
  if v_yo is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  select g.campus_id into v_campus
    from public.estudiantes_grupo_miembros m
    join public.estudiantes_grupos g on g.id = m.grupo_id
   where m.persona_id = p_persona_id and m.activo and g.activo
     and public.estudiantes_nivel_grupo(g.id) >= 1
   order by g.created_at, g.id
   limit 1;
  if v_campus is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  begin
    insert into public.estudiantes_fichas (persona_id, campus_id, anio_actual, anio_final, updated_by)
    values (p_persona_id, v_campus, p_anio_actual, p_anio_final, v_yo)
    on conflict (persona_id) do update
       set anio_actual = excluded.anio_actual, anio_final = excluded.anio_final, updated_by = excluded.updated_by;
  exception
    when foreign_key_violation or check_violation or numeric_value_out_of_range then
      raise exception 'anio_invalido' using errcode = '22023';
  end;
end;
$$;

comment on function public.estudiantes_ficha_guardar(uuid, integer, integer) is
  'Sets the school years of a person who is an active member of a group the caller sees (level >= 1). '
  'anio_final NULL takes the last year of the campus scale. Errors: sin_autoridad, anio_invalido.';

revoke all on function public.estudiantes_ficha_guardar(uuid, integer, integer) from public, anon;
grant execute on function public.estudiantes_ficha_guardar(uuid, integer, integer) to authenticated, service_role;

-- ── group management (C2) ────────────────────────────────────────────

create or replace function public.estudiantes_grupo_crear(
  p_subarea_id uuid,
  p_campus_id uuid,
  p_nombre text,
  p_anio integer default null,
  p_zona text default null,
  p_dia_semana integer default null,
  p_hora time default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_yo uuid := public.ninos_usuario_actual();
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_id uuid;
begin
  if v_yo is null or public.estudiantes_nivel_subarea(p_subarea_id) < 3
     or not public.estudiantes_campus_visible(p_campus_id) then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  if not exists (select 1 from public.campus c where c.id = p_campus_id and c.activo) then
    raise exception 'campus_invalido' using errcode = '22023';
  end if;
  if v_nombre = '' or length(v_nombre) > 80 then
    raise exception 'nombre_invalido' using errcode = '22023';
  end if;
  if length(p_zona) > 120 then
    raise exception 'texto_muy_largo' using errcode = '22023';
  end if;
  if p_dia_semana not between 0 and 6 then
    raise exception 'horario_invalido' using errcode = '22023';
  end if;
  begin
    insert into public.estudiantes_grupos (campus_id, subarea_id, nombre, anio, zona, dia_semana, hora, created_by)
    values (p_campus_id, p_subarea_id, v_nombre, p_anio, p_zona, p_dia_semana, p_hora, v_yo)
    returning id into v_id;
  exception
    when foreign_key_violation or numeric_value_out_of_range then
      raise exception 'anio_invalido' using errcode = '22023';
    when unique_violation then
      raise exception 'nombre_duplicado' using errcode = '23505';
  end;
  return v_id;
end;
$$;

comment on function public.estudiantes_grupo_crear(uuid, uuid, text, integer, text, integer, time) is
  'Creates a small group in a Grupos de Chicas / Chicos sub-área (level >= 3 on it). Transit / Inside Out need an '
  'año of their ámbito and take no weekly day; The Living Room takes no año, an optional zona and an optional '
  'regular dia_semana (0-6) and hora (hora needs the day). Errors: sin_autoridad, campus_invalido, nombre_invalido, '
  'subarea_invalida, anio_invalido, horario_invalido, texto_muy_largo, nombre_duplicado.';

revoke all on function public.estudiantes_grupo_crear(uuid, uuid, text, integer, text, integer, time) from public, anon;
grant execute on function public.estudiantes_grupo_crear(uuid, uuid, text, integer, text, integer, time) to authenticated, service_role;

create or replace function public.estudiantes_grupo_editar(
  p_grupo_id uuid,
  p_nombre text,
  p_anio integer,
  p_zona text,
  p_dia_semana integer,
  p_hora time
)
returns void
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_subarea uuid;
  v_nombre text := btrim(coalesce(p_nombre, ''));
begin
  select g.subarea_id into v_subarea from public.estudiantes_grupos g where g.id = p_grupo_id for update;
  if public.ninos_usuario_actual() is null or v_subarea is null
     or public.estudiantes_nivel_grupo(p_grupo_id) < 3 then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  if v_nombre = '' or length(v_nombre) > 80 then
    raise exception 'nombre_invalido' using errcode = '22023';
  end if;
  if length(p_zona) > 120 then
    raise exception 'texto_muy_largo' using errcode = '22023';
  end if;
  if p_dia_semana not between 0 and 6 then
    raise exception 'horario_invalido' using errcode = '22023';
  end if;
  begin
    update public.estudiantes_grupos g
       set nombre = v_nombre, anio = p_anio, zona = p_zona, dia_semana = p_dia_semana, hora = p_hora
     where g.id = p_grupo_id;
  exception
    when foreign_key_violation or numeric_value_out_of_range then
      raise exception 'anio_invalido' using errcode = '22023';
    when unique_violation then
      raise exception 'nombre_duplicado' using errcode = '23505';
  end;
end;
$$;

comment on function public.estudiantes_grupo_editar(uuid, text, integer, text, integer, time) is
  'Renames a group and sets its año / zona / weekly dia_semana and hora (level >= 3 on its sub-área), same rules as '
  'estudiantes_grupo_crear. Errors: sin_autoridad, nombre_invalido, anio_invalido, horario_invalido, texto_muy_largo, '
  'nombre_duplicado.';

revoke all on function public.estudiantes_grupo_editar(uuid, text, integer, text, integer, time) from public, anon;
grant execute on function public.estudiantes_grupo_editar(uuid, text, integer, text, integer, time) to authenticated, service_role;

create or replace function public.estudiantes_grupo_activar(p_grupo_id uuid, p_activo boolean)
returns void
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_subarea uuid;
begin
  select g.subarea_id into v_subarea from public.estudiantes_grupos g where g.id = p_grupo_id for update;
  if public.ninos_usuario_actual() is null or v_subarea is null
     or public.estudiantes_nivel_grupo(p_grupo_id) < 3 then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  if p_activo is null then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  begin
    update public.estudiantes_grupos g set activo = p_activo where g.id = p_grupo_id and g.activo <> p_activo;
  exception
    when unique_violation then
      raise exception 'nombre_duplicado' using errcode = '23505';
  end;
  -- A deactivated group releases its members (one active group per ámbito).
  if not p_activo then
    update public.estudiantes_grupo_miembros m
       set activo = false, retirado_at = now()
     where m.grupo_id = p_grupo_id and m.activo;
  end if;
end;
$$;

comment on function public.estudiantes_grupo_activar(uuid, boolean) is
  'Deactivates (releasing its members) or reactivates a group (level >= 3 on its sub-área). '
  'Errors: sin_autoridad, datos_invalidos, nombre_duplicado.';

revoke all on function public.estudiantes_grupo_activar(uuid, boolean) from public, anon;
grant execute on function public.estudiantes_grupo_activar(uuid, boolean) to authenticated, service_role;

create or replace function public.estudiantes_lideres_disponibles(p_subarea_id uuid, p_campus_id uuid)
returns table (servicio_id uuid, persona_id uuid, nombre text, apellido text, rol text)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if public.ninos_usuario_actual() is null or public.estudiantes_nivel_subarea(p_subarea_id) < 3
     or not public.estudiantes_campus_visible(p_campus_id) then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  return query
  select s.id, u.id, u.nombre, u.apellido, r.label
    from public.dream_team_servicios s
    join public.usuarios u on u.id = s.persona_id
    join public.dream_team_roles r on r.id = s.rol_id
   where s.equipo_id = p_subarea_id
     and s.estado = 'activo'
     and public.dream_team_normalizar_etiqueta(r.label) in ('lider', 'entrenador', 'director de grupo')
     and public.estudiantes_persona_en_campus(u.id, p_campus_id)
   order by u.apellido, u.nombre, s.id;
end;
$$;

comment on function public.estudiantes_lideres_disponibles(uuid, uuid) is
  'Active servicios of a sub-área, of people of the campus, that may lead a group there (lider, entrenador, '
  'director de grupo); level >= 3 and the campus visible to the caller.';

revoke all on function public.estudiantes_lideres_disponibles(uuid, uuid) from public, anon;
grant execute on function public.estudiantes_lideres_disponibles(uuid, uuid) to authenticated, service_role;

create or replace function public.estudiantes_grupo_lideres_fijar(p_grupo_id uuid, p_servicio_ids uuid[])
returns integer
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_yo uuid := public.ninos_usuario_actual();
  v_subarea uuid;
  v_campus uuid;
  v_ids uuid[];
begin
  select g.subarea_id, g.campus_id into v_subarea, v_campus
    from public.estudiantes_grupos g where g.id = p_grupo_id for update;
  if v_yo is null or v_subarea is null or public.estudiantes_nivel_grupo(p_grupo_id) < 3 then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  if p_servicio_ids is null then
    raise exception 'servicios_invalidos' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x), array[]::uuid[]) into v_ids
    from unnest(p_servicio_ids) as x
   where x is not null;
  if exists (
    select 1 from unnest(v_ids) as x
     where not exists (
       select 1
         from public.dream_team_servicios s
         join public.dream_team_roles r on r.id = s.rol_id
        where s.id = x and s.equipo_id = v_subarea and s.estado = 'activo'
          and public.dream_team_normalizar_etiqueta(r.label) in ('lider', 'entrenador', 'director de grupo')
          and public.estudiantes_persona_en_campus(s.persona_id, v_campus)
     )
  ) then
    raise exception 'servicio_invalido' using errcode = '22023';
  end if;

  delete from public.estudiantes_grupo_lideres gl
   where gl.grupo_id = p_grupo_id and gl.servicio_id <> all (v_ids);
  insert into public.estudiantes_grupo_lideres (grupo_id, servicio_id, created_by)
  select p_grupo_id, x, v_yo from unnest(v_ids) as x
  on conflict (grupo_id, servicio_id) do nothing;
  return cardinality(v_ids);
end;
$$;

comment on function public.estudiantes_grupo_lideres_fijar(uuid, uuid[]) is
  'Replaces the leaders of a group with p_servicio_ids (level >= 3 on its sub-área); an empty array clears them. '
  'Each id must be an active lider / entrenador / director de grupo servicio of the sub-área, of a person of the '
  'group''s campus. Returns how many lead. '
  'Errors: sin_autoridad, servicios_invalidos, servicio_invalido.';

revoke all on function public.estudiantes_grupo_lideres_fijar(uuid, uuid[]) from public, anon;
grant execute on function public.estudiantes_grupo_lideres_fijar(uuid, uuid[]) to authenticated, service_role;

create or replace function public.estudiantes_grupo_miembro_agregar(
  p_grupo_id uuid,
  p_persona_id uuid,
  p_estado text default 'miembro'
)
returns uuid
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_yo uuid := public.ninos_usuario_actual();
  v_g record;
  v_id uuid;
begin
  if v_yo is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  select g.id, g.campus_id, g.subarea_id, g.anio into v_g
    from public.estudiantes_grupos g where g.id = p_grupo_id and g.activo;
  if not found then
    raise exception 'grupo_invalido' using errcode = '22023';
  end if;
  if public.estudiantes_nivel_grupo(p_grupo_id) < 3 then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  if p_estado is null or p_estado not in ('visitante', 'miembro') then
    raise exception 'estado_invalido' using errcode = '22023';
  end if;
  if not public.estudiantes_persona_en_campus(p_persona_id, v_g.campus_id) then
    raise exception 'persona_invalida' using errcode = '22023';
  end if;

  perform public.estudiantes_ficha_asegurar(p_persona_id, v_g.campus_id, v_g.anio, v_yo);
  v_id := public.estudiantes_incorporar(p_grupo_id, p_persona_id, p_estado, public.ninos_hoy(), v_yo);
  if p_estado = 'miembro' then
    update public.estudiantes_grupo_miembros m
       set estado = 'miembro', confirmado_por = v_yo, confirmado_at = now()
     where m.id = v_id and m.estado = 'visitante';
  end if;
  return v_id;
end;
$$;

comment on function public.estudiantes_grupo_miembro_agregar(uuid, uuid, text) is
  'Adds a person to a group as miembro (default) or visitante (level >= 3 on its sub-área). '
  'Errors: sin_autoridad, grupo_invalido, estado_invalido, persona_invalida, persona_en_otro_grupo.';

revoke all on function public.estudiantes_grupo_miembro_agregar(uuid, uuid, text) from public, anon;
grant execute on function public.estudiantes_grupo_miembro_agregar(uuid, uuid, text) to authenticated, service_role;

create or replace function public.estudiantes_grupo_miembro_quitar(p_grupo_id uuid, p_persona_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_subarea uuid;
begin
  select g.subarea_id into v_subarea from public.estudiantes_grupos g where g.id = p_grupo_id;
  if public.ninos_usuario_actual() is null or v_subarea is null
     or public.estudiantes_nivel_grupo(p_grupo_id) < 3 then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  update public.estudiantes_grupo_miembros m
     set activo = false, retirado_at = now()
   where m.grupo_id = p_grupo_id and m.persona_id = p_persona_id and m.activo;
  return found;
end;
$$;

comment on function public.estudiantes_grupo_miembro_quitar(uuid, uuid) is
  'Removes a person from a group (membership kept as inactive, marks stay); level >= 3 on its sub-área. '
  'Returns whether they were an active member. Errors: sin_autoridad.';

revoke all on function public.estudiantes_grupo_miembro_quitar(uuid, uuid) from public, anon;
grant execute on function public.estudiantes_grupo_miembro_quitar(uuid, uuid) to authenticated, service_role;
