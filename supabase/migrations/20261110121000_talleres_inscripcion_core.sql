-- T5a (odd/tasks/talleres-reserva-publica.md) — one place that writes a
-- taller inscription, shared by the member path (talleres_inscribirme) and
-- the public reservation (20261110140000).
--
-- Adds:
--   A. taller_inscripciones.origen text NOT NULL DEFAULT 'app'
--      CHECK (app | admin | publico) and por_verificar boolean NOT NULL
--      DEFAULT false (the coordinator must confirm the identity before
--      approving). Existing rows and every staff insert path keep the
--      default 'app'; nothing is backfilled.
--   B. talleres_inscripcion_crear_core (service_role only): takes the cupo
--      lock, refuses a principal or companero already active in the
--      edición, inserts the pendiente row and maps the cupo gate's
--      CUPO_LLENO. It returns its refusals, so the caller decides whether
--      to roll back what it wrote before (a new ficha).
--   C. talleres_inscribirme recreated on top of B with the same signature,
--      grants, errors and replies as 20261004150000. It still takes the
--      same advisory lock and checks the caller BEFORE the per-mode
--      throttles (pg advisory locks are re-entrant in one transaction), so
--      a YA_INSCRITO caller keeps consuming no throttle unit; the
--      companero check moved into B (PAREJA_NO_DISPONIBLE), which runs
--      right after with nothing in between for that mode.
--
-- Rollback (in this order):
--   CREATE OR REPLACE FUNCTION public.talleres_inscribirme(uuid, jsonb) ...
--     (the body of 20261004150000);
--   DROP FUNCTION IF EXISTS public.talleres_inscripcion_crear_core(uuid, uuid, uuid, text, text, boolean, text, boolean);
--   (only when no row uses them) ALTER TABLE public.taller_inscripciones
--     DROP COLUMN IF EXISTS por_verificar, DROP COLUMN IF EXISTS origen;

-- ===========================================================================
-- A. Columns
-- ===========================================================================

ALTER TABLE public.taller_inscripciones
  ADD COLUMN origen text NOT NULL DEFAULT 'app'
    CONSTRAINT taller_inscripciones_origen_check CHECK (origen IN ('app', 'admin', 'publico')),
  ADD COLUMN por_verificar boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.taller_inscripciones.origen IS
  'Where the inscription came from: app (the member, and every pre-existing or staff row), admin, or publico (the public reservation page).';
COMMENT ON COLUMN public.taller_inscripciones.por_verificar IS
  'True when a public reservation could not prove the identity of the principal or the companero (no code was possible): the coordinator confirms it before approving.';

-- ===========================================================================
-- B. talleres_inscripcion_crear_core
-- ===========================================================================

-- The edición must exist, be abierto and have a cohorte; callers check
-- that first with their own replies, this only guards.
--   {"ok":true,"inscripcion_id":uuid}
--   {"ok":false,"codigo": EDICION_NOT_FOUND | EDICION_NO_ABIERTA |
--     YA_INSCRITO | PAREJA_NO_DISPONIBLE | CUPO_LLENO}
-- Any other error (check, foreign key, unique) is raised.
CREATE OR REPLACE FUNCTION public.talleres_inscripcion_crear_core(
  p_edicion_id uuid,
  p_principal_id uuid,
  p_companero_id uuid,
  p_vinculo text,
  p_pareja_origen text,
  p_conyuge_descartado boolean,
  p_origen text,
  p_por_verificar boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_edicion public.taller_ediciones%ROWTYPE;
  v_cohorte_id uuid;
  v_inscripcion_id uuid;
BEGIN
  SELECT * INTO v_edicion FROM public.taller_ediciones te WHERE te.id = p_edicion_id;
  IF NOT FOUND THEN
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
  IF public.talleres_estado_efectivo(v_edicion) <> 'abierto' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'EDICION_NO_ABIERTA');
  END IF;

  -- Same key as the cupo gate and the one-appearance trigger: the checks
  -- below and the INSERT see one consistent edición.
  PERFORM pg_advisory_xact_lock(hashtext('talleres_cupo:' || p_edicion_id::text));

  IF public.talleres_persona_activa_en_edicion(p_edicion_id, p_principal_id) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'YA_INSCRITO');
  END IF;
  IF p_companero_id IS NOT NULL
     AND public.talleres_persona_activa_en_edicion(p_edicion_id, p_companero_id) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'PAREJA_NO_DISPONIBLE');
  END IF;

  BEGIN
    INSERT INTO public.taller_inscripciones (
      taller_id, cohorte_id, persona_principal_id, companero_id, link_type,
      estado, sobre_cupo, pareja_origen, conyuge_registrado_descartado,
      origen, por_verificar
    ) VALUES (
      p_edicion_id, v_cohorte_id, p_principal_id, p_companero_id, p_vinculo,
      'pendiente', false, p_pareja_origen, coalesce(p_conyuge_descartado, false),
      p_origen, coalesce(p_por_verificar, false)
    )
    RETURNING id INTO v_inscripcion_id;
  EXCEPTION
    WHEN raise_exception THEN
      -- talleres_inscripciones_cupo_gate.
      IF SQLERRM = 'CUPO_LLENO' THEN
        RETURN jsonb_build_object('ok', false, 'codigo', 'CUPO_LLENO');
      END IF;
      RAISE;
  END;

  RETURN jsonb_build_object('ok', true, 'inscripcion_id', v_inscripcion_id);
