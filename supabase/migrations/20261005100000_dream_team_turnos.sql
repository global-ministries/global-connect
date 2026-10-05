-- T8 (odd/tasks/ninos-voluntarios-waumba.md, D12) — campus service shifts.
--
-- A shift ("turno") belongs to a CAMPUS and every Dream Team dirección shares
-- it (Niños, Estudiantes, DPS…). A campus opens or closes shifts as data, with
-- no code change.
--
--   dream_team_turnos           the shifts of each campus: nombre, día, hora,
--                               orden, activo.
--   dream_team_equipo_turnos    optional restriction: the shifts a node of the
--                               tree serves in. Descendants inherit it, per
--                               campus; a node with no rows for a campus serves
--                               every active shift of that campus.
--   dream_team_servicio_turnos  manual assignment of a servicio to one or more
--                               shifts. The campus of a servicio is the
--                               person's principal campus.
--
-- ── RLS ────────────────────────────────────────────────────────────────
-- turnos: any authenticated user reads (names and hours, like campus);
--         dream_team.org.manage writes. Shifts are campus-wide, so the gate is
--         the flat capability, as for a root node of the tree.
-- equipo_turnos: read follows the node's read policy; write is
--         dream_team.org.manage in the tree of the node (who edits the
--         structure).
-- servicio_turnos: read follows the servicio's read policy; insert and
--         delete use the very terms of dream_team_servicios_update (who edits
--         a servicio assigns its shifts).
--
-- dream_team_turnos_del_equipo walks the ancestors, which RLS on
-- dream_team_equipos hides from most callers, so it is SECURITY DEFINER. It
-- returns only shift ids, never personal data; anon and PUBLIC cannot run it.
-- The assignment trigger reads usuario_campus for the same reason and is
-- executable by nobody but the trigger machinery.
--
-- Barquisimeto (codigo 'BQT') starts with "Domingo 9:00" and "Domingo 11:00".
-- Every servicio starts without a shift: the spreadsheet had none.

-- ── dream_team_turnos ─────────────────────────────────────────────────
create table public.dream_team_turnos (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campus(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) > 0),
  -- 0 = domingo … 6 = sábado, as JavaScript's Date#getDay.
  dia_semana smallint not null check (dia_semana between 0 and 6),
  hora time not null,
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campus_id, nombre)
);

comment on table public.dream_team_turnos is
  'Service shifts of a campus, shared by every Dream Team dirección (D12).';

create index dream_team_turnos_campus_idx on public.dream_team_turnos (campus_id, orden);

create or replace function public.dream_team_turnos_touch()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.dream_team_turnos_touch() from public;

create trigger dream_team_turnos_touch
  before update on public.dream_team_turnos
  for each row execute function public.dream_team_turnos_touch();

alter table public.dream_team_turnos enable row level security;

create policy dream_team_turnos_select on public.dream_team_turnos
  for select to authenticated
  using (true); -- noqa: rls-using-true

create policy dream_team_turnos_insert on public.dream_team_turnos
  for insert to authenticated
  with check (public.auth_has_dream_team_capability('dream_team.org.manage'));

create policy dream_team_turnos_update on public.dream_team_turnos
  for update to authenticated
  using (public.auth_has_dream_team_capability('dream_team.org.manage'))
  with check (public.auth_has_dream_team_capability('dream_team.org.manage'));

create policy dream_team_turnos_delete on public.dream_team_turnos
  for delete to authenticated
  using (public.auth_has_dream_team_capability('dream_team.org.manage'));

revoke all on public.dream_team_turnos from anon;
grant select, insert, update, delete on public.dream_team_turnos to authenticated;
grant select, insert, update, delete on public.dream_team_turnos to service_role;

-- ── dream_team_equipo_turnos ──────────────────────────────────────────
create table public.dream_team_equipo_turnos (
  equipo_id uuid not null references public.dream_team_equipos(id) on delete cascade,
  turno_id uuid not null references public.dream_team_turnos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (equipo_id, turno_id)
);

comment on table public.dream_team_equipo_turnos is
  'Shifts a node serves in; inherited by descendants per campus; no rows = every shift (D12).';

create index dream_team_equipo_turnos_turno_idx on public.dream_team_equipo_turnos (turno_id);

alter table public.dream_team_equipo_turnos enable row level security;

create policy dream_team_equipo_turnos_select on public.dream_team_equipo_turnos
  for select to authenticated
  using (exists (select 1 from public.dream_team_equipos e where e.id = equipo_id));

create policy dream_team_equipo_turnos_insert on public.dream_team_equipo_turnos
  for insert to authenticated
  with check (public.auth_has_dream_team_capability_in_tree('dream_team.org.manage', equipo_id));

create policy dream_team_equipo_turnos_delete on public.dream_team_equipo_turnos
  for delete to authenticated
  using (public.auth_has_dream_team_capability_in_tree('dream_team.org.manage', equipo_id));

revoke all on public.dream_team_equipo_turnos from anon;
grant select, insert, delete on public.dream_team_equipo_turnos to authenticated;
grant select, insert, update, delete on public.dream_team_equipo_turnos to service_role;

