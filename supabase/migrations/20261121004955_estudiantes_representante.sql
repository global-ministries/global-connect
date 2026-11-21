-- noqa: insert-into
-- Estudiantes — add or remove the representante of an existing member
-- (odd/tasks/representante-buscador.md, S2, S3; T2).
--
-- What:
--   1. estudiantes_representante_agregar(grupo, persona, representante) → jsonb
--      {representante_id, creado}: links a representante to an active member
--      of a Transit / Inside Out group. p_representante has the visitor form
--      shape (estudiantes_visitante_crear): tipo (padre by default; padre,
--      tutor, abuelo, tio, hermano, otro_familiar) and either persona_id (an
--      existing usuario) or nombre, apellido, telefono, cedula, genero. Without
--      persona_id the person is resolved like estudiantes_visitante_crear does:
--      reused by cédula (whole church), then by teléfono + nombre together
--      (estudiantes_coincidencias, the group's campus); otherwise created
--      without account (estado_civil 'No especificado') with their
--      usuario_campus of the group's campus. The link is the canonical row
--      usuario1 = student, usuario2 = representante; an existing
--      representative link of the pair (canonical with one of the six types,
--      or the inverse usuario1 = representante, usuario2 = student, 'hijo') is
--      replaced by that single row with the new tipo, never duplicated.
--      es_principal (S2): a new pair is principal only when the student has no
--      other principal representative link (canonical rows of the six types or
--      inverse 'hijo' rows with es_principal true); a replaced pair keeps its
--      principal flag (true when any replaced row was principal). The
--      student's other relaciones_usuarios rows are never modified:
--      es_principal is shared with Niños family links.
--   2. estudiantes_representante_quitar(grupo, persona, representante) →
--      boolean: deletes only the representative links of the pair (canonical
--      rows with the six types and inverse 'hijo' rows); never a usuario. True
--      when something was deleted.
--
-- How:
--   - Authority (S3): estudiantes_nivel_grupo(grupo) >= 3 (whoever manages the
--     group: director de grupo, directors, pastor of the campus, system
--     admin). A leader (level 1) keeps setting the representante only at
--     registration (estudiantes_visitante_crear).
--   - Guard order (both functions): no current user, then the group exists
--     and is active, then the level, then The Living Room, then the
--     membership; so a caller below level 3 learns nothing about the group
--     beyond grupo_invalido.
--   - Both run as definer with an empty search_path; relaciones_usuarios keeps
--     its RLS and grants (20260618203000) for every other path.
--   - The student's usuario row is locked (FOR NO KEY UPDATE) so two
--     concurrent calls on the same student cannot leave duplicate links or
--     decide the principal flag from a stale read.
--   - A typed representante that resolves to the student is refused
--     (representante_invalido) instead of creating a duplicate of them; when
--     several people match teléfono + nombre, someone other than the student is
--     preferred.
--
-- Errors (both functions unless noted, in guard order):
--   sin_autoridad (42501): no current user.
--   grupo_invalido (22023): the group is missing or inactive.
--   sin_autoridad (42501): level < 3 on the group.
--   representante_no_aplica (22023): a The Living Room group.
--   persona_invalida (22023): the student has no active membership in the group.
--   agregar only:
--     datos_invalidos (22023): p_representante is not an object, or a bad persona_id.
--     tipo_representante_invalido (22023): tipo outside the six representative types.
--     representante_no_encontrado (22023): persona_id is not a usuario.
--     representante_incompleto (22023): no persona_id and no nombre or teléfono.
--     genero_requerido (22023): a new representante without Masculino / Femenino.
--     texto_muy_largo (22023): nombre, apellido, teléfono or cédula over 80 characters.
--     cedula_existente (23505): the cédula was taken while creating the usuario.
--     representante_invalido (22023): the representante is the student.
--     relacion_existente (23505): the pair already has a non-representative relation.

create or replace function public.estudiantes_representante_agregar(
  p_grupo_id uuid,
  p_persona_id uuid,
  p_representante jsonb
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
  v_rep_id uuid;
  v_rep_nombre text;
  v_rep_apellido text;
  v_rep_telefono text;
  v_rep_cedula text;
  v_rep_genero text;
  v_rep_tipo text;
  v_creado boolean := false;
  v_par_existia boolean;
  v_par_principal boolean;
  v_principal boolean;
begin
  if v_yo is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  select g.id, g.campus_id, a.experiencia into v_g
    from public.estudiantes_grupos g
    join public.dream_team_equipos a on a.id = g.ambito_id
   where g.id = p_grupo_id and g.activo;
  if not found then
    raise exception 'grupo_invalido' using errcode = '22023';
  end if;
  if public.estudiantes_nivel_grupo(p_grupo_id) < 3 then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  if v_g.experiencia = 'the_living_room' then
    raise exception 'representante_no_aplica' using errcode = '22023';
  end if;
  if not exists (select 1 from public.estudiantes_grupo_miembros m
                  where m.grupo_id = p_grupo_id and m.persona_id = p_persona_id and m.activo) then
    raise exception 'persona_invalida' using errcode = '22023';
  end if;

  -- The representante: same shape and validation as estudiantes_visitante_crear.
  if p_representante is null or jsonb_typeof(p_representante) <> 'object' then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  v_rep_tipo := coalesce(public.ninos_texto(p_representante, 'tipo'), 'padre');
  if v_rep_tipo not in ('padre', 'tutor', 'abuelo', 'tio', 'hermano', 'otro_familiar') then
    raise exception 'tipo_representante_invalido' using errcode = '22023';
  end if;
  if public.ninos_texto(p_representante, 'persona_id') is not null then
    begin
      v_rep_id := public.ninos_texto(p_representante, 'persona_id')::uuid;
    exception
      when invalid_text_representation then
        raise exception 'datos_invalidos' using errcode = '22023';
    end;
    if not exists (select 1 from public.usuarios u where u.id = v_rep_id) then
      raise exception 'representante_no_encontrado' using errcode = '22023';
    end if;
  else
    v_rep_nombre := public.ninos_texto(p_representante, 'nombre');
    v_rep_apellido := coalesce(public.ninos_texto(p_representante, 'apellido'), '');
    v_rep_telefono := public.ninos_texto(p_representante, 'telefono');
    v_rep_cedula := public.ninos_texto(p_representante, 'cedula');
    v_rep_genero := public.ninos_texto(p_representante, 'genero');
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

  -- One change at a time per student.
  perform 1 from public.usuarios u where u.id = p_persona_id for no key update;

  -- Reuse before creating (estudiantes_visitante_crear): cédula in the whole
  -- church, then teléfono + nombre together in the group's campus.
  if v_rep_id is null and v_rep_cedula is not null then
    select u.id into v_rep_id
      from public.usuarios u
     where u.cedula = public.normalizar_cedula_ve(v_rep_cedula)
        or public.normalizar_cedula_ve(u.cedula) = public.normalizar_cedula_ve(v_rep_cedula)
     order by (u.cedula = public.normalizar_cedula_ve(v_rep_cedula)) desc
     limit 1;
  end if;
  if v_rep_id is null and v_rep_nombre is not null then
    select c.persona_id into v_rep_id
      from public.estudiantes_coincidencias(v_g.campus_id, null, v_rep_telefono, v_rep_nombre, v_rep_apellido) c
     where c.coincide @> array['nombre', 'telefono']
     order by (c.persona_id = p_persona_id), c.persona_id
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
    v_creado := true;
  end if;

  if v_rep_id = p_persona_id then
    raise exception 'representante_invalido' using errcode = '22023';
  end if;

  -- Any relation of the pair other than a representative link is refused.
  if exists (
    select 1 from public.relaciones_usuarios r
     where ((r.usuario1_id = p_persona_id and r.usuario2_id = v_rep_id)
            or (r.usuario1_id = v_rep_id and r.usuario2_id = p_persona_id))
       and not ((r.usuario1_id = p_persona_id
                 and r.tipo_relacion in ('padre', 'tutor', 'abuelo', 'tio', 'hermano', 'otro_familiar'))
                or (r.usuario1_id = v_rep_id and r.tipo_relacion = 'hijo'))
  ) then
    raise exception 'relacion_existente' using errcode = '23505';
  end if;

  -- The principal flag (S2): a replaced pair keeps it (true when any of its
  -- rows was principal); a new pair is principal only when the student has no
  -- other principal representative link. Other rows are never modified.
  select count(*) > 0, coalesce(bool_or(r.es_principal), false)
    into v_par_existia, v_par_principal
    from public.relaciones_usuarios r
   where (r.usuario1_id = p_persona_id and r.usuario2_id = v_rep_id
          and r.tipo_relacion in ('padre', 'tutor', 'abuelo', 'tio', 'hermano', 'otro_familiar'))
      or (r.usuario1_id = v_rep_id and r.usuario2_id = p_persona_id and r.tipo_relacion = 'hijo');
  if v_par_existia then
    v_principal := v_par_principal;
  else
    v_principal := not exists (
      select 1 from public.relaciones_usuarios r
       where r.es_principal
         and ((r.usuario1_id = p_persona_id and r.usuario2_id <> v_rep_id
               and r.tipo_relacion in ('padre', 'tutor', 'abuelo', 'tio', 'hermano', 'otro_familiar'))
              or (r.usuario2_id = p_persona_id and r.usuario1_id <> v_rep_id and r.tipo_relacion = 'hijo')));
  end if;

  -- One canonical row for the pair, with the new tipo.
  delete from public.relaciones_usuarios r
   where (r.usuario1_id = p_persona_id and r.usuario2_id = v_rep_id
          and r.tipo_relacion in ('padre', 'tutor', 'abuelo', 'tio', 'hermano', 'otro_familiar'))
      or (r.usuario1_id = v_rep_id and r.usuario2_id = p_persona_id and r.tipo_relacion = 'hijo');
  insert into public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal)
  values (p_persona_id, v_rep_id, v_rep_tipo::public.enum_tipo_relacion, v_principal);

  return jsonb_build_object('representante_id', v_rep_id, 'creado', v_creado);
end;
$$;

comment on function public.estudiantes_representante_agregar(uuid, uuid, jsonb) is
  'Links a representante to an active member of a Transit / Inside Out group (S2, S3, level >= 3). '
  'p_representante: tipo (padre | tutor | abuelo | tio | hermano | otro_familiar, default padre) and persona_id, or '
  'nombre, apellido, telefono, cedula, genero (Masculino | Femenino), resolved like estudiantes_visitante_crear '
  '(cédula, then teléfono + nombre, else a new usuario of the group''s campus). Leaves one canonical row '
  '(usuario1 = student, usuario2 = representante, the new tipo). es_principal: a replaced pair keeps its flag '
  '(true when any replaced row was principal); a new pair is principal only when the student has no other '
  'principal representative link (canonical or inverse ''hijo''). Never modifies the student''s other relations '
  '(es_principal is shared with Niños). Returns {representante_id, creado}. Guards in order: sin_autoridad (no '
  'user), grupo_invalido, sin_autoridad (level < 3), representante_no_aplica, persona_invalida; then '
  'datos_invalidos, tipo_representante_invalido, representante_no_encontrado, representante_incompleto, '
  'genero_requerido, texto_muy_largo, cedula_existente, representante_invalido, relacion_existente.';

revoke all on function public.estudiantes_representante_agregar(uuid, uuid, jsonb) from public, anon;
grant execute on function public.estudiantes_representante_agregar(uuid, uuid, jsonb) to authenticated, service_role;

create or replace function public.estudiantes_representante_quitar(
  p_grupo_id uuid,
  p_persona_id uuid,
  p_representante_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_yo uuid := public.ninos_usuario_actual();
  v_g record;
begin
  if v_yo is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  select g.id, a.experiencia into v_g
    from public.estudiantes_grupos g
    join public.dream_team_equipos a on a.id = g.ambito_id
   where g.id = p_grupo_id and g.activo;
  if not found then
    raise exception 'grupo_invalido' using errcode = '22023';
  end if;
  if public.estudiantes_nivel_grupo(p_grupo_id) < 3 then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  if v_g.experiencia = 'the_living_room' then
    raise exception 'representante_no_aplica' using errcode = '22023';
  end if;
  if not exists (select 1 from public.estudiantes_grupo_miembros m
                  where m.grupo_id = p_grupo_id and m.persona_id = p_persona_id and m.activo) then
    raise exception 'persona_invalida' using errcode = '22023';
  end if;

  delete from public.relaciones_usuarios r
   where (r.usuario1_id = p_persona_id and r.usuario2_id = p_representante_id
          and r.tipo_relacion in ('padre', 'tutor', 'abuelo', 'tio', 'hermano', 'otro_familiar'))
      or (r.usuario1_id = p_representante_id and r.usuario2_id = p_persona_id and r.tipo_relacion = 'hijo');
  return found;
end;
$$;

comment on function public.estudiantes_representante_quitar(uuid, uuid, uuid) is
  'Removes the representative links between an active member of a Transit / Inside Out group and a representante '
  '(S2, S3, level >= 3): canonical rows (usuario1 = student) of the six representative types and inverse ''hijo'' '
  'rows. Never deletes nor edits a usuario, nor a relation where the student is the parent. True when something '
  'was deleted, false otherwise. Guards in order: sin_autoridad (no user), grupo_invalido, sin_autoridad '
  '(level < 3), representante_no_aplica, persona_invalida.';

revoke all on function public.estudiantes_representante_quitar(uuid, uuid, uuid) from public, anon;
grant execute on function public.estudiantes_representante_quitar(uuid, uuid, uuid) to authenticated, service_role;
