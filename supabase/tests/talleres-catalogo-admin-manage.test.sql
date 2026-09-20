-- T2 (odd/tasks/talleres-consolidar-pantallas.md) — talleres_insert_director,
-- talleres_update_director and talleres_delete_director must also accept
-- admin.manage, tree-scoped — matching create_taller_abstract (which
-- already accepts director.write OR admin.manage) and every other
-- talleres-owned table's write policies (see 20260918190000_talleres_
-- scoped_policies_core.sql: taller_ediciones, talleres_crecimiento_
-- cohortes both OR admin.manage already).
--
-- WHY THIS TEST EXISTS: today an admin-only identity (admin.manage, no
-- director.write) can CREATE a taller through create_taller_abstract
-- (its capability gate accepts admin.manage), but the direct UPDATE/
-- DELETE policies on public.talleres itself only ever checked
-- director.write — so that same admin-only identity could create a
-- taller through the RPC and then not rename or delete it.
--
-- Run against STAGING:
--   1. BEFORE applying 20260919130000_talleres_catalogo_admin_manage.sql
--      — expected to FAIL (RED): the admin-only case is denied the UPDATE.
--   2. AFTER applying it — expected to PASS (GREEN).
--
-- Follows the exact SET LOCAL ROLE authenticated / check_write / RESET
-- ROLE pattern established in talleres-autoridad-arbol.test.sql: the
-- MCP/staging connection runs as `postgres`, which has BYPASSRLS, so a
-- direct UPDATE/DELETE as that role would trivially "succeed" and prove
-- nothing about the actual policy. Switching to `authenticated` (which
-- does NOT bypass RLS) for each write attempt is what makes this test
-- meaningful.
--
-- Covers:
--   - an admin-only identity (admin.manage, scoped to ONE equipo — NOT
--     global) is denied UPDATE/DELETE today and allowed after, on its
--     OWN taller;
--   - that SAME admin-only identity stays denied on an UNRELATED sibling
--     branch's taller both before and after (the new branch is
--     tree-scoped, not a blanket bypass);
--   - a director-only identity (director.write, scoped) keeps working
--     both before and after (no regression — this policy already worked
--     for director.write and must keep working byte-for-byte);
--   - a member with zero grants stays denied both before and after.
--
-- BEGIN…ROLLBACK — nothing here is kept; fixtures live under this file's
-- own a9000000-... namespace. 'e524ea89-d3a7-45fc-be00-5a6e7452434e'
-- (Grupos de Corto Plazo) and 'daffcd22-05b6-45e8-91e3-f3743f4d551f'
-- (Próximo Paso, unrelated sibling branch) are referenced read-only as
-- parents — the same real anchors other talleres fixture tests already
-- use (see talleres-mis-permisos.test.sql, talleres-autoridad-arbol.test.sql).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t2_failures (case_name text) ON COMMIT DROP;
GRANT INSERT ON t2_failures TO authenticated;

-- Runs an UPDATE/DELETE as dynamic SQL and checks it affected exactly one
-- row (p_expect_success) or zero rows (denied via USING filtering) —
-- treating a raised insufficient_privilege (WITH CHECK failure) as an
-- equally valid "denied" outcome. Mirrors talleres-autoridad-arbol.test.sql's
-- check_write exactly.
CREATE OR REPLACE FUNCTION pg_temp.check_write(p_case text, p_sql text, p_expect_success boolean)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_count bigint;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF p_expect_success THEN
    IF v_count <> 1 THEN
      INSERT INTO t2_failures(case_name) VALUES (p_case || ': expected 1 row affected, got ' || v_count);
    END IF;
  ELSE
    IF v_count <> 0 THEN
      INSERT INTO t2_failures(case_name) VALUES (p_case || ': expected denial (0 rows), got ' || v_count || ' rows affected');
    END IF;
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    IF p_expect_success THEN
      INSERT INTO t2_failures(case_name) VALUES (p_case || ': expected success, got denied (42501)');
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.report()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
  v_msg text;
BEGIN
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t2_failures;
  IF v_n > 0 THEN
    RAISE EXCEPTION E'% failing case(s):\n%', v_n, v_msg;
  END IF;
END;
$$;

-- ── fixtures ─────────────────────────────────────────────────────────
-- Rama A (under "Grupos de Corto Plazo"):
--   a9...01  equipo — admin.manage AND director.write both live here
--            (scoped to this ONE node, not global)
--   a9...20  taller row, dream_team_equipo_id = a9...01 (UPDATE target,
--            then the DELETE target — talleres_dream_team_equipo_id_uniq
--            allows only ONE taller per equipo, so this fixture reuses
--            the same row rather than minting a second one on the same
--            equipo, which would silently no-op under ON CONFLICT DO
--            NOTHING and leave the DELETE case pointed at a phantom row)
-- Rama B (under "Próximo Paso", unrelated sibling branch):
--   a9...02  equipo — no grants
--   a9...21  taller row, dream_team_equipo_id = a9...02

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('a9000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ T2 Catalogo Admin Rama A', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true),
  ('a9000000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ T2 Catalogo Admin Rama B Sibling', 'daffcd22-05b6-45e8-91e3-f3743f4d551f', true)
ON CONFLICT DO NOTHING;

