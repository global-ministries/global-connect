-- T2b (odd/tasks/proximo-paso.md, S3 / L6.2) — "si hay cupos que quede
-- inscrito automaticamente": a taller can approve its inscripciones on the
-- spot when there is cupo. Próximo Paso turns it on.
-- noqa: insert-into (the only INSERTs are inside the talleres_inscribirme body, not data)
--
-- A. talleres.inscripcion_automatica boolean NOT NULL DEFAULT false. Every
--    existing taller keeps today's flow (pendiente until a coordinator
--    approves); only Próximo Paso (slug 'proximo-paso') is set to true.
--
-- B. talleres_inscribirme(uuid, jsonb), recreated from its live definition
--    (20261004150000_talleres_conyuge_invitacion.sql, part C; no later
--    migration redefines it). One change, at the end: after the INSERT,
--    when the edición is individual (tipo <> 'pareja') and its taller has
--    inscripcion_automatica, the new row is approved with
--      UPDATE taller_inscripciones SET estado = 'aprobado'
--       WHERE id = <new row> AND estado = 'pendiente'
--    which is exactly the write of a coordinator's approval
--    (lib/platform/talleres/inscripciones-actions.ts approveInscripcionAction).
--    The same triggers fire (couple_unit, updated_at, the cupo gate, which
--    lets a pendiente -> aprobado transition through because pendiente
--    already occupies the seat, and cancela_invitaciones, which only acts
--    on no_aprobado/retirado). Approval assigns no grupo today (grupos are
--    assigned by hand with talleres_asignar_inscripciones_a_grupo), so none
--    is assigned here either. The app-side access sender that runs after a
--    manual approval only mails partner fichas created with ficha_nueva,
--    which only exist on pareja ediciones, which this never approves.
--
--    Cupo: the cupo gate (talleres_inscripciones_cupo_gate, with
--    talleres_cupo_edicion_calculo) counts pendiente and aprobado alike and
--    already ran on the INSERT. A full edición still answers CUPO_LLENO
--    and nothing is written; no cupo defined (0) means unlimited. So "there
--    is cupo" is exactly "the INSERT passed the gate".
--
--    Pago: talleres has no payment configuration today, so there is no
--    "payment before approval" case to keep.
--
--    Pareja ediciones are unchanged on purpose: a couple's inscripción
--    involves a second person (a confirmed spouse, a cédula match or a ficha
--    created on the spot) that a coordinator reviews.
--
--    Return keys are unchanged; estado now reads the real state
--    ('pendiente' or 'aprobado'). Grants restated exactly as they are:
--    no PUBLIC, no anon; authenticated and service_role.
--
-- ROLLBACK (in this order):
--   CREATE OR REPLACE FUNCTION public.talleres_inscribirme(uuid, jsonb) ...
--     (the body of 20261004150000, part C) with its COMMENT, REVOKE and GRANT;
--   then remove the column public.talleres.inscripcion_automatica.

-- ===========================================================================
-- A. Taller option
-- ===========================================================================

ALTER TABLE public.talleres
  ADD COLUMN inscripcion_automatica boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.talleres.inscripcion_automatica IS
  'When true, talleres_inscribirme approves an individual inscripción on the spot when the edición has cupo (or none defined); when false (the default) it stays pendiente until a coordinator approves it. Pareja ediciones always stay pendiente.';

UPDATE public.talleres SET inscripcion_automatica = true WHERE slug = 'proximo-paso';

-- ===========================================================================
-- B. talleres_inscribirme
-- ===========================================================================

