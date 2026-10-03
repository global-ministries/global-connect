-- P1 (odd/tasks/talleres-inscripcion-en-pareja.md) — couples enroll
-- themselves through one RPC.
--
-- Why: no couple can self-enroll today. The self branch of the
-- taller_inscripciones_insert policy checks
-- EXISTS (SELECT 1 FROM usuarios u WHERE u.id = companero_id) under the
-- member's own usuarios RLS, and a member cannot see their spouse's row.
-- Every member enrollment now goes through talleres_inscribirme, which
-- resolves the partner itself (the registered spouse, or an exact cédula),
-- and the policy keeps only its staff branches.
--
-- Adds:
--   A. Invariants on taller_inscripciones:
--      - one appearance per person (as principal OR companero) per edición
--        among active rows (estado NOT IN ('no_aprobado', 'retirado')),
--        enforced by a trigger under the same advisory lock as the cupo
--        gate (P0001 PERSONA_YA_EN_EDICION);
--      - CHECK companero_id <> persona_principal_id;
--      - UNIQUE (taller_id, cohorte_id, persona_principal_id) becomes a
--        partial unique index over active rows, so a person whose
--        enrollment was rejected (no_aprobado) or withdrawn (retirado) can
--        enroll again;
--      - pareja_origen and conyuge_registrado_descartado, written by the
--        RPC.
--   B. acciones_limitadas + consumir_limite_accion: a durable per-actor
--      throttle that doubles as the audit trail of who searched and when.
--      It never stores a cédula (its accion CHECK refuses digits).
--   C. Internal helpers (service_role only): talleres_conyuge_unico,
--      talleres_cedula_pareja_normalizada, talleres_persona_activa_en_edicion,
--      talleres_pareja_por_cedula.
--   D. RPCs (authenticated): talleres_mi_conyuge_registrado,
--      talleres_buscar_pareja_por_cedula, talleres_inscribirme.
--   E. taller_inscripciones_insert loses its self-enroll branch; the three
--      staff branches are kept byte-for-byte.
--   F. talleres_inscribir_sobre_cupo (same signature) follows the same
--      rule: only an active appearance (as principal or companero) blocks
--      a person with YA_INSCRITO, so staff can place again someone whose
--      row was rejected or withdrawn. It now takes the cupo lock before
--      checking, so its "is the edición full" read cannot race.
--
-- Contract: every new function is a definer with search_path pinned to
-- public; the actor is the usuarios.id whose auth_id = auth.uid() (never a
-- p_auth_id), else 42501 SIN_FICHA. Every outcome that follows the throttle
-- is RETURNED as {"ok":false,"codigo":X}, never raised, so the throttle row
-- commits and the RPC cannot be used as an unthrottled oracle.
--
-- Verified against STAGING before writing this file (read-only queries):
--   * pg_policy of taller_inscripciones: the live WITH CHECK of
--     taller_inscripciones_insert equals the text of 20260928140000 (the
--     latest migration that defines it).
--   * talleres_inscripciones_cupo_gate locks
--     pg_advisory_xact_lock(hashtext('talleres_cupo:' || NEW.taller_id::text));
--     the trigger below and talleres_inscribirme take the same key
--     (advisory locks are re-entrant within a transaction).
--   * taller_inscripciones.taller_id is the EDICIÓN id; the edición's
--     cohorte is the first talleres_crecimiento_cohortes row by created_at
--     (same rule as talleres_inscribir_sobre_cupo).
--   * taller_ediciones snapshots tipo/link_type from talleres at creation
--     (talleres_instanciar_edicion, talleres_crear_edicion). The effective
--     vínculo is coalesce(taller_ediciones.link_type, talleres.vinculo),
--     the same value the app reads; only when it is NULL does the member
--     choose it (p_pareja.vinculo).
--   * the only dependency of taller_inscripciones_uniq_taller_cohorte_persona
--     is its own index; no ON CONFLICT targets it.
--   * normalizar_cedula_ve returns its input unchanged when it cannot
--     normalize it; usuarios.cedula is UNIQUE and trigger-normalized.
--   * relaciones_usuarios stores each conyuge pair once (0 pairs in both
--     directions, 0 people with two spouses).
--   * signup stores fecha_nacimiento '1900-01-01' as a placeholder.
--   * 0 ediciones and 0 inscripciones.
--
-- Rollback (in this order):
--   ALTER POLICY taller_inscripciones_insert ... (the WITH CHECK of
--     20260928140000, self-enroll branch included);
--   CREATE OR REPLACE FUNCTION public.talleres_inscribir_sobre_cupo(uuid,
--     uuid, uuid) ... (the body of 20260928140000);
--   DROP FUNCTION IF EXISTS public.talleres_inscribirme(uuid, jsonb),
--     public.talleres_buscar_pareja_por_cedula(uuid, text),
--     public.talleres_mi_conyuge_registrado(),
--     public.talleres_pareja_por_cedula(uuid, uuid, text),
--     public.talleres_persona_activa_en_edicion(uuid, uuid),
--     public.talleres_cedula_pareja_normalizada(text),
--     public.talleres_conyuge_unico(uuid),
--     public.consumir_limite_accion(uuid, text, integer, interval);
--   DROP TABLE IF EXISTS public.acciones_limitadas;
--   DROP TRIGGER IF EXISTS trg_taller_inscripciones_una_aparicion ON
--     public.taller_inscripciones;
--   DROP FUNCTION IF EXISTS public.talleres_inscripciones_una_aparicion();
--   DROP INDEX IF EXISTS public.taller_inscripciones_uniq_taller_cohorte_persona_activa;
--   ALTER TABLE public.taller_inscripciones
--     ADD CONSTRAINT taller_inscripciones_uniq_taller_cohorte_persona
--       UNIQUE (taller_id, cohorte_id, persona_principal_id),
--     DROP CONSTRAINT IF EXISTS taller_inscripciones_companero_distinto,
--     DROP COLUMN IF EXISTS conyuge_registrado_descartado,
--     DROP COLUMN IF EXISTS pareja_origen;

