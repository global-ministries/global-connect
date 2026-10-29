-- noqa: insert-into
-- Estudiantes, Phase B (C1 of odd/tasks/estudiantes-fase-b.md, S1–S10,
-- Q1–Q7) — the attendance model of Transit, Inside Out and The Living Room.
--
-- What:
--   1. estudiantes_escala: the school scale of a campus (Q2). One row per
--      year: numero, etiqueta and the ámbito (Transit or Inside Out node) the
--      year belongs to. Barquisimeto is seeded: 1..6 "1er año".."6to año",
--      1–3 Transit, 4–6 Inside Out.
--   2. estudiantes_fichas: one per person — campus, año actual (NULL for The
--      Living Room) and the last year of their school (5to or 6to; default the
--      last year of the campus scale). Both years must exist in the scale.
--   3. estudiantes_grupos: small groups hanging from a sub-área node (Grupos
--      de Chicas / Grupos de Chicos of Transit, Inside Out or The Living Room).
--      ambito_id is derived from the sub-área (its parent). Transit / Inside
--      Out groups carry an año of the scale that belongs to their ámbito and
--      meet in the Sunday turno; The Living Room groups carry no año, a zona
--      (free text, Q7) and an optional regular weekly meeting day and hour
--      (dia_semana 0–6 as dream_team_turnos, hora; T4 artboard 08) that the
--      leader's date picker offers. The day is not enforced on the meetings.
--   4. estudiantes_grupo_lideres: the leaders of a group, as active Dream
--      Team servicios of the group's sub-área with rol lider, entrenador or
--      director de grupo.
--   5. estudiantes_grupo_miembros: persona, estado visitante | miembro, desde,
--      who confirmed and when, activo. A person is in at most one active
--      group per ámbito (partial unique index on persona_id, ambito_id).
--   6. estudiantes_reuniones: one per (grupo, fecha, turno). Transit / Inside
--      Out meet on a Dream Team turno; The Living Room meets on its own date
--      with no turno and an optional lugar (Q7).
--   7. estudiantes_asistencias: one mark per (reunión, persona), presente |
--      ausente (Q4, no "justificado"), whether the person was a visitor when
--      first marked, who marked and when.
--   8. Visibility (Q3), estudiantes_nivel_subarea / estudiantes_nivel_grupo:
--        3  dream_team.org.manage, dream_team.direct,
--           dream_team.director.coordinate or dream_team.coordinate on the
--           sub-área or an ancestor (directors of Dirección de Estudiantes,
--           the ámbito director, the director de grupo's own grant), or an
--           active servicio as director de grupo in the sub-área;
--        2  an active servicio as entrenador in the sub-área;
--        1  (group only) an active servicio of the sub-área that leads the
--           group;
--        0  anyone else: Logística, Producción, Redes, Atención al Invitado,
--           plain volunteers and aprendices of the sub-área see nothing.
--      Every RPC (20261029100100) gates on these two functions.
--
-- Why: Q1 (L3) and Q7 (L15) chose tables of their own, isolated from Grupos
-- de Vida (no temporada, casa, approval nor supervision, no GdV report or map
-- picks them up), with closed RLS because they hold data of minors.
--
-- How:
--   - Consistency is declarative where it can be: composite foreign keys tie a
--     ficha's years to the campus scale, a group's año to the scale row of its
--     own ámbito ((campus, año, ámbito)), and a membership's ambito_id to its
--     group's ((grupo, ámbito)). Triggers derive ambito_id, fill the default
--     año final and refuse what a key cannot express (sub-área label, año
--     presence by ámbito, eligible leader roles, immutable columns).
--   - Roles are matched by label through dream_team_normalizar_etiqueta
--     ('lider', 'entrenador', 'director de grupo'), because the levels mint
--     the same grant for lider and entrenador (dream_team.lead) and Q3 tells
--     them apart. Reading the active servicio follows pauses and retirements
--     at once.
--   - dream_team.org.manage is read with the tree helper: an unscoped grant
--     sees every group, a scoped one only its subtree (the flat gate of
--     dream_team_puede_gestionar_turno would let a scoped grant see all).
--   - RLS is enabled on every table with no policy; anon and authenticated
--     have no privilege. Access is only through the SECURITY DEFINER RPCs.
--   - The seed resolves Dirección de Experiencia › Dirección de Estudiantes ›
--     Transit | Inside Out by path and the Barquisimeto campus by id; if any
--     does not resolve to exactly one row it raises before writing anything.
--     Idempotent (ON CONFLICT DO NOTHING on the primary key).
--
-- Blast radius: seven new tables (only the scale gets rows: six for
-- Barquisimeto), six trigger functions, two read-only helpers. No existing
-- table, function, policy or row changes.
--
-- Rollback (only while the tables hold no real data):
--   drop table if exists public.estudiantes_asistencias;
--   drop table if exists public.estudiantes_reuniones;
--   drop table if exists public.estudiantes_grupo_miembros;
--   drop table if exists public.estudiantes_grupo_lideres;
--   drop table if exists public.estudiantes_grupos;
--   drop table if exists public.estudiantes_fichas;
--   drop table if exists public.estudiantes_escala;
--   drop function if exists public.estudiantes_nivel_grupo(uuid);
--   drop function if exists public.estudiantes_nivel_subarea(uuid);
--   drop function if exists public.estudiantes_es_subarea_grupos(text);
--   drop function if exists public.estudiantes_escala_validar();
--   drop function if exists public.estudiantes_fichas_validar();
--   drop function if exists public.estudiantes_grupos_validar();
--   drop function if exists public.estudiantes_grupo_lideres_validar();
--   drop function if exists public.estudiantes_grupo_miembros_validar();

-- ── 0. labels ────────────────────────────────────────────────────────

-- Whether an equipo label names a small-group sub-área.
create or replace function public.estudiantes_es_subarea_grupos(p_label text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select public.dream_team_normalizar_etiqueta(p_label) in ('grupos de chicas', 'grupos de chicos')
$$;

revoke all on function public.estudiantes_es_subarea_grupos(text) from public;
revoke all on function public.estudiantes_es_subarea_grupos(text) from anon;
revoke all on function public.estudiantes_es_subarea_grupos(text) from authenticated;
grant execute on function public.estudiantes_es_subarea_grupos(text) to service_role;

-- ── 1. school scale ──────────────────────────────────────────────────

create table public.estudiantes_escala (
  campus_id uuid not null references public.campus(id),
  numero smallint not null check (numero between 1 and 20),
  etiqueta text not null check (length(btrim(etiqueta)) between 1 and 40),
  -- The Transit / Inside Out node the year belongs to.
  ambito_id uuid not null references public.dream_team_equipos(id),
  created_at timestamptz not null default now(),
  primary key (campus_id, numero),
  -- Target of the (campus, año, ámbito) key of estudiantes_grupos.
  unique (campus_id, numero, ambito_id)
);

comment on table public.estudiantes_escala is
  'School scale of a campus (Q2): numero, etiqueta and the ámbito (Transit / Inside Out node) of each year.';

-- The ámbito of a year is an Estudiantes node with small-group sub-áreas.
create or replace function public.estudiantes_escala_validar()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not exists (
    select 1
      from public.dream_team_equipos a
     where a.id = new.ambito_id
       and a.experiencia = 'estudiantes'
       and exists (select 1 from public.dream_team_equipos s
                    where s.parent_equipo_id = a.id
                      and public.estudiantes_es_subarea_grupos(s.label))
  ) then
    raise exception 'ambito_invalido' using errcode = '22023';
  end if;
  new.etiqueta := btrim(new.etiqueta);
  return new;
end;
$$;

revoke all on function public.estudiantes_escala_validar() from public;
revoke all on function public.estudiantes_escala_validar() from anon;
revoke all on function public.estudiantes_escala_validar() from authenticated;

create trigger estudiantes_escala_validar
  before insert or update on public.estudiantes_escala
  for each row execute function public.estudiantes_escala_validar();

-- ── 2. student file ──────────────────────────────────────────────────

create table public.estudiantes_fichas (
  persona_id uuid primary key references public.usuarios(id) on delete cascade,
  campus_id uuid not null references public.campus(id),
  -- NULL for The Living Room.
  anio_actual smallint,
  -- The last year of the person's school; defaults to the last of the scale.
  anio_final smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.usuarios(id) on delete set null,
  foreign key (campus_id, anio_actual) references public.estudiantes_escala (campus_id, numero),
  foreign key (campus_id, anio_final) references public.estudiantes_escala (campus_id, numero),
  check (anio_actual is null or anio_final is null or anio_final >= anio_actual)
);

comment on table public.estudiantes_fichas is
  'Student file: campus, current school year (NULL for The Living Room) and the last year of their school (Q2).';

create or replace function public.estudiantes_fichas_validar()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.anio_actual is not null and new.anio_final is null then
    select max(e.numero) into new.anio_final
      from public.estudiantes_escala e
     where e.campus_id = new.campus_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.estudiantes_fichas_validar() from public;
revoke all on function public.estudiantes_fichas_validar() from anon;
revoke all on function public.estudiantes_fichas_validar() from authenticated;

create trigger estudiantes_fichas_validar
  before insert or update on public.estudiantes_fichas
  for each row execute function public.estudiantes_fichas_validar();

-- ── 3. small groups ──────────────────────────────────────────────────

create table public.estudiantes_grupos (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campus(id),
  -- Grupos de Chicas / Grupos de Chicos of Transit, Inside Out or The Living Room.
  subarea_id uuid not null references public.dream_team_equipos(id),
  -- The sub-área's parent; set by the trigger.
  ambito_id uuid not null references public.dream_team_equipos(id),
  nombre text not null check (length(btrim(nombre)) between 1 and 80),
  -- Transit / Inside Out only: a year of the scale of this ámbito.
  anio smallint,
  zona text check (zona is null or length(zona) <= 120),
  -- The Living Room only: regular weekly meeting day (0 Sunday … 6 Saturday) and hour.
  dia_semana smallint check (dia_semana between 0 and 6),
  hora time,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) on delete set null,
  updated_at timestamptz not null default now(),
  -- Target of the (grupo, ámbito) key of estudiantes_grupo_miembros.
  unique (id, ambito_id),
  foreign key (campus_id, anio, ambito_id) references public.estudiantes_escala (campus_id, numero, ambito_id)
);

comment on table public.estudiantes_grupos is
  'Small group of Transit, Inside Out (by school year) or The Living Room (by zona), under a Grupos de Chicas / Chicos sub-área.';

create unique index estudiantes_grupos_nombre_activo_uniq
  on public.estudiantes_grupos (campus_id, subarea_id, lower(btrim(nombre)))
  where activo;

create index estudiantes_grupos_ambito_idx on public.estudiantes_grupos (ambito_id, campus_id);

create or replace function public.estudiantes_grupos_validar()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ambito uuid;
  v_experiencia text;
begin
  if tg_op = 'UPDATE'
     and (new.subarea_id is distinct from old.subarea_id or new.campus_id is distinct from old.campus_id) then
    raise exception 'grupo_invalido' using errcode = '22023';
  end if;

  select a.id, a.experiencia into v_ambito, v_experiencia
    from public.dream_team_equipos s
    join public.dream_team_equipos a on a.id = s.parent_equipo_id
   where s.id = new.subarea_id
     and public.estudiantes_es_subarea_grupos(s.label)
     and a.experiencia in ('estudiantes', 'the_living_room')
     and (tg_op = 'UPDATE' or (s.activo and a.activo));
  if v_ambito is null then
    raise exception 'subarea_invalida' using errcode = '22023';
  end if;

  new.ambito_id := v_ambito;
  new.nombre := btrim(new.nombre);
  new.zona := nullif(btrim(coalesce(new.zona, '')), '');
  if (v_experiencia = 'estudiantes') <> (new.anio is not null) then
    raise exception 'anio_invalido' using errcode = '22023';
  end if;
  -- Transit / Inside Out meet in the turno; an hour needs its day.
  if (v_experiencia = 'estudiantes' and (new.dia_semana is not null or new.hora is not null))
     or (new.hora is not null and new.dia_semana is null) then
    raise exception 'horario_invalido' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.estudiantes_grupos_validar() from public;
revoke all on function public.estudiantes_grupos_validar() from anon;
revoke all on function public.estudiantes_grupos_validar() from authenticated;

create trigger estudiantes_grupos_validar
  before insert or update on public.estudiantes_grupos
  for each row execute function public.estudiantes_grupos_validar();

-- ── 4. leaders ───────────────────────────────────────────────────────

create table public.estudiantes_grupo_lideres (
  grupo_id uuid not null references public.estudiantes_grupos(id) on delete cascade,
  servicio_id uuid not null references public.dream_team_servicios(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) on delete set null,
  primary key (grupo_id, servicio_id)
);

comment on table public.estudiantes_grupo_lideres is
  'Leaders of a group: active servicios of the group''s sub-área with rol lider, entrenador or director de grupo.';

create index estudiantes_grupo_lideres_servicio_idx on public.estudiantes_grupo_lideres (servicio_id);

create or replace function public.estudiantes_grupo_lideres_validar()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
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

create trigger estudiantes_grupo_lideres_validar
  before insert or update on public.estudiantes_grupo_lideres
  for each row execute function public.estudiantes_grupo_lideres_validar();

-- ── 5. members ───────────────────────────────────────────────────────

create table public.estudiantes_grupo_miembros (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null,
  -- The group's ámbito; set by the trigger, checked by the composite key.
  ambito_id uuid not null,
  persona_id uuid not null references public.usuarios(id) on delete cascade,
  estado text not null default 'visitante' check (estado in ('visitante', 'miembro')),
  desde date not null default ((now() at time zone 'America/Caracas')::date),
  confirmado_por uuid references public.usuarios(id) on delete set null,
  confirmado_at timestamptz,
  activo boolean not null default true,
  retirado_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) on delete set null,
  foreign key (grupo_id, ambito_id) references public.estudiantes_grupos (id, ambito_id) on delete cascade,
  unique (grupo_id, persona_id)
);

