-- T1 (odd/tasks/tlr-calendario-servicios.md, S1–S6, A1) — dated service
-- shifts.
--
-- What:
--   1. dream_team_turnos.tipo: 'semanal' (every week on dia_semana, as today;
--      the default, so every existing turno stays weekly) or 'fechas' (only
--      on its planned dates). dia_semana stays NOT NULL: on a dated turno it
--      is a reference only and no rule reads it.
--   2. dream_team_turno_fechas: the planned dates of a dated turno (fecha,
--      hora that overrides the turno's when set, nota up to 200 characters),
--      one row per turno and fecha.
--   3. dream_team_turno_fecha_servidores: who serves on each planned date,
--      chosen among the servicios assigned to the turno
--      (dream_team_servicio_turnos).
--   4. dream_team_turno_activo_en(turno, fecha): whether the turno happens
--      that day.
--   5. Write path (A1): dream_team_turno_fecha_guardar / _borrar and
--      dream_team_turno_fecha_servidores_fijar, gated by
--      dream_team_puede_gestionar_turno. The tables have no write privilege
--      for authenticated.
--   6. Niños ignores dated turnos (S5): the functions that list Niños
--      services, accept a turno for the roster, marking or check-in, freeze
--      or report rosters, or open the pre-check window now require
--      tipo = 'semanal'. Same signatures, outputs, errors and grants.
--
-- Why: The Living Room has no fixed day (one or two Sundays a month); the
-- coordinator plans its dates ahead and picks who serves on each one, with
-- "Todos" in one click (S1, S2). Weekly turnos (Transit 9:00, Inside Out
-- 11:00) do not change (S6).
--
-- How:
--   - A dated turno takes no biweekly assignment: frecuencia is a weekly
--     rhythm and has no meaning on planned dates. A trigger on
--     dream_team_servicio_turnos refuses it, and a trigger on
--     dream_team_turnos refuses turning a weekly turno with biweekly
--     assignments into a dated one. Both lock the turno row (FOR SHARE vs the
--     UPDATE) so the two checks cannot race.
--   - Only a dated turno takes planned dates (trigger on
--     dream_team_turno_fechas). Turning a dated turno back into a weekly one
--     keeps its assignments and its planned dates (S3); the dates stop
--     counting (dream_team_turno_activo_en reads dia_semana again) and come
--     back if the turno is dated again.
--   - dream_team_turno_fecha_servidores carries turno_id and two composite
--     foreign keys, both ON DELETE CASCADE: (turno_fecha_id, turno_id) to the
--     planned date and (servicio_id, turno_id) to the assignment. A row can
--     only name a servicio assigned to that very turno, and removing the
--     assignment by any path — a direct delete, the prune triggers
--     (dream_team_equipo_turnos_podar, dream_team_turnos_podar_inactivo,
--     dream_team_servicios_podar_turnos,
--     dream_team_usuario_campus_podar_turnos) or deleting the servicio —
--     removes its per-date rows. Those functions are not touched: they keep
--     deleting assignments and the cascade does the rest.
--   - dream_team_turno_activo_en works at turno level: weekly → active and
--     the weekday matches; dated → active and the date is planned. The
--     biweekly frequency belongs to an assignment, not to the turno, so it is
--     not read here; whether a given volunteer serves that day stays
--     dream_team_turno_sirve_en (weekly turnos) or a row in
--     dream_team_turno_fecha_servidores (dated turnos).
--   - Authority (A1), dream_team_puede_gestionar_turno(turno): whoever may
--     write dream_team_turnos (dream_team.org.manage, the same flat gate as
--     its policies), or, for a node that lists the turno in
--     dream_team_equipo_turnos, whoever holds dream_team.coordinate,
--     dream_team.director.coordinate or dream_team.direct on that node or an
--     ancestor, or has it in dream_team_equipos_registrables() (admin,
--     pastor, the Atención al Voluntario coordinator of the area: the same
--     reach that assigns shifts since 20261024100000). A turno no node lists
--     is managed by structure admins only.
--   - RLS: planned dates are readable by every authenticated user, like
--     dream_team_turnos; who serves on a date is readable when the servicio
--     is (the dream_team_servicio_turnos rule). Writes go only through the
--     SECURITY DEFINER functions, search_path '', EXECUTE revoked from
--     PUBLIC and anon, granted to authenticated. The trigger functions are
--     executable by nobody but the trigger machinery.
--   - Niños functions replaced (CREATE OR REPLACE, body copied from their
--     latest migration with only the tipo filter added):
--       ninos_precheck_en_ventana     (20261012160000) — also gates
--         ninos_precheck_avisar, ninos_mis_prechecks,
--         ninos_preregistro_servicios_hoy and ninos_preregistro_avisar;
--       ninos_voluntarios_turnos      (20261010130000) — service list;
--       ninos_voluntarios_congelar    (20261012180000) — also covers
--         ninos_voluntarios_congelar_pendientes and the report's freeze;
--       ninos_voluntarios_planilla    (20261012180000);
--       ninos_voluntarios_marcar      (20261012180100);
--       ninos_reporte_voluntarios     (20261012180000) — freeze loop and
--         the dates it reports;
--       ninos_checkin                 (20261008140000) — no check-in, so no
--         check-out, room list, occupancy or attendance report ever holds a
--         dated turno.
--
--   - Which nodes serve a dated turno: only those that list it in
--     dream_team_equipo_turnos, directly or through an ancestor, with the
--     rule of today applied per tipo. dream_team_turnos_del_equipo
--     (CREATE OR REPLACE, same signature and grants) now finds two nearest
--     restricting ancestors: one counting only weekly listings (decides the
--     weekly turnos exactly as before; with none, every active weekly turno
--     of the campus) and one counting only dated listings (decides the dated
--     turnos; with none, no dated turno). Listing a dated turno therefore
--     never takes weekly turnos away from a node, and a node with no
--     restriction never serves a dated one (S5: Niños does not see it; other
--     areas cannot be assigned it). The assignment validator
--     (dream_team_servicio_turnos_validar) and the prune triggers call this
--     function, so they follow without being replaced.
--   - Changing tipo (dream_team_turnos_tipo_cambiado, after update): a turno
--     becoming dated while a volunteer of a node that does not list it holds
--     it is refused (check_violation); otherwise the assignments of the
--     campus that stop fitting are pruned, as when listings change
--     (dream_team_equipo_turnos_podar). Going back to weekly keeps the
--     turno's own assignments (S3).
--
-- Blast radius: one column with a constant default (no rewrite, every
-- existing turno reads 'semanal'), two new empty tables, six new functions,
-- four new triggers. No existing row is inserted, updated or deleted by the
-- migration. Today every listing in dream_team_equipo_turnos is of a weekly
-- turno, so dream_team_turnos_del_equipo returns exactly what it returned
-- before for every node, and for weekly turnos every replaced Niños function
-- returns exactly what it returned before.
--
-- Rollback:
--   re-apply the Niños functions from the migrations listed above (latest
--   body of each) and dream_team_turnos_del_equipo from
--   20261005100000_dream_team_turnos.sql;
--   drop trigger if exists dream_team_turnos_tipo_cambiado on public.dream_team_turnos;
--   drop function if exists public.dream_team_turnos_tipo_cambiado();
--   drop function if exists public.dream_team_turno_fecha_servidores_fijar(uuid, uuid[]);
--   drop function if exists public.dream_team_turno_fecha_borrar(uuid);
--   drop function if exists public.dream_team_turno_fecha_guardar(uuid, date, time, text, uuid);
--   drop function if exists public.dream_team_puede_gestionar_turno(uuid);
--   drop function if exists public.dream_team_turno_activo_en(uuid, date);
--   drop table if exists public.dream_team_turno_fecha_servidores;
--   drop table if exists public.dream_team_turno_fechas;
--   drop function if exists public.dream_team_turno_fechas_validar();
--   drop trigger if exists dream_team_servicio_turnos_validar_tipo on public.dream_team_servicio_turnos;
--   drop function if exists public.dream_team_servicio_turnos_validar_tipo();
--   drop trigger if exists dream_team_turnos_validar_tipo on public.dream_team_turnos;
--   drop function if exists public.dream_team_turnos_validar_tipo();
--   alter table public.dream_team_turnos drop constraint dream_team_turnos_tipo_check;
--   then remove the tipo column of dream_team_turnos (only once no turno is
--   'fechas', or its dates and volunteers are lost).

-- ── 1. tipo ──────────────────────────────────────────────────────────

alter table public.dream_team_turnos
  add column tipo text not null default 'semanal';

alter table public.dream_team_turnos
  add constraint dream_team_turnos_tipo_check check (tipo in ('semanal', 'fechas'));

comment on column public.dream_team_turnos.tipo is
  'semanal (every week on dia_semana) or fechas (only on its planned dates in dream_team_turno_fechas; dia_semana is a reference).';

-- A weekly turno with biweekly assignments cannot become dated.
create or replace function public.dream_team_turnos_validar_tipo()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if exists (
    select 1 from public.dream_team_servicio_turnos st
     where st.turno_id = new.id and st.frecuencia <> 'semanal'
  ) then
    raise exception 'El turno tiene asignaciones quincenales: páselas a semanal antes de convertirlo en turno por fechas'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.dream_team_turnos_validar_tipo() from public;
revoke all on function public.dream_team_turnos_validar_tipo() from anon;
revoke all on function public.dream_team_turnos_validar_tipo() from authenticated;

create trigger dream_team_turnos_validar_tipo
  before update of tipo on public.dream_team_turnos
  for each row
  when (new.tipo = 'fechas' and old.tipo is distinct from 'fechas')
  execute function public.dream_team_turnos_validar_tipo();

-- A dated turno takes no biweekly assignment.
create or replace function public.dream_team_servicio_turnos_validar_tipo()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_tipo text;
begin
  -- The lock waits for a concurrent change of tipo on the same turno.
  select t.tipo into v_tipo from public.dream_team_turnos t where t.id = new.turno_id for share;
  if v_tipo = 'fechas' then
    raise exception 'Un turno por fechas no admite frecuencia quincenal'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.dream_team_servicio_turnos_validar_tipo() from public;
revoke all on function public.dream_team_servicio_turnos_validar_tipo() from anon;
revoke all on function public.dream_team_servicio_turnos_validar_tipo() from authenticated;

create trigger dream_team_servicio_turnos_validar_tipo
  before insert or update of turno_id, frecuencia, fecha_ancla on public.dream_team_servicio_turnos
  for each row
  when (new.frecuencia is distinct from 'semanal')
  execute function public.dream_team_servicio_turnos_validar_tipo();

-- A dated turno is served only by the nodes that list it (directly or by an
-- ancestor). Each tipo has its own nearest restricting ancestor; the weekly
-- one is the rule of 20261005100000.
create or replace function public.dream_team_turnos_del_equipo(p_equipo_id uuid, p_campus_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path to ''
as $$
  with recursive ancestros as (
    select e.id, e.parent_equipo_id, 1 as profundidad
    from public.dream_team_equipos e
    where e.id = p_equipo_id
    union all
    select p.id, p.parent_equipo_id, a.profundidad + 1
    from public.dream_team_equipos p
    join ancestros a on p.id = a.parent_equipo_id
    where a.profundidad < 16
  ),
  restriccion as (
    select a.id as equipo_id
    from ancestros a
    where exists (
      select 1
      from public.dream_team_equipo_turnos et
      join public.dream_team_turnos t on t.id = et.turno_id
      where et.equipo_id = a.id and t.campus_id = p_campus_id and t.tipo = 'semanal'
    )
    order by a.profundidad
    limit 1
  ),
  restriccion_fechas as (
    select a.id as equipo_id
    from ancestros a
    where exists (
      select 1
      from public.dream_team_equipo_turnos et
      join public.dream_team_turnos t on t.id = et.turno_id
      where et.equipo_id = a.id and t.campus_id = p_campus_id and t.tipo = 'fechas'
    )
    order by a.profundidad
    limit 1
  )
  select t.id
  from public.dream_team_turnos t
  where t.campus_id = p_campus_id
    and t.activo
    and case t.tipo
          when 'fechas' then exists (
            select 1
            from restriccion_fechas r
            join public.dream_team_equipo_turnos et on et.equipo_id = r.equipo_id
            where et.turno_id = t.id
          )
          else (
            not exists (select 1 from restriccion)
            or exists (
              select 1
              from restriccion r
              join public.dream_team_equipo_turnos et on et.equipo_id = r.equipo_id
              where et.turno_id = t.id
            )
          )
        end
  order by t.orden, t.hora
$$;

comment on function public.dream_team_turnos_del_equipo(uuid, uuid) is
  'Active shift ids of a campus that a Dream Team node serves in, after inheritance (D12). Dated shifts only where listed (node or ancestor).';

revoke all on function public.dream_team_turnos_del_equipo(uuid, uuid) from public;
revoke all on function public.dream_team_turnos_del_equipo(uuid, uuid) from anon;
grant execute on function public.dream_team_turnos_del_equipo(uuid, uuid) to authenticated;
grant execute on function public.dream_team_turnos_del_equipo(uuid, uuid) to service_role;

-- After tipo changes: refuse a turno becoming dated while a volunteer of a
-- node that does not list it holds it; then prune the campus's assignments
-- that stop fitting (a listing that changed tipo moves a node's restriction).
create or replace function public.dream_team_turnos_tipo_cambiado()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.tipo = 'fechas' and exists (
    select 1
      from public.dream_team_servicio_turnos st
      join public.dream_team_servicios s on s.id = st.servicio_id
     where st.turno_id = new.id
       and not exists (
         select 1 from public.dream_team_turnos_del_equipo(s.equipo_id, new.campus_id) as x
          where x = new.id
       )
  ) then
    raise exception 'El turno tiene voluntarios de equipos que no lo listan: un turno por fechas sólo lo sirven los equipos que lo tienen en su lista'
      using errcode = 'check_violation';
  end if;

  delete from public.dream_team_servicio_turnos st
   using public.dream_team_servicios s, public.dream_team_turnos t
   where st.servicio_id = s.id
     and t.id = st.turno_id
     and t.campus_id = new.campus_id
     and not exists (
       select 1 from public.dream_team_turnos_del_equipo(s.equipo_id, t.campus_id) as x
        where x = st.turno_id
     );
  return null;
end;
$$;

revoke all on function public.dream_team_turnos_tipo_cambiado() from public;
revoke all on function public.dream_team_turnos_tipo_cambiado() from anon;
revoke all on function public.dream_team_turnos_tipo_cambiado() from authenticated;

create trigger dream_team_turnos_tipo_cambiado
  after update of tipo on public.dream_team_turnos
  for each row
  when (old.tipo is distinct from new.tipo)
  execute function public.dream_team_turnos_tipo_cambiado();

-- ── 2. planned dates ─────────────────────────────────────────────────

create table public.dream_team_turno_fechas (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references public.dream_team_turnos(id) on delete cascade,
  fecha date not null,
  -- Overrides dream_team_turnos.hora on this date when set.
  hora time,
  nota text check (nota is null or length(nota) <= 200),
  created_at timestamptz not null default now(),
  unique (turno_id, fecha),
  -- Target of the composite foreign key of dream_team_turno_fecha_servidores.
  unique (id, turno_id)
);

comment on table public.dream_team_turno_fechas is
  'Planned dates of a dated turno (tipo fechas): fecha, optional hora overriding the turno''s, optional nota.';

alter table public.dream_team_turno_fechas enable row level security;

create policy dream_team_turno_fechas_select on public.dream_team_turno_fechas
  for select to authenticated
  using (true); -- noqa: rls-using-true

revoke all on public.dream_team_turno_fechas from public;
revoke all on public.dream_team_turno_fechas from anon;
revoke all on public.dream_team_turno_fechas from authenticated;
grant select on public.dream_team_turno_fechas to authenticated;
grant select, insert, update, delete on public.dream_team_turno_fechas to service_role;

-- Only a dated turno has planned dates.
create or replace function public.dream_team_turno_fechas_validar()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_tipo text;
begin
  select t.tipo into v_tipo from public.dream_team_turnos t where t.id = new.turno_id for share;
  if v_tipo is distinct from 'fechas' then
    raise exception 'Sólo un turno por fechas tiene fechas planificadas'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.dream_team_turno_fechas_validar() from public;
revoke all on function public.dream_team_turno_fechas_validar() from anon;
revoke all on function public.dream_team_turno_fechas_validar() from authenticated;

create trigger dream_team_turno_fechas_validar
  before insert or update of turno_id on public.dream_team_turno_fechas
  for each row execute function public.dream_team_turno_fechas_validar();

-- ── 3. who serves on each date ───────────────────────────────────────

create table public.dream_team_turno_fecha_servidores (
  turno_fecha_id uuid not null,
  turno_id uuid not null,
  servicio_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (turno_fecha_id, servicio_id),
  foreign key (turno_fecha_id, turno_id)
    references public.dream_team_turno_fechas (id, turno_id) on delete cascade,
  -- Only a servicio assigned to the turno; removing the assignment removes the row.
  foreign key (servicio_id, turno_id)
    references public.dream_team_servicio_turnos (servicio_id, turno_id) on delete cascade
);

comment on table public.dream_team_turno_fecha_servidores is
  'Servicios assigned to a dated turno that serve on one of its planned dates. Written by dream_team_turno_fecha_servidores_fijar.';

create index dream_team_turno_fecha_servidores_asignacion_idx
  on public.dream_team_turno_fecha_servidores (servicio_id, turno_id);

alter table public.dream_team_turno_fecha_servidores enable row level security;

create policy dream_team_turno_fecha_servidores_select on public.dream_team_turno_fecha_servidores
  for select to authenticated
  using (exists (select 1 from public.dream_team_servicios s where s.id = servicio_id));

revoke all on public.dream_team_turno_fecha_servidores from public;
revoke all on public.dream_team_turno_fecha_servidores from anon;
revoke all on public.dream_team_turno_fecha_servidores from authenticated;
grant select on public.dream_team_turno_fecha_servidores to authenticated;
grant select, insert, update, delete on public.dream_team_turno_fecha_servidores to service_role;

-- ── 4. does a turno happen on a date ─────────────────────────────────

-- Reads two tables every authenticated user may read: SECURITY INVOKER.
create or replace function public.dream_team_turno_activo_en(p_turno_id uuid, p_fecha date)
returns boolean
language sql
stable
set search_path to ''
as $$
  select exists (
    select 1
      from public.dream_team_turnos t
     where t.id = p_turno_id
       and t.activo
       and p_fecha is not null
       and case t.tipo
             when 'semanal' then extract(dow from p_fecha)::int = t.dia_semana
             else exists (select 1 from public.dream_team_turno_fechas f
                           where f.turno_id = t.id and f.fecha = p_fecha)
           end
  )
$$;

comment on function public.dream_team_turno_activo_en(uuid, date) is
  'Whether an active turno happens that day: weekly on its weekday, dated on a planned date. Frequency is per assignment (dream_team_turno_sirve_en).';

revoke all on function public.dream_team_turno_activo_en(uuid, date) from public;
revoke all on function public.dream_team_turno_activo_en(uuid, date) from anon;
grant execute on function public.dream_team_turno_activo_en(uuid, date) to authenticated;
grant execute on function public.dream_team_turno_activo_en(uuid, date) to service_role;

-- ── 5. authority and write path (A1) ─────────────────────────────────

create or replace function public.dream_team_puede_gestionar_turno(p_turno_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select auth.uid() is not null
     and exists (select 1 from public.dream_team_turnos t where t.id = p_turno_id)
     and (
       public.auth_has_dream_team_capability('dream_team.org.manage')
       or exists (
         select 1
           from public.dream_team_equipo_turnos et
          where et.turno_id = p_turno_id
            and (public.auth_has_dream_team_capability_in_tree('dream_team.coordinate', et.equipo_id)
                 or public.auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', et.equipo_id)
                 or public.auth_has_dream_team_capability_in_tree('dream_team.direct', et.equipo_id)
                 or et.equipo_id in (select r.equipo_id from public.dream_team_equipos_registrables() r))
       )
     )
$$;

comment on function public.dream_team_puede_gestionar_turno(uuid) is
  'Whether the caller may plan the dates of a turno and pick who serves on each: structure admins, or the '
  'coordinator / director of a node listing the turno in dream_team_equipo_turnos or of an ancestor (A1).';

revoke all on function public.dream_team_puede_gestionar_turno(uuid) from public;
revoke all on function public.dream_team_puede_gestionar_turno(uuid) from anon;
grant execute on function public.dream_team_puede_gestionar_turno(uuid) to authenticated;
grant execute on function public.dream_team_puede_gestionar_turno(uuid) to service_role;

-- Plans a date of a dated turno, or edits one. Without p_turno_fecha_id the
-- date is added, or its hora and nota replaced when already planned. With
-- it, that planned date moves to p_fecha (its volunteers stay).
create or replace function public.dream_team_turno_fecha_guardar(
  p_turno_id uuid,
  p_fecha date,
  p_hora time default null,
  p_nota text default null,
  p_turno_fecha_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_id uuid;
begin
  perform 1 from public.dream_team_turnos t
   where t.id = p_turno_id and t.activo and t.tipo = 'fechas'
     for share;
  if not found then
    raise exception 'turno_invalido' using errcode = '22023';
  end if;
  if not public.dream_team_puede_gestionar_turno(p_turno_id) then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  if p_fecha is null then
    raise exception 'fecha_invalida' using errcode = '22023';
  end if;

  if p_turno_fecha_id is null then
    insert into public.dream_team_turno_fechas (turno_id, fecha, hora, nota) -- noqa: insert-into
    values (p_turno_id, p_fecha, p_hora, v_nota)
    on conflict (turno_id, fecha) do update
       set hora = excluded.hora, nota = excluded.nota
    returning id into v_id;
  else
    begin
      update public.dream_team_turno_fechas f
         set fecha = p_fecha, hora = p_hora, nota = v_nota
       where f.id = p_turno_fecha_id and f.turno_id = p_turno_id
      returning f.id into v_id;
    exception
      when unique_violation then
        raise exception 'fecha_duplicada' using errcode = '23505';
    end;
    if v_id is null then
      raise exception 'turno_fecha_invalida' using errcode = '22023';
    end if;
  end if;

  return v_id;
end;
$$;

comment on function public.dream_team_turno_fecha_guardar(uuid, date, time, text, uuid) is
  'Adds or edits a planned date of a dated turno; returns its id. Errors: turno_invalido, sin_autoridad, '
  'fecha_invalida, fecha_duplicada (moving onto a planned date), turno_fecha_invalida.';

revoke all on function public.dream_team_turno_fecha_guardar(uuid, date, time, text, uuid) from public;
revoke all on function public.dream_team_turno_fecha_guardar(uuid, date, time, text, uuid) from anon;
grant execute on function public.dream_team_turno_fecha_guardar(uuid, date, time, text, uuid) to authenticated;
grant execute on function public.dream_team_turno_fecha_guardar(uuid, date, time, text, uuid) to service_role;

-- Deletes a planned date and who serves on it. Allowed on a turno that went
-- back to weekly, to clean up.
create or replace function public.dream_team_turno_fecha_borrar(p_turno_fecha_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_turno uuid;
begin
  select f.turno_id into v_turno from public.dream_team_turno_fechas f where f.id = p_turno_fecha_id;
  if v_turno is null then
    raise exception 'turno_fecha_invalida' using errcode = '22023';
  end if;
  if not public.dream_team_puede_gestionar_turno(v_turno) then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  delete from public.dream_team_turno_fechas f where f.id = p_turno_fecha_id;
  return found;
end;
$$;

comment on function public.dream_team_turno_fecha_borrar(uuid) is
  'Deletes a planned date of a turno with its volunteers. Errors: turno_fecha_invalida, sin_autoridad.';

revoke all on function public.dream_team_turno_fecha_borrar(uuid) from public;
revoke all on function public.dream_team_turno_fecha_borrar(uuid) from anon;
grant execute on function public.dream_team_turno_fecha_borrar(uuid) to authenticated;
grant execute on function public.dream_team_turno_fecha_borrar(uuid) to service_role;

-- Replaces who serves on a planned date with p_servicio_ids, atomically.
-- "Todos" passes every servicio assigned to the turno; an empty array clears
-- the date. Every id must be assigned to the turno. Returns how many serve.
create or replace function public.dream_team_turno_fecha_servidores_fijar(p_turno_fecha_id uuid, p_servicio_ids uuid[])
returns integer
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_turno uuid;
  v_ids uuid[];
begin
  -- The row lock serializes two editors of the same date.
  select f.turno_id into v_turno from public.dream_team_turno_fechas f where f.id = p_turno_fecha_id for update;
  if v_turno is null then
    raise exception 'turno_fecha_invalida' using errcode = '22023';
  end if;
  perform 1 from public.dream_team_turnos t
   where t.id = v_turno and t.activo and t.tipo = 'fechas'
     for share;
  if not found then
    raise exception 'turno_invalido' using errcode = '22023';
  end if;
  if not public.dream_team_puede_gestionar_turno(v_turno) then
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
     where not exists (select 1 from public.dream_team_servicio_turnos st
                        where st.servicio_id = x and st.turno_id = v_turno)
  ) then
    raise exception 'servicio_invalido' using errcode = '22023';
  end if;

  delete from public.dream_team_turno_fecha_servidores s
   where s.turno_fecha_id = p_turno_fecha_id
     and not (s.servicio_id = any (v_ids));
  insert into public.dream_team_turno_fecha_servidores (turno_fecha_id, turno_id, servicio_id) -- noqa: insert-into
  select p_turno_fecha_id, v_turno, x from unnest(v_ids) as x
  on conflict (turno_fecha_id, servicio_id) do nothing;

  return cardinality(v_ids);
end;
$$;

comment on function public.dream_team_turno_fecha_servidores_fijar(uuid, uuid[]) is
  'Sets who serves on a planned date (servicios assigned to the turno); returns how many. Errors: '
  'turno_fecha_invalida, turno_invalido, sin_autoridad, servicios_invalidos (NULL), servicio_invalido.';

revoke all on function public.dream_team_turno_fecha_servidores_fijar(uuid, uuid[]) from public;
revoke all on function public.dream_team_turno_fecha_servidores_fijar(uuid, uuid[]) from anon;
grant execute on function public.dream_team_turno_fecha_servidores_fijar(uuid, uuid[]) to authenticated;
grant execute on function public.dream_team_turno_fecha_servidores_fijar(uuid, uuid[]) to service_role;

-- ── 6. Niños ignores dated turnos (S5) ───────────────────────────────
-- Each body is the latest one (migration named in the header) with only the
-- tipo = 'semanal' filter added; grants restated as they were.

CREATE OR REPLACE FUNCTION public.ninos_precheck_en_ventana(p_turno_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dream_team_turnos t
     WHERE t.id = p_turno_id AND t.activo AND t.tipo = 'semanal'
       AND t.dia_semana = extract(dow FROM public.ninos_hoy())::smallint
       -- 2 h before the start until the assumed end (start + 2 h), Caracas time.
       AND (now() AT TIME ZONE 'America/Caracas')
           BETWEEN public.ninos_hoy() + t.hora - interval '2 hours'
               AND public.ninos_hoy() + t.hora + interval '2 hours');
$$;
REVOKE ALL ON FUNCTION public.ninos_precheck_en_ventana(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ninos_voluntarios_turnos()
RETURNS TABLE (id uuid, nombre text, hora time, orden integer, dia_semana smallint, campus_id uuid, campus text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH servidos AS (
    SELECT DISTINCT x.turno_id
      FROM public.ninos_voluntarios_marcables(NULL) m
      CROSS JOIN LATERAL public.dream_team_turnos_del_equipo(m.equipo_id, m.campus_id) AS x(turno_id)
  )
  SELECT t.id, t.nombre, t.hora, t.orden, t.dia_semana, t.campus_id, c.nombre
    FROM servidos s
    JOIN public.dream_team_turnos t ON t.id = s.turno_id
    JOIN public.campus c ON c.id = t.campus_id
   WHERE t.tipo = 'semanal'
   ORDER BY c.nombre, t.orden, t.hora;
$$;
REVOKE ALL ON FUNCTION public.ninos_voluntarios_turnos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_voluntarios_turnos() TO authenticated;

CREATE OR REPLACE FUNCTION public.ninos_voluntarios_congelar(p_turno_id uuid, p_fecha date)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_nuevos integer;
BEGIN
  IF p_fecha IS NULL OR p_fecha >= public.ninos_hoy() OR p_fecha < public.ninos_voluntarios_congelado_desde()
     OR NOT EXISTS (SELECT 1 FROM public.dream_team_turnos t
                     WHERE t.id = p_turno_id AND t.activo AND t.tipo = 'semanal'
                       AND t.dia_semana = extract(dow FROM p_fecha)::int) THEN
    RETURN false;
  END IF;
  -- The header row claims the date: a concurrent caller waits and then skips.
  INSERT INTO public.ninos_voluntarios_rosters (turno_id, fecha) VALUES (p_turno_id, p_fecha) -- noqa: insert-into
  ON CONFLICT (turno_id, fecha) DO NOTHING;
  GET DIAGNOSTICS v_nuevos = ROW_COUNT;
  IF v_nuevos = 0 THEN
    RETURN false;
  END IF;
  INSERT INTO public.ninos_voluntarios_roster_servicios (turno_id, fecha, servicio_id, area_id, equipo_id) -- noqa: insert-into
  SELECT p_turno_id, p_fecha, r.servicio_id, r.area_id, r.equipo_id
    FROM public.ninos_voluntarios_del_turno_vivo(p_turno_id, p_fecha) r
   WHERE r.esperado
  ON CONFLICT (turno_id, fecha, servicio_id) DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_voluntarios_congelar(uuid, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ninos_voluntarios_planilla(p_turno_id uuid, p_fecha date)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_turno public.dream_team_turnos%ROWTYPE;
  v_hoy date := public.ninos_hoy();
  v_equipos uuid[];
  v_areas uuid[];
  v_areas_json jsonb;
  v_voluntarios jsonb;
BEGIN
  IF public.ninos_usuario_actual() IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  SELECT t.* INTO v_turno FROM public.dream_team_turnos t WHERE t.id = p_turno_id AND t.activo AND t.tipo = 'semanal';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'turno_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_fecha IS NULL OR extract(dow FROM p_fecha)::int <> v_turno.dia_semana THEN
    RAISE EXCEPTION 'fecha_invalida' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(array_agg(m.equipo_id), ARRAY[]::uuid[]), coalesce(array_agg(DISTINCT m.area_id), ARRAY[]::uuid[])
    INTO v_equipos, v_areas
    FROM public.ninos_voluntarios_marcables(v_turno.campus_id) m;
  IF cardinality(v_equipos) = 0 THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  PERFORM public.ninos_voluntarios_congelar(p_turno_id, p_fecha);

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'nombre', a.label) ORDER BY a.label), '[]'::jsonb)
    INTO v_areas_json
    FROM public.dream_team_equipos a
   WHERE a.id = ANY (v_areas);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'servicio_id', r.servicio_id, 'nombre', u.nombre, 'apellido', u.apellido,
           'area_id', r.area_id, 'area', ea.label, 'equipo_id', r.equipo_id, 'equipo', e.label,
           'rol', ro.label, 'esperado', r.esperado, 'sin_turno', r.sin_turno, 'estado', a.estado)
         ORDER BY ea.label, e.label, u.nombre, u.apellido), '[]'::jsonb)
    INTO v_voluntarios
    FROM public.ninos_voluntarios_del_turno(p_turno_id, p_fecha) r
    JOIN public.dream_team_servicios sv ON sv.id = r.servicio_id
    JOIN public.usuarios u ON u.id = sv.persona_id
    JOIN public.dream_team_equipos e ON e.id = r.equipo_id
    JOIN public.dream_team_equipos ea ON ea.id = r.area_id
    JOIN public.dream_team_roles ro ON ro.id = sv.rol_id
    LEFT JOIN public.dream_team_asistencias a
      ON a.servicio_id = r.servicio_id AND a.turno_id = p_turno_id AND a.fecha = p_fecha
   WHERE r.equipo_id = ANY (v_equipos);

  RETURN jsonb_build_object(
    'turno_id', v_turno.id, 'turno', v_turno.nombre, 'dia_semana', v_turno.dia_semana,
    'fecha', p_fecha, 'hoy', v_hoy, 'editable', p_fecha BETWEEN v_hoy - 14 AND v_hoy,
    'areas', v_areas_json, 'voluntarios', v_voluntarios);
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_voluntarios_planilla(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_voluntarios_planilla(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.ninos_voluntarios_marcar(
  p_turno_id uuid,
  p_fecha date,
  p_servicio_ids uuid[],
  p_estado text,
  p_solo_sin_marcar boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.ninos_usuario_actual();
  v_turno public.dream_team_turnos%ROWTYPE;
  v_hoy date := public.ninos_hoy();
  v_ids uuid[];
  v_servicios uuid[];
  v_equipos uuid[];
  v_esperados boolean[];
  v_cambiados integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_estado IS NOT NULL AND p_estado NOT IN ('presente', 'justificado', 'ausente') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[]) INTO v_ids
    FROM unnest(p_servicio_ids) AS x WHERE x IS NOT NULL;
  IF cardinality(v_ids) > 300 THEN
    RAISE EXCEPTION 'demasiados_servicios' USING ERRCODE = '22023';
  END IF;
  SELECT t.* INTO v_turno FROM public.dream_team_turnos t WHERE t.id = p_turno_id AND t.activo AND t.tipo = 'semanal';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'turno_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_fecha IS NULL OR p_fecha > v_hoy OR p_fecha < v_hoy - 14
     OR extract(dow FROM p_fecha)::int <> v_turno.dia_semana THEN
    RAISE EXCEPTION 'fecha_invalida' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_ids) = 0 THEN
    RETURN jsonb_build_object('estado', p_estado, 'servicios', 0, 'cambiados', 0);
  END IF;
  -- The roster rows of the ids, read once: every id must be in the roster of
  -- this turno, in an equipo the caller may mark.
  SELECT coalesce(array_agg(r.servicio_id), ARRAY[]::uuid[]), coalesce(array_agg(r.equipo_id), ARRAY[]::uuid[]),
         coalesce(array_agg(r.esperado), ARRAY[]::boolean[])
    INTO v_servicios, v_equipos, v_esperados
    FROM public.ninos_voluntarios_del_turno(p_turno_id, p_fecha) r
   WHERE r.servicio_id = ANY (v_ids);
  IF cardinality(v_servicios) < cardinality(v_ids) THEN
    RAISE EXCEPTION 'servicio_invalido' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM (SELECT DISTINCT e FROM unnest(v_equipos) AS e) d
              WHERE NOT public.ninos_puede_marcar_voluntarios(d.e)) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  -- Only an authorized caller freezes a past date; the frozen roster then
  -- decides `esperado` (a snapshot is a subset of the live roster read above).
  IF public.ninos_voluntarios_congelar(p_turno_id, p_fecha) THEN
    SELECT coalesce(array_agg(r.servicio_id), ARRAY[]::uuid[]), coalesce(array_agg(r.equipo_id), ARRAY[]::uuid[]),
           coalesce(array_agg(r.esperado), ARRAY[]::boolean[])
      INTO v_servicios, v_equipos, v_esperados
      FROM public.ninos_voluntarios_del_turno(p_turno_id, p_fecha) r
     WHERE r.servicio_id = ANY (v_ids);
  END IF;

  IF p_estado IS NULL THEN
    DELETE FROM public.dream_team_asistencias a
     WHERE a.turno_id = p_turno_id AND a.fecha = p_fecha AND a.servicio_id = ANY (v_servicios);
    GET DIAGNOSTICS v_cambiados = ROW_COUNT;
  ELSIF p_solo_sin_marcar THEN
    INSERT INTO public.dream_team_asistencias (servicio_id, turno_id, fecha, estado, esperado, marcado_por) -- noqa: insert-into
    SELECT x.servicio_id, p_turno_id, p_fecha, p_estado, x.esperado, v_actor
      FROM unnest(v_servicios, v_esperados) AS x(servicio_id, esperado)
    ON CONFLICT (servicio_id, turno_id, fecha) DO NOTHING;
    GET DIAGNOSTICS v_cambiados = ROW_COUNT;
  ELSE
    -- Re-marking the same estado is a no-op: the first marker and time stay.
    INSERT INTO public.dream_team_asistencias AS a (servicio_id, turno_id, fecha, estado, esperado, marcado_por)
    SELECT x.servicio_id, p_turno_id, p_fecha, p_estado, x.esperado, v_actor
      FROM unnest(v_servicios, v_esperados) AS x(servicio_id, esperado)
    ON CONFLICT (servicio_id, turno_id, fecha) DO UPDATE
       SET estado = excluded.estado, esperado = excluded.esperado,
           marcado_por = excluded.marcado_por, marcado_at = now()
     WHERE a.estado IS DISTINCT FROM excluded.estado OR a.esperado IS DISTINCT FROM excluded.esperado;
    GET DIAGNOSTICS v_cambiados = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('estado', p_estado, 'servicios', cardinality(v_ids), 'cambiados', v_cambiados);
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_voluntarios_marcar(uuid, date, uuid[], text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_voluntarios_marcar(uuid, date, uuid[], text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.ninos_reporte_voluntarios(
  p_desde date,
  p_hasta date,
  p_campus_id uuid DEFAULT NULL,
  p_turno_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_hasta date;
BEGIN
  IF public.ninos_usuario_actual() IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde > p_hasta OR p_hasta - p_desde > 366 THEN
    RAISE EXCEPTION 'rango_invalido' USING ERRCODE = '22023';
  END IF;
  IF NOT public.ninos_puede_marcar_voluntarios_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  v_hasta := least(p_hasta, public.ninos_hoy());

  -- No scheduler on this database: past dates nobody opened are frozen here.
  PERFORM public.ninos_voluntarios_congelar(t.id, d::date)
     FROM public.dream_team_turnos t
     CROSS JOIN generate_series(p_desde, v_hasta - 1, interval '1 day') AS d
    WHERE t.activo
      AND t.tipo = 'semanal'
      AND t.campus_id IN (SELECT m.campus_id FROM public.ninos_voluntarios_marcables(p_campus_id) m)
      AND (p_turno_id IS NULL OR t.id = p_turno_id)
      AND extract(dow FROM d)::int = t.dia_semana
      AND d::date >= public.ninos_voluntarios_congelado_desde()
      AND NOT EXISTS (SELECT 1 FROM public.ninos_voluntarios_rosters c
                       WHERE c.turno_id = t.id AND c.fecha = d::date);

  RETURN (
    WITH eq AS (
      SELECT m.campus_id, m.area_id, m.equipo_id
        FROM public.ninos_voluntarios_marcables(p_campus_id) m
    ), fechas AS (
      SELECT t.id AS turno_id, d::date AS fecha
        FROM public.dream_team_turnos t
        CROSS JOIN generate_series(p_desde, v_hasta, interval '1 day') AS d
       WHERE t.campus_id IN (SELECT eq.campus_id FROM eq)
         AND t.tipo = 'semanal'
         AND (p_turno_id IS NULL OR t.id = p_turno_id)
         AND extract(dow FROM d)::int = t.dia_semana
    ), roster AS (
      -- Unmarked expected volunteers only exist on active turnos.
      SELECT f.turno_id, f.fecha, r.servicio_id, r.equipo_id
        FROM fechas f
        JOIN public.dream_team_turnos t ON t.id = f.turno_id AND t.activo
        CROSS JOIN LATERAL public.ninos_voluntarios_del_turno(f.turno_id, f.fecha) r
       WHERE r.esperado AND r.equipo_id IN (SELECT eq.equipo_id FROM eq)
    ), marcas AS (
      SELECT a.turno_id, a.fecha, a.servicio_id, a.esperado, a.estado
        FROM public.dream_team_asistencias a
        JOIN fechas f ON f.turno_id = a.turno_id AND f.fecha = a.fecha
    ), unidas AS (
      SELECT coalesce(m.turno_id, r.turno_id) AS turno_id, coalesce(m.fecha, r.fecha) AS fecha,
             coalesce(m.servicio_id, r.servicio_id) AS servicio_id,
             coalesce(m.esperado, true) AS esperado, m.estado, r.equipo_id
        FROM marcas m
        FULL JOIN roster r ON r.turno_id = m.turno_id AND r.fecha = m.fecha AND r.servicio_id = m.servicio_id
    ), filas AS (
      SELECT u.turno_id, u.fecha, u.servicio_id, eq.area_id, eq.equipo_id, u.esperado, u.estado, t.orden AS turno_orden
        FROM unidas u
        JOIN public.dream_team_turnos t ON t.id = u.turno_id
        JOIN public.dream_team_servicios sv ON sv.id = u.servicio_id
        -- A frozen volunteer stays in the equipo they had that day.
        JOIN eq ON eq.campus_id = t.campus_id AND eq.equipo_id = coalesce(u.equipo_id, sv.equipo_id)
    ), por_servicio AS (
      SELECT x.fecha, x.turno_id, x.area_id, x.equipo_id,
             count(*) FILTER (WHERE x.esperado)::int AS esperados,
             count(*) FILTER (WHERE x.estado = 'presente')::int AS presentes,
             count(*) FILTER (WHERE x.estado = 'justificado')::int AS avisos,
             count(*) FILTER (WHERE x.estado = 'ausente')::int AS faltas,
             count(*) FILTER (WHERE x.estado IS NULL)::int AS sin_marcar,
             count(*) FILTER (WHERE x.estado = 'presente' AND NOT x.esperado)::int AS extras
        FROM filas x
       GROUP BY x.fecha, x.turno_id, x.area_id, x.equipo_id
    ), esperadas AS (
      -- Expected services per volunteer, newest first; the streak is the run
      -- of Faltó from the newest one.
      SELECT x.servicio_id, x.estado,
             row_number() OVER (PARTITION BY x.servicio_id ORDER BY x.fecha DESC, x.turno_orden DESC) AS n
        FROM filas x
       WHERE x.esperado
    ), racha AS (
      SELECT e.servicio_id,
             coalesce(min(e.n) FILTER (WHERE e.estado IS DISTINCT FROM 'ausente'), max(e.n) + 1) - 1 AS seguidas
        FROM esperadas e
       GROUP BY e.servicio_id
    ), por_voluntario AS (
      SELECT x.servicio_id, x.area_id, x.equipo_id,
             count(*) FILTER (WHERE x.esperado)::int AS esperados,
             count(*) FILTER (WHERE x.estado = 'presente')::int AS presentes,
             count(*) FILTER (WHERE x.estado = 'justificado')::int AS avisos,
             count(*) FILTER (WHERE x.estado = 'ausente')::int AS faltas,
             count(*) FILTER (WHERE x.estado IS NULL)::int AS sin_marcar,
             count(*) FILTER (WHERE x.estado = 'presente' AND NOT x.esperado)::int AS extras
        FROM filas x
       GROUP BY x.servicio_id, x.area_id, x.equipo_id
    )
    SELECT jsonb_build_object(
      'desde', p_desde, 'hasta', p_hasta,
      'servicios', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'fecha', s.fecha, 'turno_id', s.turno_id, 'turno', t.nombre, 'turno_orden', t.orden,
                 'area_id', s.area_id, 'area', ea.label, 'equipo_id', s.equipo_id, 'equipo', e.label,
                 'esperados', s.esperados, 'presentes', s.presentes, 'avisos', s.avisos, 'faltas', s.faltas,
                 'sin_marcar', s.sin_marcar, 'extras', s.extras)
               ORDER BY s.fecha, t.orden, ea.label, e.label), '[]'::jsonb)
          FROM por_servicio s
          JOIN public.dream_team_turnos t ON t.id = s.turno_id
          JOIN public.dream_team_equipos ea ON ea.id = s.area_id
          JOIN public.dream_team_equipos e ON e.id = s.equipo_id),
      'voluntarios', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'servicio_id', k.servicio_id, 'nombre', btrim(u.nombre || ' ' || coalesce(u.apellido, '')),
                 'area', ea.label, 'equipo', e.label, 'rol', ro.label,
                 'esperados', k.esperados, 'presentes', k.presentes, 'avisos', k.avisos, 'faltas', k.faltas,
                 'sin_marcar', k.sin_marcar, 'extras', k.extras, 'faltas_seguidas', coalesce(r.seguidas, 0)::int)
               ORDER BY coalesce(r.seguidas, 0) DESC, k.faltas DESC, u.nombre, u.apellido), '[]'::jsonb)
          FROM por_voluntario k
          LEFT JOIN racha r ON r.servicio_id = k.servicio_id
          JOIN public.dream_team_servicios sv ON sv.id = k.servicio_id
          JOIN public.usuarios u ON u.id = sv.persona_id
          JOIN public.dream_team_roles ro ON ro.id = sv.rol_id
          JOIN public.dream_team_equipos e ON e.id = k.equipo_id
          JOIN public.dream_team_equipos ea ON ea.id = k.area_id))
  );
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_reporte_voluntarios(date, date, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_reporte_voluntarios(date, date, uuid, uuid) TO authenticated;

-- Checks in the children of one family visit. p_salon_ids is aligned with
-- p_nino_ids. Every child shares one code. Returns one row per child with the
-- room occupancy after the check-in and whether it went over capacity.
CREATE OR REPLACE FUNCTION public.ninos_checkin(
  p_nino_ids uuid[], p_turno_id uuid, p_fecha date, p_salon_ids uuid[]
)
RETURNS TABLE (nino_id uuid, salon_id uuid, codigo text, ocupacion integer, capacidad integer,
               sobre_capacidad boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
#variable_conflict use_column
DECLARE
  v_campus uuid;
  v_actor uuid := public.ninos_usuario_actual();
  v_visita uuid := gen_random_uuid();
  v_codigo text;
  v_intentos integer := 0;
  i integer;
  v_salon public.ninos_salones%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_nino_ids IS NULL OR p_salon_ids IS NULL OR cardinality(p_nino_ids) = 0
     OR cardinality(p_nino_ids) <> cardinality(p_salon_ids) THEN
    RAISE EXCEPTION 'p_nino_ids and p_salon_ids must be non-empty and aligned' USING ERRCODE = '22023';
  END IF;
  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'p_fecha is required' USING ERRCODE = '22023';
  END IF;

  SELECT t.campus_id INTO v_campus FROM public.dream_team_turnos t
   WHERE t.id = p_turno_id AND t.activo AND t.tipo = 'semanal';
  IF v_campus IS NULL THEN
    RAISE EXCEPTION 'unknown or inactive turno' USING ERRCODE = '22023';
  END IF;

  FOR i IN 1 .. cardinality(p_nino_ids) LOOP
    SELECT * INTO v_salon FROM public.ninos_salones s WHERE s.id = p_salon_ids[i];
    IF NOT FOUND OR NOT v_salon.activo OR v_salon.campus_id <> v_campus THEN
      RAISE EXCEPTION 'room % is not an active room of the turno campus', p_salon_ids[i] USING ERRCODE = '22023';
    END IF;
    IF NOT public.ninos_puede_operar(v_salon.equipo_id) THEN
      RAISE EXCEPTION 'not allowed to check in to room %', v_salon.nombre USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ninos_fichas f WHERE f.usuario_id = p_nino_ids[i]) THEN
      RAISE EXCEPTION 'child % has no ficha', p_nino_ids[i] USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Serialize code issuance for this campus + fecha + turno.
  PERFORM pg_advisory_xact_lock(hashtextextended('ninos_checkin:' || v_campus || ':' || p_fecha || ':' || p_turno_id, 0));

  LOOP
    v_codigo := lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.ninos_checkins c
      WHERE c.campus_id = v_campus AND c.fecha = p_fecha AND c.turno_id = p_turno_id
        AND c.codigo = v_codigo AND c.salida_at IS NULL);
    v_intentos := v_intentos + 1;
    IF v_intentos > 200 THEN
      RAISE EXCEPTION 'no free code for this turno' USING ERRCODE = '53000';
    END IF;
  END LOOP;

  BEGIN
    INSERT INTO public.ninos_checkins (nino_id, salon_id, turno_id, campus_id, fecha, visita_id, codigo, entrada_por) -- noqa: insert-into
    SELECT n.nino, n.salon, p_turno_id, v_campus, p_fecha, v_visita, v_codigo, v_actor
    FROM unnest(p_nino_ids, p_salon_ids) AS n(nino, salon);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'a child is already checked in for this turno' USING ERRCODE = '23505';
  END;

  RETURN QUERY
  SELECT n.nino, n.salon, v_codigo,
         (SELECT count(*)::int FROM public.ninos_checkins c
           WHERE c.salon_id = n.salon AND c.fecha = p_fecha AND c.turno_id = p_turno_id AND c.salida_at IS NULL),
         s.capacidad,
         (SELECT count(*) FROM public.ninos_checkins c
           WHERE c.salon_id = n.salon AND c.fecha = p_fecha AND c.turno_id = p_turno_id AND c.salida_at IS NULL) > s.capacidad
  FROM unnest(p_nino_ids, p_salon_ids) AS n(nino, salon)
  JOIN public.ninos_salones s ON s.id = n.salon;
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_checkin(uuid[], uuid, date, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_checkin(uuid[], uuid, date, uuid[]) TO authenticated;
