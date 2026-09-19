-- Talleres self-enroll RLS contract checks (taller_inscripciones_insert).
--
-- Covers acceptance criteria 1-6 of
-- odd/tasks/talleres-autoinscripcion.md for the self-enroll branch of
-- taller_inscripciones_insert (and its SELECT-side neighbours):
--   1. A member with zero talleres capabilities can insert their own
--      'pendiente' inscripcion into an 'abierto' edicion and see it.
--   2. They cannot insert as somebody else, nor with an estado other than
--      'pendiente'.
--   3. They cannot enroll into a 'borrador', 'cerrado' or 'cancelado'
--      edicion.
--   4. They cannot pair a taller_id with a cohorte_id that belongs to a
--      DIFFERENT edicion.
--   5. They cannot see a 'borrador' edicion or another member's inscripcion.
--   6. Coordinador/director/admin can still insert on somebody else's
--      behalf, unrestricted by the new self-branch guards (including into
--      a 'borrador' edicion, since those guards only apply to the self
--      branch of the OR).
--
-- HARNESS FORM — verified against STAGING via the Supabase MCP
-- (mcp__supabase-global-staging__execute_sql):
--   Plain `BEGIN; ... ROLLBACK;` works as a single multi-statement call —
--   the MCP connection does not wrap calls in its own outer transaction, so
--   a real BEGIN/ROLLBACK pair is honoured and nothing written inside it is
--   persisted. No DO-block workaround was needed. (Verified with a
--   throwaway INSERT into public.talleres that was gone after ROLLBACK.)
--
-- The harness creates fixtures as the connection's owner role (which
-- bypasses RLS), then does the actual assertions under
-- `SET LOCAL ROLE authenticated` with `request.jwt.claims` set per
-- identity, so INSERT/SELECT are evaluated by the real RLS policies. Temp
-- tables/functions created by the owner role are GRANTed to `authenticated`
-- for the duration of the transaction so the role switch can still reach
-- them; everything (fixtures, grants, rows) rolls back at the end.
--
-- Expected-denied inserts are asserted via SQLSTATE 42501
-- (insufficient_privilege) specifically — a raw insert failing for any
-- OTHER reason (unique violation, check violation, etc.) is treated as a
-- test failure, not a pass.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

-- ===========================================================================
-- 1. Assertion helpers
-- ===========================================================================