-- ===========================================================================
-- A. taller_inscripciones: invariants and the new columns
-- ===========================================================================

ALTER TABLE public.taller_inscripciones
  ADD COLUMN pareja_origen text NULL,
  ADD COLUMN conyuge_registrado_descartado boolean NOT NULL DEFAULT false;

ALTER TABLE public.taller_inscripciones
  ADD CONSTRAINT taller_inscripciones_pareja_origen_check
    CHECK (pareja_origen IS NULL OR pareja_origen IN ('conyuge_registrado', 'cedula')),
  ADD CONSTRAINT taller_inscripciones_companero_distinto
    CHECK (companero_id IS NULL OR companero_id <> persona_principal_id);

COMMENT ON COLUMN public.taller_inscripciones.pareja_origen IS
  'How talleres_inscribirme resolved the companero: conyuge_registrado (the caller''s unique conyuge relation) or cedula (exact cédula typed by the caller). NULL for individual inscriptions and for rows written by staff.';
COMMENT ON COLUMN public.taller_inscripciones.conyuge_registrado_descartado IS
  'True when the caller said their registered spouse is not their current partner ("no es mi cónyuge actual") and enrolled with someone else by cédula. Only set when the caller has a unique registered spouse who differs from the companero.';

-- A rejected (no_aprobado) or withdrawn (retirado) row no longer blocks the
-- same principal from enrolling again in the same edición and cohorte.
ALTER TABLE public.taller_inscripciones
  DROP CONSTRAINT taller_inscripciones_uniq_taller_cohorte_persona;

CREATE UNIQUE INDEX taller_inscripciones_uniq_taller_cohorte_persona_activa
  ON public.taller_inscripciones (taller_id, cohorte_id, persona_principal_id)
  WHERE estado NOT IN ('no_aprobado', 'retirado');

