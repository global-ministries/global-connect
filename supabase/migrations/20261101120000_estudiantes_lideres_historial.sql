-- noqa: insert-into
-- Estudiantes, Phase B — C6a leader history per group
-- (odd/tasks/estudiantes-fase-b.md, C6a; L29).
--
-- What:
--   1. estudiantes_grupo_lideres holds periods instead of the current set:
--      id (new primary key), desde, hasta (NULL while the period is current)
--      and cerrado_por (who closed it). The rows already there become current
--      periods (desde = created_at). The old primary key (grupo_id,
--      servicio_id) becomes a partial unique index over current periods, so
--      a former leader may lead the same group again in a new period.
--   2. estudiantes_grupo_lideres_validar checks the leader rule (an active
--      lider / entrenador / director de grupo servicio of the group's
--      sub-área) only on INSERT. An UPDATE may only close a period (hasta,
--      cerrado_por) or let the usuario foreign keys set NULL; it never moves
--      a period to another group or servicio, nor reopens it. Closing never
--      fails because the servicio was paused or retired later.
--   3. estudiantes_grupo_lideres_fijar keeps its signature, authority,
--      validation and return value (how many lead), but closes the periods of
--      the leaders it removes (hasta = now(), cerrado_por = caller) instead of
--      deleting them, and opens a period for each new leader.
--   4. Every reader of estudiantes_grupo_lideres counts only current periods
--      (hasta is null). Re-created verbatim from their latest definition plus
--      that filter:
--        estudiantes_nivel_grupo       (20261029100000)
--        estudiantes_mis_grupos        (20261029100100)
--        estudiantes_en_vivo           (20261029100100)
--        estudiantes_acceso            (20261101100000)
--        obtener_asistencia_persona    (Usuarios; patched in place, see below)
--   5. estudiantes_grupo_lideres_historial(grupo): every period of the group
--      (servicio, persona, nombre, apellido, rol, desde, hasta and who closed
--      it), current first, then past ones newest first. Level >= 1 on the
--      group; an inactive group only at level 3.
--
-- Why: L29 — the leader of a group must be changeable at any time without
-- losing who led it before. estudiantes_grupo_lideres_fijar deleted the row of
-- every removed leader.
--
-- Blast radius: one table altered (three columns, a new primary key, a
-- partial unique index, an index and a check); the existing rows keep their
-- meaning as current periods. Six functions re-created with the same
-- signature and grants, one new read-only function. Readers that ignored the
-- table's history see the same rows they saw before (no closed period exists
-- until fijar runs).
--
-- Rollback (closed periods are lost; only while no history matters):
--   delete from public.estudiantes_grupo_lideres where hasta is not null;
--   drop function if exists public.estudiantes_grupo_lideres_historial(uuid);
--   re-run the previous definitions of the six functions above from their
--   migrations, then:
--   drop index if exists public.estudiantes_grupo_lideres_actual_uniq;
--   drop index if exists public.estudiantes_grupo_lideres_grupo_desde_idx;
--   alter table public.estudiantes_grupo_lideres
--     drop constraint estudiantes_grupo_lideres_pkey,
--     drop constraint estudiantes_grupo_lideres_periodo,
--     add primary key (grupo_id, servicio_id),
--     drop column cerrado_por, drop column hasta, drop column desde, drop column id;

-- ── 1. periods ───────────────────────────────────────────────────────

alter table public.estudiantes_grupo_lideres
  add column id uuid not null default gen_random_uuid(),
  add column desde timestamptz,
  add column hasta timestamptz,
  add column cerrado_por uuid references public.usuarios(id) on delete set null;

-- The leaders already assigned lead since they were assigned.
update public.estudiantes_grupo_lideres gl
   set desde = gl.created_at
 where gl.desde is null;

alter table public.estudiantes_grupo_lideres
  alter column desde set default now(),
  alter column desde set not null,
  drop constraint estudiantes_grupo_lideres_pkey,
  add constraint estudiantes_grupo_lideres_pkey primary key (id),
  add constraint estudiantes_grupo_lideres_periodo check (hasta is null or hasta >= desde);