-- ── which shifts a node serves ────────────────────────────────────────
-- The nearest node, from p_equipo_id up, that restricts shifts of p_campus_id
-- decides; with none, every active shift of the campus.
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
      where et.equipo_id = a.id and t.campus_id = p_campus_id
    )
    order by a.profundidad
    limit 1
  )
  select t.id
  from public.dream_team_turnos t
  where t.campus_id = p_campus_id
    and t.activo
    and (
      not exists (select 1 from restriccion)
      or exists (
        select 1
        from restriccion r
        join public.dream_team_equipo_turnos et on et.equipo_id = r.equipo_id
        where et.turno_id = t.id
      )
    )
  order by t.orden, t.hora
$$;

comment on function public.dream_team_turnos_del_equipo(uuid, uuid) is
  'Active shift ids of a campus that a Dream Team node serves in, after inheritance (D12).';

revoke all on function public.dream_team_turnos_del_equipo(uuid, uuid) from public;
revoke all on function public.dream_team_turnos_del_equipo(uuid, uuid) from anon;
grant execute on function public.dream_team_turnos_del_equipo(uuid, uuid) to authenticated;
grant execute on function public.dream_team_turnos_del_equipo(uuid, uuid) to service_role;

-- ── dream_team_servicio_turnos ────────────────────────────────────────
create table public.dream_team_servicio_turnos (
  servicio_id uuid not null references public.dream_team_servicios(id) on delete cascade,
  turno_id uuid not null references public.dream_team_turnos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (servicio_id, turno_id)
);

comment on table public.dream_team_servicio_turnos is
  'Manual assignment of a Dream Team servicio to one or more campus shifts (D12).';

create index dream_team_servicio_turnos_turno_idx on public.dream_team_servicio_turnos (turno_id);

-- A shift must be active, of the person's principal campus, and served by the
-- servicio's node.
create or replace function public.dream_team_servicio_turnos_validar()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_equipo_id uuid;
  v_campus_id uuid;
begin
  select s.equipo_id, uc.campus_id
    into v_equipo_id, v_campus_id
    from public.dream_team_servicios s
    left join public.usuario_campus uc
      on uc.usuario_id = s.persona_id and uc.es_campus_principal
   where s.id = new.servicio_id;

  if v_campus_id is null then
    raise exception 'La persona no tiene campus principal'
      using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.dream_team_turnos_del_equipo(v_equipo_id, v_campus_id) as x
     where x = new.turno_id
  ) then
    raise exception 'El turno no está disponible para este equipo y campus'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.dream_team_servicio_turnos_validar() from public;
revoke all on function public.dream_team_servicio_turnos_validar() from anon;
revoke all on function public.dream_team_servicio_turnos_validar() from authenticated;

create trigger dream_team_servicio_turnos_validar
  before insert or update on public.dream_team_servicio_turnos
  for each row execute function public.dream_team_servicio_turnos_validar();

alter table public.dream_team_servicio_turnos enable row level security;

create policy dream_team_servicio_turnos_select on public.dream_team_servicio_turnos
  for select to authenticated
  using (exists (select 1 from public.dream_team_servicios s where s.id = servicio_id));

create policy dream_team_servicio_turnos_insert on public.dream_team_servicio_turnos
  for insert to authenticated
  with check (
    exists (
      select 1 from public.dream_team_servicios s
      where s.id = servicio_id
        and (
          public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', s.equipo_id)
          or public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', s.equipo_id)
          or public.auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', s.equipo_id)
          or public.auth_has_dream_team_capability_in_tree('dream_team.direct', s.equipo_id)
          or public.auth_has_dream_team_capability_in_tree('dream_team.org.manage', s.equipo_id)
        )
    )
  );

create policy dream_team_servicio_turnos_delete on public.dream_team_servicio_turnos
  for delete to authenticated
  using (
    exists (
      select 1 from public.dream_team_servicios s
      where s.id = servicio_id
        and (
          public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', s.equipo_id)
          or public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', s.equipo_id)
          or public.auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', s.equipo_id)
          or public.auth_has_dream_team_capability_in_tree('dream_team.direct', s.equipo_id)
          or public.auth_has_dream_team_capability_in_tree('dream_team.org.manage', s.equipo_id)
        )
    )
  );

revoke all on public.dream_team_servicio_turnos from anon;
grant select, insert, delete on public.dream_team_servicio_turnos to authenticated;
grant select, insert, update, delete on public.dream_team_servicio_turnos to service_role;

-- ── seed: Barquisimeto (reference data) ─────────────────────────────
-- noqa: insert-into
insert into public.dream_team_turnos (campus_id, nombre, dia_semana, hora, orden)
select c.id, v.nombre, 0, v.hora, v.orden
  from public.campus c
  cross join (values ('Domingo 9:00', time '09:00', 1), ('Domingo 11:00', time '11:00', 2))
    as v(nombre, hora, orden)
 where c.codigo = 'BQT'
on conflict (campus_id, nombre) do nothing;
