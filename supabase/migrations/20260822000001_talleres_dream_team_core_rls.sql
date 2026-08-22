-- Dream Team core RLS — roles / equipos / servicios
--
-- These three tables had RLS ENABLED but ZERO policies, so the `authenticated`
-- role was default-denied on every operation. That silently broke the
-- Cimiento 4 assign-servicio flow: the coordinador/director dropdown reads
-- dream_team_roles (→ empty), and the assignment writes dream_team_servicios
-- (→ blocked). service_role bypasses RLS, so the seeded rows were invisible
-- only to the app, not to admin tooling.
--
-- Cimiento 3a rewrote RLS on the talleres_* tables but never added policies to
-- the dream_team_* tables; this migration closes that gap.
--
-- Additive, forward-only, idempotent. It only ADDS policies; it never drops
-- tables/columns or deletes data. Blast radius at write time: 2 equipos (both
-- experiencia='talleres_crecimiento'), 4 roles, 0 servicios, and no rows of any
-- other experiencia — so no other feature regresses.
--
-- Gate shape mirrors the live talleres_crecimiento_cohortes policies:
--   read  = director.read | admin.manage | coordinator.read (scoped)
--           | lead.read | volunteer.read | participation.read | metrics.read
--   write = director.write | admin.manage           (servicios only)
--
-- SECURITY NOTE: dream_team_servicios is grant-bearing — an INSERT fires
-- sync_talleres_grants_on_servicio_change (SECURITY DEFINER), which mints the
-- scoped capability grants. Its write policies therefore deliberately EXCLUDE
-- coordinator.write: a coordinador must not be able to mint grants for other
-- people. This matches the app gate (director.write || admin.manage) on the
-- assign card. Reads still expose the coordinador's own equipo (scoped).

-- ── dream_team_roles (reference data, keyed by equipo_id) ───────────────
alter table public.dream_team_roles enable row level security;

drop policy if exists dream_team_roles_select on public.dream_team_roles;
create policy dream_team_roles_select on public.dream_team_roles
  for select to public
  using (
    auth_has_talleres_capability('talleres_crecimiento.director.read')
    or auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    or auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', equipo_id)
    or auth_has_talleres_capability('talleres_crecimiento.lead.read')
    or auth_has_talleres_capability('talleres_crecimiento.volunteer.read')
    or auth_has_talleres_capability('talleres_crecimiento.participation.read')
    or auth_has_talleres_capability('talleres_crecimiento.metrics.read')
  );

-- ── dream_team_equipos (reference data, keyed by id) ────────────────────
alter table public.dream_team_equipos enable row level security;

drop policy if exists dream_team_equipos_select on public.dream_team_equipos;
create policy dream_team_equipos_select on public.dream_team_equipos
  for select to public
  using (
    auth_has_talleres_capability('talleres_crecimiento.director.read')
    or auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    or auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', id)
    or auth_has_talleres_capability('talleres_crecimiento.lead.read')
    or auth_has_talleres_capability('talleres_crecimiento.volunteer.read')
    or auth_has_talleres_capability('talleres_crecimiento.participation.read')
    or auth_has_talleres_capability('talleres_crecimiento.metrics.read')
  );

-- ── dream_team_servicios (grant-bearing, keyed by equipo_id) ────────────
alter table public.dream_team_servicios enable row level security;

drop policy if exists dream_team_servicios_select on public.dream_team_servicios;
create policy dream_team_servicios_select on public.dream_team_servicios
  for select to public
  using (
    auth_has_talleres_capability('talleres_crecimiento.director.read')
    or auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    or auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', equipo_id)
    or auth_has_talleres_capability('talleres_crecimiento.lead.read')
    or auth_has_talleres_capability('talleres_crecimiento.volunteer.read')
    or auth_has_talleres_capability('talleres_crecimiento.participation.read')
    or auth_has_talleres_capability('talleres_crecimiento.metrics.read')
  );

drop policy if exists dream_team_servicios_insert on public.dream_team_servicios;
create policy dream_team_servicios_insert on public.dream_team_servicios
  for insert to public
  with check (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    or auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  );

drop policy if exists dream_team_servicios_update on public.dream_team_servicios;
create policy dream_team_servicios_update on public.dream_team_servicios
  for update to public
  using (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    or auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  )
  with check (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    or auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  );