-- A servicio leads a group at most once at a time.
create unique index estudiantes_grupo_lideres_actual_uniq
  on public.estudiantes_grupo_lideres (grupo_id, servicio_id)
  where hasta is null;

-- The history of a group, and the cascade from estudiantes_grupos.
create index estudiantes_grupo_lideres_grupo_desde_idx
  on public.estudiantes_grupo_lideres (grupo_id, desde desc);

comment on table public.estudiantes_grupo_lideres is
  'Leadership periods of a group: an active servicio of the group''s sub-área with rol lider, entrenador or director '
  'de grupo leads it from desde until hasta (NULL while current; cerrado_por closed it). At most one current period '
  'per group and servicio.';
comment on column public.estudiantes_grupo_lideres.desde is 'When the period started.';
comment on column public.estudiantes_grupo_lideres.hasta is 'When the period ended; NULL while the servicio leads the group.';
comment on column public.estudiantes_grupo_lideres.cerrado_por is 'Who ended the period (estudiantes_grupo_lideres_fijar).';

-- The leader rule holds when a period opens. Afterwards a period only closes.
create or replace function public.estudiantes_grupo_lideres_validar()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.grupo_id is distinct from old.grupo_id
       or new.servicio_id is distinct from old.servicio_id
       or new.desde is distinct from old.desde
       or (old.hasta is not null and new.hasta is distinct from old.hasta) then
      raise exception 'periodo_invalido' using errcode = '22023';
    end if;
    return new;
  end if;
  if not exists (
    select 1
      from public.dream_team_servicios s
      join public.dream_team_roles r on r.id = s.rol_id
      join public.estudiantes_grupos g on g.id = new.grupo_id
     where s.id = new.servicio_id
       and s.estado = 'activo'
       and s.equipo_id = g.subarea_id
       and public.dream_team_normalizar_etiqueta(r.label) in ('lider', 'entrenador', 'director de grupo')
  ) then
    raise exception 'servicio_invalido' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.estudiantes_grupo_lideres_validar() from public;
revoke all on function public.estudiantes_grupo_lideres_validar() from anon;
revoke all on function public.estudiantes_grupo_lideres_validar() from authenticated;

-- ── 2. readers: current periods only ─────────────────────────────────

-- estudiantes_nivel_grupo (20261029100000_estudiantes_asistencia_modelo.sql).
-- The caller's level on a group: its sub-área level in the group's campus, or 1 when an active
-- servicio of the caller in the sub-área leads the group. 0 for no group and
-- for a group of a campus the caller does not see.
create or replace function public.estudiantes_nivel_grupo(p_grupo_id uuid)
returns smallint
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce((
    select greatest(
             public.estudiantes_nivel_en_campus(g.subarea_id, g.campus_id),
             case when exists (
               select 1
                 from public.estudiantes_grupo_lideres gl
                 join public.dream_team_servicios s on s.id = gl.servicio_id
                 join public.usuarios u on u.id = s.persona_id
                where gl.grupo_id = g.id and gl.hasta is null
                  and s.equipo_id = g.subarea_id
                  and s.estado = 'activo'
                  and u.auth_id = auth.uid()
             ) then 1 else 0 end)
      from public.estudiantes_grupos g
     where g.id = p_grupo_id
       and auth.uid() is not null
       and public.estudiantes_campus_visible(g.campus_id)
  ), 0)::smallint
$$;

comment on function public.estudiantes_nivel_grupo(uuid) is
  'Caller''s level on a group (Q3): estudiantes_nivel_en_campus of its sub-área and campus, or 1 as an active leader of it; 0 otherwise '
  'and 0 when its campus is not visible to the caller (estudiantes_campus_visible). '
  '>= 1 sees the roster with contacts and marks; >= 2 sees the live view; >= 3 manages the group.';

revoke all on function public.estudiantes_nivel_grupo(uuid) from public;
revoke all on function public.estudiantes_nivel_grupo(uuid) from anon;
revoke all on function public.estudiantes_nivel_grupo(uuid) from authenticated;
grant execute on function public.estudiantes_nivel_grupo(uuid) to service_role;

