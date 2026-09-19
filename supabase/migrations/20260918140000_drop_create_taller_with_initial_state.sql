-- ════════════════════════════════════════════════════════════════════
-- T1 — Drop the unused create-taller wizard RPC.
--
-- WHY: `create_taller_with_initial_state` (PR21, see
-- 20260812000001_admin_create_taller_rpc.sql) backed the old
-- `/admin/talleres/nuevo` wizard. That screen has no inbound links from
-- any other admin screen and its `dream_team_equipos` insert mints a
-- new equipo with no `parent_equipo_id` and no roles — exactly the
-- orphan-equipo problem this change (talleres-equipo-en-organigrama)
-- removes. The wizard route and its test are deleted in the same
-- commit; this migration removes the now-dead RPC so nothing can call
-- it after the app stops referencing it.
--
-- WHAT: drops the function using its exact 15-arg signature. No other
-- function shares this name, so this cannot ambiguously drop a
-- different overload.
--
-- SAFETY: talleres flag is off in production (see
-- odd/tasks/talleres-equipo-en-organigrama.md, "Coordinación de
-- despliegue"), so the screen is not in use there. No other migration,
-- RPC, or app code calls this function (verified via repo-wide search
-- and the T1 jest guard at
-- __tests__/invariants/talleres-nuevo-wizard-removed.test.ts).
--
-- ROLLBACK: re-run 20260812000001_admin_create_taller_rpc.sql to
-- recreate the function and its grants.
-- ════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.create_taller_with_initial_state(
  text, text, text, text, int, int, text, timestamptz, timestamptz,
  jsonb, text, timestamptz, timestamptz, uuid, text
);