-- One appearance per person per edición, as principal or companero, among
-- active rows. Same advisory lock key as talleres_inscripciones_cupo_gate,
-- so concurrent writers on one edición are serialized and the EXISTS below
-- (a fresh snapshot, taken after the lock) sees every committed row.
CREATE OR REPLACE FUNCTION public.talleres_inscripciones_una_aparicion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.estado IN ('no_aprobado', 'retirado') THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('talleres_cupo:' || NEW.taller_id::text));

  IF EXISTS (
    SELECT 1
      FROM public.taller_inscripciones i
     WHERE i.taller_id = NEW.taller_id
       AND i.id <> NEW.id
       AND i.estado NOT IN ('no_aprobado', 'retirado')
       AND (i.persona_principal_id IN (NEW.persona_principal_id, NEW.companero_id)
            OR i.companero_id IN (NEW.persona_principal_id, NEW.companero_id))
  ) THEN
    RAISE EXCEPTION 'PERSONA_YA_EN_EDICION' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.talleres_inscripciones_una_aparicion() IS
  'BEFORE INSERT OR UPDATE OF persona_principal_id, companero_id, taller_id, estado on taller_inscripciones: raises P0001 PERSONA_YA_EN_EDICION when a person of an active row (estado NOT IN no_aprobado/retirado) already appears, as principal or companero, in another active row of the same edición. Takes the cupo gate''s advisory lock (talleres_cupo:<edicion>).';

REVOKE ALL ON FUNCTION public.talleres_inscripciones_una_aparicion() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_inscripciones_una_aparicion() TO service_role;

DROP TRIGGER IF EXISTS trg_taller_inscripciones_una_aparicion ON public.taller_inscripciones;
CREATE TRIGGER trg_taller_inscripciones_una_aparicion
  BEFORE INSERT OR UPDATE OF persona_principal_id, companero_id, taller_id, estado
  ON public.taller_inscripciones
  FOR EACH ROW
  EXECUTE FUNCTION public.talleres_inscripciones_una_aparicion();

-- ===========================================================================
-- B. Durable per-actor throttle
-- ===========================================================================