-- The one way a member enrolls.
--   p_pareja: NULL (individual edición) |
--     {"modo":"conyuge_registrado"} | {"modo":"cedula","cedula":"..."} |
--     {"modo":"ficha_nueva","cedula","nombre","apellido","email",
--      "fecha_nacimiento":"YYYY-MM-DD","genero":"Masculino"|"Femenino"},
--     plus optional "vinculo":"matrimonio"|"novios" (read only when the
--     effective vínculo, coalesce(taller_ediciones.link_type,
--     talleres.vinculo), is NULL) and "conyuge_descartado":true (cedula).
--   OK: {"ok":true,"inscripcion_id":uuid,"estado":"pendiente"|"aprobado",
--        "pareja_origen":null|"conyuge_registrado"|"cedula"|"ficha_nueva"}
--     estado is "aprobado" only for an individual edición of a taller with
--     inscripcion_automatica (see the header of this file).
--   Returned: {"ok":false,"codigo": EDICION_NOT_FOUND | EDICION_NO_ABIERTA |
--     YA_INSCRITO | CUPO_LLENO | PAREJA_NO_CONFIRMADA | PAREJA_NO_DISPONIBLE |
--     LIMITE_ALCANZADO}
--   Raised: 42501 SIN_FICHA; 22023 COMPANERO_NO_APLICA, COMPANERO_REQUERIDO,
--     MODO_INVALIDO, VINCULO_REQUERIDO, MODO_NO_APLICA, CEDULA_INVALIDA,
--     NOMBRE_INVALIDO, EMAIL_INVALIDO, GENERO_INVALIDO,
--     FECHA_NACIMIENTO_INVALIDA.
CREATE OR REPLACE FUNCTION public.talleres_inscribirme(p_edicion_id uuid, p_pareja jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid;
  v_edicion public.taller_ediciones%ROWTYPE;
  v_cohorte_id uuid;
  v_vinculo_taller text;
  v_modo text;
  v_vinculo text;
  v_cedula text;
  v_pareja_id uuid;
  v_conyuge_id uuid;
  v_descartado boolean := false;
  v_inscripcion_id uuid;
  v_nombre text;
  v_apellido text;
  v_email text;
  v_genero text;
  v_fecha_texto text;
  v_fecha_nacimiento date;
  v_estado text := 'pendiente';
BEGIN
  SELECT u.id INTO v_actor_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'SIN_FICHA' USING ERRCODE = '42501';
  END IF;

  IF p_pareja IS NOT NULL AND jsonb_typeof(p_pareja) = 'null' THEN
    p_pareja := NULL;
  END IF;

  SELECT * INTO v_edicion FROM public.taller_ediciones te WHERE te.id = p_edicion_id;
  IF NOT FOUND OR public.talleres_estado_efectivo(v_edicion) IN ('borrador', 'cancelado') THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'EDICION_NOT_FOUND');
  END IF;

  SELECT c.id INTO v_cohorte_id
    FROM public.talleres_crecimiento_cohortes c
   WHERE c.taller_id = p_edicion_id
   ORDER BY c.created_at
   LIMIT 1;
  IF v_cohorte_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'EDICION_NOT_FOUND');
  END IF;

  -- Input shape against the edición (client bugs: raised).
  IF v_edicion.tipo <> 'pareja' THEN
    IF p_pareja IS NOT NULL THEN
      RAISE EXCEPTION 'COMPANERO_NO_APLICA' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF p_pareja IS NULL THEN
      RAISE EXCEPTION 'COMPANERO_REQUERIDO' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_pareja) <> 'object'
       OR (p_pareja ->> 'modo') IS NULL
       OR (p_pareja ->> 'modo') NOT IN ('conyuge_registrado', 'cedula', 'ficha_nueva') THEN
      RAISE EXCEPTION 'MODO_INVALIDO' USING ERRCODE = '22023';
    END IF;
    v_modo := p_pareja ->> 'modo';

    -- Effective vínculo: the edición's own snapshot, else its taller's;
    -- the member's choice only when both are NULL.
    SELECT t.vinculo INTO v_vinculo_taller FROM public.talleres t WHERE t.id = v_edicion.taller_id;
    v_vinculo := COALESCE(
      v_edicion.link_type,
      v_vinculo_taller,
      CASE WHEN (p_pareja ->> 'vinculo') IN ('matrimonio', 'novios') THEN p_pareja ->> 'vinculo' END
    );
    IF v_vinculo IS NULL THEN
      RAISE EXCEPTION 'VINCULO_REQUERIDO' USING ERRCODE = '22023';
    END IF;

    IF v_modo = 'conyuge_registrado' AND v_vinculo <> 'matrimonio' THEN
      RAISE EXCEPTION 'MODO_NO_APLICA' USING ERRCODE = '22023';
    END IF;

    IF v_modo IN ('cedula', 'ficha_nueva') THEN
      v_cedula := public.talleres_cedula_pareja_normalizada(p_pareja ->> 'cedula');
    END IF;

    IF v_modo = 'ficha_nueva' THEN
      v_nombre := regexp_replace(btrim(coalesce(p_pareja ->> 'nombre', '')), '\s+', ' ', 'g');
      v_apellido := regexp_replace(btrim(coalesce(p_pareja ->> 'apellido', '')), '\s+', ' ', 'g');
      IF length(v_nombre) NOT BETWEEN 1 AND 80 OR length(v_apellido) NOT BETWEEN 1 AND 80 THEN
        RAISE EXCEPTION 'NOMBRE_INVALIDO' USING ERRCODE = '22023';
      END IF;

      v_email := lower(btrim(coalesce(p_pareja ->> 'email', '')));
      IF length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION 'EMAIL_INVALIDO' USING ERRCODE = '22023';
      END IF;

      v_genero := p_pareja ->> 'genero';
      IF v_genero IS NULL OR v_genero NOT IN ('Masculino', 'Femenino') THEN
        RAISE EXCEPTION 'GENERO_INVALIDO' USING ERRCODE = '22023';
      END IF;

      v_fecha_texto := p_pareja ->> 'fecha_nacimiento';
      IF v_fecha_texto IS NULL OR v_fecha_texto !~ '^\d{4}-\d{2}-\d{2}$' THEN
        RAISE EXCEPTION 'FECHA_NACIMIENTO_INVALIDA' USING ERRCODE = '22023';
      END IF;
      BEGIN
        v_fecha_nacimiento := v_fecha_texto::date;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'FECHA_NACIMIENTO_INVALIDA' USING ERRCODE = '22023';
      END;
      IF v_fecha_nacimiento <= DATE '1900-01-01' OR v_fecha_nacimiento > public.talleres_hoy() THEN
        RAISE EXCEPTION 'FECHA_NACIMIENTO_INVALIDA' USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  IF public.talleres_estado_efectivo(v_edicion) <> 'abierto' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'EDICION_NO_ABIERTA');
  END IF;

  -- Same key as the cupo gate and the one-appearance trigger: the checks
  -- below and the INSERT see one consistent edición.
  PERFORM pg_advisory_xact_lock(hashtext('talleres_cupo:' || p_edicion_id::text));

  IF public.talleres_persona_activa_en_edicion(p_edicion_id, v_actor_id) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'YA_INSCRITO');
  END IF;

  IF v_modo = 'conyuge_registrado' THEN
    v_pareja_id := public.talleres_conyuge_unico(v_actor_id);
    IF v_pareja_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'PAREJA_NO_CONFIRMADA');
    END IF;
    IF public.talleres_persona_activa_en_edicion(p_edicion_id, v_pareja_id) THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'PAREJA_NO_DISPONIBLE');
    END IF;
  ELSIF v_modo = 'cedula' THEN
    IF NOT public.consumir_limite_accion(v_actor_id, 'pareja_cedula', 10, interval '24 hours') THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'LIMITE_ALCANZADO');
    END IF;
    -- Not found, the caller, a minor and someone already active all read
    -- the same: no oracle on who is enrolled.
    v_pareja_id := public.talleres_pareja_por_cedula(p_edicion_id, v_actor_id, v_cedula);
    IF v_pareja_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'PAREJA_NO_CONFIRMADA');
    END IF;
    IF p_pareja -> 'conyuge_descartado' = 'true'::jsonb THEN
      v_conyuge_id := public.talleres_conyuge_unico(v_actor_id);
      v_descartado := v_conyuge_id IS NOT NULL AND v_conyuge_id <> v_pareja_id;
    END IF;
  ELSIF v_modo = 'ficha_nueva' THEN
    -- Only someone who already holds a role may create fichas.
    IF NOT EXISTS (SELECT 1 FROM public.usuario_roles ur WHERE ur.usuario_id = v_actor_id) THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'LIMITE_ALCANZADO');
    END IF;
    -- Global cap first (it records nothing), then the caller's own unit.
    PERFORM pg_advisory_xact_lock(hashtext('acciones_limitadas:pareja_ficha_nueva:global'));
    IF (SELECT count(*) FROM public.acciones_limitadas a
         WHERE a.accion = 'pareja_ficha_nueva'
           AND a.created_at > now() - interval '24 hours') >= 30 THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'LIMITE_ALCANZADO');
    END IF;
    IF NOT public.consumir_limite_accion(v_actor_id, 'pareja_ficha_nueva', 2, interval '30 days') THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'LIMITE_ALCANZADO');
    END IF;
    -- An existing cédula, an existing email and a minor all read the same.
    IF EXISTS (SELECT 1 FROM public.usuarios u WHERE u.cedula = v_cedula)
       OR EXISTS (SELECT 1 FROM public.usuarios u WHERE lower(u.email) = v_email)
       OR EXISTS (SELECT 1 FROM auth.users au WHERE lower(au.email) = v_email)
       OR v_fecha_nacimiento > (public.talleres_hoy() - interval '18 years')::date THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'PAREJA_NO_CONFIRMADA');
    END IF;
  END IF;

  BEGIN
    IF v_modo = 'ficha_nueva' THEN
      INSERT INTO public.usuarios (
        cedula, nombre, apellido, email, fecha_nacimiento, genero, estado_civil
      ) VALUES (
        v_cedula, v_nombre, v_apellido, v_email, v_fecha_nacimiento,
        v_genero::public.enum_genero,
        (CASE WHEN v_vinculo = 'matrimonio' THEN 'Casado' ELSE 'Soltero' END)::public.enum_estado_civil
      )
      RETURNING id INTO v_pareja_id;
    END IF;

    INSERT INTO public.taller_inscripciones (
      taller_id, cohorte_id, persona_principal_id, companero_id, link_type,
      estado, sobre_cupo, pareja_origen, conyuge_registrado_descartado
    ) VALUES (
      p_edicion_id, v_cohorte_id, v_actor_id, v_pareja_id, v_vinculo,
      'pendiente', false, v_modo, v_descartado
    )
    RETURNING id INTO v_inscripcion_id;

    IF v_modo = 'ficha_nueva' THEN
      INSERT INTO public.invitaciones_acceso (
        usuario_id, origen, creado_por, edicion_id, inscripcion_id, estado
      ) VALUES (
        v_pareja_id, 'taller_pareja', v_actor_id, p_edicion_id, v_inscripcion_id, 'en_espera'
      );
    END IF;
  EXCEPTION
    WHEN raise_exception THEN
      -- talleres_inscripciones_cupo_gate. Returned, so a consumed
      -- throttle unit stays recorded.
      IF SQLERRM = 'CUPO_LLENO' THEN
        RETURN jsonb_build_object('ok', false, 'codigo', 'CUPO_LLENO');
      END IF;
      RAISE;
    WHEN unique_violation THEN
      -- A concurrent ficha took the cédula or the email in between.
      IF v_modo = 'ficha_nueva' THEN
        RETURN jsonb_build_object('ok', false, 'codigo', 'PAREJA_NO_CONFIRMADA');
      END IF;
      RAISE;
  END;

  -- Inscripción automática (individual ediciones only). The row above went
  -- through the cupo gate as 'pendiente', which already occupies a seat, so
  -- reaching this point means there was cupo (or none defined). It is
  -- approved with the very UPDATE a coordinator's approval runs
  -- (approveInscripcionAction: estado pendiente -> aprobado), so the same
  -- triggers fire and nothing else is written.
  IF v_edicion.tipo <> 'pareja'
     AND (SELECT t.inscripcion_automatica FROM public.talleres t WHERE t.id = v_edicion.taller_id) THEN
    UPDATE public.taller_inscripciones
       SET estado = 'aprobado'
     WHERE id = v_inscripcion_id
       AND estado = 'pendiente';
    IF FOUND THEN
      v_estado := 'aprobado';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'inscripcion_id', v_inscripcion_id,
    'estado', v_estado,
    'pareja_origen', v_modo
  );