CREATE OR REPLACE FUNCTION pg_temp.assert_bool(
  p_case text,
  p_actual boolean,
  p_expected boolean
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'Assertion failed: %, expected %, got %', p_case, p_expected, p_actual;
  END IF;
END;
$$;

-- Inserts and expects RLS to ALLOW it. Any insufficient_privilege (42501) or
-- other error fails loudly with the real SQLSTATE/message.
CREATE OR REPLACE FUNCTION pg_temp.assert_self_enroll_allowed(
  p_case text,
  p_taller_id uuid,
  p_cohorte_id uuid,
  p_persona_principal_id uuid,
  p_estado text DEFAULT 'pendiente'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.taller_inscripciones (taller_id, cohorte_id, persona_principal_id, estado)
  VALUES (p_taller_id, p_cohorte_id, p_persona_principal_id, p_estado);
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Assertion failed: %, expected the insert to be allowed but got % : %',
      p_case, SQLSTATE, SQLERRM;
END;
$$;

-- Inserts and expects RLS to DENY it with SQLSTATE 42501
-- (insufficient_privilege). A successful insert, or a failure for any other
-- reason, fails the assertion loudly.
CREATE OR REPLACE FUNCTION pg_temp.assert_self_enroll_denied(
  p_case text,
  p_taller_id uuid,
  p_cohorte_id uuid,
  p_persona_principal_id uuid,
  p_estado text DEFAULT 'pendiente'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.taller_inscripciones (taller_id, cohorte_id, persona_principal_id, estado)
  VALUES (p_taller_id, p_cohorte_id, p_persona_principal_id, p_estado);

  RAISE EXCEPTION 'Assertion failed: %, expected RLS to deny the insert (42501) but it succeeded', p_case;
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL; -- expected: RLS rejected the row.
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Assertion failed: %, expected SQLSTATE 42501 (insufficient_privilege) but got % : %',
      p_case, SQLSTATE, SQLERRM;
END;
$$;

-- Coordinador/director/admin insert on somebody else's behalf, unrestricted
-- by the self-branch guards. Same success/failure contract as _allowed.
CREATE OR REPLACE FUNCTION pg_temp.assert_privileged_enroll_allowed(
  p_case text,
  p_taller_id uuid,
  p_cohorte_id uuid,
  p_persona_principal_id uuid,
  p_estado text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.taller_inscripciones (taller_id, cohorte_id, persona_principal_id, estado)
  VALUES (p_taller_id, p_cohorte_id, p_persona_principal_id, p_estado);
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Assertion failed: %, expected the privileged insert to be allowed but got % : %',
      p_case, SQLSTATE, SQLERRM;
END;
$$;

-- ===========================================================================
-- 2. Fixtures — created as the owner role (bypasses RLS)
-- ===========================================================================

CREATE TEMP TABLE rls_fixture (
  key text PRIMARY KEY,
  id uuid NOT NULL DEFAULT gen_random_uuid()
);

INSERT INTO rls_fixture (key) VALUES
  ('ev_abierto1'), ('ed_abierto1'), ('coh_abierto1'),
  ('ev_abierto2'), ('ed_abierto2'), ('coh_abierto2'),
  ('ev_encurso1'), ('ed_encurso1'), ('coh_encurso1'),
  ('ev_borrador1'), ('ed_borrador1'), ('coh_borrador1'),
  ('ev_cerrado1'), ('ed_cerrado1'), ('coh_cerrado1'),
  ('ev_cancelado1'), ('ed_cancelado1'), ('coh_cancelado1');

CREATE OR REPLACE FUNCTION pg_temp.fid(p_key text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT id FROM rls_fixture WHERE key = p_key;
$$;

-- Real staging members: two with NO active talleres_crecimiento capability
-- (resolved by query, never hardcoded), and one privileged identity
-- (coordinator.write / director.write / admin.manage). If staging currently
-- has no such active grant, a temporary one is created for the fallback
-- member — it rolls back with everything else.
CREATE TEMP TABLE rls_actor (
  key text PRIMARY KEY,
  user_id uuid NOT NULL,
  auth_id uuid NOT NULL
);

INSERT INTO rls_actor (key, user_id, auth_id)
SELECT 'no_cap', u.id, u.auth_id
FROM public.usuarios u
WHERE u.auth_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.dream_team_capability_grants g
    WHERE g.persona_id = u.id
      AND g.capability_key LIKE 'talleres_crecimiento%'
      AND g.revoked_at IS NULL
  )
ORDER BY u.fecha_registro ASC
LIMIT 1;

INSERT INTO rls_actor (key, user_id, auth_id)
SELECT 'other', u.id, u.auth_id
FROM public.usuarios u
WHERE u.auth_id IS NOT NULL
  AND u.id NOT IN (SELECT user_id FROM rls_actor)
  AND NOT EXISTS (
    SELECT 1 FROM public.dream_team_capability_grants g
    WHERE g.persona_id = u.id
      AND g.capability_key LIKE 'talleres_crecimiento%'
      AND g.revoked_at IS NULL
  )
ORDER BY u.fecha_registro ASC
LIMIT 1;

INSERT INTO rls_actor (key, user_id, auth_id)
SELECT 'privileged', u.id, u.auth_id
FROM public.dream_team_capability_grants g
JOIN public.usuarios u ON u.id = g.persona_id
WHERE g.capability_key IN (
    'talleres_crecimiento.coordinator.write',
    'talleres_crecimiento.director.write',
    'talleres_crecimiento.admin.manage'
  )
  AND g.revoked_at IS NULL
  AND u.auth_id IS NOT NULL
LIMIT 1;

-- Fallback: no active privileged grant on staging today — grant one
-- temporarily to the 'other' member so criterion 6 can still be exercised.
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id)
SELECT a.user_id, 'talleres_crecimiento.admin.manage', 'talleres_crecimiento', 'experience', NULL
FROM rls_actor a
WHERE a.key = 'other'
  AND NOT EXISTS (SELECT 1 FROM rls_actor WHERE key = 'privileged');

INSERT INTO rls_actor (key, user_id, auth_id)
SELECT 'privileged', a.user_id, a.auth_id
FROM rls_actor a
WHERE a.key = 'other'
  AND NOT EXISTS (SELECT 1 FROM rls_actor WHERE key = 'privileged');

CREATE OR REPLACE FUNCTION pg_temp.actor_user(p_key text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT user_id FROM rls_actor WHERE key = p_key;
$$;

CREATE OR REPLACE FUNCTION pg_temp.actor_auth(p_key text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT auth_id FROM rls_actor WHERE key = p_key;
$$;

SELECT pg_temp.assert_bool('fixture: found a no-capability member', pg_temp.actor_user('no_cap') IS NOT NULL, true);
SELECT pg_temp.assert_bool('fixture: found a second no-capability member', pg_temp.actor_user('other') IS NOT NULL, true);
SELECT pg_temp.assert_bool('fixture: resolved a privileged member (real or temp-granted)', pg_temp.actor_user('privileged') IS NOT NULL, true);

-- Ediciones + cohortes. Reuses an existing talleres catalog row and an
-- existing dream_team_equipos row (resolved by query) rather than creating
-- new ones.
INSERT INTO public.operating_core_events (id, kind, estado, title, start_date)
SELECT pg_temp.fid(k), 'workshop', 'active', 'RLS self-enroll fixture — ' || k, current_date::text
FROM (VALUES
  ('ev_abierto1'), ('ev_abierto2'), ('ev_encurso1'),
  ('ev_borrador1'), ('ev_cerrado1'), ('ev_cancelado1')
) AS t(k);

INSERT INTO public.taller_ediciones (
  id, operating_core_event_id, taller_id, tipo, modalidad_inscripcion, estado,
  nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot
)
SELECT
  pg_temp.fid(t.ed_key),
  pg_temp.fid(t.ev_key),
  (SELECT id FROM public.talleres ORDER BY created_at LIMIT 1),
  'individual',
  'periodo_general',
  t.estado,
  'RLS Fixture ' || t.ed_key,
  8,
  90,
  'periodo_general'
FROM (VALUES
  ('ed_abierto1', 'ev_abierto1', 'abierto'),
  ('ed_abierto2', 'ev_abierto2', 'abierto'),
  ('ed_encurso1', 'ev_encurso1', 'en_curso'),
  ('ed_borrador1', 'ev_borrador1', 'borrador'),
  ('ed_cerrado1', 'ev_cerrado1', 'cerrado'),
  ('ed_cancelado1', 'ev_cancelado1', 'cancelado')
) AS t(ed_key, ev_key, estado);

INSERT INTO public.talleres_crecimiento_cohortes (id, taller_id, dream_team_equipo_id, edicion)
SELECT
  pg_temp.fid(t.coh_key),
  pg_temp.fid(t.ed_key),
  (SELECT id FROM public.dream_team_equipos ORDER BY created_at LIMIT 1),
  'Cohorte RLS Test'
FROM (VALUES
  ('coh_abierto1', 'ed_abierto1'),
  ('coh_abierto2', 'ed_abierto2'),
  ('coh_encurso1', 'ed_encurso1'),
  ('coh_borrador1', 'ed_borrador1'),
  ('coh_cerrado1', 'ed_cerrado1'),
  ('coh_cancelado1', 'ed_cancelado1')
) AS t(coh_key, ed_key);

-- Let `authenticated` reach the fixtures/helpers above for the duration of
-- this transaction (temp objects are not visible to another role by
-- default).
GRANT SELECT ON rls_fixture, rls_actor TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.fid(text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.actor_user(text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.actor_auth(text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.assert_bool(text, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.assert_self_enroll_allowed(text, uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.assert_self_enroll_denied(text, uuid, uuid, uuid, text) TO authenticated;

-- ===========================================================================
-- 3. Identity: no-capability member ("no_cap")
-- ===========================================================================

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', pg_temp.actor_auth('no_cap'), 'role', 'authenticated')::text,
  true
);
SET LOCAL ROLE authenticated;

-- Criterion 1: self, pendiente, abierto edicion+its own cohorte -> allowed.
SELECT pg_temp.assert_self_enroll_allowed(
  'criterion 1: self-enroll pendiente into an abierto edicion',
  pg_temp.fid('ed_abierto1'), pg_temp.fid('coh_abierto1'), pg_temp.actor_user('no_cap'), 'pendiente'
);

SELECT pg_temp.assert_bool(
  'criterion 1: the member sees their own inscripcion',
  EXISTS (
    SELECT 1 FROM public.taller_inscripciones
    WHERE taller_id = pg_temp.fid('ed_abierto1')
      AND cohorte_id = pg_temp.fid('coh_abierto1')
      AND persona_principal_id = pg_temp.actor_user('no_cap')
  ),
  true
);

-- Criterion 2: cannot insert with an estado other than pendiente...
SELECT pg_temp.assert_self_enroll_denied(
  'criterion 2: cannot self-enroll with estado <> pendiente',
  pg_temp.fid('ed_encurso1'), pg_temp.fid('coh_encurso1'), pg_temp.actor_user('no_cap'), 'aprobado'
);

-- ...nor insert on behalf of somebody else.
SELECT pg_temp.assert_self_enroll_denied(
  'criterion 2: cannot enroll another persona_principal_id',
  pg_temp.fid('ed_encurso1'), pg_temp.fid('coh_encurso1'), pg_temp.actor_user('other'), 'pendiente'
);

-- Criterion 3: cannot enroll into a non-inscribible edicion (own matching
-- cohorte in every case, only estado differs). This is the RED case: these
-- three currently succeed against the pre-migration policy.
SELECT pg_temp.assert_self_enroll_denied(
  'criterion 3: cannot self-enroll into a borrador edicion',
  pg_temp.fid('ed_borrador1'), pg_temp.fid('coh_borrador1'), pg_temp.actor_user('no_cap'), 'pendiente'
);

SELECT pg_temp.assert_self_enroll_denied(
  'criterion 3: cannot self-enroll into a cerrado edicion',
  pg_temp.fid('ed_cerrado1'), pg_temp.fid('coh_cerrado1'), pg_temp.actor_user('no_cap'), 'pendiente'
);

SELECT pg_temp.assert_self_enroll_denied(
  'criterion 3: cannot self-enroll into a cancelado edicion',
  pg_temp.fid('ed_cancelado1'), pg_temp.fid('coh_cancelado1'), pg_temp.actor_user('no_cap'), 'pendiente'
);

-- Criterion 4: cannot pair an abierto edicion's taller_id with a cohorte
-- that belongs to a DIFFERENT edicion (also abierto, so only the
-- cohorte<->edicion binding guard is being exercised here). Also the RED
-- case.
SELECT pg_temp.assert_self_enroll_denied(
  'criterion 4: cannot use a cohorte that belongs to another edicion',
  pg_temp.fid('ed_abierto1'), pg_temp.fid('coh_abierto2'), pg_temp.actor_user('no_cap'), 'pendiente'
);

-- Criterion 5: cannot see a borrador edicion...
SELECT pg_temp.assert_bool(
  'criterion 5: a borrador edicion is not visible to a no-capability member',
  EXISTS (SELECT 1 FROM public.taller_ediciones WHERE id = pg_temp.fid('ed_borrador1')),
  false
);

RESET ROLE;

-- ===========================================================================
-- 4. Identity: privileged member (coordinator.write / director.write /
--    admin.manage)
-- ===========================================================================

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', pg_temp.actor_auth('privileged'), 'role', 'authenticated')::text,
  true
);
SET LOCAL ROLE authenticated;

-- Criterion 6: unrestricted by the new self-branch guards — can enroll
-- somebody else, with any estado, even into a borrador edicion.
SELECT pg_temp.assert_privileged_enroll_allowed(
  'criterion 6: coordinador/director/admin can still enroll somebody else',
  pg_temp.fid('ed_borrador1'), pg_temp.fid('coh_borrador1'), pg_temp.actor_user('other'), 'aprobado'
);

RESET ROLE;

-- ===========================================================================
-- 5. Identity: no-capability member again — cannot see the row the
--    privileged member just created for 'other'.
-- ===========================================================================

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', pg_temp.actor_auth('no_cap'), 'role', 'authenticated')::text,
  true
);
SET LOCAL ROLE authenticated;

SELECT pg_temp.assert_bool(
  'criterion 5: a no-capability member cannot see another member''s inscripcion',
  EXISTS (
    SELECT 1 FROM public.taller_inscripciones
    WHERE persona_principal_id = pg_temp.actor_user('other')
  ),
  false
);

RESET ROLE;

ROLLBACK;