comment on table public.estudiantes_grupo_miembros is
  'Members of a group: visitante until a leader confirms them as miembro (Q6). At most one active group per person and ámbito.';

-- A person is in at most one active group per ámbito.
create unique index estudiantes_grupo_miembros_un_grupo_por_ambito
  on public.estudiantes_grupo_miembros (persona_id, ambito_id)
  where activo;

create or replace function public.estudiantes_grupo_miembros_validar()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op = 'UPDATE'
     and (new.grupo_id is distinct from old.grupo_id or new.persona_id is distinct from old.persona_id
          or new.ambito_id is distinct from old.ambito_id) then
    raise exception 'miembro_invalido' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    select g.ambito_id into new.ambito_id from public.estudiantes_grupos g where g.id = new.grupo_id;
  end if;
  return new;
end;
$$;

revoke all on function public.estudiantes_grupo_miembros_validar() from public;
revoke all on function public.estudiantes_grupo_miembros_validar() from anon;
revoke all on function public.estudiantes_grupo_miembros_validar() from authenticated;

create trigger estudiantes_grupo_miembros_validar
  before insert or update on public.estudiantes_grupo_miembros
  for each row execute function public.estudiantes_grupo_miembros_validar();

-- ── 6. meetings ──────────────────────────────────────────────────────