-- estudiantes_mis_grupos (20261029100100_estudiantes_asistencia_rpcs.sql).
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
            where gl.grupo_id = g.id and gl.hasta is null and sv.estado = 'activo'), '[]'::jsonb)
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
                      where gl.grupo_id = g.id and gl.hasta is null and sv.estado = 'activo' and sv.equipo_id = g.subarea_id
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

-- estudiantes_en_vivo (20261029100100_estudiantes_asistencia_rpcs.sql).
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
  select t.campus_id into v_campus from public.dream_team_turnos t where t.id = p_turno_id;
  if v_campus is null then
    raise exception 'turno_invalido' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.dream_team_equipos s
     where s.parent_equipo_id = p_ambito_id and public.estudiantes_es_subarea_grupos(s.label)
       and public.estudiantes_nivel_en_campus(s.id, v_campus) >= 2
  ) then
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
              where gl.grupo_id = gr.id and gl.hasta is null and sv.estado = 'activo'), '[]'::jsonb),
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
         and public.estudiantes_nivel_en_campus(g.subarea_id, v_campus) >= 2
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
         and public.estudiantes_nivel_en_campus(g.subarea_id, v_campus) >= 2
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

-- estudiantes_acceso (20261101100000_estudiantes_vivo_acceso.sql).
create or replace function public.estudiantes_acceso()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  with mis_campus as (
    select c.id
      from public.campus c
     where c.activo and public.estudiantes_campus_visible(c.id)
  ),
  subareas as (
    select s.id, a.experiencia, m.id as campus_id,
           public.estudiantes_nivel_en_campus(s.id, m.id) as nivel
      from public.dream_team_equipos s
      join public.dream_team_equipos a on a.id = s.parent_equipo_id
      cross join mis_campus m
     where s.activo and a.activo
       and a.experiencia in ('estudiantes', 'the_living_room')
       and public.estudiantes_es_subarea_grupos(s.label)
  ),
  grupos as (
    select g.id, public.estudiantes_nivel_grupo(g.id) as nivel,
           exists (select 1
                     from public.estudiantes_grupo_lideres gl
                     join public.dream_team_servicios sv on sv.id = gl.servicio_id
                     join public.usuarios u on u.id = sv.persona_id
                    where gl.grupo_id = g.id and gl.hasta is null and sv.estado = 'activo' and sv.equipo_id = g.subarea_id
                      and u.auth_id = auth.uid()) as lider
      from public.estudiantes_grupos g
     where g.activo
  )
  select jsonb_build_object(
    'grupos', (select count(*) from grupos where nivel >= 1),
    'lidera', exists (select 1 from grupos where lider and nivel >= 1),
    'vivo', exists (select 1 from subareas where experiencia = 'estudiantes' and nivel >= 2),
    'gestiona', exists (select 1 from subareas where nivel >= 3))
   where auth.uid() is not null
$$;

comment on function public.estudiantes_acceso() is
  'The caller''s Estudiantes menu facts: grupos (active groups they see), lidera (they lead one), vivo (live view of '
  'some Transit / Inside Out ámbito, sub-área level >= 2) and gestiona (level 3 somewhere). NULL without a session.';

revoke all on function public.estudiantes_acceso() from public, anon;
grant execute on function public.estudiantes_acceso() to authenticated, service_role;

-- obtener_asistencia_persona (Usuarios area, owned by another line of work):
-- a person is Líder of an Estudiantes group only while their period is
-- current. The function is patched in place instead of re-created, so whatever
-- its latest definition is (20261030100000_usuarios_lista_v2.sql and any later
-- change) is kept: only `and gl.hasta is null` is added to its `lidera` CTE.
-- It raises when that CTE is not found exactly once, rather than guessing.
do $patch$
declare
  v_def text := pg_get_functiondef('public.obtener_asistencia_persona(uuid, uuid, date, date)'::regprocedure);
  v_old constant text := E'     WHERE sv.persona_id = p_usuario_id AND sv.estado = \'activo\'\n';
  v_new constant text := E'     WHERE sv.persona_id = p_usuario_id AND sv.estado = \'activo\'\n       AND gl.hasta IS NULL\n';
