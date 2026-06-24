-- PR8 guarded Casas Anfitrionas map backfill utility.
--
-- This migration defines a manual, dry-run-first helper only. It performs no
-- production data mutation when the migration is applied.

SET lock_timeout = '5s';
SET statement_timeout = '30s';

CREATE UNIQUE INDEX IF NOT EXISTS idx_casa_audit_events_approved_location_backfill_once
ON public.casa_anfitriona_audit_events(casa_anfitriona_id)
WHERE event_type = 'approved_location_backfill';

RESET lock_timeout;
RESET statement_timeout;

CREATE OR REPLACE FUNCTION public.casas_map_backfill_approved_location_audit(
  p_auth_id uuid,
  p_dry_run boolean DEFAULT true,
  p_approval_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_request_role text := nullif(current_setting('request.jwt.claim.role', true), '');
  v_actor_user_id uuid;
  v_actor_can_apply boolean := false;
  v_approval_reference text := nullif(btrim(p_approval_reference), '');
  v_eligible_count integer := 0;
  v_already_backfilled_count integer := 0;
  v_would_insert_count integer := 0;
  v_inserted_count integer := 0;
BEGIN
  IF coalesce(v_request_role, '') <> 'service_role' THEN
    RAISE EXCEPTION 'backfill_requires_service_role';
  END IF;

  IF NOT public.casas_map_auth_matches_actor(p_auth_id) THEN
    RAISE EXCEPTION 'sin_permisos';
  END IF;

  SELECT u.id, COALESCE(bool_or(rs.nombre_interno IN ('admin', 'pastor')), false)
  INTO v_actor_user_id, v_actor_can_apply
  FROM public.usuarios u
  LEFT JOIN public.usuario_roles ur ON ur.usuario_id = u.id
  LEFT JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE u.auth_id = p_auth_id
  GROUP BY u.id;

  IF v_actor_user_id IS NULL OR NOT v_actor_can_apply THEN
    RAISE EXCEPTION 'backfill_requires_admin_actor';
  END IF;

  WITH eligible AS (
    SELECT ca.id
    FROM public.casas_anfitrionas ca
    WHERE ca.aprobada = true
      AND ca.activa = true
      AND ca.direccion_id IS NOT NULL
  )
  SELECT COUNT(*)::integer,
         COUNT(ae.casa_anfitriona_id)::integer,
         (COUNT(*) - COUNT(ae.casa_anfitriona_id))::integer
  INTO v_eligible_count, v_already_backfilled_count, v_would_insert_count
  FROM eligible e
  LEFT JOIN public.casa_anfitriona_audit_events ae
    ON ae.casa_anfitriona_id = e.id
   AND ae.event_type = 'approved_location_backfill';

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', true,
      'eligible_approved_casas', v_eligible_count,
      'already_backfilled', v_already_backfilled_count,
      'would_insert', v_would_insert_count,
      'requires_explicit_approval', true
    );
  END IF;

  IF v_approval_reference IS NULL
    OR lower(v_approval_reference) IN ('approval-reference', 'approved-change-id', 'placeholder', 'replace-me', 'changeme', 'todo', 'tbd')
  THEN
    RAISE EXCEPTION 'backfill_requires_explicit_approval_reference';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('casas_map_backfill_approved_location_audit', 0));

  WITH eligible AS (
    SELECT ca.id, ca.direccion_id
    FROM public.casas_anfitrionas ca
    WHERE ca.aprobada = true
      AND ca.activa = true
      AND ca.direccion_id IS NOT NULL
  ), inserted AS (
    INSERT INTO public.casa_anfitriona_audit_events(casa_anfitriona_id, actor_user_id, event_type, event_data) -- noqa: insert-into
    SELECT e.id,
           v_actor_user_id,
           'approved_location_backfill',
           jsonb_build_object(
              'approved_direccion_id', e.direccion_id,
              'source', 'pr8_guarded_backfill',
              'approval_reference', v_approval_reference,
              'dry_run_required_before_apply', true
            )
    FROM eligible e
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.casa_anfitriona_audit_events ae
      WHERE ae.casa_anfitriona_id = e.id
        AND ae.event_type = 'approved_location_backfill'
    )
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO v_inserted_count FROM inserted;

  RETURN jsonb_build_object(
    'dry_run', false,
    'approval_reference', v_approval_reference,
    'eligible_approved_casas', v_eligible_count,
    'already_backfilled_before_apply', v_already_backfilled_count,
    'inserted', v_inserted_count,
    'remaining_after_apply', GREATEST(v_would_insert_count - v_inserted_count, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.casas_map_backfill_approved_location_audit(uuid, boolean, text)
IS 'Manual PR8 Casas map backfill helper. Defaults to dry-run and only records audit snapshots for existing approved active Casas with approved direccion_id; non-dry-run requires a concrete approval reference and never creates Casas, group assignments, or historical locations.';

REVOKE ALL ON FUNCTION public.casas_map_backfill_approved_location_audit(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.casas_map_backfill_approved_location_audit(uuid, boolean, text) FROM anon;
REVOKE ALL ON FUNCTION public.casas_map_backfill_approved_location_audit(uuid, boolean, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.casas_map_backfill_approved_location_audit(uuid, boolean, text) TO service_role;