create table public.estudiantes_reuniones (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.estudiantes_grupos(id) on delete cascade,
  fecha date not null,
  -- Transit / Inside Out: the Dream Team turno. The Living Room: NULL.
  turno_id uuid references public.dream_team_turnos(id),
  lugar text check (lugar is null or length(lugar) <= 200),
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) on delete set null,
  constraint estudiantes_reuniones_unica unique nulls not distinct (grupo_id, fecha, turno_id)
);

comment on table public.estudiantes_reuniones is
  'One meeting of a group: fecha and turno (Transit / Inside Out) or fecha and optional lugar (The Living Room).';

create index estudiantes_reuniones_turno_fecha_idx on public.estudiantes_reuniones (turno_id, fecha);

-- ── 7. attendance ────────────────────────────────────────────────────

create table public.estudiantes_asistencias (
  reunion_id uuid not null references public.estudiantes_reuniones(id) on delete cascade,
  persona_id uuid not null references public.usuarios(id) on delete cascade,
  estado text not null check (estado in ('presente', 'ausente')),
  -- The person was a visitor of the group when first marked.
  era_visitante boolean not null default false,
  marcado_por uuid references public.usuarios(id) on delete set null,
  marcado_at timestamptz not null default now(),
  primary key (reunion_id, persona_id)
);