begin
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'obtener_asistencia_persona: expected one lidera filter to patch';
  end if;
  execute replace(v_def, v_old, v_new);
end
$patch$;

-- ── 3. setting the leaders closes periods ────────────────────────────

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

  -- The group row lock above serializes concurrent calls on the group.
  update public.estudiantes_grupo_lideres gl
     set hasta = now(), cerrado_por = v_yo
   where gl.grupo_id = p_grupo_id and gl.hasta is null and gl.servicio_id <> all (v_ids);
  insert into public.estudiantes_grupo_lideres (grupo_id, servicio_id, desde, created_by)
  select p_grupo_id, x, now(), v_yo from unnest(v_ids) as x
   where not exists (select 1 from public.estudiantes_grupo_lideres gl
                      where gl.grupo_id = p_grupo_id and gl.servicio_id = x and gl.hasta is null);
  return cardinality(v_ids);
end;
$$;

comment on function public.estudiantes_grupo_lideres_fijar(uuid, uuid[]) is
  'Sets the current leaders of a group to p_servicio_ids (level >= 3 on its sub-área); an empty array clears them. '
  'A removed leader''s period is closed (hasta = now(), cerrado_por = caller), never deleted; a new or returning '
  'leader opens a new period. Each id must be an active lider / entrenador / director de grupo servicio of the '
  'sub-área, of a person of the group''s campus. Returns how many lead. '
  'Errors: sin_autoridad, servicios_invalidos, servicio_invalido.';

revoke all on function public.estudiantes_grupo_lideres_fijar(uuid, uuid[]) from public, anon;
grant execute on function public.estudiantes_grupo_lideres_fijar(uuid, uuid[]) to authenticated, service_role;

-- ── 4. history ───────────────────────────────────────────────────────

create or replace function public.estudiantes_grupo_lideres_historial(p_grupo_id uuid)
returns table (
  servicio_id uuid,
  persona_id uuid,
  nombre text,
  apellido text,
  rol text,
  desde timestamptz,
  hasta timestamptz,
  cerrado_por_nombre text
)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_activo boolean;
  v_nivel smallint;
begin
  if public.ninos_usuario_actual() is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  select g.activo into v_activo from public.estudiantes_grupos g where g.id = p_grupo_id;
  if not found then
    raise exception 'grupo_invalido' using errcode = '22023';
  end if;
  v_nivel := public.estudiantes_nivel_grupo(p_grupo_id);
  if v_nivel < 1 or (not v_activo and v_nivel < 3) then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;

  return query
  select gl.servicio_id, u.id, u.nombre, u.apellido, r.label, gl.desde, gl.hasta,
         nullif(btrim(coalesce(c.nombre, '') || ' ' || coalesce(c.apellido, '')), '')
    from public.estudiantes_grupo_lideres gl
    join public.dream_team_servicios sv on sv.id = gl.servicio_id
    join public.usuarios u on u.id = sv.persona_id
    join public.dream_team_roles r on r.id = sv.rol_id
    left join public.usuarios c on c.id = gl.cerrado_por
   where gl.grupo_id = p_grupo_id
   order by gl.hasta is not null, gl.hasta desc, gl.desde desc, u.apellido, u.nombre, gl.id;
end;
$$;

comment on function public.estudiantes_grupo_lideres_historial(uuid) is
  'Leadership periods of a group (L29): servicio, persona, nombre, apellido, rol, desde, hasta (NULL while current) '
  'and who closed it; current periods first, then past ones by hasta, newest first. Level >= 1 on the group; an '
  'inactive group only at level 3. Errors: sin_autoridad, grupo_invalido.';

revoke all on function public.estudiantes_grupo_lideres_historial(uuid) from public, anon;
grant execute on function public.estudiantes_grupo_lideres_historial(uuid) to authenticated, service_role;
