-- Paso 1 (b) — Dream Team: cerrar las cuatro tablas en negación total.
--
-- ── PROBLEMA ───────────────────────────────────────────────────────────
-- En PRODUCCIÓN, cuatro tablas del dominio tienen RLS habilitado y CERO
-- políticas, es decir negación total para el rol `authenticated`:
--
--   dream_team_requisitos
--   dream_team_requisitos_verificacion
--   dream_team_estados_historial
--   dream_team_participation_eventos
--
-- Es exactamente el mismo defecto que rompió el flujo de asignación de Cimiento
-- 4 y que 20260822000001_talleres_dream_team_core_rls.sql cerró para equipos,
-- roles y servicios — pero esas cuatro quedaron afuera. Sin ellas no hay
-- requisitos por rol (audiciones, entrenamiento), ni historial de las seis
-- etapas, ni eventos de participación: el ciclo del voluntario no puede operar.
--
-- ── QUÉ HACE ───────────────────────────────────────────────────────────
-- Replica, byte por byte, las políticas que STAGING ya tiene sobre estas mismas
-- cuatro tablas, para que producción converja al estado de staging en vez de
-- inventar un tercer criterio. Los nombres y las definiciones se leyeron de
-- `pg_policies` en staging, no se redactaron de memoria.
--
-- Forma del gate:
--   lectura   = serve | lead | coordinate | director.coordinate
--               | requirements.manage | metrics.read
--   requisitos (escritura y edición) = requirements.manage | director.coordinate
--   historial y eventos (append)     = director.coordinate
--
-- Historial y eventos son append-only a propósito: son bitácora del ciclo del
-- voluntario. No se otorga UPDATE ni DELETE sobre ellos.
--
-- ── DEPENDENCIA ────────────────────────────────────────────────────────
-- Requiere 20260910120000_dream_team_org_writable.sql, que repara
-- `auth_has_dream_team_capability`. Aplicada ANTES de esa reparación, esta
-- migración crea políticas que igual niegan todo, porque el gate estaba muerto.
--
-- ── BLAST RADIUS ───────────────────────────────────────────────────────
-- Aditiva, forward-only, idempotente. En staging es un no-op: las políticas ya
-- existen con estos mismos nombres y definiciones. En producción pasa de
-- negación total a negación efectiva salvo para quien tenga capabilities
-- `dream_team.*`, y hoy no las tiene nadie. Cero impacto sobre Grupos de Vida.

-- ── dream_team_requisitos ──────────────────────────────────────────────
alter table public.dream_team_requisitos enable row level security;

drop policy if exists dream_team_requisitos_read on public.dream_team_requisitos;
create policy dream_team_requisitos_read on public.dream_team_requisitos
  for select to public
  using (
    auth_has_dream_team_capability('dream_team.serve')
    or auth_has_dream_team_capability('dream_team.lead')
    or auth_has_dream_team_capability('dream_team.coordinate')
    or auth_has_dream_team_capability('dream_team.director.coordinate')
    or auth_has_dream_team_capability('dream_team.requirements.manage')
    or auth_has_dream_team_capability('dream_team.metrics.read')
  );

drop policy if exists dream_team_requisitos_write on public.dream_team_requisitos;
create policy dream_team_requisitos_write on public.dream_team_requisitos
  for insert to public
  with check (
    auth_has_dream_team_capability('dream_team.requirements.manage')
    or auth_has_dream_team_capability('dream_team.director.coordinate')
  );

drop policy if exists dream_team_requisitos_update on public.dream_team_requisitos;
create policy dream_team_requisitos_update on public.dream_team_requisitos
  for update to public
  using (
    auth_has_dream_team_capability('dream_team.requirements.manage')
    or auth_has_dream_team_capability('dream_team.director.coordinate')
  )
  with check (
    auth_has_dream_team_capability('dream_team.requirements.manage')
    or auth_has_dream_team_capability('dream_team.director.coordinate')
  );

-- ── dream_team_requisitos_verificacion ─────────────────────────────────
alter table public.dream_team_requisitos_verificacion enable row level security;

drop policy if exists dream_team_requisitos_verificacion_read on public.dream_team_requisitos_verificacion;
create policy dream_team_requisitos_verificacion_read on public.dream_team_requisitos_verificacion
  for select to public
  using (
    auth_has_dream_team_capability('dream_team.serve')
    or auth_has_dream_team_capability('dream_team.lead')
    or auth_has_dream_team_capability('dream_team.coordinate')
    or auth_has_dream_team_capability('dream_team.director.coordinate')
    or auth_has_dream_team_capability('dream_team.requirements.manage')
    or auth_has_dream_team_capability('dream_team.metrics.read')
  );

drop policy if exists dream_team_requisitos_verificacion_write on public.dream_team_requisitos_verificacion;
create policy dream_team_requisitos_verificacion_write on public.dream_team_requisitos_verificacion
  for insert to public
  with check (
    auth_has_dream_team_capability('dream_team.requirements.manage')
    or auth_has_dream_team_capability('dream_team.director.coordinate')
  );

drop policy if exists dream_team_requisitos_verificacion_update on public.dream_team_requisitos_verificacion;
create policy dream_team_requisitos_verificacion_update on public.dream_team_requisitos_verificacion
  for update to public
  using (
    auth_has_dream_team_capability('dream_team.requirements.manage')
    or auth_has_dream_team_capability('dream_team.director.coordinate')
  )
  with check (
    auth_has_dream_team_capability('dream_team.requirements.manage')
    or auth_has_dream_team_capability('dream_team.director.coordinate')
  );

-- ── dream_team_estados_historial (append-only) ─────────────────────────
alter table public.dream_team_estados_historial enable row level security;

drop policy if exists dream_team_estados_historial_read on public.dream_team_estados_historial;
create policy dream_team_estados_historial_read on public.dream_team_estados_historial
  for select to public
  using (
    auth_has_dream_team_capability('dream_team.serve')
    or auth_has_dream_team_capability('dream_team.lead')
    or auth_has_dream_team_capability('dream_team.coordinate')
    or auth_has_dream_team_capability('dream_team.director.coordinate')
    or auth_has_dream_team_capability('dream_team.requirements.manage')
    or auth_has_dream_team_capability('dream_team.metrics.read')
  );

drop policy if exists dream_team_estados_historial_write on public.dream_team_estados_historial;
create policy dream_team_estados_historial_write on public.dream_team_estados_historial
  for insert to public
  with check (auth_has_dream_team_capability('dream_team.director.coordinate'));

-- ── dream_team_participation_eventos (append-only) ─────────────────────
alter table public.dream_team_participation_eventos enable row level security;

drop policy if exists dream_team_participation_eventos_read on public.dream_team_participation_eventos;
create policy dream_team_participation_eventos_read on public.dream_team_participation_eventos
  for select to public
  using (
    auth_has_dream_team_capability('dream_team.serve')
    or auth_has_dream_team_capability('dream_team.lead')
    or auth_has_dream_team_capability('dream_team.coordinate')
    or auth_has_dream_team_capability('dream_team.director.coordinate')
    or auth_has_dream_team_capability('dream_team.requirements.manage')
    or auth_has_dream_team_capability('dream_team.metrics.read')
  );

drop policy if exists dream_team_participation_eventos_write on public.dream_team_participation_eventos;
create policy dream_team_participation_eventos_write on public.dream_team_participation_eventos
  for insert to public
  with check (auth_has_dream_team_capability('dream_team.director.coordinate'));