comment on table public.estudiantes_asistencias is
  'Attendance mark of a person at a meeting (Q4: presente / ausente), whether they were a visitor, who marked and when.';

create index estudiantes_asistencias_persona_idx on public.estudiantes_asistencias (persona_id);

-- ── privileges: closed tables, RPCs only ─────────────────────────────

alter table public.estudiantes_escala enable row level security;
alter table public.estudiantes_fichas enable row level security;
alter table public.estudiantes_grupos enable row level security;
alter table public.estudiantes_grupo_lideres enable row level security;
alter table public.estudiantes_grupo_miembros enable row level security;
alter table public.estudiantes_reuniones enable row level security;
alter table public.estudiantes_asistencias enable row level security;

revoke all on public.estudiantes_escala, public.estudiantes_fichas, public.estudiantes_grupos,
  public.estudiantes_grupo_lideres, public.estudiantes_grupo_miembros, public.estudiantes_reuniones,
  public.estudiantes_asistencias
  from public, anon, authenticated;
grant select, insert, update, delete on public.estudiantes_escala, public.estudiantes_fichas,
  public.estudiantes_grupos, public.estudiantes_grupo_lideres, public.estudiantes_grupo_miembros,
  public.estudiantes_reuniones, public.estudiantes_asistencias
  to service_role;

