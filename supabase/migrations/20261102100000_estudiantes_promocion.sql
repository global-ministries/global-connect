-- noqa: insert-into
-- Estudiantes, Phase B — C6b2 annual promotion, the 3er → 4to crossing and
-- graduation (odd/tasks/estudiantes-fase-b.md, S11–S15, L29, L37, L38;
-- artboards 09 / 10 of design/estudiantes-asistencia, A18–A25).
--
-- What:
--   1. estudiantes_promociones: one row per applied promotion of a campus —
--      who, when, the decisions, the summary and a jsonb snapshot (foto) of
--      everything it changed (groups' name / año / sub-área, memberships,
--      fichas, leader periods, servicios) plus the ids it created, so a
--      promotion can be undone by hand (S15). RLS on, no privilege for anon
--      or authenticated. estudiantes_fichas gets egresado_at (S13).
--   2. estudiantes_promocion_vista(campus) → jsonb: everything the preview
--      shows (S11–S14, artboards 09 / 10): per group of Transit and Inside
--      Out its leaders, member / visitor counts, who graduates and moves up,
--      what it becomes (name, año, sub-área; " B" when the name is taken), or
--      for each group of the last Transit year both options with their
--      outcome, the servicios a crossing moves and the "Transit sin 1er año"
--      warning; the graduates with their The Living Room destination by sexo;
--      the fichas without a group that move up; totals; and the last
--      promotion with its next allowed date (blocked state).
--   3. estudiantes_promocion_aplicar(campus, decisiones) → jsonb summary. One
--      transaction, serialized on the campus row:
--        - every active Transit / Inside Out group moves up one year with its
--          leaders; its name changes only when it starts with the old year
--          label (that prefix becomes the new label); on a clash with
--          another active group of the destination sub-área the arriving
--          group takes " B" (then " C" …);
--        - a group of the last Transit year follows its decision:
--          'pasan_chicos' creates a new group of the first Inside Out year in
--          the Inside Out sub-área of the same label (no leader), moves its
--          members and visitors there and sends the Transit group back to the
--          first Transit year, empty, with its leaders; 'pasa_grupo' moves the
--          group itself to that sub-área and first Inside Out year with its
--          members: each leader period closes, the Transit servicio is
--          retired (motivo reasignacion) and an equal servicio (same rol
--          label, its turnos, its verificaciones by codigo and its capability
--          grants) is opened in the Inside Out sub-área, which then leads the
--          group in a new period;
--        - a group of the last Inside Out year (the last of the scale) goes
--          back to the first Inside Out year with its leaders, empty: all its
--          members graduate;
--        - every ficha of the campus moves up one year; whoever is in their
--          final year (anio_actual = anio_final) graduates: their Transit /
--          Inside Out membership ends (activo false, retirado_at) and the
--          ficha gets egresado_at; a member without ficha gets one with the
--          group's new year;
--        - The Living Room groups and inactive groups are untouched.
--   4. estudiantes_sin_grupo(grupo) leaves out, for a Transit / Inside Out
--      group, graduates and people with an active Estudiantes group of the
--      campus in any ámbito (a 'pasan_chicos' crosser), and lists, for a The Living Room group,
--      the graduates of its campus with no active membership in its ámbito,
--      in the sub-área of their sexo (Femenino → Grupos de Chicas, Masculino
--      → Grupos de Chicos, anyone else in both). Same signature, same rows as
--      before otherwise; re-created from 20261029130000.
--   5. A group may change sub-área only inside a promotion:
--      estudiantes_grupos_validar and estudiantes_grupo_miembros_validar
--      (re-created from 20261029100000) let the sub-área / ámbito change only
--      while the transaction-local setting estudiantes.promocion is 'on',
--      which only estudiantes_promocion_aplicar sets; the membership key
--      (grupo_id, ambito_id) → estudiantes_grupos becomes ON UPDATE CASCADE
--      so a group's members follow it to its new ámbito.
--
-- How:
--   - Authority (S15): estudiantes_nivel_en_campus = 3 on every Grupos de
--     Chicas / Chicos sub-área of the campus scale's two ámbitos (and the
--     sub-área of every group that moves). Directors of Estudiantes, a pastor
--     of the campus and the system admin pass; a director of one ámbito, an
--     entrenador, a leader or a director of another campus get sin_autoridad
--     (42501). The preview has the same gate (A18).
--   - The scale must be 1..n with exactly two ámbitos, the first years
--     Transit and the rest Inside Out; otherwise escala_invalida (22023).
--   - estudiantes_promocion_plan computes, for given decisions, where each
--     group lands and its name. Names are claimed in this order: groups that
--     move up in their sub-área, groups of the last Inside Out year, Transit
--     groups sent back to the first year, then the arrivals to Inside Out
--     (crossing groups and new groups, by sub-área and name). The preview
--     calls it twice (every decision 'pasan_chicos', every decision
--     'pasa_grupo'), so with one last-year group per sub-área its names are
--     exact; with several, a later arrival may take the next letter.
--   - Renaming is two-phase (every moving group first takes '~<id>') because
--     the unique index of active names is checked per row.
--   - A refusal raises before any write or rolls the whole call back:
--     sin_autoridad (42501); campus_invalido, escala_invalida,
--     promocion_reciente (another promotion of the campus less than 180
--     days ago), decision_invalida (p_decisiones is not an object mapping
--     exactly the active groups of the last Transit year to 'pasan_chicos' or
--     'pasa_grupo'), subarea_invalida (no Inside Out sub-área of that label),
--     rol_invalido (the Inside Out sub-área has no active rol with the
--     leader's rol label) (22023).
--   - Servicios follow the app (POST / PATCH /api/dream-team/servicios and
--     dream_team_cargar_voluntarios): the retired one gets estado retirado,
--     fecha_fin, motivo_actual reasignacion, version + 1 and a history row;
--     the new one is born activo with a history row activo → activo
--     (reasignacion), one verificación per requisito of its rol (the old
--     servicio's state when the codigo matches, else pendiente) and the
--     grants of dream_team_grants_de_servicio, written as the loader does
--     (reactivate or insert, source dream-team-servicio). Retiring revokes
--     the grants that servicio minted, except one another active servicio of
--     the person mints too. Only the turnos the new sub-área serves in the
--     person's principal campus are copied (the turnos validator would refuse
--     the rest). A leader's servicio is not retired while it still leads
--     another active group of its sub-área after the promotion, and a person
--     who already has an active servicio of that rol in the Inside Out
--     sub-área keeps it (nothing new is opened). A paused servicio's period
--     just closes.
--   - A member who already has an active Inside Out membership keeps it: they
--     leave the Transit group and are not moved (one group per ámbito).
--   - Every function runs as definer with an empty search_path; the helpers
--     are closed to anon and authenticated, the two RPCs granted to
--     authenticated.
--
-- Blast radius: one new table; one new column on estudiantes_fichas; the
-- membership foreign key re-created with ON UPDATE CASCADE (same columns,
-- same ON DELETE CASCADE); two trigger functions and estudiantes_sin_grupo
-- re-created (behavior unchanged outside a promotion, plus graduates in The
-- Living Room); thirteen new functions (two RPCs, eleven closed helpers). Applying a promotion writes
-- estudiantes_grupos, _grupo_miembros, _fichas, _grupo_lideres,
-- dream_team_servicios, _estados_historial, _requisitos_verificacion,
-- _servicio_turnos and _capability_grants of one campus.
--
-- Rollback (an applied promotion is undone by hand from its foto first):
--   drop function if exists public.estudiantes_promocion_aplicar(uuid, jsonb);
--   drop function if exists public.estudiantes_promocion_vista(uuid);
--   drop function if exists public.estudiantes_promocion_retirar(uuid, uuid, text);
--   drop function if exists public.estudiantes_promocion_reasignar(uuid, uuid, uuid, text);
--   drop function if exists public.estudiantes_promocion_turnos_destino(uuid, uuid);
--   drop function if exists public.estudiantes_promocion_rol_destino(uuid, uuid);
--   drop function if exists public.estudiantes_promocion_destino(uuid, uuid, smallint, text, text, text);
--   drop function if exists public.estudiantes_promocion_egresan(uuid);
--   drop function if exists public.estudiantes_promocion_plan(uuid, jsonb);
--   drop function if exists public.estudiantes_promocion_nombre_libre(text, uuid, text[]);
--   drop function if exists public.estudiantes_promocion_renombrar(text, text, text);
--   drop function if exists public.estudiantes_promocion_autoridad(uuid);
--   drop function if exists public.estudiantes_promocion_escala(uuid);
--   drop table if exists public.estudiantes_promociones;
--   re-run estudiantes_sin_grupo from 20261029130000 and the two trigger
--   functions from 20261029100000; the ON UPDATE CASCADE key may stay; the
--   egresado_at column of estudiantes_fichas is removed only once no
--   graduate needs it.

-- ── 1. the record and the ficha marker ───────────────────────────────

alter table public.estudiantes_fichas
  add column if not exists egresado_at timestamptz;

comment on column public.estudiantes_fichas.egresado_at is
  'When the person graduated (estudiantes_promocion_aplicar, S13); NULL while they study. A graduate is listed in '
  '"Sin grupo" of The Living Room of their campus until they join a group there.';

create table if not exists public.estudiantes_promociones (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campus(id),
  aplicada_at timestamptz not null default now(),
  aplicada_por uuid references public.usuarios(id) on delete set null,
  -- Last-Transit-year group id → 'pasan_chicos' | 'pasa_grupo'.
  decisiones jsonb not null default '{}'::jsonb,
  -- What estudiantes_promocion_aplicar returned.
  resumen jsonb not null default '{}'::jsonb,
  -- The rows before the promotion and the ids it created (S15).
  foto jsonb not null default '{}'::jsonb
);

comment on table public.estudiantes_promociones is
  'Applied promotions of a campus (S11–S15): who, when, the decisions, the summary and a snapshot of every row it '
  'changed plus the ids it created, to undo it by hand. Written only by estudiantes_promocion_aplicar.';

create index if not exists estudiantes_promociones_campus_idx
  on public.estudiantes_promociones (campus_id, aplicada_at desc);

alter table public.estudiantes_promociones enable row level security;
revoke all on public.estudiantes_promociones from public, anon, authenticated;
grant select, insert, update, delete on public.estudiantes_promociones to service_role;

-- ── 2. a group changes sub-área only inside a promotion ──────────────

-- estudiantes_grupos_validar (20261029100000_estudiantes_asistencia_modelo.sql),
-- plus: the sub-área may change while estudiantes.promocion is 'on'.
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
     and (new.campus_id is distinct from old.campus_id
          or (new.subarea_id is distinct from old.subarea_id
              and coalesce(current_setting('estudiantes.promocion', true), '') <> 'on')) then
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

-- estudiantes_grupo_miembros_validar (20261029100000_estudiantes_asistencia_modelo.sql),
-- plus: the ámbito may follow the group (ON UPDATE CASCADE) inside a promotion.
create or replace function public.estudiantes_grupo_miembros_validar()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op = 'UPDATE'
     and (new.grupo_id is distinct from old.grupo_id or new.persona_id is distinct from old.persona_id
          or (new.ambito_id is distinct from old.ambito_id
              and coalesce(current_setting('estudiantes.promocion', true), '') <> 'on')) then
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

-- The (grupo_id, ambito_id) key of a membership follows its group.
do $fk$
declare
  v_n integer;
  v_nombre text;
begin
  select count(*), min(c.conname) into v_n, v_nombre
    from pg_constraint c
   where c.conrelid = 'public.estudiantes_grupo_miembros'::regclass
     and c.confrelid = 'public.estudiantes_grupos'::regclass
     and c.contype = 'f'
     and cardinality(c.conkey) = 2;
  if v_n <> 1 then
    raise exception 'estudiantes_grupo_miembros: expected one (grupo_id, ambito_id) foreign key, found %', v_n;
  end if;
  execute format('alter table public.estudiantes_grupo_miembros drop constraint %I', v_nombre);
end
$fk$;

alter table public.estudiantes_grupo_miembros
  add constraint estudiantes_grupo_miembros_grupo_ambito_fkey
  foreign key (grupo_id, ambito_id) references public.estudiantes_grupos (id, ambito_id)
  on update cascade on delete cascade;

-- ── 3. helpers ───────────────────────────────────────────────────────

-- The two ámbitos of a campus scale and their first and last years. The scale
-- must be 1..n with exactly two ámbitos: Transit first, then Inside Out.
create or replace function public.estudiantes_promocion_escala(p_campus_id uuid)
returns table (
  transit_id uuid,
  inside_out_id uuid,
  t_primero smallint,
  t_ultimo smallint,
  io_primero smallint,
  io_ultimo smallint
)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_n integer;
  v_ambitos integer;
  v_max smallint;
  v_transit uuid;
  v_io uuid;
  v_t_ultimo smallint;
  v_io_primero smallint;
begin
  select count(*), count(distinct e.ambito_id), max(e.numero) into v_n, v_ambitos, v_max
    from public.estudiantes_escala e
   where e.campus_id = p_campus_id;
  if v_n = 0 or v_ambitos <> 2 or v_n <> v_max then
    raise exception 'escala_invalida' using errcode = '22023';
  end if;
  select e.ambito_id into v_transit from public.estudiantes_escala e where e.campus_id = p_campus_id and e.numero = 1;
  select e.ambito_id into v_io from public.estudiantes_escala e where e.campus_id = p_campus_id and e.numero = v_max;
  select max(e.numero) into v_t_ultimo
    from public.estudiantes_escala e where e.campus_id = p_campus_id and e.ambito_id = v_transit;
  select min(e.numero) into v_io_primero
    from public.estudiantes_escala e where e.campus_id = p_campus_id and e.ambito_id = v_io;
  if v_transit = v_io or v_io_primero <> v_t_ultimo + 1 then
    raise exception 'escala_invalida' using errcode = '22023';
  end if;
  return query select v_transit, v_io, 1::smallint, v_t_ultimo, v_io_primero, v_max;
end;
$$;

comment on function public.estudiantes_promocion_escala(uuid) is
  'Transit and Inside Out ámbitos of a campus scale with their first and last years. Error: escala_invalida.';

revoke all on function public.estudiantes_promocion_escala(uuid) from public, anon, authenticated;
grant execute on function public.estudiantes_promocion_escala(uuid) to service_role;

-- Level 3 on every small-group sub-área of the campus's Transit and Inside Out
-- (S15). Raises escala_invalida when the campus has no valid scale.
create or replace function public.estudiantes_promocion_autoridad(p_campus_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  with e as (select * from public.estudiantes_promocion_escala(p_campus_id)),
  subareas as (
    select s.id
      from public.dream_team_equipos s, e
     where s.parent_equipo_id in (e.transit_id, e.inside_out_id)
       and s.activo
       and public.estudiantes_es_subarea_grupos(s.label)
    union
    select g.subarea_id
      from public.estudiantes_grupos g, e
     where g.campus_id = p_campus_id and g.activo and g.ambito_id in (e.transit_id, e.inside_out_id)
  )
  select exists (select 1 from subareas)
     and not exists (select 1 from subareas s where public.estudiantes_nivel_en_campus(s.id, p_campus_id) < 3)
$$;

comment on function public.estudiantes_promocion_autoridad(uuid) is
  'Whether the caller has level 3 on every Transit and Inside Out sub-área of the campus (S15).';

revoke all on function public.estudiantes_promocion_autoridad(uuid) from public, anon, authenticated;
grant execute on function public.estudiantes_promocion_autoridad(uuid) to service_role;

-- A name that starts with the old year label takes the new one (S11).
create or replace function public.estudiantes_promocion_renombrar(p_nombre text, p_de text, p_a text)
returns text
language sql
immutable
security definer
set search_path to ''
as $$
  select case
           when coalesce(length(p_de), 0) > 0 and p_a is not null
                and lower(left(p_nombre, length(p_de))) = lower(p_de)
             then left(p_a || substr(p_nombre, length(p_de) + 1), 80)
           else p_nombre
         end
$$;

revoke all on function public.estudiantes_promocion_renombrar(text, text, text) from public, anon, authenticated;
grant execute on function public.estudiantes_promocion_renombrar(text, text, text) to service_role;

-- p_base, or p_base " B" … " Z" when taken in the sub-área (L38). p_usados
-- holds 'subarea_id|lower(btrim(nombre))'.
create or replace function public.estudiantes_promocion_nombre_libre(p_base text, p_subarea_id uuid, p_usados text[])
returns text
language sql
immutable
security definer
set search_path to ''
as $$
  select coalesce((
    select c.nombre
      from (select 0 as k, p_base as nombre
            union all
            select k, left(p_base, 78) || ' ' || chr(65 + k) from generate_series(1, 25) as k) c
     where not ((p_subarea_id::text || '|' || lower(btrim(c.nombre))) = any (coalesce(p_usados, array[]::text[])))
     order by c.k
     limit 1), p_base)
$$;

revoke all on function public.estudiantes_promocion_nombre_libre(text, uuid, text[]) from public, anon, authenticated;
grant execute on function public.estudiantes_promocion_nombre_libre(text, uuid, text[]) to service_role;

-- Where every active Transit / Inside Out group of the campus lands for the
-- given decisions. tipo: 'sube', 'vuelve' (last Inside Out year), the
-- decision of a last-Transit-year group ('pasan_chicos': the Transit group
-- going back to the first year; 'pasa_grupo': the group crossing), 'nuevo'
-- (the group 'pasan_chicos' creates; grupo_id NULL, origen_id the Transit
-- group) or 'por_decidir' (no valid decision; nothing else set). subarea_id
-- is NULL when Inside Out has no sub-área of that label.
create or replace function public.estudiantes_promocion_plan(p_campus_id uuid, p_decisiones jsonb)
returns table (
  orden integer,
  grupo_id uuid,
  origen_id uuid,
  tipo text,
  subarea_id uuid,
  anio smallint,
  nombre_actual text,
  nombre_base text,
  nombre text
)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_e record;
  v_r record;
  v_usados text[] := array[]::text[];
  v_n integer := 0;
  v_destino uuid;
begin
  select * into v_e from public.estudiantes_promocion_escala(p_campus_id);

  -- Groups that stay in their sub-área claim their names first.
  for v_r in
    select x.*
      from (
        select g.id, g.nombre, g.anio as anio_hoy, g.subarea_id as subarea, s.label as subarea_label,
               case when g.ambito_id = v_e.inside_out_id and g.anio = v_e.io_ultimo then 'vuelve'
                    when g.ambito_id = v_e.transit_id and g.anio = v_e.t_ultimo then
                      case when (p_decisiones ->> g.id::text) in ('pasan_chicos', 'pasa_grupo')
                           then p_decisiones ->> g.id::text else 'por_decidir' end
                    else 'sube' end as decision
          from public.estudiantes_grupos g
          join public.dream_team_equipos s on s.id = g.subarea_id
         where g.campus_id = p_campus_id and g.activo
           and g.ambito_id in (v_e.transit_id, v_e.inside_out_id)
      ) x
     order by case x.decision when 'sube' then 1 when 'vuelve' then 2 when 'pasan_chicos' then 3 else 4 end,
              x.subarea_label, x.anio_hoy desc, x.nombre, x.id
  loop
    if v_r.decision = 'pasa_grupo' then
      continue;
    end if;
    v_n := v_n + 1;
    orden := v_n;
    grupo_id := v_r.id;
    origen_id := null;
    tipo := v_r.decision;
    nombre_actual := v_r.nombre;
    if v_r.decision = 'por_decidir' then
      subarea_id := null;
      anio := null;
      nombre_base := null;
      nombre := null;
    else
      subarea_id := v_r.subarea;
      anio := case v_r.decision when 'sube' then v_r.anio_hoy + 1
                                when 'vuelve' then v_e.io_primero
                                else v_e.t_primero end;
      nombre_base := public.estudiantes_promocion_renombrar(
        v_r.nombre,
        (select e.etiqueta from public.estudiantes_escala e where e.campus_id = p_campus_id and e.numero = v_r.anio_hoy),
        (select e.etiqueta from public.estudiantes_escala e where e.campus_id = p_campus_id and e.numero = anio));
      nombre := public.estudiantes_promocion_nombre_libre(nombre_base, subarea_id, v_usados);
      v_usados := v_usados || (subarea_id::text || '|' || lower(btrim(nombre)));
    end if;
    return next;
  end loop;

  -- Then the arrivals to Inside Out, by sub-área and name.
  for v_r in
    select g.id, g.nombre, s.label as subarea_label, p_decisiones ->> g.id::text as decision
      from public.estudiantes_grupos g
      join public.dream_team_equipos s on s.id = g.subarea_id
     where g.campus_id = p_campus_id and g.activo
       and g.ambito_id = v_e.transit_id and g.anio = v_e.t_ultimo
       and (p_decisiones ->> g.id::text) in ('pasan_chicos', 'pasa_grupo')
     order by s.label, g.nombre, g.id
  loop
    select s.id into v_destino
      from public.dream_team_equipos s
     where s.parent_equipo_id = v_e.inside_out_id and s.activo
       and public.dream_team_normalizar_etiqueta(s.label) = public.dream_team_normalizar_etiqueta(v_r.subarea_label)
     order by s.created_at, s.id
     limit 1;
    if not found then
      v_destino := null;
    end if;
    v_n := v_n + 1;
    orden := v_n;
    subarea_id := v_destino;
    anio := v_e.io_primero;
    if v_r.decision = 'pasa_grupo' then
      grupo_id := v_r.id;
      origen_id := null;
      tipo := 'pasa_grupo';
      nombre_actual := v_r.nombre;
      nombre_base := public.estudiantes_promocion_renombrar(
        v_r.nombre,
        (select e.etiqueta from public.estudiantes_escala e where e.campus_id = p_campus_id and e.numero = v_e.t_ultimo),
        (select e.etiqueta from public.estudiantes_escala e where e.campus_id = p_campus_id and e.numero = v_e.io_primero));
    else
      grupo_id := null;
      origen_id := v_r.id;
      tipo := 'nuevo';
      nombre_actual := null;
      nombre_base := (select e.etiqueta from public.estudiantes_escala e
                       where e.campus_id = p_campus_id and e.numero = v_e.io_primero)
                     || ' · '
                     || case public.dream_team_normalizar_etiqueta(v_r.subarea_label)
                          when 'grupos de chicas' then 'Chicas' else 'Chicos' end;
    end if;
    if v_destino is null then
      nombre := null;
    else
      nombre := public.estudiantes_promocion_nombre_libre(nombre_base, v_destino, v_usados);
      v_usados := v_usados || (v_destino::text || '|' || lower(btrim(nombre)));
    end if;
    return next;
  end loop;
end;
$$;

comment on function public.estudiantes_promocion_plan(uuid, jsonb) is
  'Where each active Transit / Inside Out group of a campus lands for the given decisions (sub-área, año, name with '
  '" B" on a clash) and the groups ''pasan_chicos'' creates. Internal to the promotion RPCs.';

revoke all on function public.estudiantes_promocion_plan(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.estudiantes_promocion_plan(uuid, jsonb) to service_role;

-- Who graduates (S13): fichas of the campus in their final year, and every
-- active member or visitor of a group of the last Inside Out year. grupo_id is
-- their current Transit / Inside Out group of the campus, if any.
create or replace function public.estudiantes_promocion_egresan(p_campus_id uuid)
returns table (persona_id uuid, grupo_id uuid)
language sql
stable
security definer
set search_path to ''
as $$
  with e as (select * from public.estudiantes_promocion_escala(p_campus_id)),
  activos as (
    select m.persona_id, m.grupo_id, g.anio, g.ambito_id
      from public.estudiantes_grupo_miembros m
      join public.estudiantes_grupos g on g.id = m.grupo_id
      cross join e
     where m.activo and g.activo and g.campus_id = p_campus_id
       and g.ambito_id in (e.transit_id, e.inside_out_id)
  ),
  quienes as (
    select f.persona_id
      from public.estudiantes_fichas f
     where f.campus_id = p_campus_id and f.egresado_at is null
       and f.anio_actual is not null and f.anio_actual >= f.anio_final
    union
    select a.persona_id
      from activos a, e
     where a.ambito_id = e.inside_out_id and a.anio = e.io_ultimo
  )
  select q.persona_id,
         (select a.grupo_id from activos a, e
           where a.persona_id = q.persona_id
           order by a.ambito_id = e.inside_out_id desc, a.grupo_id
           limit 1)
    from quienes q
$$;

comment on function public.estudiantes_promocion_egresan(uuid) is
  'Who graduates in a promotion of the campus (S13) and their current Transit / Inside Out group.';

revoke all on function public.estudiantes_promocion_egresan(uuid) from public, anon, authenticated;
grant execute on function public.estudiantes_promocion_egresan(uuid) to service_role;

-- What a group becomes, as the preview shows it.
create or replace function public.estudiantes_promocion_destino(
  p_campus_id uuid,
  p_subarea_id uuid,
  p_anio smallint,
  p_nombre text,
  p_nombre_base text,
  p_nombre_actual text
)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object(
           'nombre', p_nombre,
           'nombre_cambia', p_nombre is distinct from p_nombre_actual,
           'choca', case when p_nombre is distinct from p_nombre_base then p_nombre_base end,
           'anio', p_anio,
           'anio_etiqueta', e.etiqueta,
           'subarea_id', s.id,
           'subarea', s.label,
           'ambito_id', a.id,
           'ambito', a.label)
    from (select 1) uno
    left join public.dream_team_equipos s on s.id = p_subarea_id
    left join public.dream_team_equipos a on a.id = s.parent_equipo_id
    left join public.estudiantes_escala e on e.campus_id = p_campus_id and e.numero = p_anio
$$;

revoke all on function public.estudiantes_promocion_destino(uuid, uuid, smallint, text, text, text) from public, anon, authenticated;
grant execute on function public.estudiantes_promocion_destino(uuid, uuid, smallint, text, text, text) to service_role;

-- The active rol of an equipo with the same label as a rol (L37).
create or replace function public.estudiantes_promocion_rol_destino(p_rol_id uuid, p_equipo_id uuid)
returns uuid
language sql
stable
security definer
set search_path to ''
as $$
  select r2.id
    from public.dream_team_roles r
    join public.dream_team_roles r2
      on r2.equipo_id = p_equipo_id and r2.activo
     and public.dream_team_normalizar_etiqueta(r2.label) = public.dream_team_normalizar_etiqueta(r.label)
   where r.id = p_rol_id
   order by r2.created_at, r2.id
   limit 1
$$;

revoke all on function public.estudiantes_promocion_rol_destino(uuid, uuid) from public, anon, authenticated;
grant execute on function public.estudiantes_promocion_rol_destino(uuid, uuid) to service_role;

-- The turnos of a servicio that an equipo serves in the person's principal
-- campus (dream_team_servicio_turnos_validar refuses the others).
create or replace function public.estudiantes_promocion_turnos_destino(p_servicio_id uuid, p_equipo_id uuid)
returns table (turno_id uuid, frecuencia text, fecha_ancla date)
language sql
stable
security definer
set search_path to ''
as $$
  select st.turno_id, st.frecuencia, st.fecha_ancla
    from public.dream_team_servicio_turnos st
    join public.dream_team_servicios s on s.id = st.servicio_id
    join public.usuario_campus uc on uc.usuario_id = s.persona_id and uc.es_campus_principal
   where st.servicio_id = p_servicio_id
     and st.turno_id in (select x from public.dream_team_turnos_del_equipo(p_equipo_id, uc.campus_id) as x)
$$;

revoke all on function public.estudiantes_promocion_turnos_destino(uuid, uuid) from public, anon, authenticated;
grant execute on function public.estudiantes_promocion_turnos_destino(uuid, uuid) to service_role;

-- Opens the servicio a crossing leader gets in p_equipo_id: same rol label,
-- the turnos that equipo serves, verificaciones by codigo, grants. Returns
-- its id. Error: rol_invalido.
create or replace function public.estudiantes_promocion_reasignar(
  p_servicio_id uuid,
  p_equipo_id uuid,
  p_actor uuid,
  p_detalle text
)
returns uuid
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_s record;
  v_rol uuid;
  v_rol_label text;
  v_experiencia text;
  v_id uuid;
  v_g record;
  v_n integer;
begin
  select s.id, s.persona_id, s.rol_id into v_s from public.dream_team_servicios s where s.id = p_servicio_id;
  v_rol := public.estudiantes_promocion_rol_destino(v_s.rol_id, p_equipo_id);
  if v_rol is null then
    raise exception 'rol_invalido' using errcode = '22023';
  end if;
  select r.label into v_rol_label from public.dream_team_roles r where r.id = v_rol;
  select e.experiencia into v_experiencia from public.dream_team_equipos e where e.id = p_equipo_id;

  insert into public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
  values (v_s.persona_id, p_equipo_id, v_rol, 'activo', now(), 'reasignacion')
  returning id into v_id;

  insert into public.dream_team_estados_historial
    (servicio_id, estado_anterior, estado_nuevo, motivo, detalle_motivo, actor_persona_id)
  values (v_id, 'activo', 'activo', 'reasignacion', p_detalle, p_actor);

  insert into public.dream_team_requisitos_verificacion
    (servicio_id, requisito_id, estado, fecha_verificacion, verificado_por, fecha_vencimiento)
  select v_id, rq.id, coalesce(prev.estado, 'pendiente'::public.dream_team_requisito_estado),
         prev.fecha_verificacion, prev.verificado_por, prev.fecha_vencimiento
    from public.dream_team_requisitos rq
    left join lateral (
      select ov.estado, ov.fecha_verificacion, ov.verificado_por, ov.fecha_vencimiento
        from public.dream_team_requisitos_verificacion ov
        join public.dream_team_requisitos orq on orq.id = ov.requisito_id
       where ov.servicio_id = p_servicio_id and orq.codigo = rq.codigo
       order by ov.updated_at desc
       limit 1
    ) prev on true
   where rq.rol_id = v_rol
  on conflict (servicio_id, requisito_id) do nothing;

  insert into public.dream_team_servicio_turnos (servicio_id, turno_id, frecuencia, fecha_ancla)
  select v_id, t.turno_id, t.frecuencia, t.fecha_ancla
    from public.estudiantes_promocion_turnos_destino(p_servicio_id, p_equipo_id) t;

  for v_g in
    select * from public.dream_team_grants_de_servicio(p_equipo_id, v_experiencia, v_rol, v_rol_label)
  loop
    update public.dream_team_capability_grants g
       set revoked_at = null, granted_at = now()
     where g.persona_id = v_s.persona_id
       and g.capability_key = v_g.capability_key
       and g.experience = v_g.experience
       and g.scope_type = v_g.scope_type
       and g.scope_id is not distinct from v_g.scope_id
       and g.source = 'dream-team-servicio';
    get diagnostics v_n = row_count;
    if v_n = 0 then
      insert into public.dream_team_capability_grants
        (persona_id, capability_key, experience, scope_type, scope_id, source, granted_at)
      values (v_s.persona_id, v_g.capability_key, v_g.experience, v_g.scope_type, v_g.scope_id,
              'dream-team-servicio', now());
    end if;
  end loop;
  return v_id;
end;
$$;

comment on function public.estudiantes_promocion_reasignar(uuid, uuid, uuid, text) is
  'Opens the servicio a crossing leader gets in another sub-área (same rol label, its turnos, verificaciones and '
  'grants). Internal to estudiantes_promocion_aplicar.';

revoke all on function public.estudiantes_promocion_reasignar(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.estudiantes_promocion_reasignar(uuid, uuid, uuid, text) to service_role;

-- Retires an active servicio with motivo reasignacion and revokes the grants
-- it minted that no other active servicio of the person mints. Returns
-- whether it retired it.
create or replace function public.estudiantes_promocion_retirar(p_servicio_id uuid, p_actor uuid, p_detalle text)
returns boolean
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_s record;
begin
  update public.dream_team_servicios s
     set estado = 'retirado', fecha_fin = now(), motivo_actual = 'reasignacion', version = s.version + 1,
         updated_at = now()
   where s.id = p_servicio_id and s.estado = 'activo'
  returning s.id, s.persona_id, s.equipo_id, s.rol_id into v_s;
  if not found then
    return false;
  end if;

  insert into public.dream_team_estados_historial
    (servicio_id, estado_anterior, estado_nuevo, motivo, detalle_motivo, actor_persona_id)
  values (p_servicio_id, 'activo', 'retirado', 'reasignacion', p_detalle, p_actor);

  update public.dream_team_capability_grants g
     set revoked_at = now()
    from public.dream_team_grants_de_servicio(
           v_s.equipo_id,
           (select e.experiencia from public.dream_team_equipos e where e.id = v_s.equipo_id),
           v_s.rol_id,
           (select r.label from public.dream_team_roles r where r.id = v_s.rol_id)) k
   where g.persona_id = v_s.persona_id
     and g.capability_key = k.capability_key
     and g.experience = k.experience
     and g.scope_type = k.scope_type
     and g.scope_id is not distinct from k.scope_id
     and g.source = 'dream-team-servicio'
     and g.revoked_at is null
     and not exists (
       select 1
         from public.dream_team_servicios o
         join public.dream_team_equipos oe on oe.id = o.equipo_id
         join public.dream_team_roles orr on orr.id = o.rol_id
         cross join lateral public.dream_team_grants_de_servicio(o.equipo_id, oe.experiencia, o.rol_id, orr.label) ok
        where o.persona_id = v_s.persona_id and o.estado = 'activo' and o.id <> p_servicio_id
          and ok.capability_key = k.capability_key and ok.experience = k.experience
          and ok.scope_type = k.scope_type and ok.scope_id is not distinct from k.scope_id);
  return true;
end;
$$;

comment on function public.estudiantes_promocion_retirar(uuid, uuid, text) is
  'Retires an active servicio (motivo reasignacion, history row) and revokes the grants only it minted. Internal to '
  'estudiantes_promocion_aplicar.';

revoke all on function public.estudiantes_promocion_retirar(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.estudiantes_promocion_retirar(uuid, uuid, text) to service_role;

-- ── 4. the preview ───────────────────────────────────────────────────

create or replace function public.estudiantes_promocion_vista(p_campus_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_campus record;
  v_e record;
  v_ultima jsonb;
  v_bloqueado boolean := false;
  v_a jsonb;
  v_b jsonb;
  v_tlr uuid;
  v_res jsonb;
begin
  if public.ninos_usuario_actual() is null or not public.estudiantes_campus_visible(p_campus_id) then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  select c.id, c.nombre into v_campus from public.campus c where c.id = p_campus_id;
  if not found then
    raise exception 'campus_invalido' using errcode = '22023';
  end if;
  select * into v_e from public.estudiantes_promocion_escala(p_campus_id);
  if not public.estudiantes_promocion_autoridad(p_campus_id) then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;

  select jsonb_build_object(
           'promocion_id', p.id,
           'aplicada_at', p.aplicada_at,
           'por', jsonb_build_object('persona_id', u.id, 'nombre', u.nombre, 'apellido', u.apellido),
           'proxima', ((p.aplicada_at + interval '180 days') at time zone 'America/Caracas')::date,
           'resumen', p.resumen),
         p.aplicada_at > now() - interval '180 days'
    into v_ultima, v_bloqueado
    from public.estudiantes_promociones p
    left join public.usuarios u on u.id = p.aplicada_por
   where p.campus_id = p_campus_id
   order by p.aplicada_at desc
   limit 1;
  v_bloqueado := coalesce(v_bloqueado, false);

  select coalesce(jsonb_object_agg(g.id::text, 'pasan_chicos'::text), '{}'::jsonb),
         coalesce(jsonb_object_agg(g.id::text, 'pasa_grupo'::text), '{}'::jsonb)
    into v_a, v_b
    from public.estudiantes_grupos g
   where g.campus_id = p_campus_id and g.activo and g.ambito_id = v_e.transit_id and g.anio = v_e.t_ultimo;

  -- The Living Room ámbito graduates go to: the one with groups in the campus first.
  select a.id into v_tlr
    from public.dream_team_equipos a
   where a.experiencia = 'the_living_room' and a.activo
     and exists (select 1 from public.dream_team_equipos s
                  where s.parent_equipo_id = a.id and s.activo and public.estudiantes_es_subarea_grupos(s.label))
   order by exists (select 1 from public.estudiantes_grupos tg
                     where tg.ambito_id = a.id and tg.campus_id = p_campus_id and tg.activo) desc,
            a.created_at, a.id
   limit 1;

  with
  plan_a as (select * from public.estudiantes_promocion_plan(p_campus_id, v_a)),
  plan_b as (select * from public.estudiantes_promocion_plan(p_campus_id, v_b)),
  egr as (select * from public.estudiantes_promocion_egresan(p_campus_id)),
  grupos as (
    select g.id, g.nombre, g.anio, g.subarea_id, g.ambito_id, s.label as subarea, a.label as ambito,
           e.etiqueta as anio_etiqueta,
           (g.ambito_id = v_e.transit_id and g.anio = v_e.t_ultimo) as decide
      from public.estudiantes_grupos g
      join public.dream_team_equipos s on s.id = g.subarea_id
      join public.dream_team_equipos a on a.id = g.ambito_id
      join public.estudiantes_escala e on e.campus_id = g.campus_id and e.numero = g.anio
     where g.campus_id = p_campus_id and g.activo and g.ambito_id in (v_e.transit_id, v_e.inside_out_id)
  ),
  miembros as (
    select m.grupo_id, m.persona_id, m.estado, u.nombre, u.apellido, f.anio_actual, f.egresado_at,
           (f.persona_id is not null) as tiene_ficha, (x.persona_id is not null) as egresa
      from public.estudiantes_grupo_miembros m
      join grupos g on g.id = m.grupo_id
      join public.usuarios u on u.id = m.persona_id
      left join public.estudiantes_fichas f on f.persona_id = m.persona_id
      left join egr x on x.persona_id = m.persona_id
     where m.activo
  ),
  lideres as (
    select gl.grupo_id, sv.id as servicio_id, sv.persona_id, sv.rol_id, u.nombre, u.apellido, r.label as rol
      from public.estudiantes_grupo_lideres gl
      join grupos g on g.id = gl.grupo_id
      join public.dream_team_servicios sv on sv.id = gl.servicio_id
      join public.usuarios u on u.id = sv.persona_id
      join public.dream_team_roles r on r.id = sv.rol_id
     where gl.hasta is null and sv.estado = 'activo'
  ),
  filas as (
    select g.*, pa.tipo, pa.subarea_id as subarea_destino, pa.anio as anio_destino, pa.nombre as nombre_destino,
           pa.nombre_base,
           k.n_miembros, k.n_visitantes, k.n_egresan, k.n_visitantes_egresan, k.n_quedan
      from grupos g
      join plan_a pa on pa.grupo_id = g.id
      cross join lateral (
        select count(*) filter (where mm.estado = 'miembro')::integer as n_miembros,
               count(*) filter (where mm.estado = 'visitante')::integer as n_visitantes,
               count(*) filter (where mm.estado = 'miembro' and mm.egresa)::integer as n_egresan,
               count(*) filter (where mm.estado = 'visitante' and mm.egresa)::integer as n_visitantes_egresan,
               count(*) filter (where not mm.egresa)::integer as n_quedan
          from miembros mm
         where mm.grupo_id = g.id
      ) k
  ),
  egresados as (
    select x.persona_id, u.nombre, u.apellido, u.genero::text as genero, g.id as grupo_id, g.nombre as grupo,
           m.estado, coalesce(f.anio_actual, g.anio) as anio, coalesce(f.anio_final, v_e.io_ultimo) as anio_final,
           ds.id as destino_id, ds.label as destino
      from egr x
      join public.usuarios u on u.id = x.persona_id
      left join grupos g on g.id = x.grupo_id
      left join miembros m on m.grupo_id = x.grupo_id and m.persona_id = x.persona_id
      left join public.estudiantes_fichas f on f.persona_id = x.persona_id
      left join lateral (
        select s.id, s.label
          from public.dream_team_equipos s
         where s.parent_equipo_id = v_tlr and s.activo
           and public.dream_team_normalizar_etiqueta(s.label)
               = case u.genero::text when 'Femenino' then 'grupos de chicas' when 'Masculino' then 'grupos de chicos' end
         order by s.created_at, s.id
         limit 1
      ) ds on true
  ),
  sin_grupo as (
    select f.persona_id, u.nombre, u.apellido, f.anio_actual, (x.persona_id is not null) as egresa
      from public.estudiantes_fichas f
      join public.usuarios u on u.id = f.persona_id
      left join egr x on x.persona_id = f.persona_id
     where f.campus_id = p_campus_id and f.egresado_at is null and f.anio_actual is not null
       and not exists (
         select 1
           from public.estudiantes_grupo_miembros m2
           join public.estudiantes_grupos g2 on g2.id = m2.grupo_id
          where m2.persona_id = f.persona_id and m2.activo and g2.activo
            and g2.ambito_id in (v_e.transit_id, v_e.inside_out_id))
  )
  select jsonb_build_object(
    'campus', jsonb_build_object('id', v_campus.id, 'nombre', v_campus.nombre),
    'bloqueado', v_bloqueado,
    'ultima', v_ultima,
    'ambitos', (
      select jsonb_agg(jsonb_build_object(
               'ambito_id', a.id, 'nombre', a.label, 'primer_anio', x.desde, 'ultimo_anio', x.hasta,
               'primer_etiqueta', e1.etiqueta, 'ultimo_etiqueta', e2.etiqueta)
             order by x.desde)
        from (values (v_e.transit_id, v_e.t_primero, v_e.t_ultimo),
                     (v_e.inside_out_id, v_e.io_primero, v_e.io_ultimo)) as x(id, desde, hasta)
        join public.dream_team_equipos a on a.id = x.id
        join public.estudiantes_escala e1 on e1.campus_id = p_campus_id and e1.numero = x.desde
        join public.estudiantes_escala e2 on e2.campus_id = p_campus_id and e2.numero = x.hasta),
    'the_living_room', (
      select jsonb_build_object('ambito_id', a.id, 'nombre', a.label)
        from public.dream_team_equipos a where a.id = v_tlr),
    'grupos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'grupo_id', f.id,
               'nombre', f.nombre,
               'ambito_id', f.ambito_id,
               'ambito', f.ambito,
               'subarea_id', f.subarea_id,
               'subarea', f.subarea,
               'anio', f.anio,
               'anio_etiqueta', f.anio_etiqueta,
               'tipo', case when f.decide then 'por_decidir' else f.tipo end,
               'lideres', coalesce((
                 select jsonb_agg(jsonb_build_object('servicio_id', l.servicio_id, 'persona_id', l.persona_id,
                                                     'nombre', l.nombre, 'apellido', l.apellido, 'rol', l.rol)
                                  order by l.apellido, l.nombre, l.servicio_id)
                   from lideres l where l.grupo_id = f.id), '[]'::jsonb),
               'miembros', f.n_miembros,
               'visitantes', f.n_visitantes,
               'egresan', f.n_egresan,
               'visitantes_egresan', f.n_visitantes_egresan,
               'suben', f.n_miembros - f.n_egresan,
               'queda_vacio', not f.decide and f.n_quedan = 0,
               'despues', case when not f.decide then
                 public.estudiantes_promocion_destino(p_campus_id, f.subarea_destino, f.anio_destino,
                                                      f.nombre_destino, f.nombre_base, f.nombre) end,
               'opciones', case when f.decide then jsonb_build_object(
                 'pasan_chicos', jsonb_build_object(
                   'grupo', public.estudiantes_promocion_destino(p_campus_id, f.subarea_destino, f.anio_destino,
                                                                 f.nombre_destino, f.nombre_base, f.nombre),
                   'nuevo', (select public.estudiantes_promocion_destino(p_campus_id, n.subarea_id, n.anio, n.nombre,
                                                                         n.nombre_base, null)
                               from plan_a n where n.tipo = 'nuevo' and n.origen_id = f.id),
                   'llegan', f.n_miembros - f.n_egresan,
                   'llegan_visitantes', f.n_visitantes - f.n_visitantes_egresan),
                 'pasa_grupo', (
                   select jsonb_build_object(
                            'grupo', public.estudiantes_promocion_destino(p_campus_id, b.subarea_id, b.anio, b.nombre,
                                                                          b.nombre_base, b.nombre_actual),
                            'sin_primer_anio', not exists (select 1 from grupos o
                                                            where o.decide and o.subarea_id = f.subarea_id
                                                              and o.id <> f.id),
                            'servicios', coalesce((
                              select jsonb_agg(jsonb_build_object(
                                       'servicio_id', l.servicio_id, 'persona_id', l.persona_id,
                                       'nombre', l.nombre, 'apellido', l.apellido, 'rol', l.rol,
                                       'rol_destino', (select r2.label from public.dream_team_roles r2
                                                        where r2.id = public.estudiantes_promocion_rol_destino(l.rol_id, b.subarea_id)),
                                       'turnos', (select count(*)::integer from public.dream_team_servicio_turnos st
                                                   where st.servicio_id = l.servicio_id),
                                       'turnos_destino', (select count(*)::integer
                                                            from public.estudiantes_promocion_turnos_destino(l.servicio_id, b.subarea_id)))
                                     order by l.apellido, l.nombre, l.servicio_id)
                                from lideres l where l.grupo_id = f.id), '[]'::jsonb))
                     from plan_b b where b.grupo_id = f.id)) end,
               'integrantes', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'persona_id', mm.persona_id, 'nombre', mm.nombre, 'apellido', mm.apellido,
                          'estado', mm.estado, 'anio', mm.anio_actual, 'anio_etiqueta', e1.etiqueta,
                          'egresa', mm.egresa, 'anio_nuevo', nv.anio, 'anio_nuevo_etiqueta', e2.etiqueta)
                        order by mm.apellido, mm.nombre, mm.persona_id)
                   from miembros mm
                   cross join lateral (
                     select case when mm.egresa then null::smallint
                                 when mm.tiene_ficha and (mm.anio_actual is null or mm.egresado_at is not null)
                                   then mm.anio_actual
                                 when mm.tiene_ficha then (mm.anio_actual + 1)::smallint
                                 when f.decide then v_e.io_primero
                                 else f.anio_destino end as anio
                   ) nv
                   left join public.estudiantes_escala e1 on e1.campus_id = p_campus_id and e1.numero = mm.anio_actual
                   left join public.estudiantes_escala e2 on e2.campus_id = p_campus_id and e2.numero = nv.anio
                  where mm.grupo_id = f.id), '[]'::jsonb))
             order by f.ambito, f.subarea, f.anio, f.nombre, f.id)
        from filas f), '[]'::jsonb),
    'egresados', coalesce((
      select jsonb_agg(jsonb_build_object(
               'persona_id', x.persona_id, 'nombre', x.nombre, 'apellido', x.apellido, 'genero', x.genero,
               'grupo_id', x.grupo_id, 'grupo', x.grupo, 'estado', x.estado,
               'anio', x.anio, 'anio_etiqueta', e1.etiqueta, 'anio_final', x.anio_final, 'anio_final_etiqueta', e2.etiqueta,
               'destino', case when x.destino_id is not null then
                 jsonb_build_object('ambito_id', v_tlr, 'subarea_id', x.destino_id, 'subarea', x.destino) end)
             order by x.apellido, x.nombre, x.persona_id)
        from egresados x
        left join public.estudiantes_escala e1 on e1.campus_id = p_campus_id and e1.numero = x.anio
        left join public.estudiantes_escala e2 on e2.campus_id = p_campus_id and e2.numero = x.anio_final), '[]'::jsonb),
    'sin_grupo', coalesce((
      select jsonb_agg(jsonb_build_object(
               'persona_id', sg.persona_id, 'nombre', sg.nombre, 'apellido', sg.apellido,
               'anio', sg.anio_actual, 'anio_etiqueta', e1.etiqueta, 'egresa', sg.egresa,
               'anio_nuevo', case when not sg.egresa then sg.anio_actual + 1 end,
               'anio_nuevo_etiqueta', e2.etiqueta)
             order by sg.apellido, sg.nombre, sg.persona_id)
        from sin_grupo sg
        left join public.estudiantes_escala e1 on e1.campus_id = p_campus_id and e1.numero = sg.anio_actual
        left join public.estudiantes_escala e2
          on e2.campus_id = p_campus_id and e2.numero = sg.anio_actual + 1 and not sg.egresa), '[]'::jsonb),
    'totales', jsonb_build_object(
      'grupos', (select count(*) from filas),
      'integrantes', (select coalesce(sum(f.n_miembros), 0) from filas f),
      'visitantes', (select coalesce(sum(f.n_visitantes), 0) from filas f),
      'suben', (select coalesce(sum(f.n_miembros - f.n_egresan), 0) from filas f),
      'pasan_inside_out', (select coalesce(sum(f.n_miembros - f.n_egresan), 0) from filas f where f.decide),
      'egresan', (select count(*) from egresados),
      'sin_grupo', (select count(*) from sin_grupo sg where not sg.egresa),
      'por_decidir', (select count(*) from filas f where f.decide),
      'quedan_vacios', (select count(*) from filas f where not f.decide and f.n_quedan = 0)))
    into v_res;

  return v_res;