CREATE TABLE public.acciones_limitadas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  -- A short action key such as 'pareja_cedula'. No digits allowed, so a
  -- cédula can never end up stored here.
  accion text NOT NULL CHECK (accion ~ '^[a-z][a-z_]{0,62}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX acciones_limitadas_actor_accion_created_idx
  ON public.acciones_limitadas (actor_id, accion, created_at DESC);

COMMENT ON TABLE public.acciones_limitadas IS
  'One row per consumed unit of a throttled action (who and when). Read and written only by consumir_limite_accion and the functions that call it; never stores the searched value. Also the audit trail of the partner lookups by cédula.';

ALTER TABLE public.acciones_limitadas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.acciones_limitadas FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.acciones_limitadas_id_seq FROM PUBLIC, anon, authenticated;

-- True when one unit was consumed (and recorded); false when p_max units
-- were already consumed within p_ventana. A refusal records nothing.
CREATE OR REPLACE FUNCTION public.consumir_limite_accion(
  p_actor uuid,
  p_accion text,
  p_max integer,
  p_ventana interval
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_usadas integer;
BEGIN
  IF p_actor IS NULL OR p_accion IS NULL OR p_max IS NULL OR p_max < 1
     OR p_ventana IS NULL OR p_ventana <= interval '0' THEN
    RAISE EXCEPTION 'LIMITE_PARAMETROS_INVALIDOS' USING ERRCODE = '22023';
  END IF;

  -- Two parallel calls of the same actor cannot both take the last unit.
  PERFORM pg_advisory_xact_lock(hashtext('acciones_limitadas:' || p_accion || ':' || p_actor::text));

  SELECT count(*) INTO v_usadas
    FROM public.acciones_limitadas a
   WHERE a.actor_id = p_actor
     AND a.accion = p_accion
     AND a.created_at > now() - p_ventana;

  IF v_usadas >= p_max THEN
    RETURN false;
  END IF;

  INSERT INTO public.acciones_limitadas (actor_id, accion) VALUES (p_actor, p_accion);
  RETURN true;
END;
$function$;

COMMENT ON FUNCTION public.consumir_limite_accion(uuid, text, integer, interval) IS
  'Internal throttle: consumes one unit of p_accion for p_actor and returns true, or returns false (recording nothing) when p_max units were consumed within p_ventana. Callers must RETURN their refusal instead of raising, or the consumed row rolls back.';

REVOKE ALL ON FUNCTION public.consumir_limite_accion(uuid, text, integer, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consumir_limite_accion(uuid, text, integer, interval) TO service_role;

-- ===========================================================================
-- C. Internal helpers
-- ===========================================================================

-- The other party of p_persona_id's conyuge relations, stored in either
-- direction, when there is exactly one such person; NULL when there is
-- none or more than one (fail closed).
CREATE OR REPLACE FUNCTION public.talleres_conyuge_unico(p_persona_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN count(DISTINCT x.otro) = 1 THEN (array_agg(x.otro))[1] END
    FROM (
      SELECT r.usuario2_id AS otro
        FROM public.relaciones_usuarios r
       WHERE r.usuario1_id = p_persona_id AND r.tipo_relacion = 'conyuge'
      UNION ALL
      SELECT r.usuario1_id
        FROM public.relaciones_usuarios r
       WHERE r.usuario2_id = p_persona_id AND r.tipo_relacion = 'conyuge'
    ) x;
$function$;

COMMENT ON FUNCTION public.talleres_conyuge_unico(uuid) IS
  'Internal: the unique registered spouse (relaciones_usuarios tipo_relacion = conyuge, either direction) of a person, or NULL when there is none or more than one.';

REVOKE ALL ON FUNCTION public.talleres_conyuge_unico(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_conyuge_unico(uuid) TO service_role;

-- The cédula in its stored form, or 22023 CEDULA_INVALIDA. Callers run it
-- BEFORE the throttle: a malformed input is a client bug, not a lookup.
CREATE OR REPLACE FUNCTION public.talleres_cedula_pareja_normalizada(p_cedula text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cedula text;
BEGIN
  IF p_cedula IS NULL OR length(p_cedula) > 32 THEN
    RAISE EXCEPTION 'CEDULA_INVALIDA' USING ERRCODE = '22023';
  END IF;

  v_cedula := public.normalizar_cedula_ve(p_cedula);

  IF v_cedula IS NULL OR NOT (v_cedula ~ '^\d{6,8}$' OR v_cedula ~ '^E\d{6,9}$') THEN
    RAISE EXCEPTION 'CEDULA_INVALIDA' USING ERRCODE = '22023';
  END IF;

  RETURN v_cedula;
END;
$function$;

COMMENT ON FUNCTION public.talleres_cedula_pareja_normalizada(text) IS
  'Internal: normalizar_cedula_ve(p_cedula) when it yields a Venezuelan (6-8 digits) or foreign (E + 6-9 digits) cédula; raises 22023 CEDULA_INVALIDA otherwise.';

REVOKE ALL ON FUNCTION public.talleres_cedula_pareja_normalizada(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_cedula_pareja_normalizada(text) TO service_role;

CREATE OR REPLACE FUNCTION public.talleres_persona_activa_en_edicion(p_edicion_id uuid, p_persona_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.taller_inscripciones i
     WHERE i.taller_id = p_edicion_id
       AND i.estado NOT IN ('no_aprobado', 'retirado')
       AND (i.persona_principal_id = p_persona_id OR i.companero_id = p_persona_id)
  );
$function$;

COMMENT ON FUNCTION public.talleres_persona_activa_en_edicion(uuid, uuid) IS
  'Internal: true when the person appears, as principal or companero, in an active row (estado NOT IN no_aprobado/retirado) of the edición.';

REVOKE ALL ON FUNCTION public.talleres_persona_activa_en_edicion(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_persona_activa_en_edicion(uuid, uuid) TO service_role;

-- The ONE rule shared by the lookup and the cédula mode of the enrollment:
-- the person with exactly this (already normalized) cédula, unless it is
-- the caller, a person under 18, or someone already active in the edición.
-- An unknown birth date (NULL or the signup placeholder 1900-01-01) is
-- allowed.
CREATE OR REPLACE FUNCTION public.talleres_pareja_por_cedula(
  p_edicion_id uuid,
  p_actor_id uuid,
  p_cedula_normalizada text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT u.id
    FROM public.usuarios u
   WHERE u.cedula = p_cedula_normalizada
     AND u.id <> p_actor_id
     AND NOT (
       u.fecha_nacimiento IS NOT NULL
       AND u.fecha_nacimiento <> DATE '1900-01-01'
       AND u.fecha_nacimiento > (public.talleres_hoy() - interval '18 years')::date
     )
     AND NOT public.talleres_persona_activa_en_edicion(p_edicion_id, u.id);
$function$;

COMMENT ON FUNCTION public.talleres_pareja_por_cedula(uuid, uuid, text) IS
  'Internal: usuarios.id with exactly this normalized cédula, or NULL when there is none or the person is the caller, under 18 by fecha_nacimiento (NULL and 1900-01-01 count as unknown and are allowed), or already active in the edición.';

REVOKE ALL ON FUNCTION public.talleres_pareja_por_cedula(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_pareja_por_cedula(uuid, uuid, text) TO service_role;

-- ===========================================================================
-- D. RPCs
-- ===========================================================================

-- The caller's unique registered spouse: name and photo only (never the
-- id, email, phone or cédula). 0 rows when there is none or more than one.
CREATE OR REPLACE FUNCTION public.talleres_mi_conyuge_registrado()
RETURNS TABLE (nombre text, apellido text, foto_perfil_url text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid;
  v_conyuge_id uuid;
BEGIN
  SELECT u.id INTO v_actor_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'SIN_FICHA' USING ERRCODE = '42501';
  END IF;

  v_conyuge_id := public.talleres_conyuge_unico(v_actor_id);
  IF v_conyuge_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u.nombre::text, u.apellido::text, u.foto_perfil_url::text
    FROM public.usuarios u
   WHERE u.id = v_conyuge_id;
END;
$function$;

COMMENT ON FUNCTION public.talleres_mi_conyuge_registrado() IS
  'Couple enrollment: nombre, apellido and foto_perfil_url of the caller''s unique registered spouse (relaciones_usuarios conyuge, either direction); 0 rows when there is none or more than one. Raises 42501 SIN_FICHA when the session has no ficha.';

REVOKE ALL ON FUNCTION public.talleres_mi_conyuge_registrado() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_mi_conyuge_registrado() TO authenticated, service_role;

-- Lookup by exact cédula, so the member can recognize their partner before
-- confirming. Shows "<nombre> <initial of the first apellido>." only.
--   {"ok":true,"encontrada":true,"nombre_mostrado":"María G."}
--   {"ok":true,"encontrada":false}  (unknown, self, minor, already active)
--   {"ok":false,"codigo":"EDICION_NOT_FOUND" | "LIMITE_ALCANZADO"}
-- Raises 42501 SIN_FICHA, 22023 CEDULA_INVALIDA.
CREATE OR REPLACE FUNCTION public.talleres_buscar_pareja_por_cedula(p_edicion_id uuid, p_cedula text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid;
  v_cedula text;
  v_edicion public.taller_ediciones%ROWTYPE;
  v_pareja_id uuid;
  v_nombre text;
  v_inicial text;
BEGIN
  SELECT u.id INTO v_actor_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'SIN_FICHA' USING ERRCODE = '42501';
  END IF;

  v_cedula := public.talleres_cedula_pareja_normalizada(p_cedula);

  SELECT * INTO v_edicion FROM public.taller_ediciones te WHERE te.id = p_edicion_id;
  IF NOT FOUND OR public.talleres_estado_efectivo(v_edicion) IN ('borrador', 'cancelado') THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'EDICION_NOT_FOUND');
  END IF;

  IF NOT public.consumir_limite_accion(v_actor_id, 'pareja_cedula', 10, interval '24 hours') THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'LIMITE_ALCANZADO');
  END IF;

  v_pareja_id := public.talleres_pareja_por_cedula(p_edicion_id, v_actor_id, v_cedula);
  IF v_pareja_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'encontrada', false);
  END IF;

  SELECT regexp_replace(btrim(u.nombre), '\s+', ' ', 'g'),
         upper(left(btrim(u.apellido), 1))
    INTO v_nombre, v_inicial
    FROM public.usuarios u
   WHERE u.id = v_pareja_id;

  RETURN jsonb_build_object(
    'ok', true,
    'encontrada', true,
    'nombre_mostrado', CASE WHEN v_inicial = '' THEN v_nombre ELSE v_nombre || ' ' || v_inicial || '.' END
  );
END;
$function$;

COMMENT ON FUNCTION public.talleres_buscar_pareja_por_cedula(uuid, text) IS
  'Couple enrollment: looks up a partner by exact normalized cédula and returns {ok:true, encontrada:true, nombre_mostrado:"<nombre> <initial>."} or the neutral {ok:true, encontrada:false} (unknown, the caller, under 18, already active in the edición). Every call with a valid cédula on a visible edición consumes one pareja_cedula unit (10 per 24 h per caller); when exhausted returns {ok:false, codigo:LIMITE_ALCANZADO}. Unknown, borrador or cancelado edición: {ok:false, codigo:EDICION_NOT_FOUND}. Raises 42501 SIN_FICHA, 22023 CEDULA_INVALIDA.';

REVOKE ALL ON FUNCTION public.talleres_buscar_pareja_por_cedula(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_buscar_pareja_por_cedula(uuid, text) TO authenticated, service_role;

-- The one way a member enrolls.
--   p_pareja: NULL (individual edición) |
--     {"modo":"conyuge_registrado"} | {"modo":"cedula","cedula":"..."},
--     plus optional "vinculo":"matrimonio"|"novios" (read only when the
--     effective vínculo, coalesce(taller_ediciones.link_type,
--     talleres.vinculo), is NULL) and "conyuge_descartado":true.
--   OK: {"ok":true,"inscripcion_id":uuid,"estado":"pendiente",
--        "pareja_origen":null|"conyuge_registrado"|"cedula"}
--   Returned: {"ok":false,"codigo": EDICION_NOT_FOUND | EDICION_NO_ABIERTA |
--     YA_INSCRITO | CUPO_LLENO | PAREJA_NO_CONFIRMADA | PAREJA_NO_DISPONIBLE |
--     LIMITE_ALCANZADO}
--   Raised: 42501 SIN_FICHA; 22023 COMPANERO_NO_APLICA, COMPANERO_REQUERIDO,
--     MODO_INVALIDO, VINCULO_REQUERIDO, MODO_NO_APLICA, CEDULA_INVALIDA.
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
       OR (p_pareja ->> 'modo') NOT IN ('conyuge_registrado', 'cedula') THEN
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

    IF v_modo = 'cedula' THEN
      v_cedula := public.talleres_cedula_pareja_normalizada(p_pareja ->> 'cedula');
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
  END IF;

  BEGIN
    INSERT INTO public.taller_inscripciones (
      taller_id, cohorte_id, persona_principal_id, companero_id, link_type,
      estado, sobre_cupo, pareja_origen, conyuge_registrado_descartado
    ) VALUES (
      p_edicion_id, v_cohorte_id, v_actor_id, v_pareja_id, v_vinculo,
      'pendiente', false, v_modo, v_descartado
    )
    RETURNING id INTO v_inscripcion_id;
  EXCEPTION
    WHEN raise_exception THEN
      -- talleres_inscripciones_cupo_gate. Returned, so a consumed
      -- throttle unit stays recorded.
      IF SQLERRM = 'CUPO_LLENO' THEN
        RETURN jsonb_build_object('ok', false, 'codigo', 'CUPO_LLENO');
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
  'Member self-enrollment (the only path since taller_inscripciones_insert lost its self branch). Individual edición: p_pareja NULL. Pareja edición: {modo: conyuge_registrado} (matrimonio only, the caller''s unique registered spouse) or {modo: cedula, cedula} (same rules as talleres_buscar_pareja_por_cedula, same pareja_cedula throttle), plus vinculo when coalesce(taller_ediciones.link_type, talleres.vinculo) is NULL, and conyuge_descartado. Inserts a pendiente row with the edición''s first cohorte. Returns {ok:true, inscripcion_id, estado, pareja_origen} or {ok:false, codigo}; raises 42501 SIN_FICHA and 22023 input errors.';

REVOKE ALL ON FUNCTION public.talleres_inscribirme(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_inscribirme(uuid, jsonb) TO authenticated, service_role;

-- ===========================================================================
-- E. taller_inscripciones_insert: staff branches only
-- ===========================================================================

-- The three branches below are byte-for-byte those of 20260928140000 (and
-- of the live policy). The self-enroll branch is gone: members enroll
-- through talleres_inscribirme.
ALTER POLICY taller_inscripciones_insert ON public.taller_inscripciones
WITH CHECK (
  auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_cohorte(cohorte_id))
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.director.write'::text, talleres_equipo_de_cohorte(cohorte_id))
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage'::text, talleres_equipo_de_cohorte(cohorte_id))
);

-- ===========================================================================
-- F. talleres_inscribir_sobre_cupo: only an active appearance blocks
-- ===========================================================================

-- Same signature and body as 20260928140000 except: the cupo lock is taken
-- before the checks, and YA_INSCRITO now means "already active in this
-- edición, as principal or companero" instead of "any row as principal in
-- this cohorte, in any estado". A companero who is already active is
-- refused by the one-appearance trigger (P0001 PERSONA_YA_EN_EDICION).
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
    sobre_cupo, sobre_cupo_por, sobre_cupo_en
  ) VALUES (
    p_edicion_id, v_cohorte_id, p_persona_id,
    CASE WHEN v_edicion.tipo = 'pareja' THEN p_companero_id ELSE NULL END,
    CASE WHEN v_edicion.tipo = 'pareja' THEN v_edicion.link_type ELSE NULL END,
    'pendiente',
    v_es_sobre_cupo,
    CASE WHEN v_es_sobre_cupo THEN v_actor_id ELSE NULL END,
    CASE WHEN v_es_sobre_cupo THEN now() ELSE NULL END
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
  'Director/coordinator/admin places a persona in an edicion, recording sobre_cupo=true (with who/when) ONLY when the edicion is actually full at insert time; otherwise a normal insert. p_companero_id is required (P0001 COMPANERO_REQUERIDO) and stored with the edicion''s own link_type when the edicion is tipo=pareja. Refuses P0001 EDICION_NO_ABIERTA unless the edicion''s effective state is abierto/en_curso, and P0001 YA_INSCRITO when the persona is already active (estado NOT IN no_aprobado/retirado) in the edicion as principal or companero. Takes the cupo lock before checking. Raises 42501 sin_permisos_para_este_taller / P0002 EDICION_NOT_FOUND.';

REVOKE ALL ON FUNCTION public.talleres_inscribir_sobre_cupo(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_inscribir_sobre_cupo(uuid, uuid, uuid) TO authenticated, service_role;