-- ── 8. visibility (Q3) ───────────────────────────────────────────────

-- Whether the caller has a system role (roles_sistema.nombre_interno): 'admin'
-- sees and manages every campus, 'pastor' everything of their own campus (L20).
create or replace function public.estudiantes_tiene_rol_sistema(p_rol text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select auth.uid() is not null
     and exists (select 1
                   from public.usuarios u
                   join public.usuario_roles ur on ur.usuario_id = u.id
                   join public.roles_sistema rs on rs.id = ur.rol_id
                  where u.auth_id = auth.uid() and rs.nombre_interno = p_rol)
$$;

comment on function public.estudiantes_tiene_rol_sistema(text) is
  'Whether the caller has the given system role (roles_sistema.nombre_interno).';

revoke all on function public.estudiantes_tiene_rol_sistema(text) from public;
revoke all on function public.estudiantes_tiene_rol_sistema(text) from anon;
revoke all on function public.estudiantes_tiene_rol_sistema(text) from authenticated;
grant execute on function public.estudiantes_tiene_rol_sistema(text) to service_role;

-- Everyone sees only their own campus (usuario_campus); only the system admin
-- role sees every campus, a pastor included (L20). The Dream Team tree and its
-- grants carry no campus, so every group, meeting and live view is gated here.
create or replace function public.estudiantes_campus_visible(p_campus_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select auth.uid() is not null
     and p_campus_id is not null
     and (public.estudiantes_tiene_rol_sistema('admin')
          or exists (select 1
                       from public.usuarios u
                       join public.usuario_campus uc on uc.usuario_id = u.id
                      where u.auth_id = auth.uid() and uc.campus_id = p_campus_id))
$$;

comment on function public.estudiantes_campus_visible(uuid) is
  'Whether the caller may see a campus: it is one of their usuario_campus, or they have the system admin role.';

revoke all on function public.estudiantes_campus_visible(uuid) from public;
revoke all on function public.estudiantes_campus_visible(uuid) from anon;
revoke all on function public.estudiantes_campus_visible(uuid) from authenticated;
grant execute on function public.estudiantes_campus_visible(uuid) to service_role;

-- The caller's level on a small-group sub-área: 3 manages (director de grupo
-- or higher in the tree), 2 sees every group (entrenador), 0 nothing.
create or replace function public.estudiantes_nivel_subarea(p_subarea_id uuid)
returns smallint
language sql
stable
security definer
set search_path to ''
as $$
  select (case
    when auth.uid() is null or p_subarea_id is null then 0
    when public.auth_has_dream_team_capability_in_tree('dream_team.org.manage', p_subarea_id)
      or public.auth_has_dream_team_capability_in_tree('dream_team.direct', p_subarea_id)
      or public.auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', p_subarea_id)
      or public.auth_has_dream_team_capability_in_tree('dream_team.coordinate', p_subarea_id)
      or exists (
        select 1
          from public.dream_team_servicios s
          join public.usuarios u on u.id = s.persona_id
          join public.dream_team_roles r on r.id = s.rol_id
         where u.auth_id = auth.uid()
           and s.equipo_id = p_subarea_id
           and s.estado = 'activo'
           and public.dream_team_normalizar_etiqueta(r.label) = 'director de grupo'
      ) then 3
    when exists (
        select 1
          from public.dream_team_servicios s
          join public.usuarios u on u.id = s.persona_id
          join public.dream_team_roles r on r.id = s.rol_id
         where u.auth_id = auth.uid()
           and s.equipo_id = p_subarea_id
           and s.estado = 'activo'
           and public.dream_team_normalizar_etiqueta(r.label) = 'entrenador'
      ) then 2
    else 0
  end)::smallint
$$;

comment on function public.estudiantes_nivel_subarea(uuid) is
  'Caller''s level on a Grupos de Chicas / Chicos sub-área (Q3): 3 org.manage, direct, director.coordinate or '
  'coordinate on it or an ancestor, or active director de grupo in it; 2 active entrenador in it; 0 otherwise.';

revoke all on function public.estudiantes_nivel_subarea(uuid) from public;
revoke all on function public.estudiantes_nivel_subarea(uuid) from anon;
revoke all on function public.estudiantes_nivel_subarea(uuid) from authenticated;
grant execute on function public.estudiantes_nivel_subarea(uuid) to service_role;

-- The caller's level on a sub-área within a campus: 0 outside the campuses
-- the caller sees; 3 for the system admin and for a pastor of the campus, who
-- sees everything of it (L20); otherwise the sub-área level of the tree.
create or replace function public.estudiantes_nivel_en_campus(p_subarea_id uuid, p_campus_id uuid)
returns smallint
language sql
stable
security definer
set search_path to ''
as $$
  select (case
    when p_subarea_id is null or not public.estudiantes_campus_visible(p_campus_id) then 0
    when public.estudiantes_tiene_rol_sistema('admin') or public.estudiantes_tiene_rol_sistema('pastor') then 3
    else public.estudiantes_nivel_subarea(p_subarea_id)
  end)::smallint
$$;

comment on function public.estudiantes_nivel_en_campus(uuid, uuid) is
  'Caller''s level on a sub-área in a campus: 0 when the campus is not visible to them; 3 for the system admin '
  'and for a pastor of the campus; otherwise estudiantes_nivel_subarea.';

revoke all on function public.estudiantes_nivel_en_campus(uuid, uuid) from public;
revoke all on function public.estudiantes_nivel_en_campus(uuid, uuid) from anon;
revoke all on function public.estudiantes_nivel_en_campus(uuid, uuid) from authenticated;
grant execute on function public.estudiantes_nivel_en_campus(uuid, uuid) to service_role;

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
                where gl.grupo_id = g.id
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

-- ── 9. seed: Barquisimeto scale ──────────────────────────────────────

do $$
declare
  v_campus constant uuid := 'a0000000-0000-0000-0000-000000000001';
  v_matches int;
  v_estudiantes uuid;
  v_transit uuid;
  v_inside_out uuid;
begin
  if not exists (select 1 from public.campus c where c.id = v_campus) then
    raise exception 'Campus Barquisimeto (%) not found', v_campus;
  end if;

  select count(*), (array_agg(n.id))[1]
    into v_matches, v_estudiantes
  from public.dream_team_equipos d
  join public.dream_team_equipos n
    on n.parent_equipo_id = d.id and n.label = 'Dirección de Estudiantes'
  where d.parent_equipo_id is null
    and d.label = 'Dirección de Experiencia';

  if v_matches <> 1 then
    raise exception 'Dirección de Experiencia › Dirección de Estudiantes resolves to % teams, expected exactly 1',
      v_matches;
  end if;

  select count(*), (array_agg(t.id))[1]
    into v_matches, v_transit
  from public.dream_team_equipos t
  where t.parent_equipo_id = v_estudiantes and t.label = 'Transit';

  if v_matches <> 1 then
    raise exception 'Dirección de Experiencia › Dirección de Estudiantes › Transit resolves to % teams, expected exactly 1',
      v_matches;
  end if;

  select count(*), (array_agg(t.id))[1]
    into v_matches, v_inside_out
  from public.dream_team_equipos t
  where t.parent_equipo_id = v_estudiantes and t.label = 'Inside Out';

  if v_matches <> 1 then
    raise exception 'Dirección de Experiencia › Dirección de Estudiantes › Inside Out resolves to % teams, expected exactly 1',
      v_matches;
  end if;

  insert into public.estudiantes_escala (campus_id, numero, etiqueta, ambito_id)
  values
    (v_campus, 1, '1er año', v_transit),
    (v_campus, 2, '2do año', v_transit),
    (v_campus, 3, '3er año', v_transit),
    (v_campus, 4, '4to año', v_inside_out),
    (v_campus, 5, '5to año', v_inside_out),
    (v_campus, 6, '6to año', v_inside_out)
  on conflict (campus_id, numero) do nothing;
end
$$;
