-- R3i + R3j (odd/tasks/talleres-rediseno.md, S8 S9, L8).
--
--   A. Staff inscriptions are origen 'admin' («Coordinación» in the edición
--      screen). The direct insert of «Inscribir a alguien» now sends
--      origen 'admin' itself (app/(auth)/talleres/[taller]/[edicion]/
--      actions.ts agregarInscripcion); taller_inscripciones_insert (the
--      staff-only WITH CHECK of 20261003160000 E) does not look at origen,
--      so no policy changes. talleres_inscribir_sobre_cupo is recreated
--      from its latest definition (20261003160000 F) with the same
--      signature, SECURITY DEFINER, search_path, grants and behaviour; the
--      only change is that its INSERT writes origen 'admin'. The column's
--      COMMENT is updated. Existing rows are NOT touched (no backfill):
--      what was 'app' stays 'app'.
--   B. talleres_avisame_lugar_contar(uuid[]): per edición, how many people
--      asked «Avísame si se libera un lugar» and were not notified yet
--      (notificado_en IS NULL). Count only, never a name or an email.
--      taller_avisame_lugar stays revoked for anon and authenticated; this
--      SECURITY DEFINER function is the one read. It returns a row only
--      for the ediciones the caller directs or coordinates (user decision
--      L9: dirección and coordinación only, not lead or volunteer), i.e.
--      auth_has_talleres_capability_scoped with director.read/write,
--      coordinator.read/write or admin.manage on the edición's equipo (talleres_equipo_de_edicion, the same resolver
--      talleres_inscribir_sobre_cupo and talleres_minimo_panel use for the
--      edición page). Ediciones the caller cannot read, or unknown ids,
--      simply yield no row.
--
-- Rollback (in this order):
--   DROP FUNCTION IF EXISTS public.talleres_avisame_lugar_contar(uuid[]);
--   CREATE OR REPLACE FUNCTION public.talleres_inscribir_sobre_cupo(uuid,
--     uuid, uuid) ... (the body, comment and grants of 20261003160000 F);
--   COMMENT ON COLUMN public.taller_inscripciones.origen IS (the text of
--     20261110121000 A);
--   (optional, only to undo the labels) UPDATE public.taller_inscripciones
--     SET origen = 'app' WHERE origen = 'admin'; — no other path writes
--     'admin'.

-- ===========================================================================
-- A. origen 'admin' for staff inscriptions
-- ===========================================================================

COMMENT ON COLUMN public.taller_inscripciones.origen IS
  'Where the inscription came from: app (the member, and every row written before 20261111140000), admin (the team: «Inscribir a alguien», direct or sobre cupo, from 20261111140000 on) or publico (the public reservation page).';

