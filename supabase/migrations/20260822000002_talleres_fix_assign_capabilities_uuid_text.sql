-- ════════════════════════════════════════════════════════════════════
-- Fix latent uuid/text mismatch in assign_talleres_capabilities_for_role.
--
-- ROOT CAUSE (verified in staging ebwtdjtajclzciwipevw; latent in prod):
--   public.assign_talleres_capabilities_for_role(uuid, text, uuid) — the
--   helper the auto-grant trigger (sync_talleres_grants_on_servicio_change)
--   PERFORMs when a dream_team_servicios row goes estado='activo' — writes
--   p_taller_id (uuid) straight into dream_team_capability_grants.scope_id,
--   which is a TEXT column, and also compares `g.scope_id = p_taller_id`
--   in its NOT EXISTS idempotency guard. Both are uuid-vs-text with no
--   cast, so Postgres raises:
--       42883: operator does not exist: text = uuid
--   The whole servicio INSERT/UPDATE rolls back with it.
--
--   It has been dead code in prod: prod has 0 dream_team_servicios, so the
--   trigger never reached this PERFORM. It fires on the FIRST real
--   director/coordinador activation (Cimiento 4). Proven on staging: the
--   first servicio insert errored here; casting fixed it and the trigger
--   then minted correctly-scoped grants.
--
-- FIX: cast p_taller_id::text in the SELECT list and in the NOT EXISTS
--   comparison. scope_id stays text (its canonical type — the scoped RLS
--   gate auth_has_talleres_capability_scoped already casts p_equipo_id::text
--   to match it). Nothing else in the body changes.
--
-- SAFETY: additive / forward-only / idempotent (CREATE OR REPLACE, body
--   only). No data touched. The trigger keeps calling this function by
--   name, so replacing the body is picked up without recreating anything.
--   Privileges are preserved by CREATE OR REPLACE; re-stated below to keep
--   the migration self-contained and match the original grant posture.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.assign_talleres_capabilities_for_role(
  p_persona_id uuid,
  p_rol        text,
  p_taller_id  uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  INSERT INTO public.dream_team_capability_grants (
    persona_id, capability_key, experience, scope_type, scope_id, source, granted_at
  )
  SELECT
    p_persona_id,
    m.capability_key,
    'talleres_crecimiento',
    m.scope_type,
    p_taller_id::text,
    'role-auto-grant',
    now()
  FROM public.talleres_role_capability_map m
  WHERE m.rol = p_rol
    AND NOT EXISTS (
      SELECT 1 FROM public.dream_team_capability_grants g
      WHERE g.persona_id     = p_persona_id
        AND g.capability_key = m.capability_key
        AND g.experience     = 'talleres_crecimiento'
        AND g.scope_type     = m.scope_type
        AND g.scope_id       = p_taller_id::text
        AND g.source         = 'role-auto-grant'
    );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_talleres_capabilities_for_role(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_talleres_capabilities_for_role(uuid, text, uuid) TO service_role;
