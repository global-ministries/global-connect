-- Talleres de Crecimiento — coordinator/dirección resolve a withdrawal request.
--
-- Net-new resolve capability (approve/reject) for `taller_solicitudes_retiro`,
-- captured verbatim from the validated STAGING object. Two additive parts:
--
--   1. Widen the `taller_inscripciones.estado` CHECK to admit the terminal
--      'retirado' state (approving a `participante_retiro` lands the unit
--      there). Idempotent: drop-if-exists + re-add.
--
--   2. The SECURITY DEFINER RPC `talleres_resolver_solicitud_retiro`, which
--      IS the security wall:
--        - reviewer is ALWAYS auth.uid() (never a caller-supplied id),
--        - scope gate = director/admin global OR coordinator.write scoped to
--          the equipo that owns the solicitud's target (via
--          `talleres_equipo_de_solicitud`),
--        - APROBAR executes the REAL withdrawal (participante → inscripción
--          'retirado'; equipo → asignación desactivada), then flips the
--          solicitud to 'aprobada',
--        - RECHAZAR only closes the request ('rechazada'), history preserved.
--
-- Depends on helpers already shipped in
-- 20260821000004_cimiento3a_talleres_coordinador_scope_rls.sql
-- (`talleres_equipo_de_solicitud`, `auth_has_talleres_capability_scoped`).
--
-- SAFETY / PROD REVIEW: the CHECK below reproduces the validated staging set
-- ['pendiente','aprobado','no_aprobado','retirado'] — staging is a clone of
-- prod, so prod's pre-widen set is expected to be the same minus 'retirado'.
-- If prod's live constraint differs (e.g. holds another value), the ADD will
-- fail LOUDLY on violating rows rather than corrupt data — reconcile before
-- applying. Additive / forward-only: no DROP TABLE/COLUMN, no data deletes.

BEGIN;

-- 1. Additive CHECK widen — admit the terminal 'retirado' estado.
ALTER TABLE public.taller_inscripciones
  DROP CONSTRAINT IF EXISTS taller_inscripciones_estado_check;

ALTER TABLE public.taller_inscripciones
  ADD CONSTRAINT taller_inscripciones_estado_check
  CHECK (estado = ANY (ARRAY['pendiente', 'aprobado', 'no_aprobado', 'retirado']));

-- 2. Resolve RPC — the security wall (reviewer + scope derived from auth.uid()).
CREATE OR REPLACE FUNCTION public.talleres_resolver_solicitud_retiro(
  p_solicitud_id uuid,
  p_accion text,
  p_motivo text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_reviewer_id uuid;
  v_sol         public.taller_solicitudes_retiro;
  v_equipo      uuid;
BEGIN
  IF p_accion NOT IN ('aprobar', 'rechazar') THEN
    RAISE EXCEPTION 'accion_invalida' USING ERRCODE = '22023';
  END IF;

  -- Reviewer is ALWAYS the request's JWT subject — never a caller-supplied id.
  SELECT id INTO v_reviewer_id FROM public.usuarios WHERE auth_id = auth.uid();
  IF v_reviewer_id IS NULL THEN
    RAISE EXCEPTION 'usuario_no_encontrado' USING ERRCODE = '42501';
  END IF;

  -- Only a pending solicitud is resolvable (guard ⇒ idempotent under retries).
  SELECT * INTO v_sol
  FROM public.taller_solicitudes_retiro
  WHERE id = p_solicitud_id AND estado = 'pendiente';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'solicitud_no_encontrada_o_procesada' USING ERRCODE = 'P0002';
  END IF;

  -- Team that owns the solicitud's target (inscripción → cohorte, or
  -- grupo_asignacion → grupo → cohorte). Gate: director/admin global OR
  -- coordinator.write scoped to THIS equipo. Anything else is rejected.
  v_equipo := public.talleres_equipo_de_solicitud(v_sol.inscripcion_id, v_sol.grupo_asignacion_id);
  IF NOT (
        public.auth_has_talleres_capability('talleres_crecimiento.director.write')
     OR public.auth_has_talleres_capability('talleres_crecimiento.admin.manage')
     OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', v_equipo)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_esta_solicitud' USING ERRCODE = '42501';
  END IF;

  IF p_accion = 'aprobar' THEN
    IF v_sol.tipo = 'participante_retiro' THEN
      IF v_sol.inscripcion_id IS NULL THEN
        RAISE EXCEPTION 'solicitud_participante_sin_inscripcion' USING ERRCODE = '22004';
      END IF;
      -- The unit (incl. matrimonio/novios — one row) moves to the terminal
      -- 'retirado' state. updated_at is bumped by the BEFORE UPDATE trigger.
      UPDATE public.taller_inscripciones
      SET estado = 'retirado', version = version + 1
      WHERE id = v_sol.inscripcion_id;

    ELSIF v_sol.tipo = 'equipo_retiro_definitivo' THEN
      IF v_sol.grupo_asignacion_id IS NULL THEN
        RAISE EXCEPTION 'solicitud_equipo_sin_asignacion' USING ERRCODE = '22004';
      END IF;
      UPDATE public.taller_grupo_asignaciones
      SET activo                  = false,
          ended_at                = now(),
          motivo_retiro           = COALESCE(NULLIF(btrim(p_motivo), ''), v_sol.motivo),
          approved_by_director_id = v_reviewer_id,
          version                 = version + 1
      WHERE id = v_sol.grupo_asignacion_id;

    ELSE
      RAISE EXCEPTION 'tipo_desconocido' USING ERRCODE = '22023';
    END IF;

    UPDATE public.taller_solicitudes_retiro
    SET estado = 'aprobada', version = version + 1
    WHERE id = p_solicitud_id;

  ELSE  -- 'rechazar' — close the request only, preserve history (no delete).
    UPDATE public.taller_solicitudes_retiro
    SET estado = 'rechazada', version = version + 1
    WHERE id = p_solicitud_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',           true,
    'accion',       p_accion,
    'solicitud_id', p_solicitud_id,
    'tipo',         v_sol.tipo,
    'equipo',       v_equipo
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.talleres_resolver_solicitud_retiro(uuid, text, text)
  TO authenticated;

COMMIT;