-- Same signature and body as 20261003160000 F except the INSERT, which now
-- writes origen 'admin'.
CREATE OR REPLACE FUNCTION public.talleres_inscribir_sobre_cupo(
  p_edicion_id uuid,
  p_persona_id uuid,
  p_companero_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid;
  v_equipo_id uuid;
  v_edicion public.taller_ediciones%ROWTYPE;
  v_cohorte_id uuid;
  v_inscripcion_id uuid;
  v_calculo record;
  v_es_sobre_cupo boolean;
BEGIN
  SELECT u.id INTO v_actor_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'sin_permisos_para_este_taller' USING ERRCODE = '42501';
  END IF;

  v_equipo_id := public.talleres_equipo_de_edicion(p_edicion_id);
  IF v_equipo_id IS NULL THEN
    RAISE EXCEPTION 'EDICION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write'::text, v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage'::text, v_equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_este_taller' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_edicion FROM public.taller_ediciones WHERE id = p_edicion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EDICION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF public.talleres_estado_efectivo(v_edicion) NOT IN ('abierto', 'en_curso') THEN
    RAISE EXCEPTION 'EDICION_NO_ABIERTA' USING ERRCODE = 'P0001';
  END IF;

  IF v_edicion.tipo = 'pareja' AND p_companero_id IS NULL THEN
    RAISE EXCEPTION 'COMPANERO_REQUERIDO' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_cohorte_id
  FROM public.talleres_crecimiento_cohortes
  WHERE taller_id = p_edicion_id
  ORDER BY created_at
  LIMIT 1;
  IF v_cohorte_id IS NULL THEN
    RAISE EXCEPTION 'EDICION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Same key as the cupo gate and the one-appearance trigger.
  PERFORM pg_advisory_xact_lock(hashtext('talleres_cupo:' || p_edicion_id::text));

  IF public.talleres_persona_activa_en_edicion(p_edicion_id, p_persona_id) THEN
    RAISE EXCEPTION 'YA_INSCRITO' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_calculo FROM public.talleres_cupo_edicion_calculo(p_edicion_id);
  v_es_sobre_cupo := v_calculo.cupo > 0 AND v_calculo.ocupados >= v_calculo.cupo;

  -- The bypass flag is transaction-local (set_config(..., true)) and is
  -- only ever read by talleres_inscripciones_cupo_gate; it is only needed
  -- (and only set) when this placement is ACTUALLY over cupo.
  IF v_es_sobre_cupo THEN
    PERFORM set_config('talleres.sobre_cupo_autorizado', '1', true);
  END IF;

  INSERT INTO public.taller_inscripciones (
    taller_id, cohorte_id, persona_principal_id, companero_id, link_type, estado,
    sobre_cupo, sobre_cupo_por, sobre_cupo_en, origen
  ) VALUES (
    p_edicion_id, v_cohorte_id, p_persona_id,
    CASE WHEN v_edicion.tipo = 'pareja' THEN p_companero_id ELSE NULL END,
    CASE WHEN v_edicion.tipo = 'pareja' THEN v_edicion.link_type ELSE NULL END,
    'pendiente',
    v_es_sobre_cupo,
    CASE WHEN v_es_sobre_cupo THEN v_actor_id ELSE NULL END,
    CASE WHEN v_es_sobre_cupo THEN now() ELSE NULL END,
    'admin'
  )
  RETURNING id INTO v_inscripcion_id;

  SELECT * INTO v_calculo FROM public.talleres_cupo_edicion_calculo(p_edicion_id);

  RETURN jsonb_build_object(
    'inscripcion_id', v_inscripcion_id,
    'cupo', v_calculo.cupo,
    'ocupados', v_calculo.ocupados,
    'sobre_cupo', v_es_sobre_cupo
  );
END;
$function$;

COMMENT ON FUNCTION public.talleres_inscribir_sobre_cupo(uuid, uuid, uuid) IS
  'Director/coordinator/admin places a persona in an edicion, recording sobre_cupo=true (with who/when) ONLY when the edicion is actually full at insert time; otherwise a normal insert. The row is origen admin («Coordinación», 20261111140000). p_companero_id is required (P0001 COMPANERO_REQUERIDO) and stored with the edicion''s own link_type when the edicion is tipo=pareja. Refuses P0001 EDICION_NO_ABIERTA unless the edicion''s effective state is abierto/en_curso, and P0001 YA_INSCRITO when the persona is already active (estado NOT IN no_aprobado/retirado) in the edicion as principal or companero. Takes the cupo lock before checking. Raises 42501 sin_permisos_para_este_taller / P0002 EDICION_NOT_FOUND.';

REVOKE ALL ON FUNCTION public.talleres_inscribir_sobre_cupo(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_inscribir_sobre_cupo(uuid, uuid, uuid) TO authenticated, service_role;

-- ===========================================================================
-- B. talleres_avisame_lugar_contar
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_avisame_lugar_contar(p_edicion_ids uuid[])
RETURNS TABLE (edicion_id uuid, pendientes integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT te.id AS edicion_id,
         (SELECT count(*)::integer
            FROM public.taller_avisame_lugar a
           WHERE a.edicion_id = te.id
             AND a.notificado_en IS NULL) AS pendientes
    FROM public.taller_ediciones te
   WHERE te.id = ANY (coalesce(p_edicion_ids, '{}'::uuid[]))
     -- The staff branches of taller_inscripciones_select (20261003140000 H).
     AND (
          public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read'::text, public.talleres_equipo_de_edicion(te.id))
       OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write'::text, public.talleres_equipo_de_edicion(te.id))
       OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read'::text, public.talleres_equipo_de_edicion(te.id))
       OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, public.talleres_equipo_de_edicion(te.id))
       OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage'::text, public.talleres_equipo_de_edicion(te.id))
     );
$function$;

COMMENT ON FUNCTION public.talleres_avisame_lugar_contar(uuid[]) IS
  'R3j (talleres-rediseno S9): per edición, how many «Avísame si se libera un lugar» requests are not notified yet (taller_avisame_lugar.notificado_en IS NULL). Count only, never a name or an email. Returns one row (pendientes may be 0) per given edición the caller directs or coordinates (director.read/write, coordinator.read/write or admin.manage scoped to talleres_equipo_de_edicion; lead and volunteer get no row); other or unknown ids yield no row.';

REVOKE ALL ON FUNCTION public.talleres_avisame_lugar_contar(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_avisame_lugar_contar(uuid[]) TO authenticated, service_role;