END;
$function$;

COMMENT ON FUNCTION public.talleres_inscribirme(uuid, jsonb) IS
  'Member self-enrollment (the only path since taller_inscripciones_insert lost its self branch). Individual edición: p_pareja NULL. Pareja edición: {modo: conyuge_registrado} (matrimonio only, the caller''s unique registered spouse), {modo: cedula, cedula} (same rules as talleres_buscar_pareja_por_cedula, same pareja_cedula throttle) or {modo: ficha_nueva, cedula, nombre, apellido, email, fecha_nacimiento, genero} (creates the partner''s ficha without a role plus an en_espera access invitation; callers with a role only, 2 per 30 days per caller, 30 per 24 h overall; existing cédula or email, or under 18, return PAREJA_NO_CONFIRMADA), plus vinculo when coalesce(taller_ediciones.link_type, talleres.vinculo) is NULL, and conyuge_descartado. Inserts a pendiente row with the edición''s first cohorte; on an individual edición of a taller with inscripcion_automatica it is approved right away with the coordinator''s own UPDATE (there was cupo: the gate let it in). Returns {ok:true, inscripcion_id, estado, pareja_origen} or {ok:false, codigo}; raises 42501 SIN_FICHA and 22023 input errors.';

REVOKE ALL ON FUNCTION public.talleres_inscribirme(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_inscribirme(uuid, jsonb) TO authenticated, service_role;
