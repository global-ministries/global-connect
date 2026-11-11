-- T8a follow-up (odd/tasks/talleres-reserva-publica.md, S9 S15; Log L18) —
-- fixes from the independent verification of
-- 20261110200000_talleres_minimo_suspension.sql (already applied; not
-- edited). Each function below is that migration's body with the minimal
-- change; signatures, grants and search_path are identical.
--
-- WHAT
--   1. talleres_reprogramar_edicion (S15): when a later Reprogramar changes
--      the cierre, every aprobada still answering a date change
--      (confirmacion_estado 'pendiente') gets confirmacion_limite = the new
--      cierre, and its open taller_cambio_fecha notices follow it
--      (datos.limite, expira_at, the «Confirma antes del …» sentence).
--      Done here and not in talleres_reprogramar_edicion_mover, so the
--      suspension behaves as before. The reply is unchanged (the move).
--   2. talleres_edicion_bajo_minimo (S9): false once the edición started
--      (a sesión numero 1 'cerrada', the same test as the move's
--      EDICION_YA_EMPEZO), so the banner, Suspender, «Abrir igual» and the
--      Cancelar retry disappear.
--   3. A cancelled edición (estado 'cancelado') is ignored by
--      talleres_cerrar_confirmaciones_vencidas and
--      talleres_mis_cambios_de_fecha; talleres_confirmar_cambio_fecha
--      refuses it with CONFIRMACION_NO_PENDIENTE.
--
-- Blast radius: four functions replaced with the same signature. No row
-- changes when applied. Rows with a confirmation already past its limit are
-- carried by a later Reprogramar too (only aprobadas still 'pendiente').
--
-- ROLLBACK: re-run, from 20261110200000_talleres_minimo_suspension.sql, the
-- CREATE OR REPLACE blocks (with their COMMENT/REVOKE/GRANT) of
-- talleres_reprogramar_edicion (part B), talleres_edicion_bajo_minimo
-- (part C), talleres_confirmar_cambio_fecha (D2),
-- talleres_mis_cambios_de_fecha (D6) and
-- talleres_cerrar_confirmaciones_vencidas (E, without the DO block).