INSERT INTO public.talleres (id, slug, nombre, descripcion, modalidad_default, estado, dream_team_equipo_id) VALUES
  ('a9000000-0000-4000-8000-000000000020', 'zz-t2-fixture-taller-a', 'ZZ T2 Fixture Taller Rama A', NULL, 'periodo_general', 'active', 'a9000000-0000-4000-8000-000000000001'),
  ('a9000000-0000-4000-8000-000000000021', 'zz-t2-fixture-taller-b', 'ZZ T2 Fixture Taller Rama B', NULL, 'periodo_general', 'active', 'a9000000-0000-4000-8000-000000000002')
ON CONFLICT DO NOTHING;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('a9000000-0000-4000-8000-000000000010', 'authenticated', 'authenticated', 't2-fixture-catadmin@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a9000000-0000-4000-8000-000000000012', 'authenticated', 'authenticated', 't2-fixture-catdirector@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a9000000-0000-4000-8000-000000000014', 'authenticated', 'authenticated', 't2-fixture-catmiembro@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  ('a9000000-0000-4000-8000-000000000011', 'a9000000-0000-4000-8000-000000000010', 'T2 Fixture', 'CatAdmin', 't2-fixture-catadmin@example.test', 'Soltero', 'Otro'),
  ('a9000000-0000-4000-8000-000000000013', 'a9000000-0000-4000-8000-000000000012', 'T2 Fixture', 'CatDirector', 't2-fixture-catdirector@example.test', 'Soltero', 'Otro'),
  ('a9000000-0000-4000-8000-000000000015', 'a9000000-0000-4000-8000-000000000014', 'T2 Fixture', 'CatMiembro', 't2-fixture-catmiembro@example.test', 'Soltero', 'Otro')
ON CONFLICT (id) DO NOTHING;

-- admin.manage and director.write both SCOPED to Rama A's equipo (a9...01)
-- — NOT global — so a pass here proves tree-scoping, not a blanket bypass.
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('a9000000-0000-4000-8000-000000000011', 'talleres_crecimiento.admin.manage', 'talleres_crecimiento', 'taller', 'a9000000-0000-4000-8000-000000000001'),
  ('a9000000-0000-4000-8000-000000000013', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'a9000000-0000-4000-8000-000000000001')
ON CONFLICT DO NOTHING;
  -- Miembro (...015) — zero grants, on purpose.

CREATE OR REPLACE FUNCTION pg_temp.as_admin() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000010', true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;
CREATE OR REPLACE FUNCTION pg_temp.as_director() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000012', true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;
CREATE OR REPLACE FUNCTION pg_temp.as_miembro() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000014', true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- ══ Admin-only (scoped, not global) — own branch: UPDATE must be ALLOWED ══
-- (this is the RED→GREEN case: denied before the migration, allowed after)

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_admin();
SELECT pg_temp.check_write(
  'admin-only @ own taller (Rama A) — UPDATE must be allowed',
  $$UPDATE public.talleres SET nombre = 'ZZ T2 Fixture Taller Rama A (renamed)' WHERE id = 'a9000000-0000-4000-8000-000000000020'$$,
  true
);
RESET ROLE;

-- ══ Admin-only — unrelated sibling branch: must stay DENIED (tree-scoped) ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_admin();
SELECT pg_temp.check_write(
  'admin-only @ Rama B Sibling (unrelated branch) — UPDATE must stay denied',
  $$UPDATE public.talleres SET nombre = 'ZZ T2 Fixture Taller Rama B (renamed)' WHERE id = 'a9000000-0000-4000-8000-000000000021'$$,
  false
);
RESET ROLE;

-- ══ Director-only (scoped) — own branch: must keep working (no regression) ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_director();
SELECT pg_temp.check_write(
  'director-only @ own taller (Rama A) — UPDATE must keep working',
  $$UPDATE public.talleres SET nombre = 'ZZ T2 Fixture Taller Rama A (edited by director)' WHERE id = 'a9000000-0000-4000-8000-000000000020'$$,
  true
);
RESET ROLE;

-- ══ Miembro sin permisos — must stay DENIED ═══════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_miembro();
SELECT pg_temp.check_write(
  'miembro @ Rama A — UPDATE must stay denied',
  $$UPDATE public.talleres SET nombre = 'ZZ T2 Fixture Taller Rama A (miembro)' WHERE id = 'a9000000-0000-4000-8000-000000000020'$$,
  false
);
RESET ROLE;

-- ══ DELETE — same shape, admin-only on its own branch only ═══════════════
-- Reuses a9...20 (Rama A) — the UPDATE cases above only ever changed its
-- `nombre`, never removed it, so it's still there for DELETE. Order
-- matters: miembro's denied DELETE attempt below must run BEFORE admin's
-- allowed one, so admin's attempt still has a row to delete.

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_miembro();
SELECT pg_temp.check_write(
  'miembro @ Rama A — DELETE must stay denied',
  $$DELETE FROM public.talleres WHERE id = 'a9000000-0000-4000-8000-000000000020'$$,
  false
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_admin();
SELECT pg_temp.check_write(
  'admin-only @ own taller (Rama A) — DELETE must be allowed',
  $$DELETE FROM public.talleres WHERE id = 'a9000000-0000-4000-8000-000000000020'$$,
  true
);
RESET ROLE;

SELECT pg_temp.report();

ROLLBACK;
