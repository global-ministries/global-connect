-- T2 (odd/tasks/uno-a-uno.md) — the pastoral module and the empty legacy 1:1
-- tables are gone (migration 20261015110000_quitar_modulo_pastoral), and what
-- the migration keeps on purpose is still there.
--
-- Covers:
--   a. None of the dropped tables exists: the nine pastoral_* tables and
--      uno_a_uno_reuniones / uno_a_uno_participantes.
--   b. None of the dropped functions exists, and no function of public is
--      still named after the pastoral module.
--   c. None of the five pastoral enums exists.
--   d. usuario_roles still exists and has no pastoral trigger left; no
--      remaining function body, policy or view mentions a dropped object.
--   e. No dream_team_capability_grants row is pastoral.
--   f. Kept: operating_core_participation_eventos.sensitivity and the 14
--      pastoral_* values of operating_core_participation_kind.
--
-- Run against STAGING, after the migration is applied, inside BEGIN…ROLLBACK
-- (nothing here writes). The last statement is a SELECT of the failing cases
-- (0 failing cases = all ok).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_qp_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_qp_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

-- ── a. Tables ────────────────────────────────────────────────────────

SELECT pg_temp.fail('a: table still exists', t)
  FROM unnest(ARRAY[
         'public.pastoral_crisis_detection_log', 'public.pastoral_crisis_keyword_catalog',
         'public.pastoral_one_on_one', 'public.pastoral_one_on_one_notas',
         'public.pastoral_one_on_one_participantes', 'public.pastoral_role_capability_map',
         'public.pastoral_triada', 'public.pastoral_triada_eventos', 'public.pastoral_triada_miembros',
         'public.uno_a_uno_reuniones', 'public.uno_a_uno_participantes']) t
 WHERE to_regclass(t) IS NOT NULL;

-- ── b. Functions ─────────────────────────────────────────────────────

SELECT pg_temp.fail('b: function still exists', f)
  FROM unnest(ARRAY[
         'public.sync_pastoral_grants_on_role_change()',
         'public.assign_pastoral_capabilities_for_role(uuid, text)',
         'public.auth_user_is_pastoral_actor_for_triada(uuid)',
         'public.auth_user_is_pastoral_actor(uuid)',
         'public.auth_has_pastoral_capability(text)',
         'public.get_personas_under_me(uuid)']) f
 WHERE to_regprocedure(f) IS NOT NULL;

SELECT pg_temp.fail('b: pastoral-named function left', p.oid::regprocedure::text)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname LIKE '%pastoral%';

-- ── c. Enums ─────────────────────────────────────────────────────────

SELECT pg_temp.fail('c: type still exists', t)
  FROM unnest(ARRAY[
         'public.pastoral_one_on_one_estado', 'public.pastoral_triada_contexto',
         'public.pastoral_triada_estado', 'public.pastoral_triada_evento_tipo',
         'public.pastoral_triada_motivo_disolucion']) t
 WHERE to_regtype(t) IS NOT NULL;

-- ── d. usuario_roles and leftover references ─────────────────────────

SELECT pg_temp.fail('d: usuario_roles', 'table is missing')
 WHERE to_regclass('public.usuario_roles') IS NULL;

SELECT pg_temp.fail('d: pastoral trigger left', tg.tgname || ' on ' || tg.tgrelid::regclass::text)
  FROM pg_trigger tg
 WHERE NOT tg.tgisinternal
   AND (tg.tgname LIKE '%pastoral%' OR tg.tgfoid::regproc::text LIKE '%pastoral%');

SELECT pg_temp.fail('d: function body references a dropped object', p.oid::regprocedure::text)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_temp%'
   AND p.prosrc ~ '(auth_has_pastoral_capability|auth_user_is_pastoral_actor|get_personas_under_me|pastoral_role_capability_map|pastoral_one_on_one\M|pastoral_triada\M|uno_a_uno_reuniones|uno_a_uno_participantes)';

SELECT pg_temp.fail('d: policy references a dropped object', pol.polname || ' on ' || pol.polrelid::regclass::text)
  FROM pg_policy pol
 WHERE coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
       ~ '(pastoral|get_personas_under_me|uno_a_uno_)';

SELECT pg_temp.fail('d: view references a dropped object', c.oid::regclass::text)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE c.relkind IN ('v', 'm') AND n.nspname NOT IN ('pg_catalog', 'information_schema')
   AND pg_get_viewdef(c.oid) ~ '(pastoral_|get_personas_under_me|uno_a_uno_)';

-- ── e. Grants ────────────────────────────────────────────────────────

SELECT pg_temp.fail('e: pastoral grants left', count(*)::text)
  FROM public.dream_team_capability_grants
 WHERE experience = 'pastoral' OR capability_key LIKE 'pastoral.%'
HAVING count(*) > 0;

-- ── f. Kept on purpose ───────────────────────────────────────────────

SELECT pg_temp.fail('f: sensitivity column', 'operating_core_participation_eventos.sensitivity is missing')
 WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'operating_core_participation_eventos'
                      AND column_name = 'sensitivity');

SELECT pg_temp.fail('f: pastoral kind value missing', v)
  FROM unnest(ARRAY[
         'pastoral_one_on_one_logged', 'pastoral_one_on_one_completed', 'pastoral_one_on_one_cancelled',
         'pastoral_one_on_one_note_logged', 'pastoral_one_on_one_followup_set',
         'pastoral_one_on_one_followup_completed', 'pastoral_one_on_one_step_validated',
         'pastoral_triada_formed', 'pastoral_triada_member_added', 'pastoral_triada_member_removed',
         'pastoral_triada_disbanded', 'pastoral_triada_step_suggested', 'pastoral_triada_step_validated',
         'pastoral_crisis_detected']) v
 WHERE NOT EXISTS (SELECT 1 FROM pg_enum e
                    WHERE e.enumtypid = 'public.operating_core_participation_kind'::regtype AND e.enumlabel = v);

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n' ORDER BY case_name), 'all cases ok') AS detail
  FROM t_qp_failures;

ROLLBACK;