-- ===========================================================================
-- 1. talleres_reprogramar_edicion(): the confirmation deadline follows
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_reprogramar_edicion(
  p_edicion_id uuid,
  p_fecha_inicio date DEFAULT NULL,
  p_cierre_inscripcion date DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_edicion   public.taller_ediciones%ROWTYPE;
  v_equipo_id uuid;
  v_movido    jsonb;
  v_cierre    date;
BEGIN
  SELECT * INTO v_edicion
  FROM public.taller_ediciones
  WHERE id = p_edicion_id;

  v_equipo_id := public.talleres_equipo_de_edicion(p_edicion_id);

  IF NOT FOUND OR NOT (
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_esta_edicion' USING ERRCODE = '42501';
  END IF;

  IF public.talleres_estado_efectivo(v_edicion) IN ('cancelado', 'cerrado') THEN
    RAISE EXCEPTION 'EDICION_NO_REPROGRAMABLE' USING ERRCODE = 'P0001';
  END IF;

  IF p_fecha_inicio IS NULL AND p_cierre_inscripcion IS NULL THEN
    RAISE EXCEPTION 'NADA_QUE_CAMBIAR' USING ERRCODE = 'P0001';
  END IF;

  v_movido := public.talleres_reprogramar_edicion_mover(v_edicion, p_fecha_inicio, p_cierre_inscripcion, p_motivo);
  v_cierre := (v_movido ->> 'cierre_inscripcion')::date;

  -- S15: whoever still has to answer a date change answers by the new
  -- cierre; their open notices say so.
  IF v_cierre IS DISTINCT FROM v_edicion.cierre_inscripcion THEN
    WITH siguen AS (
      SELECT i.id, i.confirmacion_limite AS limite_anterior
        FROM public.taller_inscripciones i
        JOIN public.talleres_crecimiento_cohortes c ON c.id = i.cohorte_id
       WHERE c.taller_id = p_edicion_id
         AND i.estado = 'aprobado'
         AND i.confirmacion_estado = 'pendiente'
         FOR UPDATE OF i
    ), movidas AS (
      UPDATE public.taller_inscripciones i
         SET confirmacion_limite = v_cierre
        FROM siguen s
       WHERE i.id = s.id
      RETURNING i.id, s.limite_anterior
    )
    UPDATE public.avisos_persona a
       SET datos = jsonb_set(a.datos, '{limite}', to_jsonb(v_cierre)),
           expira_at = public.talleres_fin_del_dia(v_cierre),
           cuerpo = replace(a.cuerpo,
                            format('Confirma antes del %s ', to_char(m.limite_anterior, 'DD/MM/YYYY')),
                            format('Confirma antes del %s ', to_char(v_cierre, 'DD/MM/YYYY')))
      FROM movidas m
     WHERE a.tipo = 'taller_cambio_fecha'
       AND a.datos ->> 'inscripcion_id' = m.id::text
       AND (a.expira_at IS NULL OR a.expira_at > now());
  END IF;

  RETURN v_movido;
END;
$function$;

COMMENT ON FUNCTION public.talleres_reprogramar_edicion(uuid, date, date, text) IS
  'T7b (talleres-temporadas-y-ediciones, paso 6) - extends an edicion''s cierre_inscripcion only (p_fecha_inicio NULL), or moves its fecha_inicio (shifting every taller_sesiones row not cerrada/cancelada by the same delta, recomputing fecha_fin/cierre_inscripcion). Refuses a cancelado/cerrado (effective) edicion, both params NULL, a cierre past fecha_fin, or moving a start whose primera clase is already cerrada. La temporada (temporada_id) never changes here. Authority mirrors talleres_crear_edicion (director.write|admin.manage scoped to the edicion''s own node). T8a: the move itself lives in talleres_reprogramar_edicion_mover; when the cierre changes, aprobadas still pendiente of a date change get confirmacion_limite = the new cierre and their open taller_cambio_fecha notices follow (20261110210000).';

REVOKE ALL ON FUNCTION public.talleres_reprogramar_edicion(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_reprogramar_edicion(uuid, date, date, text) TO authenticated, postgres, service_role;

-- ===========================================================================
-- 2. talleres_edicion_bajo_minimo(): never once the edición started
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_edicion_bajo_minimo(p_edicion_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT COALESCE((
    SELECT t.minimo_inscritos IS NOT NULL
       AND e.cerrada_en IS NULL
       AND e.estado NOT IN ('borrador', 'cancelado')
       AND e.abierta_igual_en IS NULL
       AND e.cierre_inscripcion IS NOT NULL
       AND e.cierre_inscripcion <= public.talleres_hoy()
       AND (e.fecha_fin IS NULL OR public.talleres_hoy() <= e.fecha_fin)
       -- Started: the first clase was held (the move's EDICION_YA_EMPEZO).
       AND NOT EXISTS (
         SELECT 1
           FROM public.taller_sesiones s
           JOIN public.taller_grupos g ON g.id = s.grupo_id
           JOIN public.talleres_crecimiento_cohortes c ON c.id = g.cohorte_id
          WHERE c.taller_id = e.id
            AND s.numero = 1
            AND s.estado = 'cerrada'
       )
       AND public.talleres_minimo_aprobados(e.id) < t.minimo_inscritos
      FROM public.taller_ediciones e
      JOIN public.talleres t ON t.id = e.taller_id
     WHERE e.id = p_edicion_id
  ), false);
$function$;

COMMENT ON FUNCTION public.talleres_edicion_bajo_minimo(uuid) IS
  'T8a — true when the taller has a minimum, the edición''s inscription already closed (cierre <= talleres_hoy()), it has not ended nor started (no sesión numero 1 cerrada, 20261110210000), is not closed/borrador/cancelado, nobody opened it anyway, and its approved units are below the minimum. Internal.';

REVOKE ALL ON FUNCTION public.talleres_edicion_bajo_minimo(uuid) FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 3a. talleres_confirmar_cambio_fecha(): not for a cancelled edición
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_confirmar_cambio_fecha(
  p_inscripcion_id uuid,
  p_respuesta text,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_persona_id uuid;
  v_ins        public.taller_inscripciones%ROWTYPE;
  v_motivo     text := NULLIF(btrim(p_motivo), '');
BEGIN
  IF p_respuesta IS NULL OR p_respuesta NOT IN ('mantener', 'no_puedo') THEN
    RAISE EXCEPTION 'RESPUESTA_INVALIDA' USING ERRCODE = '22023';
  END IF;

  SELECT u.id INTO v_persona_id FROM public.usuarios u WHERE u.auth_id = auth.uid();

  SELECT * INTO v_ins
    FROM public.taller_inscripciones
   WHERE id = p_inscripcion_id
     FOR UPDATE;

  -- Not found and not yours collapse to the same refusal.
  IF v_persona_id IS NULL OR v_ins.id IS NULL
     OR v_persona_id NOT IN (v_ins.persona_principal_id, COALESCE(v_ins.companero_id, v_ins.persona_principal_id)) THEN
    RAISE EXCEPTION 'sin_permisos_para_esta_inscripcion' USING ERRCODE = '42501';
  END IF;

  -- A cancelled edición has nothing left to confirm.
  IF v_ins.estado <> 'aprobado' OR v_ins.confirmacion_estado IS DISTINCT FROM 'pendiente'
     OR EXISTS (SELECT 1 FROM public.taller_ediciones e WHERE e.id = v_ins.taller_id AND e.estado = 'cancelado') THEN
    RAISE EXCEPTION 'CONFIRMACION_NO_PENDIENTE' USING ERRCODE = 'P0001';
  END IF;

  IF v_ins.confirmacion_limite < public.talleres_hoy() THEN
    RAISE EXCEPTION 'CONFIRMACION_VENCIDA' USING ERRCODE = 'P0001';
  END IF;

  IF v_motivo IS NOT NULL AND length(v_motivo) > 300 THEN
    RAISE EXCEPTION 'TEXTO_DEMASIADO_LARGO' USING ERRCODE = '22023';
  END IF;

  IF p_respuesta = 'mantener' THEN
    UPDATE public.taller_inscripciones
       SET confirmacion_estado = 'confirmada',
           confirmada_por = v_persona_id,
           confirmada_en = now(),
           confirmacion_canal = 'app'
     WHERE id = p_inscripcion_id;
  ELSE
    -- Leaves the edición the way talleres_resolver_solicitud_retiro does.
    UPDATE public.taller_inscripciones
       SET estado = 'retirado',
           version = version + 1,
           confirmacion_estado = 'no_puede',
           confirmada_por = v_persona_id,
           confirmada_en = now(),
           confirmacion_canal = 'app',
           confirmacion_motivo = COALESCE(v_motivo, 'Ya no puede con la nueva fecha')
     WHERE id = p_inscripcion_id;
  END IF;

  -- The question is answered for both members of the unit.
  UPDATE public.avisos_persona
     SET expira_at = now()
   WHERE tipo = 'taller_cambio_fecha'
     AND datos ->> 'inscripcion_id' = p_inscripcion_id::text
     AND (expira_at IS NULL OR expira_at > now());

  RETURN jsonb_build_object(
    'inscripcion_id', p_inscripcion_id,
    'confirmacion_estado', CASE WHEN p_respuesta = 'mantener' THEN 'confirmada' ELSE 'no_puede' END,
    'estado', CASE WHEN p_respuesta = 'mantener' THEN 'aprobado' ELSE 'retirado' END
  );
END;
$function$;

COMMENT ON FUNCTION public.talleres_confirmar_cambio_fecha(uuid, text, text) IS
  'T8a (S9, S15) — the principal or companero of an aprobada answers a date change before its limit: mantener -> confirmada; no_puedo -> no_puede and estado retirado (as talleres_resolver_solicitud_retiro writes it) with the motivo. Refuses 22023 RESPUESTA_INVALIDA, 42501 sin_permisos_para_esta_inscripcion (not found or not theirs), P0001 CONFIRMACION_NO_PENDIENTE (also for a cancelled edición, 20261110210000), P0001 CONFIRMACION_VENCIDA.';

REVOKE ALL ON FUNCTION public.talleres_confirmar_cambio_fecha(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_confirmar_cambio_fecha(uuid, text, text) TO authenticated, service_role;

-- ===========================================================================
-- 3b. talleres_mis_cambios_de_fecha(): not for a cancelled edición
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_mis_cambios_de_fecha()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'inscripcion_id', i.id,
           'taller_nombre', t.nombre,
           'edicion_nombre', e.nombre_snapshot,
           'fecha_inicio', e.fecha_inicio,
           'fecha_anterior', e.suspension_fecha_anterior,
           'lugar', e.lugar,
           'mensaje', e.suspension_mensaje,
           'limite', i.confirmacion_limite
         ) ORDER BY i.confirmacion_limite, t.nombre), '[]'::jsonb)
    FROM public.taller_inscripciones i
    JOIN public.taller_ediciones e ON e.id = i.taller_id
    JOIN public.talleres t ON t.id = e.taller_id
   WHERE (SELECT u.id FROM public.usuarios u WHERE u.auth_id = auth.uid()) IN (i.persona_principal_id, i.companero_id)
     AND i.estado = 'aprobado'
     AND i.confirmacion_estado = 'pendiente'
     AND i.confirmacion_limite >= public.talleres_hoy()
     AND e.estado <> 'cancelado';
$function$;

COMMENT ON FUNCTION public.talleres_mis_cambios_de_fecha() IS
  'T8a — the caller''s aprobadas (as principal or companero) that still have to answer a date change before their limit, with the taller, the new and previous start, lugar, the message and the limit. Cancelled ediciones are left out (20261110210000).';

REVOKE ALL ON FUNCTION public.talleres_mis_cambios_de_fecha() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_mis_cambios_de_fecha() TO authenticated, service_role;

-- ===========================================================================
-- 3c. talleres_cerrar_confirmaciones_vencidas(): not for a cancelled edición
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_cerrar_confirmaciones_vencidas()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_ids uuid[];
BEGIN
  WITH salen AS (
    UPDATE public.taller_inscripciones i
       SET estado = 'retirado',
           version = version + 1,
           confirmacion_motivo = 'Sin confirmar el cambio de fecha'
     WHERE i.confirmacion_estado = 'pendiente'
       AND i.estado = 'aprobado'
       AND i.confirmacion_limite < public.talleres_hoy()
       AND NOT EXISTS (SELECT 1 FROM public.taller_ediciones e WHERE e.id = i.taller_id AND e.estado = 'cancelado')
    RETURNING i.id
  )
  SELECT COALESCE(array_agg(id), '{}') INTO v_ids FROM salen;

  UPDATE public.avisos_persona
     SET expira_at = now()
   WHERE tipo = 'taller_cambio_fecha'
     AND datos ->> 'inscripcion_id' = ANY (v_ids::text[])
     AND (expira_at IS NULL OR expira_at > now());

  RETURN cardinality(v_ids);
END;
$function$;

COMMENT ON FUNCTION public.talleres_cerrar_confirmaciones_vencidas() IS
  'T8a (S15) — every aprobada still pendiente after its confirmacion_limite (talleres_hoy()) leaves the edición: estado retirado (as talleres_resolver_solicitud_retiro writes it), confirmacion_motivo ''Sin confirmar el cambio de fecha''; confirmacion_estado stays pendiente as the trace. A cancelled edición is skipped (20261110210000). Returns how many left. service_role only (pg_cron).';

REVOKE ALL ON FUNCTION public.talleres_cerrar_confirmaciones_vencidas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_cerrar_confirmaciones_vencidas() TO service_role;