end;
$$;

comment on function public.estudiantes_promocion_vista(uuid) is
  'Preview of "Promover temporada" for a campus (S11–S15, artboards 09 / 10): groups with leaders, counts and what '
  'each becomes, both options for each last-Transit-year group, graduates with their The Living Room destination, '
  'fichas without a group, totals, and the last promotion (bloqueado within 180 days). Level 3 on every Transit and '
  'Inside Out sub-área of the campus. Errors: sin_autoridad, campus_invalido, escala_invalida.';

revoke all on function public.estudiantes_promocion_vista(uuid) from public, anon;
grant execute on function public.estudiantes_promocion_vista(uuid) to authenticated, service_role;

-- ── 5. applying it ───────────────────────────────────────────────────

create or replace function public.estudiantes_promocion_aplicar(p_campus_id uuid, p_decisiones jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_yo uuid := public.ninos_usuario_actual();
  v_hoy date := public.ninos_hoy();
  v_e record;
  v_ultima timestamptz;
  v_ultimos text[];
  v_dec jsonb;
  v_n integer;
  v_plan jsonb;
  v_r record;
  v_m record;
  v_s record;
  v_egresan uuid[];
  v_foto jsonb;
  v_mapa jsonb := '{}'::jsonb;
  v_abiertos uuid[] := array[]::uuid[];
  v_nuevos jsonb := '[]'::jsonb;
  v_cruzan jsonb := '[]'::jsonb;
  v_grupos_creados uuid[] := array[]::uuid[];
  v_fichas_creadas uuid[] := array[]::uuid[];
  v_lideres_abiertos uuid[] := array[]::uuid[];
  v_servicios_creados uuid[] := array[]::uuid[];
  v_id uuid;
  v_servicio uuid;
  v_periodo uuid;
  v_n_fichas_suben integer;
  v_n_movidos integer := 0;
  v_n_retirados integer := 0;
  v_promocion uuid;
  v_aplicada timestamptz;
  v_resumen jsonb;
begin
  if v_yo is null or not public.estudiantes_campus_visible(p_campus_id) then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  if not exists (select 1 from public.campus c where c.id = p_campus_id) then
    raise exception 'campus_invalido' using errcode = '22023';
  end if;
  select * into v_e from public.estudiantes_promocion_escala(p_campus_id);
  if not public.estudiantes_promocion_autoridad(p_campus_id) then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;

  -- One promotion of a campus at a time; the second waits here and then sees
  -- the first one's record.
  perform 1 from public.campus c where c.id = p_campus_id for update;
  select max(p.aplicada_at) into v_ultima from public.estudiantes_promociones p where p.campus_id = p_campus_id;
  if v_ultima > now() - interval '180 days' then
    raise exception 'promocion_reciente' using errcode = '22023';
  end if;
  perform 1
     from public.estudiantes_grupos g
    where g.campus_id = p_campus_id and g.activo and g.ambito_id in (v_e.transit_id, v_e.inside_out_id)
      for update;

  -- Exactly one decision per active group of the last Transit year.
  if p_decisiones is null or jsonb_typeof(p_decisiones) <> 'object' then
    raise exception 'decision_invalida' using errcode = '22023';
  end if;
  v_ultimos := array(
    select g.id::text from public.estudiantes_grupos g
     where g.campus_id = p_campus_id and g.activo and g.ambito_id = v_e.transit_id and g.anio = v_e.t_ultimo);
  select coalesce(jsonb_object_agg(lower(d.key), d.value), '{}'::jsonb), count(*) into v_dec, v_n
    from jsonb_each(p_decisiones) d;
  if v_n <> cardinality(v_ultimos)
     or (select count(*) from jsonb_object_keys(v_dec)) <> v_n
     or exists (select 1 from jsonb_each(v_dec) d
                 where not (d.key = any (v_ultimos))
                    or d.value not in ('"pasan_chicos"'::jsonb, '"pasa_grupo"'::jsonb)) then
    raise exception 'decision_invalida' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.orden), '[]'::jsonb) into v_plan
    from public.estudiantes_promocion_plan(p_campus_id, v_dec) p;
  if exists (select 1 from jsonb_to_recordset(v_plan) as p(tipo text, subarea_id uuid)
              where p.tipo in ('pasa_grupo', 'nuevo') and p.subarea_id is null) then
    raise exception 'subarea_invalida' using errcode = '22023';
  end if;
  if exists (
    select 1
      from jsonb_to_recordset(v_plan) as p(tipo text, grupo_id uuid, subarea_id uuid)
      join public.estudiantes_grupo_lideres gl on gl.grupo_id = p.grupo_id and gl.hasta is null
      join public.dream_team_servicios sv on sv.id = gl.servicio_id and sv.estado = 'activo'
     where p.tipo = 'pasa_grupo'
       and public.estudiantes_promocion_rol_destino(sv.rol_id, p.subarea_id) is null) then
    raise exception 'rol_invalido' using errcode = '22023';
  end if;

  v_egresan := array(select x.persona_id from public.estudiantes_promocion_egresan(p_campus_id) x);

  -- The rows as they were (S15).
  v_foto := jsonb_build_object(
    'grupos', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'nombre', g.nombre, 'anio', g.anio,
                                          'subarea_id', g.subarea_id, 'ambito_id', g.ambito_id) order by g.id)
        from public.estudiantes_grupos g
       where g.campus_id = p_campus_id and g.activo and g.ambito_id in (v_e.transit_id, v_e.inside_out_id)), '[]'::jsonb),
    'miembros', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'grupo_id', m.grupo_id, 'persona_id', m.persona_id,
                                          'estado', m.estado, 'desde', m.desde, 'confirmado_por', m.confirmado_por,
                                          'confirmado_at', m.confirmado_at) order by m.id)
        from public.estudiantes_grupo_miembros m
        join public.estudiantes_grupos g on g.id = m.grupo_id
       where m.activo and g.campus_id = p_campus_id and g.activo
         and g.ambito_id in (v_e.transit_id, v_e.inside_out_id)), '[]'::jsonb),
    'fichas', coalesce((
      select jsonb_agg(jsonb_build_object('persona_id', f.persona_id, 'campus_id', f.campus_id,
                                          'anio_actual', f.anio_actual, 'anio_final', f.anio_final,
                                          'egresado_at', f.egresado_at) order by f.persona_id)
        from public.estudiantes_fichas f
       where f.campus_id = p_campus_id or f.persona_id = any (v_egresan)), '[]'::jsonb),
    'lideres', coalesce((
      select jsonb_agg(jsonb_build_object('id', gl.id, 'grupo_id', gl.grupo_id, 'servicio_id', gl.servicio_id,
                                          'desde', gl.desde) order by gl.id)
        from public.estudiantes_grupo_lideres gl
        join public.estudiantes_grupos g on g.id = gl.grupo_id
       where gl.hasta is null and g.campus_id = p_campus_id and g.activo
         and g.ambito_id in (v_e.transit_id, v_e.inside_out_id)), '[]'::jsonb),
    'servicios', coalesce((
      select jsonb_agg(jsonb_build_object('id', sv.id, 'persona_id', sv.persona_id, 'equipo_id', sv.equipo_id,
                                          'rol_id', sv.rol_id, 'estado', sv.estado, 'version', sv.version,
                                          'motivo_actual', sv.motivo_actual, 'fecha_fin', sv.fecha_fin)
                       order by sv.id)
        from public.dream_team_servicios sv
       where sv.id in (select gl.servicio_id
                         from jsonb_to_recordset(v_plan) as p(tipo text, grupo_id uuid)
                         join public.estudiantes_grupo_lideres gl on gl.grupo_id = p.grupo_id and gl.hasta is null
                        where p.tipo = 'pasa_grupo')), '[]'::jsonb),
    'egresan', to_jsonb(v_egresan));

  perform set_config('estudiantes.promocion', 'on', true);

  -- Graduates leave their Transit / Inside Out group; their ficha is marked
  -- (one is created at the last year for a graduate without ficha).
  update public.estudiantes_grupo_miembros m
     set activo = false, retirado_at = now()
    from public.estudiantes_grupos g
   where g.id = m.grupo_id and m.activo and m.persona_id = any (v_egresan)
     and g.campus_id = p_campus_id and g.ambito_id in (v_e.transit_id, v_e.inside_out_id);
  for v_m in
    select x as persona_id from unnest(v_egresan) as x
     where not exists (select 1 from public.estudiantes_fichas f where f.persona_id = x)
     order by x
  loop
    perform public.estudiantes_ficha_asegurar(v_m.persona_id, p_campus_id, v_e.io_ultimo, v_yo);
    v_fichas_creadas := v_fichas_creadas || v_m.persona_id;
  end loop;
  update public.estudiantes_fichas f
     set egresado_at = coalesce(f.egresado_at, now()), updated_by = v_yo
   where f.persona_id = any (v_egresan);

  -- Every other ficha of the campus moves up one year (S14).
  update public.estudiantes_fichas f
     set anio_actual = f.anio_actual + 1, updated_by = v_yo
   where f.campus_id = p_campus_id and f.egresado_at is null
     and f.anio_actual is not null and f.anio_actual < f.anio_final;
  get diagnostics v_n_fichas_suben = row_count;

  -- Names are freed first: the unique index of active names is checked per row.
  update public.estudiantes_grupos g
     set nombre = '~' || g.id::text
   where g.campus_id = p_campus_id and g.activo and g.ambito_id in (v_e.transit_id, v_e.inside_out_id);

  -- Groups that stay in their sub-área.
  for v_r in
    select * from jsonb_to_recordset(v_plan)
      as p(orden integer, grupo_id uuid, tipo text, anio smallint, nombre text)
     where p.tipo in ('sube', 'vuelve', 'pasan_chicos')
     order by p.orden
  loop
    update public.estudiantes_grupos g set anio = v_r.anio, nombre = v_r.nombre where g.id = v_r.grupo_id;
  end loop;

  -- 'pasa_grupo': the group crosses with its members; its leaders get an equal
  -- servicio in the Inside Out sub-área and a new period.
  for v_r in
    select * from jsonb_to_recordset(v_plan)
      as p(orden integer, grupo_id uuid, tipo text, subarea_id uuid, anio smallint, nombre text)
     where p.tipo = 'pasa_grupo'
     order by p.orden
  loop
    update public.estudiantes_grupo_miembros m
       set activo = false, retirado_at = now()
     where m.grupo_id = v_r.grupo_id and m.activo
       and exists (select 1 from public.estudiantes_grupo_miembros a
                    where a.persona_id = m.persona_id and a.ambito_id = v_e.inside_out_id and a.activo);
    v_abiertos := array[]::uuid[];
    for v_s in
      select gl.id as periodo_id, sv.id, sv.estado, sv.persona_id,
             public.estudiantes_promocion_rol_destino(sv.rol_id, v_r.subarea_id) as rol_destino
        from public.estudiantes_grupo_lideres gl
        join public.dream_team_servicios sv on sv.id = gl.servicio_id
       where gl.grupo_id = v_r.grupo_id and gl.hasta is null
       order by sv.id
    loop
      update public.estudiantes_grupo_lideres gl set hasta = now(), cerrado_por = v_yo where gl.id = v_s.periodo_id;
      if v_s.estado = 'activo' then
        v_servicio := (v_mapa ->> v_s.id::text)::uuid;
        if v_servicio is null then
          -- A person who already serves there with that rol keeps that servicio.
          select sv.id into v_servicio
            from public.dream_team_servicios sv
           where sv.persona_id = v_s.persona_id and sv.equipo_id = v_r.subarea_id
             and sv.rol_id = v_s.rol_destino and sv.estado = 'activo'
           order by sv.fecha_inicio, sv.id
           limit 1;
          if v_servicio is null then
            v_servicio := public.estudiantes_promocion_reasignar(
              v_s.id, v_r.subarea_id, v_yo,
              'Promoción de temporada: pasa a ' || (select s.label from public.dream_team_equipos s where s.id = v_r.subarea_id)
              || ' de ' || (select a.label from public.dream_team_equipos a where a.id = v_e.inside_out_id));
            v_servicios_creados := v_servicios_creados || v_servicio;
          end if;
          v_mapa := v_mapa || jsonb_build_object(v_s.id::text, v_servicio);
        end if;
        v_abiertos := v_abiertos || v_servicio;
      end if;
    end loop;
    update public.estudiantes_grupos g
       set subarea_id = v_r.subarea_id, anio = v_r.anio, nombre = v_r.nombre
     where g.id = v_r.grupo_id;
    for v_id in
      select distinct x from unnest(v_abiertos) as x order by x
    loop
      if not exists (select 1 from public.estudiantes_grupo_lideres gl
                      where gl.grupo_id = v_r.grupo_id and gl.servicio_id = v_id and gl.hasta is null) then
        insert into public.estudiantes_grupo_lideres (grupo_id, servicio_id, desde, created_by)
        values (v_r.grupo_id, v_id, now(), v_yo)
        returning id into v_periodo;
        v_lideres_abiertos := v_lideres_abiertos || v_periodo;
      end if;
    end loop;
    v_cruzan := v_cruzan || jsonb_build_array(jsonb_build_object('grupo_id', v_r.grupo_id, 'nombre', v_r.nombre));
  end loop;

  -- A Transit servicio is retired once no active group of its sub-área keeps it.
  for v_id in
    select k::uuid from jsonb_object_keys(v_mapa) as k order by k
  loop
    if not exists (
      select 1
        from public.estudiantes_grupo_lideres gl
        join public.estudiantes_grupos g on g.id = gl.grupo_id
        join public.dream_team_servicios sv on sv.id = gl.servicio_id
       where gl.servicio_id = v_id and gl.hasta is null and g.activo and g.subarea_id = sv.equipo_id
    ) then
      if public.estudiantes_promocion_retirar(
           v_id, v_yo,
           'Promoción de temporada: pasa a ' || (select a.label from public.dream_team_equipos a where a.id = v_e.inside_out_id)) then
        v_n_retirados := v_n_retirados + 1;
      end if;
    end if;
  end loop;

  -- 'pasan_chicos': a new group without leader receives the members.
  for v_r in
    select * from jsonb_to_recordset(v_plan)
      as p(orden integer, origen_id uuid, tipo text, subarea_id uuid, anio smallint, nombre text)
     where p.tipo = 'nuevo'
     order by p.orden
  loop
    insert into public.estudiantes_grupos (campus_id, subarea_id, nombre, anio, created_by)
    values (p_campus_id, v_r.subarea_id, v_r.nombre, v_r.anio, v_yo)
    returning id into v_id;
    v_grupos_creados := v_grupos_creados || v_id;
    v_nuevos := v_nuevos || jsonb_build_array(jsonb_build_object('grupo_id', v_id, 'nombre', v_r.nombre,
                                                                 'origen_id', v_r.origen_id));
    for v_m in
      select m.id, m.persona_id, m.estado
        from public.estudiantes_grupo_miembros m
       where m.grupo_id = v_r.origen_id and m.activo
       order by m.persona_id
    loop
      update public.estudiantes_grupo_miembros m set activo = false, retirado_at = now() where m.id = v_m.id;
      if not exists (select 1 from public.estudiantes_grupo_miembros a
                      where a.persona_id = v_m.persona_id and a.ambito_id = v_e.inside_out_id and a.activo) then
        perform public.estudiantes_incorporar(v_id, v_m.persona_id, v_m.estado, v_hoy, v_yo);
        v_n_movidos := v_n_movidos + 1;
      end if;
    end loop;
  end loop;

  -- A member without ficha takes the new year of their group (S14).
  for v_m in
    select distinct on (m.persona_id) m.persona_id, g.anio
      from public.estudiantes_grupo_miembros m
      join public.estudiantes_grupos g on g.id = m.grupo_id
     where m.activo and g.activo and g.campus_id = p_campus_id
       and g.ambito_id in (v_e.transit_id, v_e.inside_out_id)
       and not exists (select 1 from public.estudiantes_fichas f where f.persona_id = m.persona_id)
     order by m.persona_id, g.anio
  loop
    perform public.estudiantes_ficha_asegurar(v_m.persona_id, p_campus_id, v_m.anio, v_yo);
    v_fichas_creadas := v_fichas_creadas || v_m.persona_id;
  end loop;

  perform set_config('estudiantes.promocion', '', true);

  v_resumen := jsonb_build_object(
    'campus_id', p_campus_id,
    'grupos', (select count(*) from jsonb_to_recordset(v_plan) as p(tipo text) where p.tipo <> 'nuevo'),
    'renombrados', (select count(*) from jsonb_to_recordset(v_plan) as p(tipo text, nombre_actual text, nombre text)
                     where p.tipo <> 'nuevo' and p.nombre is distinct from p.nombre_actual),
    'egresan', cardinality(v_egresan),
    'fichas_suben', v_n_fichas_suben,
    'fichas_creadas', cardinality(v_fichas_creadas),
    'miembros_movidos', v_n_movidos,
    'servicios_retirados', v_n_retirados,
    'servicios_abiertos', cardinality(v_servicios_creados),
    'grupos_nuevos', v_nuevos,
    'pasan_grupo', v_cruzan);

  insert into public.estudiantes_promociones (campus_id, aplicada_por, decisiones, resumen, foto)
  values (p_campus_id, v_yo, v_dec, v_resumen,
          v_foto || jsonb_build_object('creados', jsonb_build_object(
            'grupos', to_jsonb(v_grupos_creados),
            'fichas', to_jsonb(v_fichas_creadas),
            'lideres', to_jsonb(v_lideres_abiertos),
            'servicios', to_jsonb(v_servicios_creados),
            'servicios_reasignados', v_mapa)))
  returning id, aplicada_at into v_promocion, v_aplicada;

  return v_resumen || jsonb_build_object(
    'promocion_id', v_promocion,
    'aplicada_at', v_aplicada,
    'proxima', ((v_aplicada + interval '180 days') at time zone 'America/Caracas')::date);