END;
$function$;

COMMENT ON FUNCTION public.talleres_inscripcion_crear_core(uuid, uuid, uuid, text, text, boolean, text, boolean) IS
  'Internal (service_role): the one writer of a self/public taller inscription. Guards the edición (exists, first cohorte, abierto), takes the talleres_cupo advisory lock, refuses an active principal (YA_INSCRITO) or companero (PAREJA_NO_DISPONIBLE), inserts a pendiente row (sobre_cupo false) with origen and por_verificar, and maps the cupo gate to CUPO_LLENO. Returns {ok:true, inscripcion_id} or {ok:false, codigo}; a caller that wrote a ficha before must roll it back on a refusal.';

REVOKE ALL ON FUNCTION public.talleres_inscripcion_crear_core(uuid, uuid, uuid, text, text, boolean, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_inscripcion_crear_core(uuid, uuid, uuid, text, text, boolean, text, boolean) TO service_role;

-- ===========================================================================
-- C. talleres_inscribirme on top of the core
-- ===========================================================================

-- Contract unchanged from 20261004150000 (see its header): same input
-- modes, same {ok:true, inscripcion_id, estado, pareja_origen} reply, same
-- {ok:false, codigo} refusals and the same raised 42501/22023 errors.
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
  v_core jsonb;
  v_codigo text;
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

  -- The caller is checked under the cupo lock BEFORE any throttle, so an
  -- enrolled caller consumes no unit. The core takes the same lock again
  -- (re-entrant) and repeats the check.
  PERFORM pg_advisory_xact_lock(hashtext('talleres_cupo:' || p_edicion_id::text));

  IF public.talleres_persona_activa_en_edicion(p_edicion_id, v_actor_id) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'YA_INSCRITO');
  END IF;

  IF v_modo = 'conyuge_registrado' THEN
    v_pareja_id := public.talleres_conyuge_unico(v_actor_id);
    IF v_pareja_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'PAREJA_NO_CONFIRMADA');
    END IF;
    -- An active spouse: the core returns PAREJA_NO_DISPONIBLE.
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

  -- One subtransaction: a refusal of the core rolls back the new ficha;
  -- the throttle units consumed above stay recorded.
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

    v_core := public.talleres_inscripcion_crear_core(
      p_edicion_id, v_actor_id, v_pareja_id, v_vinculo, v_modo, v_descartado, 'app', false
    );
    IF NOT (v_core ->> 'ok')::boolean THEN
      RAISE EXCEPTION 'INSCRIPCION_RECHAZADA' USING ERRCODE = 'P0001', DETAIL = v_core ->> 'codigo';
    END IF;
    v_inscripcion_id := (v_core ->> 'inscripcion_id')::uuid;

    IF v_modo = 'ficha_nueva' THEN
      INSERT INTO public.invitaciones_acceso (
        usuario_id, origen, creado_por, edicion_id, inscripcion_id, estado
      ) VALUES (
        v_pareja_id, 'taller_pareja', v_actor_id, p_edicion_id, v_inscripcion_id, 'en_espera'
      );
    END IF;
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM = 'INSCRIPCION_RECHAZADA' THEN
        GET STACKED DIAGNOSTICS v_codigo = PG_EXCEPTION_DETAIL;
        RETURN jsonb_build_object('ok', false, 'codigo', v_codigo);
      END IF;
      RAISE;
    WHEN unique_violation THEN
      -- A concurrent ficha took the cédula or the email in between.
      IF v_modo = 'ficha_nueva' THEN
        RETURN jsonb_build_object('ok', false, 'codigo', 'PAREJA_NO_CONFIRMADA');
      END IF;
      RAISE;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'inscripcion_id', v_inscripcion_id,
    'estado', 'pendiente',
    'pareja_origen', v_modo
  );
END;
$function$;

COMMENT ON FUNCTION public.talleres_inscribirme(uuid, jsonb) IS
  'Member self-enrollment (the only path since taller_inscripciones_insert lost its self branch). Individual edición: p_pareja NULL. Pareja edición: {modo: conyuge_registrado} (matrimonio only, the caller''s unique registered spouse), {modo: cedula, cedula} (same rules as talleres_buscar_pareja_por_cedula, same pareja_cedula throttle) or {modo: ficha_nueva, cedula, nombre, apellido, email, fecha_nacimiento, genero} (creates the partner''s ficha without a role plus an en_espera access invitation; callers with a role only, 2 per 30 days per caller, 30 per 24 h overall; existing cédula or email, or under 18, return PAREJA_NO_CONFIRMADA), plus vinculo when coalesce(taller_ediciones.link_type, talleres.vinculo) is NULL, and conyuge_descartado. Writes through talleres_inscripcion_crear_core (origen app): a pendiente row with the edición''s first cohorte. Returns {ok:true, inscripcion_id, estado, pareja_origen} or {ok:false, codigo}; raises 42501 SIN_FICHA and 22023 input errors.';

REVOKE ALL ON FUNCTION public.talleres_inscribirme(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_inscribirme(uuid, jsonb) TO authenticated, service_role;