end;
$$;

comment on function public.estudiantes_promocion_aplicar(uuid, jsonb) is
  'Applies "Promover temporada" to a campus in one transaction (S11–S15): every active Transit / Inside Out group '
  'moves up a year with its leaders (renamed when it starts with the old year label, " B" on a clash), each '
  'last-Transit-year group follows p_decisiones (''pasan_chicos'': its members to a new first-Inside-Out-year group '
  'without leader, the group back to the first year; ''pasa_grupo'': the group crosses, its leaders'' servicios are '
  'reassigned), the last Inside Out year graduates and goes back to the first Inside Out year, every ficha moves up '
  'and graduates are marked egresado. Stores the record and a snapshot in estudiantes_promociones; returns a '
  'summary. Errors: sin_autoridad, campus_invalido, escala_invalida, promocion_reciente, decision_invalida, '
  'subarea_invalida, rol_invalido.';

revoke all on function public.estudiantes_promocion_aplicar(uuid, jsonb) from public, anon;
grant execute on function public.estudiantes_promocion_aplicar(uuid, jsonb) to authenticated, service_role;

-- ── 6. graduates in "Sin grupo" of The Living Room ───────────────────

-- estudiantes_sin_grupo (20261029130000_estudiantes_gestion_grupos.sql), plus:
-- for a Transit / Inside Out group, graduates and people with an active
-- Estudiantes group of the campus (any ámbito) are left out; for a The Living Room group, the graduates of its campus (S13) of the
-- sub-área's sexo with no active group in its ámbito; their last group is
-- the Estudiantes group they left, with the name it had then.
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
  select g.id, g.campus_id, g.ambito_id, g.subarea_id, a.experiencia,
         public.dream_team_normalizar_etiqueta(s.label) as subarea_label
    into v_g
    from public.estudiantes_grupos g
    join public.dream_team_equipos a on a.id = g.ambito_id
    join public.dream_team_equipos s on s.id = g.subarea_id
   where g.id = p_grupo_id and g.activo;
  if not found then
    raise exception 'grupo_invalido' using errcode = '22023';
  end if;
  if public.estudiantes_nivel_grupo(p_grupo_id) < 3 then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;

  return query
  select x.persona_id, x.nombre, x.apellido, x.anio_etiqueta, x.ultimo_grupo, x.retirado_at
    from (
      select distinct on (y.persona_id) y.persona_id, y.nombre, y.apellido, y.anio_etiqueta, y.ultimo_grupo, y.retirado_at
        from (
          select m.persona_id, u.nombre, u.apellido, ef.etiqueta as anio_etiqueta, g.nombre as ultimo_grupo,
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
             -- Transit / Inside Out: not a graduate, and in no active Estudiantes
             -- group of the campus (whoever crossed to Inside Out has one).
             and (v_g.experiencia <> 'estudiantes'
                  or (not exists (select 1 from public.estudiantes_fichas fe
                                   where fe.persona_id = m.persona_id and fe.egresado_at is not null)
                      and not exists (select 1
                                        from public.estudiantes_grupo_miembros a
                                        join public.estudiantes_grupos ga on ga.id = a.grupo_id
                                        join public.dream_team_equipos aa on aa.id = ga.ambito_id
                                       where a.persona_id = m.persona_id and a.activo and ga.activo
                                         and ga.campus_id = v_g.campus_id and aa.experiencia = 'estudiantes')))
          union all
          select f.persona_id, u.nombre, u.apellido, ef.etiqueta, lg.nombre, coalesce(lg.retirado_at, f.egresado_at)
            from public.estudiantes_fichas f
            join public.usuarios u on u.id = f.persona_id
            left join public.estudiantes_escala ef on ef.campus_id = f.campus_id and ef.numero = f.anio_actual
            left join lateral (
              select coalesce((select fg.value ->> 'nombre'
                                 from public.estudiantes_promociones p
                                 cross join lateral jsonb_array_elements(p.foto -> 'grupos') fg
                                where p.campus_id = g2.campus_id and fg.value ->> 'id' = g2.id::text
                                  and p.aplicada_at >= m2.retirado_at
                                order by p.aplicada_at
                                limit 1), g2.nombre) as nombre,
                     m2.retirado_at
                from public.estudiantes_grupo_miembros m2
                join public.estudiantes_grupos g2 on g2.id = m2.grupo_id
                join public.dream_team_equipos a2 on a2.id = g2.ambito_id
               where m2.persona_id = f.persona_id and not m2.activo and a2.experiencia = 'estudiantes'
               order by m2.retirado_at desc nulls last, m2.id
               limit 1
            ) lg on true
           where v_g.experiencia = 'the_living_room'
             and f.campus_id = v_g.campus_id
             and f.egresado_at is not null
             and case v_g.subarea_label
                   when 'grupos de chicas' then u.genero::text is distinct from 'Masculino'
                   when 'grupos de chicos' then u.genero::text is distinct from 'Femenino'
                   else false
                 end
             and not exists (select 1 from public.estudiantes_grupo_miembros a
                              where a.persona_id = f.persona_id and a.ambito_id = v_g.ambito_id and a.activo)
        ) y
       order by y.persona_id, y.retirado_at desc nulls last
    ) x
   order by x.retirado_at desc nulls last, x.apellido, x.nombre, x.persona_id
   limit 50;
end;
$$;

comment on function public.estudiantes_sin_grupo(uuid) is
  'People who were in a group of the same sub-área and campus and have no active group in the ámbito today, '
  'last removed first (level 3 on the group). For a Transit / Inside Out group, graduates and people in an active '
  'Estudiantes group of the campus are left out. For a The Living Room group also the graduates of its campus (S13) '
  'of the sub-área''s sexo (Femenino → Chicas, Masculino → Chicos, anyone else in both) with no active group in '
  'its ámbito. At most 50. Errors: sin_autoridad, grupo_invalido.';

revoke all on function public.estudiantes_sin_grupo(uuid) from public, anon;
grant execute on function public.estudiantes_sin_grupo(uuid) to authenticated, service_role;
